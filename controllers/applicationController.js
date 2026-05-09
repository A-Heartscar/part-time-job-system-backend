// ========== 投递记录控制器 ==========
const Application = require('../models/Application');
const Job = require('../models/Job');
const Resume = require('../models/Resume');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const dayjs = require('dayjs');
const redis = require("../config/redis");
/**
 * 投递验证规则
 */
exports.applicationValidation = [
    body('jobId')
        .notEmpty().withMessage('岗位ID不能为空')
        .isMongoId().withMessage('岗位ID格式无效'),

    body('resumeId')
        .notEmpty().withMessage('简历ID不能为空')
        .isMongoId().withMessage('简历ID格式无效'),

    body('coverLetter')
        .optional()
        .isLength({ max: 1000 }).withMessage('求职信不能超过1000字符')
];

/**
 * 学生投递简历
 * @route POST /api/applications
 * @access 仅学生
 */
exports.submitApplication = async (req, res) => {
    try {
        console.log('[投递申请] ========== 开始处理 ==========');

        // 验证请求数据
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('[投递申请] 验证失败:', errors.array());
            return res.status(400).json({
                success: false,
                message: errors.array().map(e => e.msg).join('; ')
            });
        }

        const { jobId, resumeId, coverLetter } = req.body;
        const studentUUID = req.user.userUUID;

        console.log('[投递申请] 请求参数:', { jobId, studentUUID, resumeId });

        // ========== 1. 验证岗位是否存在且已发布 ==========
        const job = await Job.findById(jobId);
        if (!job) {
            console.log('[投递申请] 岗位不存在:', jobId);
            return res.status(404).json({
                success: false,
                message: '岗位不存在'
            });
        }

        if (job.status !== 'published') {
            console.log('[投递申请] 岗位未发布:', job.status);
            return res.status(400).json({
                success: false,
                message: '该岗位暂不接受投递'
            });
        }

        // 检查申请截止日期
        if (job.applicationDeadline && new Date(job.applicationDeadline) < new Date()) {
            console.log('[投递申请] 已过截止日期:', job.applicationDeadline);
            return res.status(400).json({
                success: false,
                message: '该岗位已过申请截止日期'
            });
        }

        console.log('[投递申请] 岗位验证通过:', { title: job.title, employerUUID: job.employerUUID });

        // ========== 2. 验证简历是否存在且属于当前学生 ==========
        const resume = await Resume.findById(resumeId);
        if (!resume) {
            console.log('[投递申请] 简历不存在:', resumeId);
            return res.status(404).json({
                success: false,
                message: '简历不存在'
            });
        }

        if (resume.studentUUID !== studentUUID) {
            console.log('[投递申请] 简历不属于当前学生:', {
                resumeOwner: resume.studentUUID,
                currentUser: studentUUID
            });
            return res.status(403).json({
                success: false,
                message: '无权使用此简历'
            });
        }

        console.log('[投递申请] 简历验证通过');

        // ========== 3. 检查是否已投递过 ==========
        const existingApplication = await Application.findOne({
            jobId,
            studentUUID
        }).select('status').lean();

        if (existingApplication) {
            // 仅当状态为 rejected 时允许重新投递
            if (existingApplication.status !== 'rejected' && existingApplication.status !== 'completed') {
                console.log('[投递申请] 重复投递，当前状态:', existingApplication.status);
                return res.status(400).json({
                    success: false,
                    message: '您已投递过该岗位，请勿重复投递'
                });
            }
            // rejected 状态允许重投，先删除旧的投递记录
            console.log('[投递申请] rejected 状态重投，删除旧记录:', existingApplication._id);
            await Application.findByIdAndDelete(existingApplication._id);
        }

        // ========== 4. 创建投递记录 ==========
        const application = new Application({
            jobId,
            studentUUID,
            employerUUID: job.employerUUID,
            resumeId,
            coverLetter: coverLetter || '',
            status: 'pending',
            submittedAt: new Date(),
            statusUpdatedAt: new Date()
        });

        await application.save();

        console.log('[投递申请] 投递成功:', {
            applicationId: application._id,
            jobId,
            studentUUID,
            employerUUID: job.employerUUID
        });
        console.log('[投递申请] ========== 处理完成 ==========');

        res.status(201).json({
            success: true,
            message: '投递成功',
            data: {
                applicationId: application._id,
                status: application.status,
                submittedAt: application.submittedAt
            }
        });

    } catch (error) {
        console.error('[投递申请] 失败:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: '您已投递过该岗位'
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取当前学生的投递记录列表
 * @route GET /api/applications/my
 * @access 仅学生
 */
exports.getMyApplications = async (req, res) => {
    try {
        const studentUUID = req.user.userUUID;
        const { page = 1, limit = 10, status } = req.query;

        console.log('[我的投递] ========== 开始查询 ==========');
        console.log('[我的投递] 参数:', { studentUUID, page, limit, status });

        // 构建查询条件
        const query = { studentUUID };
        if (status) {
            query.status = status;
        }

        // 分页查询
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const applications = await Application.find(query)
            .populate({
                path: 'jobId',
                select: 'title category description salary workSchedule location status employerUUID applicationDeadline'
            })
            .populate({
                path: 'resumeId',
                select: 'studentStatus updatedAt'
            })
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Application.countDocuments(query);

        // 补充雇主信息
        const employerUUIDs = [...new Set(applications.map(a => a.jobId?.employerUUID).filter(Boolean))];
        const employers = await User.find(
            { userUUID: { $in: employerUUIDs } },
            'userUUID username avatar employerInfo'
        ).lean();

        const employerMap = {};
        employers.forEach(e => {
            employerMap[e.userUUID] = {
                username: e.username,
                avatar: e.avatar,
                companyName: e.employerInfo?.companyInfo?.companyName ||
                    e.employerInfo?.personalInfo?.realName || '未知雇主'
            };
        });

        // 组装返回数据
        const enrichedApplications = applications.map(app => ({
            ...app,
            job: app.jobId,
            resume: app.resumeId,
            employer: employerMap[app.jobId?.employerUUID] || null
        }));

        console.log('[我的投递] 查询结果:', { total, returned: enrichedApplications.length });
        console.log('[我的投递] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: enrichedApplications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[我的投递] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 检查学生对某岗位的投递状态
 * @route GET /api/applications/check/:jobId
 * @access 仅学生
 */
exports.checkApplicationStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const studentUUID = req.user.userUUID;

        console.log('[检查投递状态] 查询:', { jobId, studentUUID });

        const application = await Application.findOne(
            { jobId, studentUUID },
            '_id status submittedAt'
        ).lean();

        if (!application) {
            console.log('[检查投递状态] 未投递');
            return res.json({
                success: true,
                data: {
                    hasApplied: false
                }
            });
        }

        console.log('[检查投递状态] 已投递:', application.status);

        // rejected 和 completed状态允许重新投递，前端据此显示「重新投递」按钮
        const canReapply = application.status === 'rejected' || application.status === 'completed';

        res.json({
            success: true,
            data: {
                hasApplied: true,
                applicationId: application._id,
                status: application.status,
                submittedAt: application.submittedAt,
                canReapply: canReapply
            }
        });

    } catch (error) {
        console.error('[检查投递状态] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 学生撤回投递
 * @route DELETE /api/applications/:id
 * @access 仅学生
 */
exports.withdrawApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const studentUUID = req.user.userUUID;

        console.log('[撤回投递] ========== 开始处理 ==========');
        console.log('[撤回投递] 参数:', { id, studentUUID });

        const application = await Application.findById(id);
        if (!application) {
            console.log('[撤回投递] 记录不存在:', id);
            return res.status(404).json({
                success: false,
                message: '投递记录不存在'
            });
        }

        if (application.studentUUID !== studentUUID) {
            console.log('[撤回投递] 无权操作');
            return res.status(403).json({
                success: false,
                message: '无权操作此投递记录'
            });
        }

        if (!application.canWithdraw()) {
            console.log('[撤回投递] 状态不允许撤回:', application.status);
            return res.status(400).json({
                success: false,
                message: '当前状态无法撤回，只有待处理的投递可以撤回'
            });
        }

        application.status = 'withdrawn';
        application.statusUpdatedAt = new Date();
        await application.save();

        console.log('[撤回投递] 撤回成功:', id);
        console.log('[撤回投递] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '投递已撤回'
        });

    } catch (error) {
        console.error('[撤回投递] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取指定岗位的投递列表（雇主视角）
 * @route GET /api/applications/job/:jobId
 * @access 仅雇主（且只能看自己的岗位）
 */
exports.getJobApplications = async (req, res) => {
    try {
        const { jobId } = req.params;
        const employerUUID = req.user.userUUID;
        const { page = 1, limit = 20, status } = req.query;

        // // ========== 缓存读取 ==========
        // if (redis.isConnected()) {
        //     const cacheKey = `applications:job:${jobId}:${status || 'all'}:${page}`;
        //     const cached = await redis.pGet(cacheKey);
        //     if (cached) return res.json({ success: true, ...JSON.parse(cached) });
        // }

        console.log('[岗位投递列表] ========== 开始查询 ==========');
        console.log('[岗位投递列表] 参数:', { jobId, employerUUID, page, limit, status });

        // 验证岗位所有权
        const Job = require('../models/Job');
        const job = await Job.findOne({ _id: jobId, employerUUID });
        if (!job) {
            console.log('[岗位投递列表] 岗位不存在或无权访问');
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权访问'
            });
        }

        // 查询投递记录
        const query = { jobId };
        if (status) {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const applications = await Application.find(query)
            .populate({
                path: 'resumeId',
                select: 'studentUUID studentStatus skills projectExperiences internshipExperiences'
            })
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Application.countDocuments(query);

        // 补充学生信息
        const User = require('../models/User');
        const studentUUIDs = [...new Set(applications.map(a => a.studentUUID))];
        const students = await User.find(
            { userUUID: { $in: studentUUIDs } },
            'userUUID username avatar studentInfo'
        ).lean();

        const studentMap = {};
        students.forEach(s => {
            studentMap[s.userUUID] = {
                username: s.username,
                avatar: s.avatar,
                studentName: s.studentInfo?.studentName || s.username,
                school: s.studentInfo?.school || '未知学校',
                major: s.studentInfo?.major || '未知专业'
            };
        });

        // 组装返回数据
        const enrichedApplications = applications.map(app => ({
            ...app,
            student: studentMap[app.studentUUID] || null,
            resume: app.resumeId
        }));

        // 获取状态统计
        const stats = await Application.getJobStats(jobId);

        console.log('[岗位投递列表] 查询完成:', { total, returned: enrichedApplications.length });
        console.log('[岗位投递列表] ========== 查询完成 ==========');

        // // ========== 缓存回写 ==========
        // if (redis.isConnected()) {
        //     const cacheKey = `applications:job:${jobId}:${status || 'all'}:${page}`;
        //     const cacheData = {
        //         data: enrichedApplications,
        //         stats,
        //         pagination: {
        //             page: parseInt(page),
        //             limit: parseInt(limit),
        //             total,
        //             pages: Math.ceil(total / parseInt(limit))
        //         } };
        //     await redis.pSetex(cacheKey, 120, JSON.stringify(cacheData)); // 2分钟
        // }

        res.json({
            success: true,
            data: enrichedApplications,
            stats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[岗位投递列表] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新投递状态（雇主操作）
 * @route PATCH /api/applications/:id/status
 * @access 仅雇主（且只能操作自己岗位的投递）
 */
exports.updateApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, employerNotes } = req.body;
        const employerUUID = req.user.userUUID;

        console.log('[更新投递状态] ========== 开始处理 ==========');
        console.log('[更新投递状态] 参数:', { id, status, employerUUID });

        // 验证状态值
        const validStatuses = ['reviewing', 'interviewed', 'interview_completed', 'accepted', 'rejected', 'completed'];
        if (!validStatuses.includes(status)) {
            console.log('[更新投递状态] 无效的状态值:', status);
            return res.status(400).json({
                success: false,
                message: '无效的状态值'
            });
        }

        // 查找投递记录并验证权限
        const application = await Application.findById(id);
        if (!application) {
            console.log('[更新投递状态] 记录不存在:', id);
            return res.status(404).json({
                success: false,
                message: '投递记录不存在'
            });
        }

        if (application.employerUUID !== employerUUID) {
            console.log('[更新投递状态] 无权操作');
            return res.status(403).json({
                success: false,
                message: '无权操作此投递记录'
            });
        }

        // 状态流转校验
        const currentStatus = application.status;

        if (currentStatus === 'withdrawn') {
            return res.status(400).json({
                success: false,
                message: '学生已撤回投递，无法操作'
            });
        }

        // 更新状态
        await application.updateStatus(status);

        // 更新雇主备注
        if (employerNotes !== undefined) {
            application.employerNotes = employerNotes;
        }

        // ========== 保存面试信息 ==========
        if (status === 'interviewed' && req.body.interview) {
            application.interview = {
                interviewTime: req.body.interview.interviewTime || null,
                interviewType: req.body.interview.interviewType || 'online',
                interviewLocation: req.body.interview.interviewLocation || ''
            };
        }

        await application.save();

        // 所有状态变更都发送站内信通知，仅面试环节额外发送邮件
        await sendStatusChangeNotification(application, status, employerNotes, req);
        // ========== 在 application.save() 之后，添加以下缓存清除代码 ==========
        // 清除该岗位的雇主端投递列表缓存
        if (redis.isConnected()) {
            const jobId = application.jobId.toString();
            // 删除该岗位所有状态+分页组合的缓存（使用通配符模式）
            const cachePattern = `applications:job:${jobId}:*`;
            const keys = await redis.keys(`ptjob:${cachePattern}`);
            if (keys.length > 0) {
                await redis.del(keys);
                console.log('[缓存] 投递状态更新：已清除岗位投递列表缓存，数量:', keys.length);
            }
        }
        console.log('[更新投递状态] 更新成功:', {
            id,
            oldStatus: currentStatus,
            newStatus: status
        });
        console.log('[更新投递状态] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '状态更新成功',
            data: {
                status: application.status,
                statusUpdatedAt: application.statusUpdatedAt,
                reviewedAt: application.reviewedAt,
                decidedAt: application.decidedAt
            }
        });

    } catch (error) {
        console.error('[更新投递状态] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};


// ========== 状态变更通知函数 ==========

/**
 * 状态文案映射
 * 将状态枚举值映射为用户可读的中文描述
 */
const STATUS_LABEL_MAP = {
    reviewing: '雇主已查看您的简历',
    interviewed: '雇主邀请您进入面试环节',
    interview_completed: '面试已完成，等待雇主决策',
    accepted: '恭喜！您已被录用',
    rejected: '很遗憾，您暂时不合适',
    completed: '工作已完成'
};

/**
 * 发送状态变更通知（站内信 + 可选邮件）
 *
 * 当雇主更新投递状态时，自动在聊天会话中发送通知消息，
 * 仅在进入面试环节时额外发送邮件通知。
 *
 * @param {Object} application - 投递记录文档
 * @param {string} newStatus - 新状态值
 * @param {string} employerNotes - 雇主备注
 * @param {Object} req - Express 请求对象（用于获取 io 实例）
 */
async function sendStatusChangeNotification(application, newStatus, employerNotes, req) {
    // 面试以外的状态不需要邮件（根据需求仅面试发邮件）
    const needEmail = newStatus === 'interviewed';

    console.log('[状态通知] ========== 开始发送通知 ==========');
    console.log('[状态通知] 状态:', newStatus, '| 是否需要邮件:', needEmail);

    try {
        // ========== 1. 查询关联信息 ==========
        const User = require('../models/User');
        const Job = require('../models/Job');
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');

        const [student, job, employer] = await Promise.all([
            User.findOne({ userUUID: application.studentUUID }).select('email username studentInfo'),
            Job.findById(application.jobId).select('title'),
            User.findOne({ userUUID: application.employerUUID }).select('username employerInfo')
        ]);

        if (!student || !job) {
            console.warn('[状态通知] 学生或岗位信息缺失，跳过通知');
            return;
        }

        // ========== 2. 提取通用信息 ==========
        const employerUUID = application.employerUUID;
        const studentUUID = application.studentUUID;
        const jobTitle = job.title;
        const statusLabel = STATUS_LABEL_MAP[newStatus] || `状态更新为：${newStatus}`;

        // 雇主名称
        const companyName = employer?.employerInfo?.companyInfo?.companyName
            || employer?.employerInfo?.personalInfo?.realName
            || employer?.username
            || '未知雇主';

        // ========== 3. 邮件通知（仅面试环节） ==========
        if (needEmail) {
            const studentName = student.studentInfo?.studentName || student.username || '同学';
            const emailService = require('../config/emailService');

            // ========== 从 application.interview 中提取面试详情 ==========
            const interviewTime = application.interview?.interviewTime
                ? dayjs(application.interview.interviewTime).format('YYYY年MM月DD日 HH:mm')
                : '请查看站内信与雇主沟通确认';
            const interviewTypeLabel = application.interview?.interviewType === 'offline' ? '线下' : '线上';
            const interviewLocation = application.interview?.interviewType === 'offline'
                ? (application.interview?.interviewLocation || '待定')
                : '线上（具体链接请与雇主沟通确认）';

            const emailResult = await emailService.sendInterviewEmail({
                to: student.email,
                studentName: studentName,
                jobTitle: jobTitle,
                companyName: companyName,
                interviewTime: interviewTime,
                interviewLocation: `${interviewTypeLabel} - ${interviewLocation}`,
                employerNotes: employerNotes || ''
            });

            console.log('[状态通知] 邮件发送结果:', emailResult ? '成功' : '失败');
        }

        // ========== 4. 构造通知消息内容（JSON 格式） ==========
        // 区分普通状态变更和最终结果通知，便于前端渲染不同的卡片样式
        const isFinalResult = newStatus === 'accepted' || newStatus === 'rejected';
        const isInterview = newStatus === 'interviewed';

        let messageType;
        if (isFinalResult) {
            messageType = 'result_notification';
        } else if (isInterview) {
            messageType = 'interview_notification';
        } else {
            messageType = 'status_change';
        }

        const notificationContent = JSON.stringify({
            type: messageType,
            applicationId: application._id.toString(),
            jobId: job._id.toString(),
            jobTitle: jobTitle,
            companyName: companyName,
            employerUUID: employerUUID,
            newStatus: newStatus,
            statusLabel: statusLabel,
            employerNotes: employerNotes || '',
            notifiedAt: new Date().toISOString(),
            ...(newStatus === 'interviewed' ? {
                interviewTime: application.interview?.interviewTime || null,
                interviewType: application.interview?.interviewType || 'online',
                interviewLocation: application.interview?.interviewLocation || ''
            } : {})
        });

        // ========== 5. 查找或创建会话 ==========
        const conversation = await Conversation.findOrCreate(employerUUID, studentUUID);
        console.log('[状态通知] 会话ID:', conversation._id);

        // ========== 6. 创建通知消息 ==========
        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID: employerUUID,
            receiverUUID: studentUUID,
            content: notificationContent,
            type: 'text',
            metadata: {
                jobId: job._id,
                jobTitle: jobTitle,
                action: 'status_change',
                newStatus: newStatus
            }
        });

        // ========== 7. 更新会话最后消息 ==========
        // 会话列表摘要显示为可读文本
        const summaryMap = {
            reviewing: `【简历已查看】${companyName}查看了您对「${jobTitle}」的投递`,
            interviewed: `【面试通知】${companyName}邀请您参加「${jobTitle}」的面试`,
            interview_completed: `【面试完成】${companyName}已完成对您「${jobTitle}」的面试`,
            accepted: `【已录用】${companyName}已录用您担任「${jobTitle}」`,
            rejected: `【未通过】${companyName}认为您暂不适合「${jobTitle}」`,
            completed: `【工作完成】${companyName}标记您对「${jobTitle}」的工作已完成`
        };
        conversation.lastMessage = {
            content: summaryMap[newStatus] || `${companyName}更新了「${jobTitle}」的投递状态`,
            senderUUID: employerUUID,
            sentAt: new Date()
        };
        const unreadMap = conversation.unreadCount instanceof Map
            ? conversation.unreadCount
            : new Map(Object.entries(conversation.unreadCount || {}));
        const currentCount = unreadMap.get(studentUUID) || 0;
        unreadMap.set(studentUUID, currentCount + 1);
        conversation.unreadCount = unreadMap;
        conversation.updatedAt = new Date();
        await conversation.save();

        console.log('[状态通知] 站内信已创建:', message._id);

        // ========== 8. 通过 WebSocket 推送实时通知 ==========
        const io = req.app.get('io');
        if (io) {
            // 推送给学生（ChatRoom 实时渲染）
            io.to(studentUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id.toString()
            });

            // 同时推送给雇主（更新会话列表）
            io.to(employerUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id.toString()
            });

            // 推送状态变更事件（前端可用于弹窗/角标提醒）
            io.to(studentUUID).emit('application_status_changed', {
                applicationId: application._id.toString(),
                jobId: job._id.toString(),
                jobTitle: jobTitle,
                newStatus: newStatus,
                statusLabel: statusLabel,
                conversationId: conversation._id.toString()
            });

            console.log('[状态通知] WebSocket 已推送至学生:', studentUUID, '和雇主:', employerUUID);
        } else {
            console.warn('[状态通知] io 实例未获取，WebSocket 推送跳过');
        }

        // ========== 调试：验证消息是否创建成功 ==========
        const verifyMessage = await Message.findById(message._id).lean();
        console.log('[状态通知][调试] 消息验证:', {
            exists: !!verifyMessage,
            content: verifyMessage?.content?.slice(0, 80),
            conversationId: verifyMessage?.conversationId?.toString()
        });

        // ========== 调试：验证会话是否存在 ==========
        const verifyConversation = await Conversation.findById(conversation._id).lean();
        console.log('[状态通知][调试] 会话验证:', {
            exists: !!verifyConversation,
            participants: verifyConversation?.participants,
            lastMessageContent: verifyConversation?.lastMessage?.content
        });

        console.log('[状态通知] ========== 通知发送完成 ==========');

    } catch (error) {
        console.error('[状态通知] 发送失败:', error);
        // 通知失败不阻塞主流程（状态已更新）
    }
}