// ========== 消息路由 ==========
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const messageController = require('../controllers/messageController');

router.use(authMiddleware);

// 获取会话列表
router.get('/conversations', messageController.getConversations);

// 获取会话消息
router.get('/conversations/:conversationId', messageController.getMessages);

// 发送消息
router.post('/send', messageController.sendMessage);

// 发送岗位邀请消息
router.post('/send-invitation', messageController.sendInvitation);

// 面试确认回复
router.post('/interview-reply', messageController.sendInterviewReply);

// 雇主处理改期申请
router.post('/reschedule-reply', messageController.handleRescheduleReply);

module.exports = router;