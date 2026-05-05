// ========== WebSocket 聊天处理 ==========
const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const { verifyToken } = require('../config/jwt');
const JWT_SECRET = 'temp-key-123456'; // 与 jwt.js 保持一致

const onlineUsers = new Map(); // 内存降级方案
function initChatSocket(io) {

    // 认证中间件
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('未提供认证令牌'));
        }

        try {
            const decoded = await verifyToken(token);
            socket.userUUID = decoded.userUUID;
            socket.username = decoded.username;
            socket.role = decoded.role;
            next();
        } catch (error) {
            next(new Error('认证失败'));
        }
    });

    io.on('connection', async (socket) => {
        console.log('[Socket] 用户连接:', socket.userUUID, socket.username);

        socket.join(socket.userUUID);

        // ========== 在线用户管理 ==========
        if (redis.isConnected()) {
            // Redis 可用：使用 Sorted Set + Hash
            await redis.pZadd('online_users', Date.now(), socket.userUUID);
            await redis.pHset('online_sockets', socket.userUUID, socket.id);

            // 启动心跳定时器（每 30 秒刷新时间戳和 Socket 映射 TTL）
            socket.heartbeatTimer = setInterval(async () => {
                try {
                    await redis.pZadd('online_users', Date.now(), socket.userUUID);
                    await redis.pExpire('online_sockets', 300);
                } catch (err) {
                    console.error('[Socket] 心跳刷新失败:', err.message);
                }
            }, 30000);

            console.log('[Socket] 用户上线（Redis）:', socket.userUUID);
        } else {
            // Redis 不可用：回退到内存 Map
            onlineUsers.set(socket.userUUID, socket.id);
            console.log('[Socket] 用户上线（内存降级）:', socket.userUUID);
        }

        // 广播在线状态
        io.emit('online_status', {
            userUUID: socket.userUUID,
            online: true
        });

        /**
         * 发送消息
         */
        socket.on('send_message', async (data) => {
            try {
                // 校验参数
                if (!data.receiverUUID) {
                    console.error('[Socket] receiverUUID 为空');
                    socket.emit('error', {message: '接收者信息缺失'});
                    return;
                }

                console.log('[Socket] 收到消息:', {
                    from: socket.userUUID,
                    to: data.receiverUUID,
                    content: data.content?.slice(0, 30)
                });

                const Conversation = require('../models/Conversation');
                const Message = require('../models/Message');

                // 查找或创建会话
                const conversation = await Conversation.findOrCreate(
                    socket.userUUID,
                    data.receiverUUID
                );

                // 创建消息
                const message = await Message.create({
                    conversationId: conversation._id,
                    senderUUID: socket.userUUID,
                    receiverUUID: data.receiverUUID,
                    content: data.content,
                    type: data.type || 'text',
                    metadata: data.metadata || {}
                });

                // ========== 清除双方会话缓存 ==========
                if (redis.isConnected()) {
                    await redis.pDel(`chat:conversations:${socket.userUUID}`);
                    await redis.pDel(`chat:conversations:${data.receiverUUID}`);
                    console.log('[Socket缓存] 消息发送：已清除双方会话缓存');
                }

                // 更新会话最后消息
                conversation.lastMessage = {
                    content: data.content.slice(0, 100),
                    senderUUID: socket.userUUID,
                    sentAt: new Date()
                };
                const unreadMap = conversation.unreadCount instanceof Map
                    ? conversation.unreadCount
                    : new Map(Object.entries(conversation.unreadCount || {}));

                const currentCount = unreadMap.get(data.receiverUUID) || 0;
                unreadMap.set(data.receiverUUID, currentCount + 1);
                conversation.unreadCount = unreadMap;
                conversation.updatedAt = new Date();
                await conversation.save();

                // ========== 获取接收者 socketId ==========
                let receiverSocketId;
                if (redis.isConnected()) {
                    receiverSocketId = await redis.pHget('online_sockets', data.receiverUUID);
                } else {
                    receiverSocketId = onlineUsers.get(data.receiverUUID);
                }

                // 推送给接收者（如果在线）
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new_message', {
                        message: message.toObject(),
                        conversationId: conversation._id
                    });
                    console.log('[Socket] 消息已推送给接收者:', data.receiverUUID);
                } else {
                    console.log('[Socket] 接收者离线，消息仅存储到数据库:', data.receiverUUID);
                }

                // 推送给发送者
                io.to(socket.userUUID).emit('new_message', {
                    message: message.toObject(),
                    conversationId: conversation._id
                });

                console.log('[Socket] 消息已推送');

            } catch (error) {
                console.error('[Socket] 消息处理失败:', error);
                socket.emit('error', {message: '消息发送失败'});
            }
        });

        // ========== 处理岗位邀请消息 ==========
        /**
         * 发送岗位邀请消息（通过 WebSocket）
         * 前端组件可在不刷新页面的情况下发送邀请
         * 处理逻辑与 REST API 类似，但直接通过 socket 通信
         */
        socket.on('send_invitation', async (data) => {
            try {
                // ========== 校验参数 ==========
                if (!data.receiverUUID || !data.jobId || !data.jobTitle) {
                    console.error('[Socket] 邀请消息缺少参数');
                    socket.emit('error', {message: '邀请信息不完整'});
                    return;
                }

                // ========== 校验角色（仅雇主可发送） ==========
                if (socket.role !== 'employer') {
                    console.warn('[Socket] 非雇主尝试发送邀请');
                    socket.emit('error', {message: '仅雇主可发送邀请'});
                    return;
                }

                console.log('[Socket] 收到邀请消息:', {
                    from: socket.userUUID,
                    to: data.receiverUUID,
                    jobTitle: data.jobTitle
                });

                const Conversation = require('../models/Conversation');
                const Message = require('../models/Message');

                // ========== 构造邀请内容 ==========
                const invitationContent = JSON.stringify({
                    jobId: data.jobId,
                    jobTitle: data.jobTitle,
                    jobCategory: data.jobCategory || 'other',
                    salary: data.salary || {baseRate: 0, rateType: 'hourly'},
                    scheduleType: data.scheduleType || 'flexible_hours',
                    location: data.location || {},
                    employerName: socket.username
                });

                // ========== 查找或创建会话 ==========
                const conversation = await Conversation.findOrCreate(
                    socket.userUUID,
                    data.receiverUUID
                );

                // ========== 创建邀请消息 ==========
                const message = await Message.create({
                    conversationId: conversation._id,
                    senderUUID: socket.userUUID,
                    receiverUUID: data.receiverUUID,
                    content: invitationContent,
                    type: 'invitation',
                    metadata: {
                        jobId: data.jobId,
                        jobTitle: data.jobTitle,
                        action: 'invite'
                    }
                });

                // ========== 更新会话最后消息 ==========
                conversation.lastMessage = {
                    content: `[岗位邀请] ${data.jobTitle}`,
                    senderUUID: socket.userUUID,
                    sentAt: new Date()
                };
                const unreadMap = conversation.unreadCount instanceof Map
                    ? conversation.unreadCount
                    : new Map(Object.entries(conversation.unreadCount || {}));

                const currentCount = unreadMap.get(data.receiverUUID) || 0;
                unreadMap.set(data.receiverUUID, currentCount + 1);
                conversation.unreadCount = unreadMap;
                conversation.updatedAt = new Date();
                await conversation.save();

                // ========== 推送给接收者 ==========
                let receiverSocketId;
                if (redis.isConnected()) {
                    receiverSocketId = await redis.pHget('online_sockets', data.receiverUUID);
                } else {
                    receiverSocketId = onlineUsers.get(data.receiverUUID);
                }
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new_message', {
                        message: message.toObject(),
                        conversationId: conversation._id
                    });
                }

                // 额外推送邀请通知事件
                io.to(data.receiverUUID).emit('job_invitation', {
                    from: socket.userUUID,
                    fromName: socket.username,
                    jobId: data.jobId,
                    jobTitle: data.jobTitle,
                    conversationId: conversation._id.toString()
                });

                // 推送给发送者更新会话列表
                io.to(socket.userUUID).emit('new_message', {
                    message: message.toObject(),
                    conversationId: conversation._id
                });

                console.log('[Socket] 邀请消息已推送');

            } catch (error) {
                console.error('[Socket] 邀请消息处理失败:', error);
                socket.emit('error', {message: '邀请发送失败'});
            }
        });

        /**
         * 标记已读
         */
        socket.on('mark_read', async (data) => {
            try {
                const Conversation = require('../models/Conversation');
                const conversation = await Conversation.findById(data.conversationId);
                if (conversation) {
                    conversation.unreadCount.set(socket.userUUID, 0);
                    await conversation.save();
                }
            } catch (error) {
                console.error('[Socket] 标记已读失败:', error);
            }
        });

        /**
         * 断开连接
         */
        socket.on('disconnect', async () => {
            console.log('[Socket] 用户断开:', socket.userUUID);

            // 清除心跳定时器
            if (socket.heartbeatTimer) {
                clearInterval(socket.heartbeatTimer);
                socket.heartbeatTimer = null;
            }

            // 从在线列表中移除
            if (redis.isConnected()) {
                await redis.pZrem('online_users', socket.userUUID);
                await redis.pHdel('online_sockets', socket.userUUID);
                console.log('[Socket] 用户下线（Redis）:', socket.userUUID);
            } else {
                onlineUsers.delete(socket.userUUID);
                console.log('[Socket] 用户下线（内存降级）:', socket.userUUID);
            }

            io.emit('online_status', {
                userUUID: socket.userUUID,
                online: false
            });
        });
    });

    console.log('[Socket] 初始化完成');
}

module.exports = initChatSocket;