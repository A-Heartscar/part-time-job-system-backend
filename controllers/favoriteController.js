// ========== 岗位收藏控制器 ==========
const Favorite = require('../models/Favorite');

/**
 * 获取当前学生的收藏列表
 * @route GET /api/favorites
 */
exports.getFavorites = async (req, res) => {
    try {
        const studentUUID = req.user.userUUID;
        const { page = 1, limit = 12 } = req.query;

        console.log('[收藏列表] 查询:', { studentUUID, page, limit });

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 查询收藏记录并关联岗位信息
        const favorites = await Favorite.find({ studentUUID })
            .populate({
                path: 'jobId',
                select: 'title category description salary workSchedule location status employerUUID applicationDeadline createdAt'
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Favorite.countDocuments({ studentUUID });

        // 补充雇主信息
        const employerUUIDs = [...new Set(favorites.map(f => f.jobId?.employerUUID).filter(Boolean))];
        const User = require('../models/User');
        const employers = await User.find(
            { userUUID: { $in: employerUUIDs } },
            'userUUID username avatar employerInfo'
        ).lean();

        const employerMap = {};
        employers.forEach(e => {
            employerMap[e.userUUID] = {
                username: e.username,
                avatar: e.avatar,
                displayName: e.employerInfo?.companyInfo?.companyName ||
                    e.employerInfo?.personalInfo?.realName || e.username,
                verified: !!e.employerInfo?.companyInfo?.creditCode
            };
        });

        // 组装返回数据
        const enrichedFavorites = favorites.map(fav => ({
            _id: fav._id,
            jobId: fav.jobId?._id,
            job: fav.jobId ? {
                ...fav.jobId,
                employer: employerMap[fav.jobId.employerUUID] || { username: '未知雇主', displayName: '未知雇主' }
            } : null,
            notes: fav.notes,
            createdAt: fav.createdAt
        })).filter(f => f.job !== null); // 过滤掉已删除的岗位

        console.log('[收藏列表] 结果:', { total, returned: enrichedFavorites.length });

        res.json({
            success: true,
            data: enrichedFavorites,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[收藏列表] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};

/**
 * 收藏岗位
 * @route POST /api/favorites/:jobId
 */
exports.addFavorite = async (req, res) => {
    try {
        const { jobId } = req.params;
        const studentUUID = req.user.userUUID;

        console.log('[收藏] 添加:', { studentUUID, jobId });

        // 检查岗位是否存在
        const Job = require('../models/Job');
        const job = await Job.findById(jobId).select('status').lean();
        if (!job) {
            return res.status(404).json({ success: false, message: '岗位不存在' });
        }

        // 创建收藏
        const favorite = new Favorite({ studentUUID, jobId });
        await favorite.save();

        console.log('[收藏] 成功:', favorite._id);

        res.status(201).json({ success: true, message: '收藏成功', data: { favoriteId: favorite._id } });

    } catch (error) {
        console.error('[收藏] 失败:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: '您已收藏过该岗位' });
        }
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};

/**
 * 取消收藏
 * @route DELETE /api/favorites/:jobId
 */
exports.removeFavorite = async (req, res) => {
    try {
        const { jobId } = req.params;
        const studentUUID = req.user.userUUID;

        console.log('[取消收藏] 删除:', { studentUUID, jobId });

        const result = await Favorite.findOneAndDelete({ studentUUID, jobId });
        if (!result) {
            return res.status(404).json({ success: false, message: '收藏记录不存在' });
        }

        console.log('[取消收藏] 成功');

        res.json({ success: true, message: '已取消收藏' });

    } catch (error) {
        console.error('[取消收藏] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};

/**
 * 检查是否已收藏
 * @route GET /api/favorites/:jobId/check
 */
exports.checkFavorite = async (req, res) => {
    try {
        const { jobId } = req.params;
        const studentUUID = req.user.userUUID;

        const isFavorited = await Favorite.isFavorited(studentUUID, jobId);

        res.json({ success: true, data: { isFavorited } });

    } catch (error) {
        console.error('[收藏检查] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};