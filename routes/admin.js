// routes/admin.js
// ========== 管理员路由 ==========
// 独立路由前缀 /api/admin，与普通用户 /api 路由物理隔离
const express = require('express');
const router = express.Router();
const adminAuthMiddleware = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

// ========== 登录接口（不需要鉴权） ==========
router.post(
    '/login',
    adminController.loginValidation,
    adminController.adminLogin
);

// ========== 以下接口需要管理员鉴权 ==========

// 登出
router.post('/logout', adminAuthMiddleware, adminController.adminLogout);

// 获取当前管理员信息
router.get('/me', adminAuthMiddleware, adminController.getCurrentAdmin);

// 更新个人信息
router.put('/me', adminAuthMiddleware, adminController.updateAdminInfo);

// 修改密码
router.put('/change-password', adminAuthMiddleware, adminController.changeAdminPassword);

// 创建子管理员（仅 super_admin）
router.post('/create', adminAuthMiddleware, adminController.createSubAdmin);

// 获取管理员列表（仅 super_admin）
router.get('/list', adminAuthMiddleware, adminController.getAdminList);

// 更新管理员状态（仅 super_admin）
router.put('/:adminUUID/status', adminAuthMiddleware, adminController.updateAdminStatus);

// 登录日志
router.get('/logs/login', adminAuthMiddleware, adminController.getLoginLogs);

// 操作日志
router.get('/logs/operation', adminAuthMiddleware, adminController.getOperationLogs);

// 待审核实习列表
router.get('/pending/internships', adminAuthMiddleware, adminController.getPendingInternships);

// 审核实习
router.post('/verify/internship/:resumeId/:internshipIndex', adminAuthMiddleware, adminController.verifyInternship);

// 待审核雇主列表
router.get('/pending/employers', adminAuthMiddleware, adminController.getPendingEmployers);

// 审核雇主
router.post('/verify/employer/:userUUID', adminAuthMiddleware, adminController.verifyEmployer);


// ========== 评论举报审核系统路由 ==========

// 举报工单管理
router.get('/reports', adminAuthMiddleware, adminController.getPendingReports);
router.get('/reports/:reportId', adminAuthMiddleware, adminController.getReportDetail);
router.post('/reports/:reportId/process', adminAuthMiddleware, adminController.processReport);
router.post('/reports/batch-process', adminAuthMiddleware, adminController.batchProcessReports);
router.post('/reports/:reportId/claim', adminAuthMiddleware, adminController.claimReport);
router.post('/reports/:reportId/release', adminAuthMiddleware, adminController.releaseReport);
router.post('/reports/:reportId/transfer', adminAuthMiddleware, adminController.transferReport);

// 申诉管理
router.get('/appeals', adminAuthMiddleware, adminController.getAppeals);
router.post('/appeals/:reportId/process', adminAuthMiddleware, adminController.processAppeal);

// 审核统计
router.get('/audit-stats', adminAuthMiddleware, adminController.getAuditStats);

// 举报原因配置
router.get('/report-reasons', adminAuthMiddleware, adminController.getAdminReportReasons);
router.post('/report-reasons', adminAuthMiddleware, adminController.createReportReason);
router.put('/report-reasons/:reasonKey', adminAuthMiddleware, adminController.updateReportReason);
router.delete('/report-reasons/:reasonKey', adminAuthMiddleware, adminController.deleteReportReason);

// 处罚管理
router.get('/penalties/:penaltyId', adminAuthMiddleware, adminController.getPenaltyDetail);
router.post('/penalties/:penaltyId/revoke', adminAuthMiddleware, adminController.revokePenalty);
module.exports = router;