// middleware/studentFileAuth.js
const fileAccessor = require('../config/fileAccessor');

/**
 * 文件访问权限验证中间件
 * 用于验证用户是否有权限访问指定的文件
 */
const fileAuthMiddleware = (req, res, next) => {
    try {
        // 获取请求的文件路径
        const filePath = req.params[0] || req.path;

        console.log('[文件权限验证] 请求路径:', filePath);
        console.log('[文件权限验证] 用户信息:', {
            hasUser: !!req.user,
            userUUID: req.user?.userUUID,
            userId: req.user?.id
        });

        // 检查是否已登录
        if (!req.user) {
            console.warn('[文件权限验证] 未登录用户尝试访问文件');
            return res.status(401).json({
                success: false,
                message: '请先登录'
            });
        }

        // 构建完整路径
        const fullPath = `/uploads/${filePath}`;

        // 检查权限
        const hasAccess = fileAccessor.checkAccess(fullPath, req.user);

        if (!hasAccess) {
            console.warn('[文件权限验证] 用户无权访问文件:', {
                user: req.user.userUUID || req.user.id,
                path: fullPath
            });
            return res.status(403).json({
                success: false,
                message: '无权访问此文件'
            });
        }

        // 检查文件是否存在
        if (!fileAccessor.fileExists(fullPath)) {
            console.warn('[文件权限验证] 文件不存在:', fullPath);
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        // 将文件信息附加到请求对象
        req.fileInfo = fileAccessor.getFileInfo(fullPath);
        req.filePath = fullPath;

        console.log('[文件权限验证] 验证通过:', {
            fileName: req.fileInfo?.name,
            mimeType: req.fileInfo?.mimeType
        });

        next();
    } catch (error) {
        console.error('[文件权限验证] 验证失败:', error);
        return res.status(500).json({
            success: false,
            message: '文件访问验证失败'
        });
    }
};

module.exports = fileAuthMiddleware;