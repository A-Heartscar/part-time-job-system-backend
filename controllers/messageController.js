// ========== 消息控制器 ==========
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const redis = require('../config/redis');

/**
 * 获取当前用户的会话列表
 */
exports.getConversations = async (req, res) => {
    try {

        const userUUID = req.user.userUUID;

        // ========== 缓存读取 ==========
        if (redis.isConnected()) {
            const cacheKey = `chat:conversations:${userUUID}`;
            const cached = await redis.pGet(cacheKey);
            if (cached) {
                console.log('[会话列表] 缓存命中:', userUUID);
                return res.json({ success: true, data: JSON.parse(cached) });
            }
            console.log('[会话列表] 缓存未命中:', userUUID);
        }

        // ========== 非缓存读取 ==========
        console.log('[消息] 获取会话列表:', userUUID);

        const conversations = await Conversation.getUserConversations(userUUID);

        // 补充对方用户信息
        const otherUserUUIDs = conversations.map(c =>
            c.participants.find(p => p !== userUUID)
        );

        const users = await User.find(
            { userUUID: { $in: otherUserUUIDs } },
            'userUUID username avatar employerInfo studentInfo role'
        ).lean();

        const userMap = {};
        users.forEach(u => {
            userMap[u.userUUID] = {
                userUUID: u.userUUID,
                username: u.username,
                avatar: u.avatar,
                role: u.role,
                displayName: u.role === 'employer'
                    ? (u.employerInfo?.companyInfo?.companyName || u.username)
                    : (u.studentInfo?.studentName || u.username)
            };
        });

        const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

        const enrichedConversations = conversations.map(c => {
            const otherUUID = c.participants.find(p => p !== userUUID);

            let otherUser = userMap[otherUUID] || null;

            // 如果对方是系统通知用户且不在 User 查询结果中，手动构建对象
            if (!otherUser && otherUUID === SYSTEM_USER_UUID) {
                otherUser = {
                    userUUID: SYSTEM_USER_UUID,
                    username: 'system_notification',
                    avatar: '',
                    role: 'student',
                    displayName: '系统通知'
                };
            }

            return {
                _id: c._id,
                participants: c.participants,
                otherUser: otherUser,
                lastMessage: c.lastMessage,
                unreadCount: (c.unreadCount instanceof Map
                    ? c.unreadCount.get(userUUID)
                    : (c.unreadCount?.[userUUID] || 0)),
                updatedAt: c.updatedAt
            };
        });


        console.log('[消息] 会话数量:', enrichedConversations.length);

        // ========== 缓存回写 ==========
        if (redis.isConnected()) {
            await redis.pSetex(`chat:conversations:${userUUID}`, 180, JSON.stringify(enrichedConversations));
            console.log('[会话列表] 缓存已写入');
        }


        res.json({
            success: true,
            data: enrichedConversations
        });

    } catch (error) {
        console.error('[消息] 获取会话失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取会话的历史消息
 */
exports.getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 30 } = req.query;
        const userUUID = req.user.userUUID;

        console.log('[消息] 获取历史消息:', { conversationId, page, limit });

        // 验证用户是否属于该会话
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(userUUID)) {
            return res.status(403).json({
                success: false,
                message: '无权访问此会话'
            });
        }

        const result = await Message.getConversationMessages(conversationId, parseInt(page), parseInt(limit));

        // 标记消息已读
        conversation.unreadCount.set(userUUID, 0);
        await conversation.save();

        console.log('[消息] 消息数量:', result.messages.length);

        res.json({
            success: true,
            data: result.messages,
            pagination: result.pagination
        });

    } catch (error) {
        console.error('[消息] 获取失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// 提取公共清除函数
const clearConvCache = async (uuid) => {
    if (redis.isConnected()) {
        await redis.pDel(`chat:conversations:${uuid}`);
    }
};


/**
 * 发送消息
 */
exports.sendMessage = async (req, res) => {
    try {
        const senderUUID = req.user.userUUID;
        const { receiverUUID, content, type = 'text', metadata } = req.body;

        console.log('[消息] 发送消息:', { senderUUID, receiverUUID, type });

        if (!receiverUUID || !content) {
            return res.status(400).json({
                success: false,
                message: '接收者和消息内容不能为空'
            });
        }

        // 查找或创建会话
        const conversation = await Conversation.findOrCreate(senderUUID, receiverUUID);

        // 创建消息
        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID,
            receiverUUID,
            content,
            type,
            metadata: metadata || {}
        });

        // 更新会话最后消息
        conversation.lastMessage = {
            content: content.slice(0, 100),
            senderUUID,
            sentAt: new Date()
        };

        // 增加接收者未读计数
        const currentCount = conversation.unreadCount.get(receiverUUID) || 0;
        conversation.unreadCount.set(receiverUUID, currentCount + 1);
        conversation.updatedAt = new Date();
        await conversation.save();

        console.log('[消息] 发送成功:', message._id);

        // 触发 WebSocket 推送（由路由调用时无法直接访问 io，在 socket 模块中处理）

        res.status(201).json({
            success: true,
            data: {
                message,
                conversationId: conversation._id
            }
        });

        await clearConvCache(senderUUID);
        await clearConvCache(receiverUUID);

    } catch (error) {
        console.error('[消息] 发送失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 发送岗位邀请消息
 * @route POST /api/messages/send-invitation
 * @access 仅雇主
 * @description 雇主向学生发送投递邀请，生成一条 type 为 'invitation' 的特殊消息，
 *              包含岗位核心信息（标题、薪资、类别等），前端渲染为富文本卡片。
 */
exports.sendInvitation = async (req, res) => {
    try {
        const senderUUID = req.user.userUUID;
        const { receiverUUID, jobId, jobTitle, jobCategory, jobSalary, jobScheduleType, jobLocation } = req.body;

        console.log('[邀请消息] ========== 开始发送 ==========');
        console.log('[邀请消息] 请求参数:', {
            senderUUID,
            receiverUUID,
            jobId,
            jobTitle
        });

        // ========== 1. 参数校验 ==========
        if (!receiverUUID || !jobId || !jobTitle) {
            console.warn('[邀请消息] 缺少必要参数');
            return res.status(400).json({
                success: false,
                message: '接收者、岗位ID和岗位标题不能为空'
            });
        }

        // ========== 2. 校验发送者角色（仅雇主可发送邀请） ==========
        if (req.user.role !== 'employer') {
            console.warn('[邀请消息] 非雇主用户尝试发送邀请:', req.user.role);
            return res.status(403).json({
                success: false,
                message: '仅雇主用户可发送投递邀请'
            });
        }

        // ========== 3. 校验岗位是否属于当前雇主 ==========
        const Job = require('../models/Job');
        const job = await Job.findOne({ _id: jobId, employerUUID: senderUUID });
        if (!job) {
            console.warn('[邀请消息] 岗位不存在或不属于当前雇主:', jobId);
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权操作'
            });
        }

        // ========== 4. 构造邀请消息内容（纯文本，前端据此渲染卡片） ==========
        // 格式: JSON 字符串，包含岗位核心信息
        const invitationContent = JSON.stringify({
            jobId: job._id.toString(),
            jobTitle: job.title,
            jobCategory: job.category,
            salary: {
                baseRate: job.salary?.baseRate || 0,
                rateType: job.salary?.rateType || 'hourly'
            },
            scheduleType: job.workSchedule?.scheduleType || 'flexible_hours',
            location: {
                campusArea: job.location?.campusArea || false,
                remoteAllowed: job.location?.remoteAllowed || false
            },
            employerName: req.user.username || '未知雇主'
        });

        console.log('[邀请消息] 邀请内容:', invitationContent.slice(0, 100) + '...');

        // ========== 5. 查找或创建会话 ==========
        const Conversation = require('../models/Conversation');
        const conversation = await Conversation.findOrCreate(senderUUID, receiverUUID);

        console.log('[邀请消息] 会话ID:', conversation._id);

        // ========== 6. 创建邀请消息 ==========
        const Message = require('../models/Message');
        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID,
            receiverUUID,
            content: invitationContent,
            type: 'invitation',
            metadata: {
                jobId: job._id,
                jobTitle: job.title,
                action: 'invite'
            }
        });

        // ========== 7. 更新会话最后消息（摘要显示为可读文本） ==========
        conversation.lastMessage = {
            content: `[岗位邀请] ${job.title}`,
            senderUUID,
            sentAt: new Date()
        };

        // 增加接收者未读计数
        const unreadMap = conversation.unreadCount instanceof Map
            ? conversation.unreadCount
            : new Map(Object.entries(conversation.unreadCount || {}));

        const currentCount = unreadMap.get(receiverUUID) || 0;
        unreadMap.set(receiverUUID, currentCount + 1);
        conversation.unreadCount = unreadMap;
        conversation.updatedAt = new Date();
        await conversation.save();

        // ========== 8. 通过 WebSocket 推送给接收者 ==========
        const io = req.app.get('io');
        if (io) {
            // 推送给接收者
            io.to(receiverUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id
            });
            // 同时推送给发送者
            io.to(senderUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id
            });

            // 额外推送一个邀请通知事件（前端可用于弹窗提示）
            io.to(receiverUUID).emit('job_invitation', {
                from: senderUUID,
                fromName: req.user.username,
                jobId: job._id.toString(),
                jobTitle: job.title,
                conversationId: conversation._id.toString()
            });

            console.log('[邀请消息] WebSocket 已推送至:', receiverUUID);
        }

        console.log('[邀请消息] 发送成功:', message._id);
        console.log('[邀请消息] ========== 发送完成 ==========');

        res.status(201).json({
            success: true,
            data: {
                message,
                conversationId: conversation._id
            }
        });

        await clearConvCache(senderUUID);
        await clearConvCache(receiverUUID);

    } catch (error) {
        console.error('[邀请消息] 发送失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 学生面试确认回复
 * @route POST /api/messages/interview-reply
 * @access 仅学生
 * @description 学生收到面试通知后，回复「确认参加」或「申请改期」，
 *              系统自动在聊天中发送回复消息，通知雇主。
 */
exports.sendInterviewReply = async (req, res) => {
    try {
        const senderUUID = req.user.userUUID;
        const { employerUUID, jobId, jobTitle, replyType, rescheduleReason } = req.body;

        console.log('[面试回复] ========== 开始处理 ==========');
        console.log('[面试回复] 请求参数:', { senderUUID, employerUUID, jobId, replyType });

        // ========== 1. 参数校验 ==========
        if (!employerUUID || !jobId || !replyType) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        if (!['accept', 'reschedule'].includes(replyType)) {
            return res.status(400).json({
                success: false,
                message: '无效的回复类型'
            });
        }

        // ========== 2. 校验发送者角色（仅学生可回复） ==========
        if (req.user.role !== 'student') {
            return res.status(403).json({
                success: false,
                message: '仅学生用户可回复面试通知'
            });
        }

        // ========== 3. 获取学生姓名 ==========
        const User = require('../models/User');
        const student = await User.findOne({ userUUID: senderUUID }).select('studentInfo username');
        const studentName = student?.studentInfo?.studentName || student?.username || '同学';

        // ========== 4.
        // 构造回复消息内容 ==========
        const replyLabel = replyType === 'accept' ? '确认参加面试' : '申请调整面试时间';
        const replyContent = replyType === 'accept'
            ? `${studentName}已确认参加「${jobTitle}」的面试，请按时参加。`
            : `${studentName}申请调整「${jobTitle}」的面试时间${rescheduleReason ? `，原因：${rescheduleReason}` : ''}，请与雇主沟通新的时间安排。`;

        console.log('[面试回复] 回复内容:', replyContent);

        // ========== 5. 查找或创建会话 ==========
        const Conversation = require('../models/Conversation');
        const conversation = await Conversation.findOrCreate(senderUUID, employerUUID);

        // ========== 6. 创建回复消息（包含结构化元数据） ==========
        const Message = require('../models/Message');
        const messageContent = JSON.stringify({
            type: 'interview_reply',
            replyType: replyType,
            studentUUID: senderUUID,
            studentName: studentName,
            jobId: jobId,
            jobTitle: jobTitle,
            replyLabel: replyLabel,
            replyText: replyContent,
            rescheduleReason: rescheduleReason || '',
            repliedAt: new Date().toISOString()
        });

        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID,
            receiverUUID: employerUUID,
            content: messageContent,
            type: 'text',
            metadata: {
                jobId: jobId,
                jobTitle: jobTitle,
                action: replyType === 'accept' ? 'interview_accept' : 'interview_reschedule'
            }
        });

        // ========== 7. 更新会话最后消息 ==========
        conversation.lastMessage = {
            content: `【面试回复】${replyLabel} - ${jobTitle}`,
            senderUUID,
            sentAt: new Date()
        };
        const unreadMap = conversation.unreadCount instanceof Map
            ? conversation.unreadCount
            : new Map(Object.entries(conversation.unreadCount || {}));
        const currentCount = unreadMap.get(employerUUID) || 0;
        unreadMap.set(employerUUID, currentCount + 1);
        conversation.unreadCount = unreadMap;
        conversation.updatedAt = new Date();
        await conversation.save();

        // ========== 8. WebSocket 推送 ==========
        const io = req.app.get('io');
        if (io) {
            io.to(employerUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id.toString()
            });
            io.to(senderUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id.toString()
            });
            console.log('[面试回复] WebSocket 已推送');
        }

        console.log('[面试回复] ========== 处理完成 ==========');

        res.status(201).json({
            success: true,
            data: {
                message,
                conversationId: conversation._id
            }
        });

        await clearConvCache(senderUUID);
        await clearConvCache(employerUUID);

    } catch (error) {
        console.error('[面试回复] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 雇主处理学生改期申请
 * @route POST /api/messages/reschedule-reply
 * @access 仅雇主
 * @description 雇主同意改期时填写新的面试信息并重新发送面试通知；
 *              拒绝改期时发送拒绝消息。
 */
exports.handleRescheduleReply = async (req, res) => {
    try {
        const senderUUID = req.user.userUUID;
        const { studentUUID, jobId, jobTitle, replyType, interviewTime, interviewType: newInterviewType, interviewLocation } = req.body;

        console.log('[改期回复] ========== 开始处理 ==========');
        console.log('[改期回复] 请求参数:', { senderUUID, studentUUID, replyType });

        // ========== 1. 参数校验 ==========
        if (!studentUUID || !jobId || !replyType) {
            return res.status(400).json({ success: false, message: '缺少必要参数' });
        }

        if (!['accept', 'reject'].includes(replyType)) {
            return res.status(400).json({ success: false, message: '无效的回复类型' });
        }

        if (req.user.role !== 'employer') {
            return res.status(403).json({ success: false, message: '仅雇主可操作' });
        }

        // ========== 2. 获取雇主名称 ==========
        const User = require('../models/User');
        const employer = await User.findOne({ userUUID: senderUUID }).select('username employerInfo');
        const companyName = employer?.employerInfo?.companyInfo?.companyName
            || employer?.employerInfo?.personalInfo?.realName
            || employer?.username
            || '未知雇主';

        // ========== 3. 构造消息 ==========
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');

        let messageContent;
        let actionType;
        let summaryContent;

        if (replyType === 'reject') {
            // 拒绝改期
            messageContent = JSON.stringify({
                type: 'reschedule_response',
                replyType: 'reject',
                companyName: companyName,
                jobId: jobId,
                jobTitle: jobTitle,
                responseText: `${companyName}暂时无法调整「${jobTitle}」的面试时间，请按原计划参加面试。`,
                respondedAt: new Date().toISOString()
            });
            actionType = 'reschedule_reject';
            summaryContent = `【改期拒绝】${companyName}暂不调整「${jobTitle}」面试时间`;
        } else {
            // 同意改期：校验新的面试时间
            if (!interviewTime) {
                return res.status(400).json({ success: false, message: '请填写新的面试时间' });
            }

            messageContent = JSON.stringify({
                type: 'interview_notification',
                applicationId: '',
                jobId: jobId,
                jobTitle: jobTitle,
                companyName: companyName,
                employerUUID: senderUUID,
                newStatus: 'interviewed',
                statusLabel: '面试时间已调整',
                employerNotes: '',
                notifiedAt: new Date().toISOString(),
                interviewTime: interviewTime,
                interviewType: newInterviewType || 'online',
                interviewLocation: (newInterviewType === 'offline' ? interviewLocation : '') || ''
            });
            actionType = 'reschedule_accept';
            summaryContent = `【面试改期】${companyName}已更新「${jobTitle}」面试时间`;
        }

        // ========== 4. 查找或创建会话并发送消息 ==========
        const conversation = await Conversation.findOrCreate(senderUUID, studentUUID);

        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID,
            receiverUUID: studentUUID,
            content: messageContent,
            type: 'text',
            metadata: { jobId, jobTitle, action: actionType }
        });

        conversation.lastMessage = {
            content: summaryContent,
            senderUUID,
            sentAt: new Date()
        };
        const unreadMap = conversation.unreadCount instanceof Map
            ? conversation.unreadCount
            : new Map(Object.entries(conversation.unreadCount || {}));
        unreadMap.set(studentUUID, (unreadMap.get(studentUUID) || 0) + 1);
        conversation.unreadCount = unreadMap;
        conversation.updatedAt = new Date();
        await conversation.save();

        // ========== 5. WebSocket 推送 ==========
        const io = req.app.get('io');
        console.log('[改期回复] io 实例:', io ? '已获取' : '未获取');
        if (io) {
            io.to(studentUUID).emit('new_message', { message: message.toObject(), conversationId: conversation._id.toString() });
            io.to(senderUUID).emit('new_message', { message: message.toObject(), conversationId: conversation._id.toString() });
            console.log('[改期回复] WebSocket 已推送');
        }

        console.log('[改期回复] ========== 处理完成 ==========');

        res.status(201).json({
            success: true,
            data: { message, conversationId: conversation._id }
        });

        await clearConvCache(senderUUID);
        await clearConvCache(studentUUID);

    } catch (error) {
        console.error('[改期回复] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};