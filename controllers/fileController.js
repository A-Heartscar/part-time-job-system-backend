// controllers/fileController.js
const fileAccessor = require('../config/fileAccessor');
const Resume = require('../models/Resume');
const fs = require('fs');
const path = require('path');

/**
 * 统一的文件访问方法
 *
 * 支持两种访问方式：
 * 1. 通过文件路径访问（原有方式）：/api/files/access/userFile/{uuid}/...
 * 2. 通过文件名访问（新增方式）：/api/files/access-by-name/{fileName}?userUUID={uuid}
 *
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.accessFile = async (req, res) => {
    try {
        let filePath = req.filePath;
        let fileInfo = req.fileInfo;
        const action = req.query.action || 'preview';

        console.log('[文件访问] 请求访问:', {
            path: filePath,
            action: action,
            mimeType: fileInfo?.mimeType
        });

        // 如果 fileInfo 不存在，尝试重新获取
        if (!fileInfo) {
            fileInfo = fileAccessor.getFileInfo(filePath);
        }

        if (!fileInfo) {
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        // 获取文件流
        const fileStream = fileAccessor.getFileStream(filePath);

        if (!fileStream) {
            return res.status(404).json({
                success: false,
                message: '无法读取文件'
            });
        }

        // 设置响应头
        res.setHeader('Content-Type', fileInfo.mimeType);

        // 处理文件名（支持中文）
        const encodedFileName = encodeURIComponent(fileInfo.name);

        if (action === 'download') {
            // 下载模式
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
        } else {
            // 预览模式
            if (fileInfo.mimeType === 'application/pdf') {
                res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
            } else if (fileInfo.mimeType.startsWith('image/')) {
                res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
                res.setHeader('Cache-Control', 'public, max-age=86400');
            } else {
                // 其他文件类型默认下载
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
            }
        }

        // 设置安全头
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

        // 流式传输文件
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('[文件访问] 流传输错误:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: '文件传输失败'
                });
            }
        });

    } catch (error) {
        console.error('[文件访问] 访问失败:', error);
        res.status(500).json({
            success: false,
            message: '文件访问失败: ' + error.message
        });
    }
};

/**
 * 通过文件名访问文件
 *
 * 处理流程：
 * 1. 接收文件名和用户UUID
 * 2. 从数据库查询用户简历
 * 3. 在材料中查找文件名对应的URL
 * 4. 使用找到的URL进行文件访问
 *
 * URL格式：GET /api/files/access-by-name/{fileName}?userUUID={uuid}&action=preview|download
 */
exports.accessFileByName = async (req, res) => {
    try {
        console.log('[FileController] ========== accessFileByName 被调用 ==========');
        console.log('[FileController] req.user:', req.user);
        console.log('[FileController] req.params:', req.params);
        console.log('[FileController] req.query:', req.query);

        // 从路径参数获取文件名（需要解码）
        const encodedFileName = req.params.fileName;
        const fileName = fileAccessor.decodeFileName(encodedFileName);

        // 从查询参数获取用户UUID和操作类型
        const userUUID = req.query.userUUID;
        const action = req.query.action || 'preview';

        console.log('[文件名访问] 请求:', {
            fileName,
            userUUID,
            action
        });

        // 参数验证
        if (!fileName || !userUUID) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数：fileName 或 userUUID'
            });
        }

        // 权限验证：确保当前登录用户与请求的userUUID一致
        const currentUserUUID = req.user?.userUUID || req.user?.id;
        if (currentUserUUID !== userUUID) {
            console.warn('[文件名访问] 权限拒绝:', {
                currentUser: currentUserUUID,
                requestedUser: userUUID
            });
            return res.status(403).json({
                success: false,
                message: '无权访问此文件'
            });
        }

        // 查询用户简历
        const resume = await Resume.findOne({ studentUUID: userUUID });
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: '用户简历不存在'
            });
        }

        // 通过文件名查找对应的URL
        const searchResult = await fileAccessor.findByFileName(fileName, userUUID, resume);

        if (!searchResult) {
            return res.status(404).json({
                success: false,
                message: `未找到文件: ${fileName}`
            });
        }

        const filePath = searchResult.url;

        // 验证文件是否存在
        if (!fileAccessor.fileExists(filePath)) {
            console.warn('[文件名访问] 物理文件不存在:', filePath);
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        // 获取文件信息
        const fileInfo = fileAccessor.getFileInfo(filePath);

        // 将文件路径和信息附加到请求对象，复用 accessFile 方法
        req.filePath = filePath;
        req.fileInfo = fileInfo;
        req.query.action = action;

        // 调用原有的文件访问方法
        return exports.accessFile(req, res);

    } catch (error) {
        console.error('[文件名访问] 访问失败:', error);
        res.status(500).json({
            success: false,
            message: '文件访问失败: ' + error.message
        });
    }
};

/**
 * 获取文件信息
 */
exports.getFileInfo = async (req, res) => {
    try {
        const fileInfo = req.fileInfo;

        res.json({
            success: true,
            data: {
                name: fileInfo.name,
                size: fileInfo.size,
                mimeType: fileInfo.mimeType,
                isPreviewable: fileInfo.isPreviewable,
                modified: fileInfo.modified
            }
        });
    } catch (error) {
        console.error('[文件信息] 获取失败:', error);
        res.status(500).json({
            success: false,
            message: '获取文件信息失败'
        });
    }
};

/**
 * 通过文件名获取文件信息
 */
exports.getFileInfoByName = async (req, res) => {
    try {
        const encodedFileName = req.params.fileName;
        const fileName = fileAccessor.decodeFileName(encodedFileName);
        const userUUID = req.query.userUUID;

        // 权限验证
        const currentUserUUID = req.user?.userUUID || req.user?.id;
        if (currentUserUUID !== userUUID) {
            return res.status(403).json({
                success: false,
                message: '无权访问此文件'
            });
        }

        // 查询并查找文件
        const resume = await Resume.findOne({ studentUUID: userUUID });
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: '用户简历不存在'
            });
        }

        const searchResult = fileAccessor.findByFileName(fileName, userUUID, resume);

        if (!searchResult) {
            return res.status(404).json({
                success: false,
                message: `未找到文件: ${fileName}`
            });
        }

        const fileInfo = fileAccessor.getFileInfo(searchResult.url);

        if (!fileInfo) {
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        res.json({
            success: true,
            data: {
                name: fileInfo.name,
                size: fileInfo.size,
                mimeType: fileInfo.mimeType,
                isPreviewable: fileInfo.isPreviewable,
                modified: fileInfo.modified
            }
        });

    } catch (error) {
        console.error('[文件名信息] 获取失败:', error);
        res.status(500).json({
            success: false,
            message: '获取文件信息失败'
        });
    }
};

/**
 * 预览文件（HTML页面）
 */
exports.previewFile = async (req, res) => {
    try {
        const filePath = req.filePath;
        const fileInfo = req.fileInfo;

        // 生成预览页面
        const html = generatePreviewHtml(filePath, fileInfo);

        res.send(html);
    } catch (error) {
        console.error('[文件预览] 生成预览失败:', error);
        res.status(500).json({
            success: false,
            message: '生成预览页面失败'
        });
    }
};

// 2026/4/19
// ========== 以下为新增的雇主文件访问方法 ==========

/**
 * 雇主通过文件名访问学生文件
 * 需要验证投递关系（双重验证：中间件已验证，此处再次确认）
 *
 * URL格式：GET /api/files/employer/access-by-name/:fileName?userUUID={uuid}&action=preview|download
 */
exports.accessFileForEmployer = async (req, res) => {
    try {
        console.log('[雇主文件访问] ========== 开始处理 ==========');

        // 从路径参数获取文件名（需要解码）
        const encodedFileName = req.params.fileName;
        const fileName = fileAccessor.decodeFileName(encodedFileName);

        // 从查询参数获取学生UUID和操作类型
        const studentUUID = req.query.userUUID;
        const action = req.query.action || 'preview';
        const employerUUID = req.user.userUUID;

        console.log('[雇主文件访问] 请求参数:', {
            fileName,
            studentUUID,
            employerUUID,
            action
        });

        // 参数验证
        if (!fileName || !studentUUID) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数：fileName 或 userUUID'
            });
        }

        // 双重验证投递关系（中间件已验证，此处作为安全冗余）
        const Application = require('../models/Application');
        const hasApplication = await Application.exists({
            studentUUID: studentUUID,
            employerUUID: employerUUID
        });

        if (!hasApplication) {
            console.warn('[雇主文件访问] 投递关系验证失败');
            return res.status(403).json({
                success: false,
                message: '无权访问此文件'
            });
        }

        // 查询学生简历
        const Resume = require('../models/Resume');
        const resume = await Resume.findOne({ studentUUID: studentUUID });
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: '学生简历不存在'
            });
        }

        // 通过文件名查找对应的URL
        const searchResult = await fileAccessor.findByFileName(fileName, studentUUID, resume);

        if (!searchResult) {
            console.warn('[雇主文件访问] 未找到文件:', fileName);
            return res.status(404).json({
                success: false,
                message: `未找到文件: ${fileName}`
            });
        }

        const filePath = searchResult.url;

        // 验证文件是否存在
        if (!fileAccessor.fileExists(filePath)) {
            console.warn('[雇主文件访问] 物理文件不存在:', filePath);
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        // 获取文件信息
        const fileInfo = fileAccessor.getFileInfo(filePath);

        console.log('[雇主文件访问] 文件信息:', {
            path: filePath,
            name: fileInfo.name,
            mimeType: fileInfo.mimeType
        });

        // 将文件路径和信息附加到请求对象，复用 accessFile 方法
        req.filePath = filePath;
        req.fileInfo = fileInfo;
        req.query.action = action;

        // 调用原有的文件访问方法
        console.log('[雇主文件访问] ========== 处理完成 ==========');
        return exports.accessFile(req, res);

    } catch (error) {
        console.error('[雇主文件访问] 访问失败:', error);
        res.status(500).json({
            success: false,
            message: '文件访问失败: ' + error.message
        });
    }
};

/**
 * 雇主通过路径访问学生文件（备选方案）
 * URL格式：GET /api/files/employer/access/*?action=preview|download
 */
exports.accessFileForEmployerByPath = async (req, res) => {
    try {
        console.log('[雇主文件访问-路径] ========== 开始处理 ==========');

        let filePath = req.filePath;
        let fileInfo = req.fileInfo;
        const action = req.query.action || 'preview';

        console.log('[雇主文件访问-路径] 请求参数:', {
            path: filePath,
            action: action,
            mimeType: fileInfo?.mimeType
        });

        // 如果 fileInfo 不存在，尝试重新获取
        if (!fileInfo) {
            fileInfo = fileAccessor.getFileInfo(filePath);
        }

        if (!fileInfo) {
            return res.status(404).json({
                success: false,
                message: '文件不存在'
            });
        }

        // 获取文件流
        const fileStream = fileAccessor.getFileStream(filePath);

        if (!fileStream) {
            return res.status(404).json({
                success: false,
                message: '无法读取文件'
            });
        }

        // 设置响应头
        res.setHeader('Content-Type', fileInfo.mimeType);

        // 处理文件名（支持中文）
        const encodedFileName = encodeURIComponent(fileInfo.name);

        if (action === 'download') {
            // 下载模式
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
        } else {
            // 预览模式
            if (fileInfo.mimeType === 'application/pdf') {
                res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
            } else if (fileInfo.mimeType.startsWith('image/')) {
                res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
                res.setHeader('Cache-Control', 'public, max-age=86400');
            } else {
                // 其他文件类型默认下载
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
            }
        }

        // 设置安全头
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

        // 流式传输文件
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('[雇主文件访问-路径] 流传输错误:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: '文件传输失败'
                });
            }
        });

        console.log('[雇主文件访问-路径] ========== 处理完成 ==========');

    } catch (error) {
        console.error('[雇主文件访问-路径] 访问失败:', error);
        res.status(500).json({
            success: false,
            message: '文件访问失败: ' + error.message
        });
    }
};

/**
 * 生成文件预览HTML
 */
function generatePreviewHtml(fileUrl, fileInfo) {
    const mimeType = fileInfo.mimeType;
    const fileName = fileInfo.name;
    const encodedFileName = encodeURIComponent(fileName);

    let contentHtml = '';

    if (mimeType.startsWith('image/')) {
        contentHtml = `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5;">
                <img src="/api/files/access${fileUrl}" alt="${fileName}" style="max-width: 100%; max-height: 100vh; object-fit: contain;" />
            </div>
        `;
    } else if (mimeType === 'application/pdf') {
        contentHtml = `
            <iframe src="/api/files/access${fileUrl}" width="100%" height="100%" style="border: none;"></iframe>
        `;
    } else if (mimeType.startsWith('text/')) {
        contentHtml = `
            <div style="padding: 20px; background: #fff;">
                <pre id="fileContent" style="white-space: pre-wrap; word-wrap: break-word;">加载中...</pre>
            </div>
            <script>
                fetch('/api/files/access${fileUrl}')
                    .then(res => res.text())
                    .then(text => {
                        document.getElementById('fileContent').textContent = text;
                    })
                    .catch(err => {
                        document.getElementById('fileContent').textContent = '加载失败: ' + err.message;
                    });
            </script>
        `;
    } else {
        contentHtml = `
            <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5;">
                <div style="text-align: center; padding: 40px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1890ff" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <h3 style="margin: 16px 0; color: #333;">${fileName}</h3>
                    <p style="color: #666;">此文件类型暂不支持在线预览</p>
                    <a href="/api/files/access${fileUrl}?action=download" 
                       style="display: inline-block; margin-top: 16px; padding: 8px 24px; background: #1890ff; color: #fff; text-decoration: none; border-radius: 4px;">
                        下载文件
                    </a>
                </div>
            </div>
        `;
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>文件预览 - ${fileName}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { width: 100%; height: 100%; overflow: hidden; }
                .header {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 50px;
                    background: #fff;
                    border-bottom: 1px solid #e8e8e8;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 20px;
                    z-index: 1000;
                }
                .header h3 {
                    margin: 0;
                    color: #333;
                    font-size: 16px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 60%;
                }
                .header .actions {
                    display: flex;
                    gap: 10px;
                }
                .header .actions a {
                    padding: 6px 16px;
                    background: #1890ff;
                    color: #fff;
                    text-decoration: none;
                    border-radius: 4px;
                    font-size: 14px;
                }
                .header .actions a:hover {
                    background: #40a9ff;
                }
                .content {
                    margin-top: 50px;
                    height: calc(100% - 50px);
                    overflow: auto;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3 title="${fileName}">${fileName}</h3>
                <div class="actions">
                    <a href="/api/files/access${fileUrl}?action=download">下载</a>
                </div>
            </div>
            <div class="content">
                ${contentHtml}
            </div>
        </body>
        </html>
    `;
}