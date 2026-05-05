// routes/comments.js
// ========== 评论路由 ==========
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const commentController = require('../controllers/commentController');

// ========== 公开路由（无需认证） ==========
// 获取举报原因列表
router.get('/report-reasons', commentController.getReportReasons);


// 所有评论路由都需要身份验证
router.use(authMiddleware);

// ========== 评论管理 ==========

// 获取岗位评论列表（jobId通过query参数传递）
router.get('/', commentController.getComments);

// 发布评论/回复（jobId在请求体中传递）
router.post('/', commentController.commentValidation, commentController.createComment);

// 编辑评论
router.put('/:id', commentController.updateComment);

// 删除评论
router.delete('/:id', commentController.deleteComment);

// 置顶/取消置顶评论
router.patch('/:id/pin', commentController.togglePinComment);

// ========== 互动操作 ==========

// 点赞/取消点赞
router.post('/:id/like', commentController.toggleLike);

// ========== 举报 ==========

// 举报评论
router.post('/:id/report', commentController.reportValidation, commentController.reportComment);

// ========== 屏蔽用户 ==========

// 屏蔽用户
router.post('/block-user', commentController.blockUser);

// 解除屏蔽
router.delete('/block-user/:uuid', commentController.unblockUser);


// ========== 评论申诉 ==========
router.post('/:id/appeal', commentController.appealComment);

module.exports = router;