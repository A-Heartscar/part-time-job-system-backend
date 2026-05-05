// config/adminJwt.js
// ========== 管理员 JWT 配置 ==========
// 使用独立密钥和过期时间，与普通用户 JWT 完全隔离
// Token 存储位置：Cookie 键名 'admin_token'，Header 前缀 'AdminHeartscar '
const jwt = require('jsonwebtoken');

// 从环境变量读取，提供默认值
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin_temp_key_789012';
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '8h';

// ========== Token 黑名单（内存存储，使用 Set） ==========
const tokenBlacklist = new Set();

/**
 * 生成管理员 JWT Token
 * @param {Object} payload - 管理员信息 { adminId, adminUUID, username, role }
 * @returns {string} JWT Token
 */
exports.generateAdminToken = (payload) => {
    console.log('[AdminJWT] 生成管理员 Token:', {
        adminUUID: payload.adminUUID,
        username: payload.username,
        role: payload.role
    });

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
};

/**
 * 验证管理员 JWT Token
 * @param {string} token - Token 字符串
 * @returns {Object} 解码后的管理员信息
 */
exports.verifyAdminToken = async (token) => {
    try {
        // 检查 token 是否在黑名单中
        if (tokenBlacklist.has(token)) {
            throw new Error('令牌已失效');
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('[AdminJWT] Token 验证成功:', decoded.username);
        return decoded;
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new Error('管理员令牌已过期');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('管理员令牌无效');
        } else if (error.message === '令牌已失效') {
            throw new Error('管理员令牌已失效，请重新登录');
        } else {
            throw new Error('管理员身份验证失败');
        }
    }
};

/**
 * 使管理员 Token 失效（加入黑名单）
 * @param {string} token - 要失效的 Token
 * @returns {boolean} 是否成功
 */
exports.invalidateAdminToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // 加入黑名单
        tokenBlacklist.add(token);

        // 设置定时清理（Token 过期后自动从黑名单移除）
        const expiresIn = decoded.exp * 1000 - Date.now();
        if (expiresIn > 0) {
            setTimeout(() => {
                tokenBlacklist.delete(token);
                console.log('[AdminJWT] 已过期 Token 从黑名单移除');
            }, expiresIn);
        }

        console.log('[AdminJWT] Token 已加入黑名单');
        return true;
    } catch (error) {
        console.error('[AdminJWT] Token 失效失败:', error.message);
        return false;
    }
};