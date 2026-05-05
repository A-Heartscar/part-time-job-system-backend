// 简历文件上传中间件
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 修复中文文件名乱码的辅助函数
const decodeFileName = (fileName) => {
    try {
        // Multer 默认使用 latin1 编码解析文件名，需要转回 utf-8
        return Buffer.from(fileName, 'latin1').toString('utf8');
    } catch (e) {
        // 如果转换失败，返回原文件名
        console.warn('[文件名解码] 解码失败，使用原文件名:', fileName);
        return fileName;
    }
};


// 配置存储目录和文件名
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 使用 userUUID (从 authMiddleware 放入 req.user 的信息中获取)，防止 req.user.userUUID 为空时回退到 'anonymous'，增加 req.user.id 作为备选
        let userUUID = req.user?.userUUID || req.user?.id ;

        // 如果没有从用户信息获取到，尝试从 resumeData 中解析
        if (!userUUID && req.body.resumeData) {
            try {
                const resumeData = JSON.parse(req.body.resumeData);
                userUUID = resumeData.studentUUID;
            } catch (e) {
                console.error('[Multer] 解析 resumeData 失败:', e);
            }
        }

        // 如果还是没有，使用 anonymous
        if (!userUUID) {
            userUUID = 'anonymous';
        }

        // 统一根目录：public/uploads/userFile/{userUUID}
        // 再根据 fieldname 分子目录
        let subDir = 'others';
        if (file.fieldname.startsWith('skill_')) subDir = 'skills';
        else if (file.fieldname.startsWith('intern_')) subDir = 'internships';
        else if (file.fieldname.startsWith('project_')) subDir = 'projects';

        const uploadDir = path.join(__dirname, '../public/uploads/userFile', userUUID, subDir);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },

    // 使用时间戳+随机数命名，避免文件名冲突，防止中文/特殊字符导致的路径问题，防止路径遍历攻击
    filename: (req, file, cb) => {
        // 生成唯一文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = decodeFileName(file.originalname);
        const ext = path.extname(originalName);

        // 保存解码后的原始文件名到 file 对象，供后续使用
        file.decodedOriginalname = originalName;

        // 存储时使用唯一名称，但原始文件名会在其他地方保存
        cb(null, uniqueSuffix + ext);
    }
});

// 文件过滤
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpg', 'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('仅允许上传图片、PDF、Word、Excel、文本文件！'), false);
    }
};

// 创建上传实例
const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 20 // 最多5个文件
    },
    fileFilter: fileFilter
});

// 导出上传中间件 - 使用 .any() 接收所有动态命名的文件
exports.uploadResumeFiles = () => {
    return (req, res, next) => {
        upload.any()(req, res, (err) => {
            if (err) return next(err);

            // 对所有上传的文件进行文件名解码
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    // 解码原始文件名
                    try {
                        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    } catch (e) {
                        console.warn('文件名解码失败:', file.originalname);
                    }
                });
            }

            next();
        });
    };
};


// 生成文件URL,其他场景，待优化，暂时别调用
exports.generateFileUrl = (req, file, studentUUID = null) => {
    if (!file) return null;

    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/userFile`;
    // 优先使用传入的studentUUID，其次从请求体或用户信息中获取
    let userId = studentUUID;
    if (!userId && req.body.resumeData) {
        try {
            const resumeData = JSON.parse(req.body.resumeData);
            userId = resumeData.studentUUID;
        } catch (e) {
            // 忽略解析错误
        }
    }
    if (!userId) {
        userId = req.user?.userUUID || req.user?.id || 'anonymous';
    }

    // 根据文件类型确定子目录
    let subDir = 'others';
    switch (file.fieldname) {
        case 'certificate':
            subDir = 'certificates';
            break;
        case 'recommendation':
            subDir = 'recommendations';
            break;
        case 'work_sample':
            subDir = 'work_samples';
            break;
        case 'portfolio':
            subDir = 'portfolios';
            break;
        case 'document':
            subDir = 'documents';
            break;
        default:
            subDir = 'others';
    }

    return `${baseUrl}/${subDir}/${userId}/${file.filename}`;
};