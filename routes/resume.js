// 简历路由
const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Resume = require('../models/Resume');
const resumeController = require('../controllers/resumeController');
const uploadMiddleware = require('../middleware/uploadMiddleware');

// 解析 resumeData 并合并到 req.body 的中间件
const parseResumeData = (req, res, next) => {
    console.log('[parseResumeData] 开始处理');
    console.log('[parseResumeData] req.body 键:', Object.keys(req.body));

    // 如果有 resumeData 字段，解析并展开到 req.body
    if (req.body.resumeData) {
        try {
            const parsedData = JSON.parse(req.body.resumeData);
            console.log('[parseResumeData] 解析成功，包含字段:', Object.keys(parsedData));

            // 将解析后的数据展开到 req.body（保留原有的 resumeData）
            Object.assign(req.body, parsedData);

            console.log('[parseResumeData] 展开后 req.body 键:', Object.keys(req.body));
            console.log('[parseResumeData] studentUUID:', req.body.studentUUID);
            console.log('[parseResumeData] studentStatus.grade:', req.body.studentStatus?.grade);
        } catch (e) {
            console.error('[parseResumeData] JSON 解析失败:', e.message);
            return res.status(400).json({
                success: false,
                message: '简历数据格式错误: ' + e.message
            });
        }
    } else {
        console.warn('[parseResumeData] 警告: 没有 resumeData 字段');
    }

    next();
};

// 验证错误处理中间件
const validate = (validations) => {
    return async (req, res, next) => {
        // 执行所有验证
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('[路由验证错误]', errors.array());
            return res.status(400).json({
                success: false,
                message: errors.array().map(e => e.msg).join('; ')
            });
        }
        next();
    };
};

// 获取当前用户的简历（给学生用户调用）
router.get('/me/my-resume', authMiddleware, resumeController.getMyResume);

// 获取学生简历（给雇主用户调用）
router.get('/:studentUUID', authMiddleware, resumeController.getResume);

// 创建简历（支持文件上传）
router.post('/',
    authMiddleware,
    (req, res, next) => {
        console.log('[路由] POST /resumes 请求进入');
        console.log('[路由] Content-Type:', req.headers['content-type']);
        console.log('[路由] 是否有 resumeData 字段:', !!req.body?.resumeData);
        next();
    },
    uploadMiddleware.uploadResumeFiles(),
    parseResumeData,
    validate(resumeController.resumeValidation),
    resumeController.createResume
);

// 更新简历（支持文件上传）
router.put('/:id',
    authMiddleware,
    uploadMiddleware.uploadResumeFiles(),
    resumeController.resumeValidation,
    resumeController.updateResume
);

// 删除简历
router.delete('/:id', authMiddleware, resumeController.deleteResume);



// 单独上传证明材料
router.post('/:id/upload-material',
    authMiddleware,
    uploadMiddleware.uploadResumeFiles(),
    resumeController.uploadVerificationMaterial
);

module.exports = router;