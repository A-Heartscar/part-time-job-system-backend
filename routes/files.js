// routes/files.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const fileAuthMiddleware = require('../middleware/studentFileAuth');
const employerFileAuthMiddleware = require('../middleware/employerFileAuth');
const fileController = require('../controllers/fileController');

// 【调试】添加路由级别的日志
router.use((req, res, next) => {
    console.log('[Files路由] 请求进入:', {
        method: req.method,
        path: req.path,
        url: req.url,
        params: req.params,
        query: req.query
    });
    next();
});

// 所有文件访问都需要身份验证
router.use(authMiddleware);

// ========== 学生通过路径访问 ==========

// 访问文件（原始文件流）
router.get('/access/*',
    fileAuthMiddleware,
    fileController.accessFile
);

// 获取文件信息
router.get('/info/*',
    fileAuthMiddleware,
    fileController.getFileInfo
);

// 预览文件（带UI的HTML页面）
router.get('/preview/*',
    fileAuthMiddleware,
    fileController.previewFile
);

// ========== 学生通过文件名访问 ==========
// 设计说明：
// 这些路由不需要 fileAuthMiddleware，因为权限验证在控制器内部完成
// 通过文件名和用户UUID的组合来定位文件

// 通过文件名访问文件
// URL格式：GET /api/files/access-by-name/:fileName?userUUID={uuid}&action=preview|download
router.get('/access-by-name/:fileName',
    (req, res, next) => {
        console.log('[Files路由] access-by-name 被匹配');
        next();
    },
    fileController.accessFileByName
);

// 通过文件名获取文件信息
router.get('/info-by-name/:fileName',
    fileController.getFileInfoByName
);

// 通过文件名预览文件
// URL格式：GET /api/files/preview-by-name/:fileName?userUUID={uuid}
router.get('/preview-by-name/:fileName',
    fileController.accessFileByName  // 复用同一个方法，通过 action 参数区分
);

// ========== 雇主文件访问 ==========

// 雇主通过文件名访问学生文件
router.get('/employer/access-by-name/:fileName',
    fileController.accessFileForEmployer
);

// 雇主通过路径访问学生文件（需要权限验证）
router.get('/employer/access/*',
    employerFileAuthMiddleware,
    fileController.accessFileForEmployerByPath
);

// 雇主预览学生文件
router.get('/employer/preview/*',
    employerFileAuthMiddleware,
    fileController.previewFile
);

module.exports = router;