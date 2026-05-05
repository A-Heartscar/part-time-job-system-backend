// 用户路由
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require("../middleware/auth");

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

// 注册接口
router.post('/register', userController.registerUser);

// 登录接口
router.post('/', userController.loginUser);

// 登出接口
router.post('/logout', authMiddleware, userController.logoutUser);

// 获取当前用户信息
router.get('/me', authMiddleware, userController.getCurrentUser);
// 头像上传
router.post('/avatar', authMiddleware, userController.uploadAvatar);

// 上传举报图片
router.post('/upload-report-image', authMiddleware, userController.uploadReportImage);

// 更新信息
router.put('/me', authMiddleware, userController.updateUserInfo);

// 修改密码 - 新增
router.put('/change-password',
    authMiddleware,
    userController.changePasswordValidation,
    userController.changePassword
);

// 用户搜索
router.get('/search', authMiddleware, userController.searchUsers);

// ========== 忘记密码路由 ==========

// 第一步：通过用户名获取脱敏邮箱
router.post('/forgot-password', userController.forgotPassword);

// 第二步：发送重置密码验证码
router.post('/send-reset-code', userController.sendResetCode);

// 第三步：验证码校验 + 重置密码
router.post('/reset-password', userController.resetPassword);

// 发送注册验证码（注册时使用）
router.post('/send-register-code', userController.sendRegisterCode);
// ========== 身份验证路由 ==========

// 提交身份验证申请（雇主主动提交）
router.post('/verify', authMiddleware, userController.submitVerification);

// 管理员审核身份验证（预留，待管理员系统开发后启用）
// TODO: 添加管理员权限中间件 adminAuthMiddleware
router.put('/verify/review', authMiddleware, userController.reviewVerification);

module.exports = router;
