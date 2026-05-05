// ========== 投递记录路由 ==========
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const applicationController = require('../controllers/applicationController');

// 所有投递路由都需要身份验证
router.use(authMiddleware);

// ========== 学生操作 ==========

// 检查对某岗位的投递状态（必须放在 /my 和 /job 之前）
router.get('/check/:jobId', applicationController.checkApplicationStatus);

// 获取当前学生的投递记录
router.get('/my', applicationController.getMyApplications);

// 投递简历
router.post('/',
    applicationController.applicationValidation,
    applicationController.submitApplication
);

// 撤回投递
router.delete('/:id', applicationController.withdrawApplication);

// ========== 雇主操作 ==========

// 获取指定岗位的投递列表
router.get('/job/:jobId', applicationController.getJobApplications);

// 更新投递状态
router.patch('/:id/status', applicationController.updateApplicationStatus);

module.exports = router;