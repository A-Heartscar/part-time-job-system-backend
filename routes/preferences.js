// ========== 用户偏好路由 ==========
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const preferenceController = require('../controllers/preferenceController');

router.use(authMiddleware);

// 获取偏好设置
router.get('/', preferenceController.getPreference);

// 更新偏好设置
router.put('/', preferenceController.updatePreference);

// 重置为默认
router.post('/reset', preferenceController.resetPreference);

module.exports = router;