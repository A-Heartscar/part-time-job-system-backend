// ========== 雇主文件访问权限中间件 ==========
// 用于验证雇主是否有权访问学生的文件（需存在投递关系）

const fileAccessor = require('../config/fileAccessor');

const employerFileAuthMiddleware = async (req, res, next) => {
    try {
        // 获取请求的文件路径
        const filePath = req.params[0] || req.path;
        const fullPath = `/uploads/${filePath}`;

        console.log('[雇主文件权限验证] ========== 开始验证 ==========');
        console.log('[雇主文件权限验证] 请求路径:', filePath);
        console.log('[雇主文件权限验证] 用户信息:', {
            role: req.user?.role,
            userUUID: req.user?.userUUID,
            userId: req.user?.id
        });

        // 检查是否已登录
        if (!req.user) {
            console.warn('[雇主文件权限验证] 未登录用户');
            return res.status(401).json({
                success: false,
                message: '请先登录'
            });
        }

        // 检查角色是否为雇主
        if (req.user.role !== 'employer') {
            console.warn('[雇主文件权限验证] 非雇主用户:', req.user.role);
            return res.status(403).json({
                success: false,
                message: '无权访问此文件'
            });
        }

        // 提取文件所有者UUID
        const fileOwnerUUID = fileAccessor.extractUserUUIDFromPath(fullPath);
        if (!fileOwnerUUID) {
            console.warn('[雇主文件权限验证] 无法提取文件所有者UUID');
            return res.status(400).json({
                success: false,
                message: '无效的文件路径'
            });
        }

        const employerUUID = req.user.userUUID;

        console.log('[雇主文件权限验证] 验证投递关系:', {
            fileOwner: fileOwnerUUID,
            employer: employerUUID
        });

        // 验证雇主是否收到过该学生的投递
        const Application = require('../models/Application');
        const hasApplication = await Application.exists({
            studentUUID: fileOwnerUUID,
            employerUUID: employerUUID
        });

        if (!hasApplication) {
            console.warn('[雇主文件权限验证] 无投递关系，拒绝访问');
            return res.status(403).json({
                success: false,
                message: '您无权访问此文件，该学生未向您投递过简历'
            });
        }

        // 检查文件是否存在
        if (!fileAccessor.fileExists(fullPath)) {
            console.warn('[雇主文件权限验证] 文件不存在:', fullPath);
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        // 将文件信息附加到请求对象
        req.fileInfo = fileAccessor.getFileInfo(fullPath);
        req.filePath = fullPath;

        console.log('[雇主文件权限验证] 验证通过:', {
            fileName: req.fileInfo?.name,
            mimeType: req.fileInfo?.mimeType
        });
        console.log('[雇主文件权限验证] ========== 验证完成 ==========');

        next();
    } catch (error) {
        console.error('[雇主文件权限验证] 验证失败:', error);
        return res.status(500).json({
            success: false,
            message: '文件访问验证失败'
        });
    }
};

module.exports = employerFileAuthMiddleware;