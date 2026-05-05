// middleware/auth.js
const { verifyToken } = require('../config/jwt');

/**
 * JWT身份验证中间件
 * 支持两种方式获取token：
 * 1. Cookie中的token（优先，支持新标签页直接访问）
 * 2. Authorization头（用于API请求）
 */
const authMiddleware = async (req, res, next) => {
    try {

        console.log('[JWT验证] ========== 开始验证 ==========');
        console.log('[JWT验证] 请求路径:', req.path);
        console.log('[JWT验证] 请求方法:', req.method);
        console.log('[JWT验证] Cookies:', req.cookies);
        console.log('[JWT验证] Headers:', {
            authorization: req.headers.authorization,
            cookie: req.headers.cookie
        });

        let token = null;


        // ========== 1. 遍历 Cookie 中的 token_{uuid} 格式键 ==========
        if ( req.cookies ) {
            const cookieKeys = Object.keys(req.cookies);

            for (const key of cookieKeys) {
                if (key.startsWith('token_') && key !== 'token_admin') {
                    try {
                        const decoded = await verifyToken(req.cookies[key]);
                        if (key === `token_${decoded.userUUID}`) {
                            token = req.cookies[key];
                            console.log('[JWT验证] 从 Cookie', key, '获取 token 成功');
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
        }

        // ========== 2. 回退到旧版 'token' Cookie（向后兼容） ==========
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
            console.log('[JWT验证] 从旧版 token Cookie 获取成功（兼容模式）');
        }

        // ========== 3. 从 Authorization Header 获取（备选） ==========
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Heartscar ')) {
                token = authHeader.split(' ')[1];
                console.log('[JWT验证] 从 Authorization Header 获取 token 成功');
            }
        }
        // 4. 从URL参数获取token（作为备选）
        if (!token && req.query.token) {
            token = req.query.token;
            console.log('[JWT验证] 从URL参数获取token成功');
        }

        // 如果都没有获取到token
        if (!token) {
            console.warn('[JWT验证] 未找到token，请求路径:', req.path);

            // 对于API请求，返回JSON错误
            if (req.path.startsWith('/api/') || req.xhr) {
                return res.status(401).json({
                    success: false,
                    message: '请先登录'
                });
            }

            // 对于页面请求，可以重定向到登录页（如果有的话）
            return res.status(401).json({
                success: false,
                message: '请先登录'
            });
        }

        // 验证token
        const decoded = await verifyToken(token);

        // 将用户信息挂载到req对象
        req.user = decoded;

        console.log('[JWT验证] 验证成功:', {
            userId: decoded.id || decoded.userId,
            userUUID: decoded.userUUID,
            path: req.path
        });

        // 放行
        next();

    } catch (error) {
        console.error('[JWT验证] 验证失败:', error.message);

        let statusCode = 401;
        let errorMessage = error.message || '身份验证失败';

        // 根据错误类型返回不同的状态码和消息
        if (error.message.includes('令牌已失效')) {
            errorMessage = '登录已失效，请重新登录';
        } else if (error.message.includes('令牌已过期')) {
            errorMessage = '登录已过期，请重新登录';
        } else if (error.message.includes('无效的令牌')) {
            errorMessage = '无效的身份凭证，请重新登录';
        }

        // 清除无效的cookie
        if (req.cookies && req.cookies.token) {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
        }

        return res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }
};

module.exports = authMiddleware;