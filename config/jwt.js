// config/jwt.js
const jwt = require('jsonwebtoken');
const redis = require('./redis');

// 这里后续要改，设置配置文件
const JWT_SECRET = 'temp-key-123456';
const JWT_EXPIRES_IN = '24h';

// 简单内存存储token黑名单（后续应使用Redis）
const tokenBlacklist = new Set();

/**
 * 生成JWT令牌
 * @param {Object} payload - 存入令牌用户信息
 * @returns {String} JWT令牌
 */
exports.generateToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
};

/**
 * 验证JWT令牌合法性
 * @param {String} token - 前端传入的令牌
 * @returns {Object} 解码后的用户信息（验证失败抛错）
 */
exports.verifyToken = async (token) => {
    try {
        // ========== 检查 token 是否在黑名单中 ==========
        if (redis.isConnected()) {
            // Redis 可用：使用 Redis 检查黑名单
            const tokenKey = `token:blacklist:${token.slice(0, 8)}`;
            const exists = await redis.pExists(tokenKey);
            if (exists) {
                throw new Error('令牌已失效');
            }
            console.log('[JWT] Redis 黑名单检查通过');
        } else {
            // Redis 不可用：回退到内存 Set
            if (tokenBlacklist.has(token)) {
                throw new Error('令牌已失效');
            }
            console.log('[JWT] 内存黑名单检查通过（降级模式）');
        }

        // ========== 验证 JWT ==========
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (error) {
        // 错误处理保持不变
        if (error.name === 'TokenExpiredError') {
            throw new Error('令牌已过期');
        } else if (error.name === 'JsonWebTokenError') {
            throw new Error('令牌无效');
        } else if (error.message === '令牌已失效') {
            throw new Error('令牌已失效，请重新登录');
        } else {
            throw new Error('身份验证失败');
        }
    }
}

/**
 * 使token失效（加入黑名单）
 * @param {String} token - 要失效的token
 */
exports.invalidateToken = (token) => {
    try {
        // 先验证 token 获取 decoded（不使用 exports.verifyToken 避免循环依赖）
        const decoded = jwt.verify(token, JWT_SECRET);

        if (redis.isConnected()) {
            // Redis 可用：使用 SETEX 存储黑名单，自动过期
            const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
            if (expiresIn > 0) {
                const tokenKey = `token:blacklist:${token.slice(0, 8)}`;
                redis.pSetex(tokenKey, expiresIn, 'revoked');
                console.log('[JWT] Token 已加入 Redis 黑名单, TTL:', expiresIn, '秒');
            }
        } else {
            // Redis 不可用：回退到内存 Set
            tokenBlacklist.add(token);
            const expiresIn = decoded.exp * 1000 - Date.now();
            if (expiresIn > 0) {
                setTimeout(() => {
                    tokenBlacklist.delete(token);
                }, expiresIn);
            }
            console.log('[JWT] Token 已加入内存黑名单（降级模式）');
        }

        return true;
    } catch (error) {
        console.error('[JWT] 使token失效失败:', error.message);
        return false;
    }
};

/**
 * 使用户的所有token失效（通过用户ID）
 * @param {String} userId - 用户ID
 * @param {String} currentToken - 当前token（可选）
 * @returns {Boolean} 是否成功
 */
exports.invalidateUserTokens = (userId, currentToken = null) => {
    try {
        // 注意：这个简单实现只能使传入的当前token失效
        // 生产环境需要更复杂的机制来追踪用户的所有活跃token
        if (currentToken) {
            return this.invalidateToken(currentToken);
        }
        return false;
    } catch (error) {
        console.error('使用户token失效失败:', error.message);
        return false;
    }
};

/**
 * 此方法已废弃
 * 
 * 清理过期的黑名单 token
 * @deprecated Redis 模式下由 SETEX 自动过期，无需手动清理
 * 仅在内存降级模式下仍可调用
 */
exports.cleanupBlacklist = () => {
    if (!redis.isConnected()) {
        // 仅在降级模式下有意义
        console.log('[JWT] 当前内存黑名单大小:', tokenBlacklist.size);
    } else {
        console.log('[JWT] Redis 模式下黑名单自动过期，无需手动清理');
    }
};

