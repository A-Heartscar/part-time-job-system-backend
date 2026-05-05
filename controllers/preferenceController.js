// ========== 用户偏好控制器 ==========
const UserPreference = require('../models/UserPreference');
const redis = require('../config/redis');


/**
 * 获取当前用户的偏好设置
 */
exports.getPreference = async (req, res) => {
    try {
        const userUUID = req.user.userUUID;
        const userType = req.user.role;

        console.log('[偏好获取] 请求:', { userUUID, userType });

        const preference = await UserPreference.getOrCreate(userUUID, userType);

        res.json({
            success: true,
            data: {
                userType: preference.userType,
                mode: preference.mode,
                enabled: preference.enabled,
                rawPreferences: preference.rawPreferences,
                weights: preference.weights
            }
        });

    } catch (error) {
        console.error('[偏好获取] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新用户偏好设置
 */
exports.updatePreference = async (req, res) => {
    try {
        const userUUID = req.user.userUUID;
        const userType = req.user.role;
        const { mode, rawPreferences, enabled } = req.body;

        console.log('[偏好更新] 请求:', { userUUID, userType, mode, enabled });

        let preference = await UserPreference.findOne({ userUUID });

        if (!preference) {
            preference = new UserPreference({ userUUID, userType });
        }

        if (mode !== undefined) preference.mode = mode;
        if (enabled !== undefined) preference.enabled = enabled;

        if (rawPreferences) {
            if (rawPreferences.dimensions) {
                Object.assign(preference.rawPreferences.dimensions, rawPreferences.dimensions);
            }

            if (mode === 'advanced' || preference.mode === 'advanced') {
                const subScoreFields = [
                    'skillSubScores', 'experienceSubScores', 'qualitySubScores',
                    'timeSubScores', 'salarySubScores', 'locationSubScores', 'materialSubScores'
                ];

                subScoreFields.forEach(field => {
                    if (rawPreferences[field]) {
                        Object.assign(preference.rawPreferences[field], rawPreferences[field]);
                    }
                });
            }
        }

        preference.weights = preference.calculateWeights(mode || preference.mode);
        await preference.save();

        if (redis.isConnected()) {
            await redis.pDel(`jobs:recommended:${userUUID}`);
            console.log('[缓存] 偏好更新：已清除推荐缓存');
        }

        res.json({
            success: true,
            message: '偏好设置已更新',
            data: {
                mode: preference.mode,
                enabled: preference.enabled,
                rawPreferences: preference.rawPreferences,
                weights: preference.weights
            }
        });

    } catch (error) {
        console.error('[偏好更新] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 重置为默认偏好
 */
exports.resetPreference = async (req, res) => {
    try {
        const userUUID = req.user.userUUID;
        const userType = req.user.role;

        console.log('[偏好重置] 请求:', { userUUID, userType });

        let preference = await UserPreference.findOne({ userUUID });

        if (!preference) {
            preference = new UserPreference({ userUUID, userType });
        } else {
            preference.resetToDefault();
        }

        await preference.save();

        if (redis.isConnected()) {
            await redis.pDel(`jobs:recommended:${userUUID}`);
            console.log('[缓存] 偏好重置：已清除推荐缓存');
        }
        
        res.json({
            success: true,
            message: '已重置为默认偏好',
            data: {
                mode: preference.mode,
                enabled: preference.enabled,
                rawPreferences: preference.rawPreferences,
                weights: preference.weights
            }
        });

    } catch (error) {
        console.error('[偏好重置] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};