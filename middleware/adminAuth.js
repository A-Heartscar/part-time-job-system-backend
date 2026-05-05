// middleware/adminAuth.js
// ========== 管理员鉴权中间件 ==========
// 独立于普通用户 auth.js，使用独立 JWT 密钥和验证逻辑
// 验证通过后将管理员信息挂载到 req.admin
const { verifyAdminToken } = require('../config/adminJwt');

const adminAuthMiddleware = async (req, res, next) => {
    try {
        console.log('[AdminAuth] ========== 开始验证 ==========');
        console.log('[AdminAuth] 请求路径:', req.path);

        let token = null;

        // ========== 1. 从 Cookie 中获取 admin_token（优先级最高） ==========
        if (req.cookies && req.cookies.admin_token) {
            token = req.cookies.admin_token;
            console.log('[AdminAuth] 从 Cookie 获取 admin_token 成功');
        }

        // ========== 2. 从 Authorization Header 获取（备选） ==========
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('AdminHeartscar ')) {
                token = authHeader.split(' ')[1];
                console.log('[AdminAuth] 从 Authorization Header 获取 token 成功');
            }
        }

        // ========== 3. 从 URL 参数获取（备选） ==========
        if (!token && req.query.token) {
            token = req.query.token;
            console.log('[AdminAuth] 从 URL 参数获取 token 成功');
        }

        // ========== 未找到 Token ==========
        if (!token) {
            console.warn('[AdminAuth] 未找到 token');
            return res.status(401).json({
                success: false,
                message: '请先登录管理员账号'
            });
        }

        // ========== 验证 Token ==========
        const decoded = await verifyAdminToken(token);

        // ========== 将管理员信息挂载到 req.admin ==========
        req.admin = {
            id: decoded.adminId || decoded.id,
            adminUUID: decoded.adminUUID,
            username: decoded.username,
            role: decoded.role
        };

        console.log('[AdminAuth] 验证成功:', {
            adminUUID: req.admin.adminUUID,
            username: req.admin.username,
            role: req.admin.role
        });
        console.log('[AdminAuth] ========== 验证完成 ==========');

        next();

    } catch (error) {
        console.error('[AdminAuth] 验证失败:', error.message);

        // 清除无效的 Cookie
        if (req.cookies && req.cookies.admin_token) {
            res.clearCookie('admin_token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
        }

        return res.status(401).json({
            success: false,
            message: error.message || '管理员身份验证失败'
        });
    }
};

module.exports = adminAuthMiddleware;