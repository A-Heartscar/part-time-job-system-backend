// ========== 岗位收藏路由 ==========
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const favoriteController = require('../controllers/favoriteController');

router.use(authMiddleware);

// 获取收藏列表
router.get('/', favoriteController.getFavorites);

// 检查是否已收藏
router.get('/:jobId/check', favoriteController.checkFavorite);

// 收藏岗位
router.post('/:jobId', favoriteController.addFavorite);

// 取消收藏
router.delete('/:jobId', favoriteController.removeFavorite);

module.exports = router;