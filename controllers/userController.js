const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { body, validationResult  } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const {generateToken, invalidateToken} = require("../config/jwt");
const { sendVerificationCode } = require('../config/emailService');
const verificationCodeManager = require('../utils/verificationCodeManager');
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const redis = require('../config/redis');


// 通用校验
const validators = {
    // 必填字符串校验
    requiredString: (field, msg) => body(field)
        .notEmpty().withMessage(msg)
        .trim()
        .isString().withMessage(`${msg.split('不能为空')[0]}需为字符串`),

    // 必填对象校验
    requiredObject: (field, msg) => body(field)
        .notEmpty().withMessage(msg)
        .isObject().withMessage(`${msg.split('不能为空')[0]}需为对象格式`),

    // 手机号校验
    phone: (field, msg) => body(field)
        .notEmpty().withMessage(msg)
        .trim()
        .matches(/^1[3-9]\d{9}$/).withMessage('联系电话需为11位有效手机号'),

    // 身份证号校验
    idCard: (field, msg) => body(field)
        .notEmpty().withMessage(msg)
        .trim()
        .isString().withMessage('身份证号需为字符串')
        .matches(/^\d{17}[\dXx]$/).withMessage('应输入正确的18位身份证'),

    // 条件触发校验
    whenFieldEquals: (parentField, value, validations) => {
        return validations.map(validation => validation.if(body(parentField).equals(value)));
    }
};

// 拆分角色校验组
exports.registerValidation = [
    // 基础通用校验
    body('username')
        .notEmpty().withMessage('用户名不能为空')
        .trim()
        .isLength({ min: 3, max: 20 }).withMessage('用户名长度需在3-20位之间'),
    body('password')
        .isLength({ min: 6 }).withMessage('密码至少6位')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('密码需包含字母和数字'),
    body('role')
        .isIn(['student', 'employer']).withMessage('角色只能是student/employer'),

    // 学生校验
    ...validators.whenFieldEquals('role', 'student', [
        validators.requiredObject('studentInfo', '学生角色必须传学生信息'),
        validators.requiredString('studentInfo.studentCode', '学生学号不能为空'),
        validators.requiredString('studentInfo.studentName', '学生姓名不能为空'),
        validators.requiredString('studentInfo.school', '学生学校不能为空'),
        validators.requiredString('studentInfo.major', '学生专业不能为空'),
        validators.phone('studentInfo.phone', '联系电话不能为空')
    ]),

    // 雇主校验
    ...validators.whenFieldEquals('role', 'employer', [
        validators.requiredObject('employerInfo', '雇主角色必须传雇主信息'),
        // 企业雇主二级校验
        ...validators.whenFieldEquals('employerInfo.employerType', 'company', [
            validators.requiredObject('employerInfo.companyInfo', '企业雇主必须传企业信息'),
            validators.requiredString('employerInfo.companyInfo.companyName', '企业名称不能为空'),
            validators.requiredString('employerInfo.companyInfo.industry', '企业类型不能为空'),
            validators.requiredString('employerInfo.companyInfo.creditCode', '信用代码不能为空'),
            validators.requiredString('employerInfo.companyInfo.companyAddress', '企业地址不能为空'),
            validators.requiredString('employerInfo.companyInfo.contactPerson', '联系人不能为空'),
            validators.phone('employerInfo.companyInfo.contactPhone', '联系电话不能为空')
        ]),
        // 个人雇主二级校验
        ...validators.whenFieldEquals('employerInfo.employerType', 'personal', [
            validators.requiredObject('employerInfo.personalInfo', '个人雇主必须传个人信息'),
            validators.requiredString('employerInfo.personalInfo.realName', '个人姓名不能为空'),
            validators.idCard('employerInfo.personalInfo.idCard', '身份证号不能为空'),
            validators.requiredString('employerInfo.personalInfo.profession', '个人职业不能为空')
        ])
    ])
]

// ========== 忘记密码相关方法 ==========

/**
 * 忘记密码 - 第一步：通过用户名获取脱敏邮箱
 * @route POST /users/forgot-password
 * @access 公开
 * @description 用户输入用户名，返回脱敏后的邮箱地址用于确认身份
 *
 * @param {string} username - 用户名
 * @returns {Object} { maskedEmail: '1***@qq.com' }
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { username } = req.body;

        console.log('[忘记密码] ========== 第一步：查询用户名 ==========');
        console.log('[忘记密码] 用户名:', username);

        // ========== 1. 参数校验 ==========
        if (!username || !username.trim()) {
            return res.status(400).json({
                success: false,
                message: '请输入用户名'
            });
        }

        // ========== 2. 查找用户 ==========
        const user = await User.findOne({ username: username.trim() }).select('email');
        if (!user) {
            console.log('[忘记密码] 用户不存在:', username);
            return res.status(404).json({
                success: false,
                message: '该用户名不存在'
            });
        }

        // ========== 3. 邮箱脱敏处理 ==========
        // 脱敏规则：@前面的部分首字符保留，其余用***替代
        const email = user.email;
        const atIndex = email.indexOf('@');
        if (atIndex <= 1) {
            // 邮箱格式异常，返回通用脱敏
            console.log('[忘记密码] 邮箱格式异常，使用通用脱敏');
            return res.json({
                success: true,
                data: { maskedEmail: '***' + email.substring(atIndex) }
            });
        }

        const maskedEmail = email.charAt(0) + '***' + email.substring(atIndex);

        console.log('[忘记密码] 邮箱脱敏:', {
            original: email,
            masked: maskedEmail
        });
        console.log('[忘记密码] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: { maskedEmail }
        });

    } catch (error) {
        console.error('[忘记密码] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 忘记密码 - 第二步：发送重置密码验证码
 * @route POST /users/send-reset-code
 * @access 公开
 * @description 验证用户邮箱完全匹配后发送6位数字验证码
 *
 * @param {string} username - 用户名
 * @param {string} fullEmail - 用户输入的完整邮箱
 * @returns {Object} { cooldown: 60 }
 */
exports.sendResetCode = async (req, res) => {
    try {
        const { username, fullEmail } = req.body;

        console.log('[发送重置验证码] ========== 开始处理 ==========');
        console.log('[发送重置验证码] 参数:', { username, fullEmail });

        // ========== 1. 参数校验 ==========
        if (!username || !fullEmail) {
            return res.status(400).json({
                success: false,
                message: '用户名和邮箱不能为空'
            });
        }

        // ========== 2. 查找用户并校验邮箱 ==========
        const user = await User.findOne({ username: username.trim() }).select('email');
        if (!user) {
            console.log('[发送重置验证码] 用户不存在:', username);
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        // 邮箱不区分大小写比较
        if (user.email.toLowerCase() !== fullEmail.trim().toLowerCase()) {
            console.log('[发送重置验证码] 邮箱不匹配');
            return res.status(400).json({
                success: false,
                message: '邮箱不匹配，请检查后重试'
            });
        }

        const email = user.email;

        // ========== 3. 检查冷却时间（60秒） ==========
        const resendCheck = await verificationCodeManager.canResend(email);
        if (!resendCheck.canResend) {
            console.log('[发送重置验证码] 冷却中，剩余秒数:', resendCheck.remainingSeconds);
            return res.status(429).json({
                success: false,
                message: `请等待 ${resendCheck.remainingSeconds} 秒后再重新获取验证码`,
                data: { cooldown: resendCheck.remainingSeconds }
            });
        }

        // ========== 4. 生成验证码并发送邮件 ==========
        let code;
        // [测试] 测试邮箱，固定验证码为 123456
        if (email.startsWith('testEmail')) {
            code = '123456';
            console.log(`[发送重置验证码] 测试邮箱，使用固定验证码: ${code}`);
        } else {
            // 生成6位随机数字验证码并存储到缓存
            const result = verificationCodeManager.generate(email);
            code = result.code;
            console.log('[发送重置验证码] 验证码已生成并缓存');
        }

        // 发送邮件
        const emailSent = await sendVerificationCode({
            to: email,
            code: code,
            purpose: 'reset_password'
        });

        if (!emailSent) {
            console.log('[发送重置验证码] 邮件发送失败');
            // 邮件发送失败时清理缓存中的验证码
            await verificationCodeManager.remove(email);
            return res.status(500).json({
                success: false,
                message: '验证码发送失败，请稍后重试'
            });
        }

        console.log('[发送重置验证码] 验证码已发送:', email.replace(/(.{2}).*(@.*)/, '$1***$2'));
        console.log('[发送重置验证码] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '验证码已发送，请查收邮件',
            data: {
                cooldown: verificationCodeManager.RESEND_COOLDOWN_SECONDS
            }
        });

    } catch (error) {
        console.error('[发送重置验证码] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 忘记密码 - 第三步：验证码校验 + 重置密码
 * @route POST /users/reset-password
 * @access 公开
 * @description 验证码通过后更新密码，使所有现有token失效
 *
 * @param {string} username - 用户名
 * @param {string} fullEmail - 完整邮箱
 * @param {string} code - 6位验证码
 * @param {string} newPassword - 新密码
 */
exports.resetPassword = async (req, res) => {
    try {
        const { username, fullEmail, code, newPassword } = req.body;

        console.log('[重置密码] ========== 开始处理 ==========');
        console.log('[重置密码] 参数:', { username, fullEmail, code });

        // ========== 1. 参数校验 ==========
        if (!username || !fullEmail || !code || !newPassword) {
            return res.status(400).json({
                success: false,
                message: '所有字段不能为空'
            });
        }

        // ========== 2. 密码强度校验（复用现有规则） ==========
        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: '新密码至少6位，且包含字母和数字'
            });
        }

        // ========== 3. 查找用户并校验邮箱 ==========
        const user = await User.findOne({ username: username.trim() }).select('+password email');
        if (!user) {
            console.log('[重置密码] 用户不存在:', username);
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        if (user.email.toLowerCase() !== fullEmail.trim().toLowerCase()) {
            console.log('[重置密码] 邮箱不匹配');
            return res.status(400).json({
                success: false,
                message: '邮箱不匹配'
            });
        }

        const email = user.email;

        // ========== 4. 校验验证码 ==========
        // [测试] 测试邮箱，固定验证码为 123456
        if (email.startsWith('testEmail')) {
            if (code !== '123456') {
                console.log('[重置密码] 测试邮箱验证码错误');
                return res.status(400).json({
                    success: false,
                    message: '验证码错误'
                });
            }
            console.log('[重置密码] 测试邮箱验证码校验通过');
        } else {
            const verifyResult = await verificationCodeManager.verify(email, code);
            if (!verifyResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: verifyResult.message
                });
            }
            // 验证通过后清理缓存
            await verificationCodeManager.remove(email);
        }

        // ========== 5. 更新密码 ==========
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        console.log('[重置密码] 密码更新成功:', username);

        // ========== 6. 清除 Cookie 和 Token ==========
        // 通过响应清除Cookie（由前端调用时处理，这里通知前端需要重新登录）

        console.log('[重置密码] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '密码重置成功，请使用新密码重新登录'
        });

    } catch (error) {
        console.error('[重置密码] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

exports.registerUser = async (req, res) => {
    try {
        // 验证前端参数
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }


        // ========== 邮箱验证码校验 ==========
        const { emailCode } = req.body;
        const email = req.body.email;

        console.log('[注册] 开始邮箱验证码校验');

        if (!emailCode) {
            return res.status(400).json({
                success: false,
                message: '请输入邮箱验证码'
            });
        }

        // [测试] 测试邮箱，固定验证码为 123456
        if (email.startsWith('testEmail')) {
            if (emailCode !== '123456') {
                console.log('[注册] 测试邮箱验证码错误');
                return res.status(400).json({
                    success: false,
                    message: '邮箱验证码错误'
                });
            }
            console.log('[注册] 测试邮箱验证码校验通过');
        } else {
            const emailVerifyResult = await verificationCodeManager.verify(email, emailCode);
            if (!emailVerifyResult.valid) {
                return res.status(400).json({
                    success: false,
                    message: emailVerifyResult.message
                });
            }
            // 验证通过后清理缓存
            await verificationCodeManager.remove(email);
            console.log('[注册] 邮箱验证码校验通过，缓存已清理');
        }

        // 检查用户名是否已存在
        const existingUser = await User.findOne({ username: req.body.username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: '用户名已存在' });
        }

        // 校验学生学号的唯一性
        if(req.body.role === 'student'){
            const existingStudent = await User.findOne(
                {
                    role: 'student',
                    'studentInfo.studentCode': req.body.studentInfo.studentCode
                }
            )

            if (existingStudent) {
                return res.status(400).json({
                    success: false,
                    message: '学号已存在，请勿重复注册'
                });
            }
        }

        // 加密
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        // uuid
        const userUUID = uuidv4();

        // 接收数据并创建用户
        const user = await User.create({
            ...req.body,
            userUUID: userUUID,
            password: hashedPassword // 存储加密密码
        });

        // 返回成功响应
        res.status(201).json({
            success: true,
            message: '用户注册成功',
            data: {
                userUUID: user.userUUID,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        // 区分 Mongoose 验证错误/数据库错误
        console.error('注册失败：', error);
        if (error.name === 'ValidationError') {
            const errMsg = Object.values(error.errors).map(item => item.message).join(', ');
            return res.status(400).json({ success: false, message: errMsg });
        }
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
}

exports.loginUser = async (req, res) => {
    try {
        // 基础参数校验
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: '用户名和密码不能为空'
            });
        }

        // 查询用户
        const user = await User.findOne({ username }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        // 密码校验
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        // 生成令牌
        const token = generateToken({
            id: user._id,
            username: user.username,
            role: user.role,
            userUUID: user.userUUID
        });

        // 使用 userUUID 作为 Cookie 键名后缀，确保多用户登录不冲突
        const cookieName = `token_${user.userUUID}`;

        res.cookie(cookieName, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });

        // 旧版 'token' Cookie 用于向后兼容（middleware 优先读取新版）
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });

        console.log('[登录成功] Cookie已设置, 用户:', username, 'userUUID:', user.userUUID);

        // 登录成功
        res.status(200).json({
            success: true,
            message: '登录成功',
            data: {
                user: {
                    userUUID: user.userUUID,
                    username: user.username,
                    role: user.role
                },
                token: token,
                expiresIn: '24h'
            }
        });
    } catch (error) {
        console.error('登录失败：', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
}

// 获取当前登录用户信息
exports.getCurrentUser = async (req, res) => {
    try {
        const userUUID = req.user.userUUID;

        // ========== 缓存读取 ==========
        if (redis.isConnected()) {
            const cacheKey = `user:info:${userUUID}`;
            const cached = await redis.pHgetall(cacheKey);
            if (cached && cached.username) {
                // 反序列化嵌套对象
                const user = { ...cached };
                if (user.studentInfo) user.studentInfo = JSON.parse(user.studentInfo);
                if (user.employerInfo) user.employerInfo = JSON.parse(user.employerInfo);
                console.log('[用户信息] 缓存命中:', userUUID);
                return res.status(200).json({ success: true, data: user });
            }
            console.log('[用户信息] 缓存未命中:', userUUID);
        }


        // ========== MongoDB 查询 ==========
        const user = await User.findById(req.user.id).select('-password'); // 排除密码


        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        // ========== 缓存回写 ==========
        if (redis.isConnected()) {
            const cacheKey = `user:info:${userUUID}`;
            const userObj = user.toObject();
            // 序列化嵌套对象
            if (userObj.studentInfo) userObj.studentInfo = JSON.stringify(userObj.studentInfo);
            if (userObj.employerInfo) {
                userObj.verificationStatus = userObj.employerInfo?.verification?.status || 'unverified';
                userObj.employerInfo = JSON.stringify(userObj.employerInfo);
            }
            userObj.updatedAt = new Date().toISOString();
            delete userObj._id;
            delete userObj.password;

            await redis.pHset(cacheKey, 'username', userObj.username || '');
            await redis.pHset(cacheKey, 'email', userObj.email || '');
            await redis.pHset(cacheKey, 'avatar', userObj.avatar || '');
            await redis.pHset(cacheKey, 'role', userObj.role || '');
            if (userObj.studentInfo) await redis.pHset(cacheKey, 'studentInfo', userObj.studentInfo);
            if (userObj.employerInfo) await redis.pHset(cacheKey, 'employerInfo', userObj.employerInfo);
            if (userObj.verificationStatus) await redis.pHset(cacheKey, 'verificationStatus', userObj.verificationStatus);
            await redis.pHset(cacheKey, 'updatedAt', userObj.updatedAt);
            await redis.pExpire(cacheKey, 600); // 10 分钟
            console.log('[用户信息] 缓存已写入');
        }


        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('获取用户信息失败：', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
};

// 用户登出
exports.logoutUser = async (req, res) => {
    try {
        const userUUID = req.user.userUUID;

        // 清除新版 UUID Cookie
        res.clearCookie(`token_${userUUID}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        // 同时清除旧版 token（兼容）
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        console.log('[登出成功] Cookie已清除, userUUID:', userUUID);

        res.status(200).json({
            success: true,
            message: '登出成功'
        });
    } catch (error) {
        console.error('登出失败：', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
};


 // 用户自定义上传头像
 // 配置存储目录和文件名
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // 从 req.user 获取用户 UUID
        const userUUID = req.user?.userUUID;

        if (!userUUID) {
            console.error('[头像上传] 无法获取用户UUID');
            return cb(new Error('无法获取用户信息'), null);
        }

        // 新的目录结构：public/uploads/userFile/{userUUID}/avatar
        const uploadDir = path.join(__dirname, '../public/uploads/userFile', userUUID, 'avatar');

        // 确保目录存在，不存在则自动创建
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('[头像上传] 创建目录:', uploadDir);
        }

        cb(null, uploadDir);
    },
    // 文件名：avatar_{timestamp}.{ext}
    filename: (req, file, cb) => {
        const suffix = path.extname(file.originalname);
        const fileName = `avatar_${Date.now()}${suffix}`;
        cb(null, fileName);
    }
});

 // 文件过滤
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpg', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('仅允许上传 jpg、jpeg、png、webp 格式的图片！'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
}).single('avatar');

// 上传头像用户头像
exports.uploadAvatar = async (req, res) => {
    upload(req, res, async (err) => {
        try {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message || '头像上传失败，请检查文件格式和大小'
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: '请选择要上传的头像图片'
                });
            }

            const userUUID = req.user.userUUID;

            // 新的头像URL格式：/uploads/userFile/{userUUID}/avatar/{filename}
            const avatarUrl = `/uploads/userFile/${userUUID}/avatar/${req.file.filename}`;

            console.log('[头像上传] 生成头像URL:', avatarUrl);

            // 获取旧头像URL，用于删除旧文件
            const oldUser = await User.findById(req.user.id).select('avatar');
            const oldAvatarUrl = oldUser?.avatar;

            // 更新当前登录用户的avatar字段
            const updateUser = await User.findByIdAndUpdate(
                req.user.id,
                { avatar: avatarUrl },
                { new: true, runValidators: true }
            ).select('username avatar userUUID');

            // 删除旧头像文件（如果存在且不是默认头像）
            if (oldAvatarUrl && oldAvatarUrl.includes('/uploads/userFile/')) {
                try {
                    const oldAvatarPath = path.join(__dirname, '../public', oldAvatarUrl.replace(/^\//, ''));
                    if (fs.existsSync(oldAvatarPath)) {
                        fs.unlinkSync(oldAvatarPath);
                        console.log('[头像上传] 删除旧头像:', oldAvatarPath);
                    }
                } catch (deleteErr) {
                    console.warn('[头像上传] 删除旧头像失败:', deleteErr.message);
                    // 不影响主流程，继续返回成功
                }
            }

            if (redis.isConnected()) {
                await redis.pDel(`user:info:${userUUID}`);
                console.log('[缓存] 头像上传：已清除用户信息缓存');
            }

            res.json({
                success: true,
                message: '头像上传成功',
                data: {
                    avatar: updateUser.avatar,
                    userUUID: updateUser.userUUID
                }
            });

        } catch (err) {
            console.error('[头像上传] 接口错误：', err);
            res.status(500).json({
                success: false,
                message: '服务器内部错误，头像上传失败'
            });
        }
    })
}

/**
 * 举报截图上传（专用接口）
 * 文件存储到 /uploads/userFile/{userUUID}/reportImage/ 目录
 * 仅上传文件并返回 URL，不修改任何用户数据
 *
 * @route POST /users/upload-report-image
 * @access 已登录用户
 */
exports.uploadReportImage = async (req, res) => {
    // 构建独立的 multer 实例，存储目录为 userFile/{userUUID}/reportImage/
    const uploadDir = path.join(__dirname, '../public/uploads/userFile', req.user.userUUID, 'reportImage');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const reportImageUpload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadDir),
            filename: (req, file, cb) => {
                const suffix = path.extname(file.originalname);
                // 文件名格式：report_{timestamp}_{随机串}.{ext}
                const randomStr = Math.random().toString(36).slice(2, 8);
                cb(null, `report_${Date.now()}_${randomStr}${suffix}`);
            }
        }),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: (req, file, cb) => {
            const allowedTypes = ['image/jpg', 'image/jpeg', 'image/png', 'image/webp'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('仅允许上传 jpg、jpeg、png、webp 格式的图片'), false);
            }
        }
    }).single('reportImage');

    reportImageUpload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || '举报截图上传失败'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '请选择要上传的截图'
            });
        }

        const userUUID = req.user.userUUID;
        // URL 格式与现有文件体系一致
        const imageUrl = `/uploads/userFile/${userUUID}/reportImage/${req.file.filename}`;

        console.log('[举报截图上传] 上传成功:', {
            userUUID,
            fileName: req.file.filename,
            url: imageUrl
        });

        res.json({
            success: true,
            message: '截图上传成功',
            data: { url: imageUrl }
        });
    });
};

exports.updateUserInfo = async (req, res) => {
    try {
        console.log('更新用户信息请求:', {
            userId: req.user.id,
            body: req.body
        });

        const updateData = { ...req.body };

        // 不允许直接修改的字段
        const protectedFields = ['password', 'role', 'userUUID', '_id'];
        protectedFields.forEach(field => delete updateData[field]);

        // 查找当前用户
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            })
        }

        // 根据用户角色处理更新数据
        if (user.role === 'student' && updateData.studentInfo) {
            // 更新学生信息
            user.studentInfo = {
                ...user.studentInfo.toObject(),
                ...updateData.studentInfo
            }
        } else if (user.role === 'employer' && updateData.employerInfo) {
            // 更新雇主信息
            user.employerInfo = {
                ...user.employerInfo.toObject(),
                ...updateData.employerInfo
            }
        } else if (updateData.username || updateData.email || updateData.avatar) {
            // 更新通用字段
            if (updateData.username) user.username = updateData.username;
            if (updateData.email) user.email = updateData.email;
            if (updateData.avatar) user.avatar = updateData.avatar;
        } else {
            return res.status(400).json({
                success: false,
                message: '没有有效的更新数据'
            })
        }

        await user.save();

        if (redis.isConnected()) {
            await redis.pDel(`user:info:${user.userUUID}`);
            console.log('[缓存] 用户信息更新：已清除缓存');
        }


        // 重新获取用户信息(排除密码)
        const updatedUser = await User.findById(req.user.id).select('-password');

        res.status(200).json({
            success: true,
            message: '用户信息更新成功',
            data: updatedUser
        })

    } catch (error) {
        console.error('更新用户信息失败：', error);

        // 处理验证错误
        if (error.name === 'ValidationError') {
            const errMsg = Object.values(error.errors).map(item => item.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errMsg
            });
        }

        // 处理唯一性约束错误
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `${field} 已存在`
            })
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        })
    }
}

// 修改密码验证规则
exports.changePasswordValidation = [
    body('newPassword')
        .notEmpty().withMessage('新密码不能为空')
        .trim()
        .isLength({ min: 6 }).withMessage('新密码至少6位')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/).withMessage('新密码需包含字母和数字'),

    body('confirmPassword')
        .notEmpty().withMessage('确认密码不能为空')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('两次输入的新密码不一致');
            }
            return true;
        })
]

// 修改密码
exports.changePassword = async (req, res) => {
    try {
        console.log('【后端】修改密码请求:', {
            userId: req.user.id,
            body: req.body
        });

        // 二次校验
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const { newPassword } = req.body;
        const userId = req.user.id;


        // 查询用户（包含密码字段）
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        // 比较原密码
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: '新密码不能与当前密码相同'
            });
        }


        // 检查密码强度（可以在前端验证，这里作为二次验证）
        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: '密码至少6位，且包含字母和数字'
            });
        }

        // 加密新密码并更新
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        // 修改密码后清除 Cookie
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        console.log('[密码修改] Cookie已清除, 用户需重新登录');

        // 使所有现有token失效（增强安全性）
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Heartscar ')) {
            const currentToken = authHeader.split(' ')[1];
            if (currentToken) {
                // 使用当前token
                const invalidated = invalidateToken(currentToken);

                // Redis方案留档
                // const invalidated = await jwt.invalidateUserTokens(userId);

                if (invalidated) {
                    console.log(`用户 ${userId} 的token已失效`);
                } else {
                    console.warn(`用户 ${userId} 的token失效失败`);
                }
            }
        }

        res.status(200).json({
            success: true,
            message: '密码修改成功，请重新登录'
        });

    } catch (error) {
        console.error('修改密码失败：', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: '数据验证失败: ' + error.message
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
};


/**
 * 搜索用户（用于发起聊天）
 * @route GET /users/search
 */
exports.searchUsers = async (req, res) => {
    try {
        const { keyword } = req.query;
        const currentUserUUID = req.user.userUUID;

        console.log('[用户搜索] 关键字:', keyword);

        if (!keyword || keyword.trim().length < 2) {
            return res.json({
                success: true,
                data: []
            });
        }

        // 搜索匹配的用户名或邮箱
        const regex = new RegExp(keyword.trim(), 'i');
        const users = await User.find({
            $and: [
                { userUUID: { $ne: currentUserUUID } },
                {
                    $or: [
                        { username: regex },
                        { email: regex }
                    ]
                }
            ]
        })
            .select('userUUID username avatar email role employerInfo studentInfo')
            .limit(20)
            .lean();

        // 格式化返回数据
        const results = users.map(u => ({
            userUUID: u.userUUID,
            username: u.username,
            avatar: u.avatar,
            email: u.email,
            role: u.role,
            displayName: u.role === 'employer'
                ? (u.employerInfo?.companyInfo?.companyName || u.username)
                : (u.studentInfo?.studentName || u.username)
        }));

        console.log('[用户搜索] 结果数量:', results.length);

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('[用户搜索] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// ========== 腾讯云图形验证码验证辅助函数 ==========

/**
 * 验证腾讯云图形验证码（防水墙）
 * 调用腾讯云验证码服务端验证接口
 *
 * @param {string} ticket - 前端验证成功后获取的 ticket
 * @param {string} randstr - 前端验证成功后获取的 randstr
 * @param {string} userIP - 用户IP地址
 * @returns {Promise<boolean>} 验证是否通过
 */
const verifyTencentCaptcha = (ticket, randstr, userIP) => {
    return new Promise((resolve) => {
        console.log('[腾讯云验证码] ========== 开始服务端校验 ==========');

        const appId = process.env.TENCENT_CAPTCHA_APP_ID || '193713700';
        const secretKey = process.env.TENCENT_CAPTCHA_APP_SECRET_KEY || '';

        // 如果未配置密钥，跳过验证（开发环境兼容）
        if (!secretKey) {
            console.warn('[腾讯云验证码] 未配置 TENCENT_CAPTCHA_APP_SECRET_KEY，跳过验证（开发环境）');
            console.log('[腾讯云验证码] ========== 校验完成（跳过） ==========');
            resolve(true);
            return;
        }

        // 构建请求参数
        const params = new URLSearchParams({
            aid: appId,
            AppSecretKey: secretKey,
            Ticket: ticket,
            Randstr: randstr,
            UserIP: userIP || '0.0.0.0'
        });

        const requestUrl = `https://ssl.captcha.qq.com/ticket/verify?${params.toString()}`;

        console.log('[腾讯云验证码] 请求URL:', requestUrl.replace(secretKey, '***'));

        https.get(requestUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log('[腾讯云验证码] 响应:', result);

                    // response 为 '1' 表示验证成功
                    if (result.response === '1') {
                        console.log('[腾讯云验证码] 校验通过');
                        console.log('[腾讯云验证码] ========== 校验完成 ==========');
                        resolve(true);
                    } else {
                        console.log('[腾讯云验证码] 校验失败:', result.err_msg || '未知错误');
                        console.log('[腾讯云验证码] ========== 校验完成（失败） ==========');
                        resolve(false);
                    }
                } catch (parseError) {
                    console.error('[腾讯云验证码] 响应解析失败:', parseError);
                    console.log('[腾讯云验证码] ========== 校验完成（异常） ==========');
                    resolve(false);
                }
            });
        }).on('error', (error) => {
            console.error('[腾讯云验证码] 请求失败:', error);
            console.log('[腾讯云验证码] ========== 校验完成（网络异常） ==========');
            resolve(false);
        });
    });
};


/**
 * 发送注册验证码
 * @route POST /users/send-register-code
 * @access 公开
 * @description 注册时发送邮箱验证码，无需事先注册
 *
 * @param {string} email - 邮箱地址
 * @returns {Object} { cooldown: 60 }
 */
exports.sendRegisterCode = async (req, res) => {
    try {
        const { email } = req.body;

        console.log('[发送注册验证码] ========== 开始处理 ==========');
        console.log('[发送注册验证码] 邮箱:', email);

        // ========== 1. 参数校验 ==========
        if (!email) {
            return res.status(400).json({
                success: false,
                message: '邮箱不能为空'
            });
        }

        // ========== 2. 检查冷却时间 ==========
        const resendCheck = await verificationCodeManager.canResend(email);
        if (!resendCheck.canResend) {
            return res.status(429).json({
                success: false,
                message: `请等待 ${resendCheck.remainingSeconds} 秒后再重新获取验证码`,
                data: { cooldown: resendCheck.remainingSeconds }
            });
        }

        // ========== 3. 生成验证码并发送 ==========
        let code;
        // [测试] 测试邮箱，固定验证码为 123456
        if (email.startsWith('testEmail')) {
            code = '123456';
            console.log(`[发送注册验证码] 测试邮箱，使用固定验证码: ${code}`);
        } else {
            const result = verificationCodeManager.generate(email);
            code = result.code;
        }

        const emailSent = await sendVerificationCode({
            to: email,
            code: code,
            purpose: 'register'
        });

        if (!emailSent) {
            await verificationCodeManager.remove(email);
            return res.status(500).json({
                success: false,
                message: '验证码发送失败，请稍后重试'
            });
        }

        console.log('[发送注册验证码] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '验证码已发送，请查收邮件',
            data: { cooldown: verificationCodeManager.RESEND_COOLDOWN_SECONDS }
        });

    } catch (error) {
        console.error('[发送注册验证码] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// ========== 身份验证相关方法 ==========

/**
 * 提交身份验证申请
 * @route POST /users/verify
 * @access 仅雇主用户
 * @description 雇主主动提交身份验证申请，根据雇主类型自动设置验证类型
 *              个人雇主 → real_name（实名验证）
 *              企业雇主 → enterprise（企业认证）
 */
exports.submitVerification = async (req, res) => {
    try {
        const userUUID = req.user.userUUID;
        const userId = req.user.id;

        console.log('[身份验证] ========== 提交验证申请 ==========');
        console.log('[身份验证] 用户:', { userUUID, userId, role: req.user.role });

        // ========== 1. 验证用户角色（仅雇主可提交） ==========
        const user = await User.findById(userId);
        if (!user) {
            console.log('[身份验证] 用户不存在:', userId);
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        if (user.role !== 'employer') {
            console.log('[身份验证] 非雇主用户:', user.role);
            return res.status(403).json({
                success: false,
                message: '仅雇主用户可提交身份验证'
            });
        }

        // ========== 2. 检查是否已在审核中 ==========
        const currentStatus = user.employerInfo?.verification?.status || 'unverified';
        if (currentStatus === 'pending') {
            console.log('[身份验证] 已有待审核的申请');
            return res.status(400).json({
                success: false,
                message: '您已有待审核的验证申请，请耐心等待管理员审核'
            });
        }

        if (currentStatus === 'approved') {
            console.log('[身份验证] 已验证通过');
            return res.status(400).json({
                success: false,
                message: '您的身份已验证通过，无需重复申请'
            });
        }

        // ========== 3. 初始化 verification 对象（兼容旧数据） ==========
        if (!user.employerInfo.verification) {
            user.employerInfo.verification = {};
        }

        // ========== 4. 根据雇主类型设置验证类型 ==========
        const employerType = user.employerInfo.employerType;
        const verificationType = employerType === 'personal' ? 'real_name' : 'enterprise';

        console.log('[身份验证] 验证类型:', {
            employerType,
            verificationType
        });

        // ========== 5. 更新验证状态为待审核 ==========
        user.employerInfo.verification.status = 'pending';
        user.employerInfo.verification.submittedAt = new Date();
        user.employerInfo.verification.verificationType = verificationType;
        // 清空之前的审核信息
        user.employerInfo.verification.reviewedAt = null;
        user.employerInfo.verification.reviewerNotes = '';
        user.employerInfo.verification.rejectionReason = '';

        await user.save();

        if (redis.isConnected()) {
            await redis.pDel(`user:info:${userUUID}`);
            console.log('[缓存] 身份验证提交：已清除用户信息缓存');
        }

        console.log('[身份验证] 申请提交成功:', {
            status: user.employerInfo.verification.status,
            verificationType: user.employerInfo.verification.verificationType,
            submittedAt: user.employerInfo.verification.submittedAt
        });
        console.log('[身份验证] ========== 提交完成 ==========');

        res.json({
            success: true,
            message: '验证申请已提交，请等待管理员审核',
            data: {
                verification: user.employerInfo.verification
            }
        });

    } catch (error) {
        console.error('[身份验证] 提交失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 管理员审核身份验证（预留接口，待管理员系统开发后启用）
 * @route PUT /users/verify/review
 * @access 仅管理员（待实现权限校验）
 * @description 管理员审核雇主提交的身份验证申请
 *
 * @param {string} targetUserUUID - 被审核用户的UUID
 * @param {string} status - 审核结果：'approved' | 'rejected'
 * @param {string} reviewerNotes - 审核备注
 * @param {string} rejectionReason - 驳回原因（rejected时填写）
 *
 * TODO: 待管理员系统开发后：
 * 1. 添加管理员权限中间件验证
 * 2. 绑定到路由 PUT /users/verify/review
 * 3. 实现审核通知（站内信推送）
 */
exports.reviewVerification = async (req, res) => {
    try {
        const { targetUserUUID, status, reviewerNotes, rejectionReason } = req.body;
        const adminUUID = req.user.userUUID; // 管理员UUID

        console.log('[身份验证审核] ========== 开始审核 ==========');
        console.log('[身份验证审核] 参数:', {
            adminUUID,
            targetUserUUID,
            status,
            reviewerNotes
        });

        // ========== 1. 参数校验 ==========
        if (!targetUserUUID || !status) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数：targetUserUUID 或 status'
            });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的审核状态，只能为 approved 或 rejected'
            });
        }

        // ========== 2. TODO: 管理员权限校验（待管理员系统开发） ==========
        // 当前暂时允许所有已登录用户调用，后续需替换为管理员权限中间件
        // if (req.user.role !== 'admin') {
        //     return res.status(403).json({ success: false, message: '仅管理员可操作' });
        // }

        // ========== 3. 查找目标用户 ==========
        const targetUser = await User.findOne({ userUUID: targetUserUUID });
        if (!targetUser) {
            console.log('[身份验证审核] 目标用户不存在:', targetUserUUID);
            return res.status(404).json({
                success: false,
                message: '目标用户不存在'
            });
        }

        // ========== 4. 检查目标用户是否有待审核的申请 ==========
        const currentStatus = targetUser.employerInfo?.verification?.status;
        if (currentStatus !== 'pending') {
            console.log('[身份验证审核] 用户无待审核申请:', currentStatus);
            return res.status(400).json({
                success: false,
                message: `该用户当前状态为"${currentStatus}"，无法审核`
            });
        }

        // ========== 5. 初始verification对象（兼容旧数据） ==========
        if (!targetUser.employerInfo.verification) {
            targetUser.employerInfo.verification = {};
        }

        // ========== 6. 更新审核结果 ==========
        targetUser.employerInfo.verification.status = status;
        targetUser.employerInfo.verification.reviewedAt = new Date();
        targetUser.employerInfo.verification.reviewerNotes = reviewerNotes || '';

        if (status === 'rejected' && rejectionReason) {
            targetUser.employerInfo.verification.rejectionReason = rejectionReason;
        }

        await targetUser.save();

        console.log('[身份验证审核] 审核完成:', {
            targetUserUUID,
            newStatus: status,
            reviewedAt: targetUser.employerInfo.verification.reviewedAt
        });
        console.log('[身份验证审核] ========== 审核完成 ==========');

        // ========== 7. TODO: 发送审核结果通知（待开发） ==========
        // 复用现有站内信系统通知被审核用户审核结果
        // await sendVerificationResultNotification(targetUser, status, reviewerNotes);

        res.json({
            success: true,
            message: status === 'approved' ? '验证已通过' : '验证已拒绝',
            data: {
                verification: targetUser.employerInfo.verification
            }
        });

    } catch (error) {
        console.error('[身份验证审核] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

