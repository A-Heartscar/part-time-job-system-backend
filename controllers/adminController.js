// controllers/adminController.js
// ========== 管理员控制器 ==========
// 独立于 userController，管理员和普通用户系统完全隔离
// 处理管理员登录、审核、管理操作等所有业务逻辑
const Admin = require('../models/Admin');
const AdminLoginLog = require('../models/AdminLoginLog');
const AdminOperationLog = require('../models/AdminOperationLog');
const User = require('../models/User');
const Resume = require('../models/Resume');
const Comment = require('../models/Comment');
const CommentReport = require('../models/CommentReport');
const UserViolationRecord = require('../models/UserViolationRecord');
const UserPenalty = require('../models/UserPenalty');
const Job = require('../models/Job');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { generateAdminToken } = require('../config/adminJwt');
const { logAdminLogin, logAdminOperation } = require('../utils/adminLogHelper');
const redis = require("../config/redis");

// ========== 登录验证规则 ==========
exports.loginValidation = [
    require('express-validator').body('username')
        .notEmpty().withMessage('用户名不能为空')
        .trim(),
    require('express-validator').body('password')
        .notEmpty().withMessage('密码不能为空')
];

/**
 * 管理员登录
 * @route POST /api/admin/login
 * @access 公开
 */
exports.adminLogin = async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('[管理员登录] ========== 开始登录 ==========');
        console.log('[管理员登录] 用户名:', username);

        // ========== 1. 参数校验 ==========
        if (!username || !password) {
            console.log('[管理员登录] 参数不完整');
            await logAdminLogin(
                { adminUUID: '', username: username || 'unknown' },
                req.ip, req.headers['user-agent'], 'failed', '用户名或密码为空'
            );
            return res.status(400).json({
                success: false,
                message: '用户名和密码不能为空'
            });
        }

        // ========== 2. 查找管理员 ==========
        const admin = await Admin.findOne({ username: username.trim() }).select('+password');
        if (!admin) {
            console.log('[管理员登录] 管理员不存在:', username);
            await logAdminLogin(
                { adminUUID: '', username: username.trim() },
                req.ip, req.headers['user-agent'], 'failed', '用户名不存在'
            );
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        // ========== 3. 检查账号状态 ==========
        if (admin.status !== 'active') {
            console.log('[管理员登录] 账号已被禁用:', username);
            await logAdminLogin(
                { adminUUID: admin.adminUUID, username: admin.username },
                req.ip, req.headers['user-agent'], 'failed', '账号已被禁用'
            );
            return res.status(403).json({
                success: false,
                message: '该管理员账号已被禁用，请联系超级管理员'
            });
        }

        // ========== 4. 校验密码 ==========
        const isPasswordValid = await admin.comparePassword(password);
        if (!isPasswordValid) {
            console.log('[管理员登录] 密码错误:', username);
            await logAdminLogin(
                { adminUUID: admin.adminUUID, username: admin.username },
                req.ip, req.headers['user-agent'], 'failed', '密码错误'
            );
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        // ========== 5. 生成 Token ==========
        const token = generateAdminToken({
            adminId: admin._id,
            adminUUID: admin.adminUUID,
            username: admin.username,
            role: admin.role
        });

        // ========== 6. 设置 admin_token Cookie ==========
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 8 * 60 * 60 * 1000, // 8小时
            path: '/'
        });

        // ========== 7. 更新登录信息 ==========
        admin.lastLoginAt = new Date();
        admin.lastLoginIP = req.ip || '';
        await admin.save();

        // ========== 8. 记录登录成功日志 ==========
        await logAdminLogin(
            { adminUUID: admin.adminUUID, username: admin.username },
            req.ip, req.headers['user-agent'], 'success'
        );

        console.log('[管理员登录] 登录成功:', username);
        console.log('[管理员登录] ========== 登录完成 ==========');

        res.status(200).json({
            success: true,
            message: '管理员登录成功',
            data: {
                admin: {
                    adminUUID: admin.adminUUID,
                    username: admin.username,
                    role: admin.role,
                    realName: admin.realName
                },
                token: token,
                expiresIn: '8h'
            }
        });

    } catch (error) {
        console.error('[管理员登录] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 管理员登出
 * @route POST /api/admin/logout
 * @access 已登录管理员
 */
exports.adminLogout = async (req, res) => {
    try {
        console.log('[管理员登出] ========== 开始登出 ==========');
        console.log('[管理员登出] 管理员:', req.admin?.username);

        // 清除 admin_token Cookie
        res.clearCookie('admin_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        console.log('[管理员登出] Cookie 已清除');
        console.log('[管理员登出] ========== 登出完成 ==========');

        res.status(200).json({
            success: true,
            message: '管理员已退出登录'
        });

    } catch (error) {
        console.error('[管理员登出] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取当前管理员信息
 * @route GET /api/admin/me
 * @access 已登录管理员
 */
exports.getCurrentAdmin = async (req, res) => {
    try {
        console.log('[管理员信息] 查询当前管理员:', req.admin?.username);

        const admin = await Admin.findOne({ adminUUID: req.admin.adminUUID })
            .select('-password');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: '管理员不存在'
            });
        }

        console.log('[管理员信息] 查询成功:', admin.username);

        res.json({
            success: true,
            data: admin
        });

    } catch (error) {
        console.error('[管理员信息] 查询失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新管理员个人信息
 * @route PUT /api/admin/me
 * @access 已登录管理员
 */
exports.updateAdminInfo = async (req, res) => {
    try {
        const { realName, email, avatar } = req.body;
        const adminUUID = req.admin.adminUUID;

        console.log('[管理员更新] ========== 开始更新 ==========');
        console.log('[管理员更新] 管理员:', req.admin.username);

        // ========== 1. 查找管理员 ==========
        const admin = await Admin.findOne({ adminUUID });
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: '管理员不存在'
            });
        }

        // ========== 2. 更新允许修改的字段 ==========
        if (realName !== undefined) admin.realName = realName;
        if (email !== undefined) admin.email = email;
        if (avatar !== undefined) admin.avatar = avatar;

        await admin.save();

        console.log('[管理员更新] 更新成功');
        console.log('[管理员更新] ========== 更新完成 ==========');

        res.json({
            success: true,
            message: '个人信息已更新',
            data: admin
        });

    } catch (error) {
        console.error('[管理员更新] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 修改管理员密码
 * @route PUT /api/admin/change-password
 * @access 已登录管理员
 */
exports.changeAdminPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const adminUUID = req.admin.adminUUID;

        console.log('[管理员改密] ========== 开始处理 ==========');
        console.log('[管理员改密] 管理员:', req.admin.username);

        // ========== 1. 参数校验 ==========
        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: '旧密码和新密码不能为空'
            });
        }

        // ========== 2. 密码强度校验 ==========
        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: '新密码至少6位，且包含字母和数字'
            });
        }

        // ========== 3. 查找管理员 ==========
        const admin = await Admin.findOne({ adminUUID }).select('+password');
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: '管理员不存在'
            });
        }

        // ========== 4. 校验旧密码 ==========
        const isOldPasswordValid = await admin.comparePassword(oldPassword);
        if (!isOldPasswordValid) {
            console.log('[管理员改密] 旧密码错误');
            return res.status(400).json({
                success: false,
                message: '旧密码错误'
            });
        }

        // ========== 5. 新密码不能与旧密码相同 ==========
        const isSamePassword = await bcrypt.compare(newPassword, admin.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: '新密码不能与当前密码相同'
            });
        }

        // ========== 6. 更新密码 ==========
        const salt = await bcrypt.genSalt(10);
        admin.password = await bcrypt.hash(newPassword, salt);
        await admin.save();

        // 清除 Cookie
        res.clearCookie('admin_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        });

        // ========== 7. 记录操作日志 ==========
        await logAdminOperation(
            req.admin, 'update_password', 'admin', admin.adminUUID,
            '修改管理员密码', req.ip
        );

        console.log('[管理员改密] 密码修改成功，请重新登录');
        console.log('[管理员改密] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '密码修改成功，请重新登录'
        });

    } catch (error) {
        console.error('[管理员改密] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 创建子管理员（仅超级管理员可操作）
 * @route POST /api/admin/create
 * @access 仅 super_admin
 */
exports.createSubAdmin = async (req, res) => {
    try {
        const { username, password, realName, email } = req.body;
        const operatorAdmin = req.admin;

        console.log('[创建管理员] ========== 开始创建 ==========');
        console.log('[创建管理员] 操作者:', operatorAdmin.username);

        // ========== 1. 权限校验 ==========
        if (operatorAdmin.role !== 'super_admin') {
            console.log('[创建管理员] 权限不足:', operatorAdmin.role);
            return res.status(403).json({
                success: false,
                message: '仅超级管理员可创建管理员账号'
            });
        }

        // ========== 2. 参数校验 ==========
        if (!username || !password || !realName || !email) {
            return res.status(400).json({
                success: false,
                message: '所有字段不能为空'
            });
        }

        // ========== 3. 密码强度校验 ==========
        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: '密码至少6位，且包含字母和数字'
            });
        }

        // ========== 4. 检查用户名是否已存在 ==========
        const isTaken = await Admin.isUsernameTaken(username);
        if (isTaken) {
            console.log('[创建管理员] 用户名已存在:', username);
            return res.status(400).json({
                success: false,
                message: '用户名已存在'
            });
        }

        // ========== 5. 创建管理员 ==========
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAdmin = await Admin.create({
            adminUUID: uuidv4(),
            username: username.trim(),
            password: hashedPassword,
            realName: realName.trim(),
            role: 'admin', // 固定为普通管理员
            email: email.trim(),
            status: 'active',
            createdBy: operatorAdmin.adminUUID
        });

        // ========== 6. 记录操作日志 ==========
        await logAdminOperation(
            operatorAdmin, 'create_admin', 'admin', newAdmin.adminUUID,
            `创建管理员: ${newAdmin.username} (${newAdmin.realName})`, req.ip
        );

        console.log('[创建管理员] 创建成功:', {
            adminUUID: newAdmin.adminUUID,
            username: newAdmin.username
        });
        console.log('[创建管理员] ========== 创建完成 ==========');

        res.status(201).json({
            success: true,
            message: '管理员创建成功',
            data: {
                adminUUID: newAdmin.adminUUID,
                username: newAdmin.username,
                realName: newAdmin.realName,
                role: newAdmin.role
            }
        });

    } catch (error) {
        console.error('[创建管理员] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取管理员列表（仅超级管理员可操作）
 * @route GET /api/admin/list
 * @access 仅 super_admin
 */
exports.getAdminList = async (req, res) => {
    try {
        console.log('[管理员列表] ========== 开始查询 ==========');

        // ========== 1. 权限校验 ==========
        if (req.admin.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: '仅超级管理员可查看管理员列表'
            });
        }

        const { page = 1, limit = 20 } = req.query;

        // ========== 2. 分页查询 ==========
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const admins = await Admin.find()
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Admin.countDocuments();

        console.log('[管理员列表] 查询结果:', { total, returned: admins.length });
        console.log('[管理员列表] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: admins,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[管理员列表] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新管理员状态（启用/禁用）
 * @route PUT /api/admin/:adminUUID/status
 * @access 仅 super_admin
 */
exports.updateAdminStatus = async (req, res) => {
    try {
        const { adminUUID } = req.params;
        const { status } = req.body;
        const operatorAdmin = req.admin;

        console.log('[管理员状态] ========== 开始更新 ==========');
        console.log('[管理员状态] 目标:', adminUUID, '新状态:', status);

        // ========== 1. 权限校验 ==========
        if (operatorAdmin.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: '仅超级管理员可修改管理员状态'
            });
        }

        // ========== 2. 参数校验 ==========
        if (!['active', 'disabled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的状态值'
            });
        }

        // ========== 3. 不能修改自己的状态 ==========
        if (operatorAdmin.adminUUID === adminUUID) {
            return res.status(400).json({
                success: false,
                message: '不能修改自己的状态'
            });
        }

        // ========== 4. 查找目标管理员 ==========
        const targetAdmin = await Admin.findOne({ adminUUID });
        if (!targetAdmin) {
            return res.status(404).json({
                success: false,
                message: '管理员不存在'
            });
        }

        // ========== 5. 不能修改超级管理员的状态 ==========
        if (targetAdmin.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                message: '不能修改超级管理员的状态'
            });
        }

        // ========== 6. 更新状态 ==========
        targetAdmin.status = status;
        await targetAdmin.save();

        // ========== 7. 记录操作日志 ==========
        await logAdminOperation(
            operatorAdmin, 'update_admin_status', 'admin', targetAdmin.adminUUID,
            `${status === 'active' ? '启用' : '禁用'}管理员: ${targetAdmin.username}`, req.ip
        );

        console.log('[管理员状态] 更新完成:', { username: targetAdmin.username, status });
        console.log('[管理员状态] ========== 更新完成 ==========');

        res.json({
            success: true,
            message: status === 'active' ? '管理员已启用' : '管理员已禁用',
            data: { adminUUID: targetAdmin.adminUUID, status: targetAdmin.status }
        });

    } catch (error) {
        console.error('[管理员状态] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取登录日志
 * @route GET /api/admin/logs/login
 * @access 已登录管理员
 */
exports.getLoginLogs = async (req, res) => {
    try {
        const { page = 1, limit = 30 } = req.query;

        console.log('[登录日志] ========== 开始查询 ==========');

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AdminLoginLog.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await AdminLoginLog.countDocuments();

        console.log('[登录日志] 查询结果:', { total, returned: logs.length });
        console.log('[登录日志] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[登录日志] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取操作日志
 * @route GET /api/admin/logs/operation
 * @access 已登录管理员
 */
exports.getOperationLogs = async (req, res) => {
    try {
        const { page = 1, limit = 30, action } = req.query;

        console.log('[操作日志] ========== 开始查询 ==========');
        console.log('[操作日志] 筛选 action:', action);

        // 构建查询条件
        const query = {};
        if (action) {
            query.action = action;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AdminOperationLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await AdminOperationLog.countDocuments(query);

        console.log('[操作日志] 查询结果:', { total, returned: logs.length });
        console.log('[操作日志] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[操作日志] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取待审核实习列表
 * @route GET /api/admin/pending/internships
 * @access 已登录管理员
 */
exports.getPendingInternships = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        console.log('[待审核实习] ========== 开始查询 ==========');

        // ========== 1. 查询包含待审核实习的简历 ==========
        const resumes = await Resume.find({
            'internshipExperiences.verificationRequest.status': 'pending'
        })
            .select('studentUUID internshipExperiences')
            .lean();

        console.log('[待审核实习] 匹配简历数:', resumes.length);

        // ========== 2. 提取所有待审核实习 ==========
        const pendingInternships = [];
        const studentUUIDs = new Set();

        resumes.forEach(resume => {
            resume.internshipExperiences.forEach((internship, index) => {
                if (internship.verificationRequest?.status === 'pending') {
                    pendingInternships.push({
                        resumeId: resume._id,
                        studentUUID: resume.studentUUID,
                        internshipIndex: index,
                        company: internship.company,
                        position: internship.position,
                        durationWeeks: internship.durationWeeks,
                        submittedAt: internship.verificationRequest.submittedAt,
                        materialsCount: internship.verificationRequest.supportingMaterials?.length || 0,
                        verificationRequest: internship.verificationRequest
                    });
                    studentUUIDs.add(resume.studentUUID);
                }
            });
        });

        // ========== 3. 查询学生信息 ==========
        const students = await User.find(
            { userUUID: { $in: [...studentUUIDs] } },
            'userUUID username avatar studentInfo'
        ).lean();

        const studentMap = {};
        students.forEach(s => {
            studentMap[s.userUUID] = {
                username: s.username,
                avatar: s.avatar,
                studentName: s.studentInfo?.studentName || s.username,
                school: s.studentInfo?.school || '未知学校',
                major: s.studentInfo?.major || '未知专业'
            };
        });

        // ========== 4. 组装返回数据 ==========
        const enrichedInternships = pendingInternships.map(item => ({
            ...item,
            student: studentMap[item.studentUUID] || { username: '未知', studentName: '未知' }
        }));

        // 分页处理
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const total = enrichedInternships.length;
        const paginatedData = enrichedInternships.slice(skip, skip + parseInt(limit));

        console.log('[待审核实习] 查询结果:', { total, returned: paginatedData.length });
        console.log('[待审核实习] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: paginatedData,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[待审核实习] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 审核实习经历
 * @route POST /api/admin/verify/internship/:resumeId/:internshipIndex
 * @access 已登录管理员
 */
exports.verifyInternship = async (req, res) => {
    try {
        const { resumeId, internshipIndex } = req.params;
        const { status, reviewerNotes } = req.body;
        const operatorAdmin = req.admin;

        console.log('[实习审核] ========== 开始审核 ==========');
        console.log('[实习审核] 参数:', { resumeId, internshipIndex, status });

        // ========== 1. 参数校验 ==========
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的审核状态，只能为 approved 或 rejected'
            });
        }

        // ========== 2. 查找简历 ==========
        const resume = await Resume.findById(resumeId);
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: '简历不存在'
            });
        }

        // ========== 3. 检查实习经历是否存在 ==========
        const internship = resume.internshipExperiences[parseInt(internshipIndex)];
        if (!internship) {
            return res.status(404).json({
                success: false,
                message: '实习经历不存在'
            });
        }

        // ========== 4. 检查审核状态 ==========
        if (internship.verificationRequest?.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `该实习经历当前状态为"${internship.verificationRequest?.status || 'none'}"，无法审核`
            });
        }

        // ========== 5. 初始 verificationRequest 对象 ==========
        if (!internship.verificationRequest) {
            internship.verificationRequest = {};
        }

        // ========== 6. 更新审核结果 ==========
        internship.verificationRequest.status = status;
        internship.verificationRequest.reviewedAt = new Date();
        internship.verificationRequest.reviewerNotes = reviewerNotes || '';
        internship.verificationRequest.reviewedBy = operatorAdmin.adminUUID;

        // 审核通过时更新实习认证状态
        if (status === 'approved') {
            internship.isVerified = true;
        }

        await resume.save();

        // ========== 7. 记录操作日志 ==========
        await logAdminOperation(
            operatorAdmin, 'verify_internship', 'internship',
            resume.studentUUID,
            `${status === 'approved' ? '通过' : '拒绝'}实习审核: ${internship.company} - ${internship.position}`,
            req.ip
        );

        console.log('[实习审核] 审核完成:', { status, company: internship.company });
        console.log('[实习审核] ========== 审核完成 ==========');

        res.json({
            success: true,
            message: status === 'approved' ? '实习审核已通过' : '实习审核已拒绝',
            data: { status }
        });

    } catch (error) {
        console.error('[实习审核] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取待审核雇主列表
 * @route GET /api/admin/pending/employers
 * @access 已登录管理员
 */
exports.getPendingEmployers = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        console.log('[待审核雇主] ========== 开始查询 ==========');

        // ========== 1. 查询待审核雇主 ==========
        const query = {
            role: 'employer',
            'employerInfo.verification.status': 'pending'
        };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const employers = await User.find(query)
            .select('userUUID username email avatar role employerInfo createdAt')
            .sort({ 'employerInfo.verification.submittedAt': -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await User.countDocuments(query);

        // ========== 2. 格式化返回数据 ==========
        const formattedEmployers = employers.map(emp => {
            const info = emp.employerInfo || {};
            const verification = info.verification || {};
            const isCompany = info.employerType === 'company';

            return {
                userUUID: emp.userUUID,
                username: emp.username,
                email: emp.email,
                avatar: emp.avatar,
                employerType: info.employerType,
                verificationStatus: verification.status,
                submittedAt: verification.submittedAt,
                verificationType: verification.verificationType,
                // 企业信息
                companyName: isCompany ? info.companyInfo?.companyName : null,
                creditCode: isCompany ? info.companyInfo?.creditCode : null,
                companyType: isCompany ? info.companyInfo?.companyType : null,
                companyAddress: isCompany ? info.companyInfo?.companyAddress : null,
                // 个人信息
                realName: !isCompany ? info.personalInfo?.realName : null,
                idCard: !isCompany ? info.personalInfo?.idCard : null,
                profession: !isCompany ? info.personalInfo?.profession : null,
                createdAt: emp.createdAt
            };
        });

        console.log('[待审核雇主] 查询结果:', { total, returned: formattedEmployers.length });
        console.log('[待审核雇主] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: formattedEmployers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[待审核雇主] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 审核雇主身份验证
 * @route POST /api/admin/verify/employer/:userUUID
 * @access 已登录管理员
 */
exports.verifyEmployer = async (req, res) => {
    try {
        const { userUUID } = req.params;
        const { status, reviewerNotes, rejectionReason } = req.body;
        const operatorAdmin = req.admin;

        console.log('[雇主审核] ========== 开始审核 ==========');
        console.log('[雇主审核] 参数:', { userUUID, status });

        // ========== 1. 参数校验 ==========
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的审核状态，只能为 approved 或 rejected'
            });
        }

        // ========== 2. 查找雇主用户 ==========
        const user = await User.findOne({ userUUID, role: 'employer' });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: '雇主用户不存在'
            });
        }

        // ========== 3. 检查审核状态 ==========
        const currentStatus = user.employerInfo?.verification?.status;
        if (currentStatus !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `该雇主当前验证状态为"${currentStatus || 'unverified'}"，无法审核`
            });
        }

        // ========== 4. 初始 verification 对象 ==========
        if (!user.employerInfo.verification) {
            user.employerInfo.verification = {};
        }

        // ========== 5. 更新审核结果 ==========
        user.employerInfo.verification.status = status;
        user.employerInfo.verification.reviewedAt = new Date();
        user.employerInfo.verification.reviewerNotes = reviewerNotes || '';

        if (status === 'rejected' && rejectionReason) {
            user.employerInfo.verification.rejectionReason = rejectionReason;
        }

        await user.save();

        // ========== 清除用户信息缓存 ==========
        if (redis.isConnected()) {
            await redis.pDel(`user:info:${userUUID}`);
            console.log('[缓存] 雇主审核：已清除用户信息缓存');
        }

        // ========== 6. 记录操作日志 ==========
        const employerName = user.employerInfo?.employerType === 'company'
            ? user.employerInfo?.companyInfo?.companyName
            : user.employerInfo?.personalInfo?.realName;

        await logAdminOperation(
            operatorAdmin, 'verify_employer', 'employer', userUUID,
            `${status === 'approved' ? '通过' : '拒绝'}雇主验证: ${employerName || user.username} (${user.employerInfo?.employerType === 'company' ? '企业' : '个人'})`,
            req.ip
        );

        console.log('[雇主审核] 审核完成:', { userUUID, status });
        console.log('[雇主审核] ========== 审核完成 ==========');

        res.json({
            success: true,
            message: status === 'approved' ? '雇主验证已通过' : '雇主验证已拒绝',
            data: {
                userUUID,
                status,
                reviewedAt: user.employerInfo.verification.reviewedAt
            }
        });

    } catch (error) {
        console.error('[雇主审核] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取待审核举报列表
 * 查询 CommentReport 表中 status === 'pending' 或 'in_review' 的记录
 * 支持筛选、搜索、高优标记
 *
 * @route GET /api/admin/reports
 * @access 已登录管理员
 */
exports.getPendingReports = async (req, res) => {
    try {
        const {
            page = 1, limit = 20, status, reason,
            startDate, endDate, keyword, priority
        } = req.query;

        console.log('[举报列表] ========== 开始查询 ==========');
        console.log('[举报列表] 参数:', { page, limit, status, reason, keyword, priority });

        // ========== 1. 先处理锁过期的工单（自动释放认领锁） ==========
        const now = new Date();
        const releasedLocks = await CommentReport.updateMany(
            {
                status: 'in_review',
                lockExpireAt: { $lt: now }
            },
            {
                $set: {
                    status: 'pending',
                    claimedBy: null,
                    claimedAt: null,
                    lockExpireAt: null
                }
            }
        );
        if (releasedLocks.modifiedCount > 0) {
            console.log('[举报列表] 释放过期锁:', releasedLocks.modifiedCount);
        }

        // ========== 2. 构建查询条件 ==========
        const query = {
            status: { $in: ['pending', 'in_review'] }
        };

        // 状态筛选
        if (status) {
            query.status = status;
        }

        // 举报原因筛选
        if (reason) {
            query.reason = reason;
        }

        // 时间范围筛选
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // ========== 3. 关键词搜索（需先查评论ID） ==========
        let commentIdFilter = null;
        if (keyword && keyword.trim()) {
            // 搜索评论内容匹配的评论ID
            const matchedComments = await Comment.find(
                { content: { $regex: keyword.trim(), $options: 'i' } },
                '_id'
            ).lean();
            const commentIds = matchedComments.map(c => c._id);

            // 搜索用户名匹配的用户UUID
            const matchedUsers = await User.find(
                { username: { $regex: keyword.trim(), $options: 'i' } },
                'userUUID'
            ).lean();
            const userUUIDs = matchedUsers.map(u => u.userUUID);

            if (commentIds.length > 0 || userUUIDs.length > 0) {
                query.$or = [];
                if (commentIds.length > 0) {
                    query.$or.push({ commentId: { $in: commentIds } });
                }
                if (userUUIDs.length > 0) {
                    query.$or.push({ reporterUUID: { $in: userUUIDs } });
                }
            }
        }

        console.log('[举报列表] 查询条件:', JSON.stringify(query));

        // ========== 4. 分页查询 ==========
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 构建排序：高优优先 + 时间倒序
        let sortConfig = { createdAt: -1 };

        const reports = await CommentReport.find(query)
            .sort(sortConfig)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await CommentReport.countDocuments(query);

        // ========== 5. 关联查询评论信息 ==========
        const commentIds = [...new Set(reports.map(r => r.commentId.toString()))];
        const comments = await Comment.find(
            { _id: { $in: commentIds } },
            'content status reportSummary authorUUID jobId createdAt'
        ).lean();

        const commentMap = {};
        comments.forEach(c => {
            commentMap[c._id.toString()] = c;
        });

        // ========== 6. 查询举报者和被举报者信息 ==========
        const reporterUUIDs = [...new Set(reports.map(r => r.reporterUUID))];
        const authorUUIDs = [...new Set(Object.values(commentMap).map(c => c.authorUUID))];
        const allUUIDs = [...new Set([...reporterUUIDs, ...authorUUIDs])];

        const users = await User.find(
            { userUUID: { $in: allUUIDs } },
            'userUUID username avatar role'
        ).lean();

        const userMap = {};
        users.forEach(u => {
            userMap[u.userUUID] = {
                username: u.username,
                avatar: u.avatar,
                role: u.role
            };
        });

        // ========== 7. 查询岗位信息 ==========
        const jobIds = [...new Set(Object.values(commentMap).map(c => c.jobId).filter(Boolean))];
        const jobs = await Job.find(
            { _id: { $in: jobIds } },
            'title'
        ).lean();

        const jobMap = {};
        jobs.forEach(j => {
            jobMap[j._id.toString()] = j;
        });

        // ========== 8. 组装返回数据 ==========
        const enrichedReports = reports.map(report => {
            const comment = commentMap[report.commentId?.toString()] || {};
            // 高优标记：uniqueReporters >= 3 或 autoProcessed === true
            const isPriority = (comment.reportSummary?.uniqueReporters || 0) >= 3
                || report.autoProcessed === true;

            // 按优先级排序时，高优置顶
            return {
                ...report,
                comment: {
                    _id: comment._id,
                    content: comment.content ? comment.content.slice(0, 60) : '已删除',
                    status: comment.status,
                    reportSummary: comment.reportSummary,
                    authorUUID: comment.authorUUID,
                    jobId: comment.jobId
                },
                reporter: userMap[report.reporterUUID] || { username: '未知用户' },
                commentAuthor: userMap[comment.authorUUID] || { username: '未知用户' },
                job: comment.jobId ? (jobMap[comment.jobId.toString()] || { title: '未知岗位' }) : { title: '未知岗位' },
                isPriority
            };
        });

        // 如果启用高优筛选，过滤只显示高优
        let finalReports = enrichedReports;
        if (priority === 'true') {
            finalReports = enrichedReports.filter(r => r.isPriority);
        }

        // 最终按高优降序 + 时间降序
        finalReports.sort((a, b) => {
            if (a.isPriority !== b.isPriority) return b.isPriority ? 1 : -1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        console.log('[举报列表] 查询结果:', { total, returned: finalReports.length });
        console.log('[举报列表] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: finalReports,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[举报列表] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};


/**
 * 获取单个举报工单详情
 * 包含评论完整信息、作者信息、父评论链、举报者列表、历史违规次数等
 *
 * @route GET /api/admin/reports/:reportId
 * @access 已登录管理员
 */
exports.getReportDetail = async (req, res) => {
    try {
        const { reportId } = req.params;

        console.log('[举报详情] ========== 开始查询 ==========');
        console.log('[举报详情] reportId:', reportId);

        // ========== 1. 查询举报工单 ==========
        const report = await CommentReport.findById(reportId).lean();
        if (!report) {
            return res.status(404).json({
                success: false,
                message: '举报工单不存在'
            });
        }

        // ========== 2. 查询被举报评论完整信息 ==========
        const comment = await Comment.findById(report.commentId).lean();
        if (!comment) {
            return res.status(404).json({
                success: false,
                message: '关联评论不存在（可能已被删除）'
            });
        }

        console.log('[举报详情] 评论状态:', comment.status);

        // ========== 3. 查询评论作者信息及历史违规次数 ==========
        const [commentAuthor, violationRecord] = await Promise.all([
            User.findOne({ userUUID: comment.authorUUID }, 'username avatar role createdAt').lean(),
            UserViolationRecord.findOne({ userUUID: comment.authorUUID }).lean().catch(() => null)
        ]);

        // ========== 4. 查询父评论链（如果该评论是回复，递归查询 parentId 链，最多3层） ==========
        let parentChain = [];
        let currentParentId = comment.parentId;
        let depth = 0;
        while (currentParentId && depth < 3) {
            const parentComment = await Comment.findById(currentParentId)
                .select('content authorUUID createdAt')
                .lean();
            if (parentComment) {
                const parentAuthor = await User.findOne(
                    { userUUID: parentComment.authorUUID },
                    'username avatar'
                ).lean();
                parentChain.push({
                    ...parentComment,
                    author: parentAuthor || { username: '未知用户' }
                });
                currentParentId = parentComment.parentId;
            } else {
                break;
            }
            depth++;
        }

        // ========== 5. 查询该评论的所有举报记录及举报者信息 ==========
        const allReports = await CommentReport.find({ commentId: comment._id })
            .sort({ createdAt: -1 })
            .lean();

        const reporterUUIDs = [...new Set(allReports.map(r => r.reporterUUID))];
        const reporters = await User.find(
            { userUUID: { $in: reporterUUIDs } },
            'userUUID username avatar role'
        ).lean();

        const reporterMap = {};
        reporters.forEach(u => { reporterMap[u.userUUID] = u; });

        // ========== 6. 查询每个举报者的历史举报成功率 ==========
        const reporterStats = {};
        for (const reporterUUID of reporterUUIDs) {
            const totalReports = await CommentReport.countDocuments({ reporterUUID });
            const validReports = await CommentReport.countDocuments({
                reporterUUID,
                status: { $in: ['processed', 'appeal_upheld'] }
            });
            reporterStats[reporterUUID] = {
                totalReports,
                validReports,
                successRate: totalReports > 0 ? Math.round(validReports / totalReports * 100) : 0
            };
        }

        // ========== 7. 查询关联的处罚记录 ==========
        const penalties = await UserPenalty.find({
            $or: [
                { relatedCommentId: comment._id },
                { relatedReportId: report._id }
            ]
        }).sort({ createdAt: -1 }).lean();

        // ========== 8. 查询所属岗位信息 ==========
        const job = await Job.findById(comment.jobId, 'title').lean();

        // ========== 9. 组装返回数据 ==========
        const enrichedReporters = allReports.map(r => ({
            ...r,
            reporterInfo: reporterMap[r.reporterUUID] || { username: '未知用户' },
            reportStats: reporterStats[r.reporterUUID] || { totalReports: 0, validReports: 0, successRate: 0 }
        }));

        const result = {
            report,
            comment: {
                ...comment,
                reportSummary: comment.reportSummary
            },
            commentAuthor: commentAuthor ? {
                ...commentAuthor,
                violationCount: violationRecord?.violationCount || 0
            } : null,
            parentChain,
            reporters: enrichedReporters,
            penalties,
            job: job || { title: '未知岗位' }
        };

        console.log('[举报详情] 查询完成');
        console.log('[举报详情] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('[举报详情] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};
/**
 * 处理举报工单（审核操作）
 * 支持通过（处罚）和驳回（举报不实）两种操作
 * 根据违规等级自动创建处罚记录并更新用户违规档案
 *
 * @route POST /api/admin/reports/:reportId/process
 * @access 已登录管理员
 */
exports.processReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        // 接收参数：status（processed/dismissed）、violationLevel、reviewNotes、penaltyType、penaltyDuration
        const { status, violationLevel, reviewNotes, penaltyType, penaltyDuration } = req.body;
        const adminInfo = req.admin;

        console.log('[处理举报] ========== 开始处理 ==========');
        console.log('[处理举报] 参数:', { reportId, status, violationLevel, penaltyType, penaltyDuration });

        // ========== 1. 参数校验 ==========
        if (!['processed', 'dismissed'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '处理结果必须为 processed 或 dismissed'
            });
        }

        if (status === 'processed' && !violationLevel) {
            return res.status(400).json({
                success: false,
                message: '处理违规时需指定违规等级（minor/moderate/severe）'
            });
        }

        // ========== 2. 查询工单 ==========
        const report = await CommentReport.findById(reportId);
        if (!report) {
            return res.status(404).json({
                success: false,
                message: '举报工单不存在'
            });
        }

        // 校验工单状态：仅 pending 或 in_review 状态可处理
        if (!['pending', 'in_review'].includes(report.status)) {
            return res.status(400).json({
                success: false,
                message: `工单状态为"${report.status}"，无法处理`
            });
        }

        // ========== 3. 更新 CommentReport ==========
        report.status = status;
        report.reviewedAt = new Date();
        report.reviewerUUID = adminInfo.adminUUID;
        report.reviewNotes = reviewNotes || '';
        report.violationLevel = status === 'processed' ? violationLevel : 'none';

        if (status === 'processed') {
            report.processingResult = `违规属实，等级：${violationLevel}`;
        } else {
            report.processingResult = '举报不实，已驳回';
        }

        await report.save();

        console.log('[处理举报] 工单已更新:', report.status);

        // ========== 4. 查询关联评论 ==========
        const comment = await Comment.findById(report.commentId);
        if (!comment) {
            return res.status(404).json({
                success: false,
                message: '关联评论不存在'
            });
        }

        // ========== 5. 根据处理结果执行不同操作 ==========
        if (status === 'processed') {
            // ========== 违规属实：处罚评论和用户 ==========

            // 5.1 更新评论状态（minor→hidden, moderate/severe→deleted）
            if (violationLevel === 'minor') {
                comment.status = 'hidden';
            } else {
                comment.status = 'deleted';
            }
            comment.violationLevel = violationLevel;
            comment.reviewedBy = adminInfo.adminUUID;
            comment.reviewedAt = new Date();
            await comment.save();

            console.log('[处理举报] 评论状态已更新:', comment.status);

            // 5.2 创建处罚记录
            const penaltyData = {
                userUUID: comment.authorUUID,
                type: penaltyType || 'warning',
                level: violationLevel,
                reason: reviewNotes || `评论违规（${violationLevel}级别）`,
                duration: penaltyDuration || 0,
                relatedCommentId: comment._id,
                relatedReportId: report._id,
                reviewedBy: adminInfo.adminUUID
            };

            // 根据处罚类型和等级设置持续时间
            if (penaltyType === 'comment_ban') {
                // 禁言：moderate默认7天，severe默认30天
                penaltyData.duration = penaltyDuration || (violationLevel === 'severe' ? 30 : 7);
            } else if (penaltyType === 'account_ban') {
                // 封禁：severe默认永封（-1）
                penaltyData.duration = penaltyDuration || (violationLevel === 'severe' ? -1 : 30);
            }

            if (penaltyData.duration !== 0) {
                penaltyData.startAt = new Date();
                if (penaltyData.duration === -1) {
                    penaltyData.endAt = null; // 永久处罚
                } else {
                    penaltyData.endAt = new Date(Date.now() + penaltyData.duration * 24 * 60 * 60 * 1000);
                }
            }

            const penalty = await UserPenalty.create(penaltyData);
            console.log('[处理举报] 处罚记录已创建:', penalty._id);

            // 5.3 更新/创建用户违规记录
            const violationRecord = await UserViolationRecord.getOrCreate(comment.authorUUID);

            // 扣分规则：minor(-5), moderate(-15), severe(-30)
            const scoreMap = { minor: -5, moderate: -15, severe: -30 };
            const scoreDeduct = scoreMap[violationLevel] || -5;
            violationRecord.totalScore += scoreDeduct;
            violationRecord.violationCount += 1;
            violationRecord.lastViolationAt = new Date();

            // 限制规则：moderate禁言7天，severe禁言30天/永封
            if (violationLevel === 'moderate' && !violationRecord.commentBanUntil) {
                violationRecord.commentBanUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            } else if (violationLevel === 'severe') {
                if (penaltyType === 'account_ban') {
                    violationRecord.accountBanUntil = penaltyData.endAt;
                    violationRecord.accountStatus = penaltyData.duration === -1 ? 'banned' : 'normal';
                } else {
                    violationRecord.commentBanUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                }
            }

            await violationRecord.save();
            console.log('[处理举报] 违规记录已更新:', {
                totalScore: violationRecord.totalScore,
                violationCount: violationRecord.violationCount
            });

            // ========== 发送处罚通知给被处罚用户 ==========
            try {
                const Conversation = require('../models/Conversation');
                const Message = require('../models/Message');
                const io = req.app.get('io');

                // 构建通知内容
                const penaltyInfo = penalty.type === 'warning'
                    ? '收到一次警告'
                    : penalty.type === 'comment_ban'
                        ? `已被禁言${penalty.duration}天`
                        : penalty.type === 'account_ban'
                            ? (penalty.duration === -1 ? '账号已被永久封禁' : `账号已被封禁${penalty.duration}天`)
                            : '受到处罚';

                const notificationContent = JSON.stringify({
                    type: 'penalty_notification',
                    commentId: comment._id.toString(),
                    content: comment.content.slice(0, 80),
                    violationLevel: violationLevel,
                    penaltyType: penalty.type,
                    penaltyDuration: penalty.duration,
                    penaltyReason: reviewNotes || '评论违规',
                    penaltyInfo: penaltyInfo,
                    notifiedAt: new Date().toISOString()
                });

                // 使用系统通知虚拟用户 UUID（固定值，前端显示为「系统通知」）
                const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

                const conversation = await Conversation.findOrCreate(
                    SYSTEM_USER_UUID,
                    comment.authorUUID
                );

                const message = await Message.create({
                    conversationId: conversation._id,
                    senderUUID: SYSTEM_USER_UUID,
                    receiverUUID: comment.authorUUID,
                    content: notificationContent,
                    type: 'text',
                    metadata: {
                        action: 'penalty_notification',
                        commentId: comment._id,
                        violationLevel: violationLevel
                    }
                });


                // 更新会话
                conversation.lastMessage = {
                    content: `【系统通知】您的评论因违规被处理：${penaltyInfo}`,
                    senderUUID: SYSTEM_USER_UUID,
                    sentAt: new Date()
                };
                const unreadMap = conversation.unreadCount instanceof Map
                    ? conversation.unreadCount
                    : new Map(Object.entries(conversation.unreadCount || {}));
                // 只有接收者的未读计数需要 +1
                const currentCount = unreadMap.get(comment.authorUUID) || 0;
                unreadMap.set(comment.authorUUID, currentCount + 1);

                conversation.unreadCount = unreadMap;
                conversation.updatedAt = new Date();
                await conversation.save();

                // WebSocket 推送给被处罚用户
                if (io) {
                    io.to(comment.authorUUID).emit('new_message', {
                        message: message.toObject(),
                        conversationId: conversation._id.toString()
                    });
                    console.log('[处理举报] 处罚通知已推送至:', comment.authorUUID);
                }

                console.log('[处理举报] 处罚通知已创建:', message._id);

                if (redis.isConnected()) {
                    await redis.pDel(`chat:conversations:${comment.authorUUID}`);
                    console.log('[缓存] 处罚通知：已清除接收者会话缓存');
                }

            } catch (notifyError) {
                console.error('[处理举报] 处罚通知发送失败（不阻塞主流程）:', notifyError);
            }

        } else {
            // ========== 驳回举报（dismissed）：恢复评论 ==========

            // 5.4 如果评论之前被自动隐藏，恢复为正常状态
            if (comment.status === 'auto_hidden') {
                comment.status = 'normal';
                comment.violationLevel = 'none';
                comment.reviewedBy = '';
                comment.reviewedAt = null;
                await comment.save();
                console.log('[处理举报] 自动隐藏评论已恢复');
            }

            // 5.5 更新举报者的恶意举报计数
            const reporterViolationRecord = await UserViolationRecord.getOrCreate(report.reporterUUID);
            reporterViolationRecord.falseReportCount += 1;

            // 检查恶意举报阈值
            const falseCount = reporterViolationRecord.falseReportCount;
            if (falseCount >= 20) {
                // 累计≥20次恶意举报：限制举报30天
                reporterViolationRecord.reportBanUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                reporterViolationRecord.reportBanReason = `累计${falseCount}次恶意举报，限制举报30天`;
                reporterViolationRecord.reportWeight = 0;
            } else if (falseCount >= 10) {
                // 累计≥10次：忽略举报（权重降为0）
                reporterViolationRecord.reportWeight = 0;
            } else if (falseCount >= 5) {
                // 累计≥5次：降权
                reporterViolationRecord.reportWeight = 0.5;
            }

            await reporterViolationRecord.save();
            console.log('[处理举报] 举报者恶意计数更新:', { falseCount });
        }

        // ========== 6. 记录操作日志 ==========
        await logAdminOperation(
            adminInfo,
            'verify_comment_report',
            'comment_report',
            report._id,
            `${status === 'processed' ? '通过' : '驳回'}评论举报审核`,
            req.ip
        );

        console.log('[处理举报] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: status === 'processed' ? '举报已处理，违规评论已处罚' : '举报已驳回',
            data: { status, violationLevel }
        });

    } catch (error) {
        console.error('[处理举报] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 批量处理举报工单
 * 逐个处理，独立 try-catch（一个失败不影响其他）
 * 上限50条
 *
 * @route POST /api/admin/reports/batch-process
 * @access 已登录管理员
 */
exports.batchProcessReports = async (req, res) => {
    try {
        const { reportIds, action, reviewNotes, violationLevel } = req.body;
        const adminInfo = req.admin;

        console.log('[批量处理] ========== 开始处理 ==========');
        console.log('[批量处理] 参数:', { count: reportIds?.length, action, violationLevel });

        // ========== 1. 参数校验 ==========
        if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '请选择要处理的工单'
            });
        }

        if (reportIds.length > 50) {
            return res.status(400).json({
                success: false,
                message: '单次批量操作最多50条'
            });
        }

        if (!['dismiss', 'hide', 'delete'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: '操作类型必须为 dismiss/hide/delete'
            });
        }

        // ========== 2. 逐个处理 ==========
        let succeeded = 0;
        let failed = 0;
        const failedIds = [];
        const errors = [];

        for (const reportId of reportIds) {
            try {
                // 构建处理参数
                let processStatus, processViolationLevel, processPenaltyType;

                if (action === 'dismiss') {
                    processStatus = 'dismissed';
                    processViolationLevel = 'none';
                    processPenaltyType = 'warning';
                } else if (action === 'hide') {
                    processStatus = 'processed';
                    processViolationLevel = violationLevel || 'minor';
                    processPenaltyType = 'warning';
                } else if (action === 'delete') {
                    processStatus = 'processed';
                    processViolationLevel = violationLevel || 'moderate';
                    processPenaltyType = 'comment_ban';
                }

                // 直接调用单个处理逻辑（复用 processReport 的核心逻辑）
                const report = await CommentReport.findById(reportId);
                if (!report) {
                    failed++;
                    failedIds.push(reportId);
                    errors.push(`工单${reportId}不存在`);
                    continue;
                }

                if (!['pending', 'in_review'].includes(report.status)) {
                    failed++;
                    failedIds.push(reportId);
                    errors.push(`工单${reportId}状态为${report.status}，无法处理`);
                    continue;
                }

                // 更新工单
                report.status = processStatus;
                report.reviewedAt = new Date();
                report.reviewerUUID = adminInfo.adminUUID;
                report.reviewNotes = reviewNotes || '';
                report.violationLevel = processViolationLevel;
                report.processingResult = `批量${action === 'dismiss' ? '驳回' : action === 'hide' ? '隐藏' : '删除'}操作`;
                await report.save();

                // 根据操作类型更新评论状态
                const comment = await Comment.findById(report.commentId);
                if (comment) {
                    if (action === 'dismiss') {
                        if (comment.status === 'auto_hidden') {
                            comment.status = 'normal';
                            comment.violationLevel = 'none';
                            await comment.save();
                        }
                    } else if (action === 'hide') {
                        comment.status = 'hidden';
                        comment.violationLevel = processViolationLevel;
                        comment.reviewedBy = adminInfo.adminUUID;
                        comment.reviewedAt = new Date();
                        await comment.save();
                    } else if (action === 'delete') {
                        comment.status = 'deleted';
                        comment.violationLevel = processViolationLevel;
                        comment.reviewedBy = adminInfo.adminUUID;
                        comment.reviewedAt = new Date();
                        await comment.save();
                    }
                }

                // 记录操作日志
                await logAdminOperation(
                    adminInfo,
                    'batch_process_report',
                    'comment_report',
                    report._id,
                    `批量${action}操作`,
                    req.ip
                );

                succeeded++;

            } catch (innerError) {
                console.error(`[批量处理] 处理${reportId}失败:`, innerError);
                failed++;
                failedIds.push(reportId);
                errors.push(`工单${reportId}: ${innerError.message}`);
            }
        }

        console.log('[批量处理] 结果:', { total: reportIds.length, succeeded, failed });
        console.log('[批量处理] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: `批量处理完成：成功${succeeded}，失败${failed}`,
            data: {
                total: reportIds.length,
                succeeded,
                failed,
                failedIds,
                errors
            }
        });

    } catch (error) {
        console.error('[批量处理] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 认领举报工单
 * 将工单标记为"审核中"，设定30分钟锁定时间
 * 已被他人认领且未过期的工单不可重复认领
 *
 * @route POST /api/admin/reports/:reportId/claim
 * @access 已登录管理员
 */
exports.claimReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const adminInfo = req.admin;

        console.log('[认领工单] ========== 开始认领 ==========');
        console.log('[认领工单] 参数:', { reportId, adminUUID: adminInfo.adminUUID });

        // ========== 1. 查询工单 ==========
        const report = await CommentReport.findById(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: '工单不存在' });
        }

        if (report.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `工单状态为"${report.status}"，无法认领`
            });
        }

        // ========== 2. 检查是否已被他人认领 ==========
        if (report.claimedBy && report.lockExpireAt && new Date(report.lockExpireAt) > new Date()) {
            return res.status(400).json({
                success: false,
                message: '该工单已被其他管理员认领，请等待释放或联系超级管理员转移'
            });
        }

        // ========== 3. 执行认领 ==========
        report.claimedBy = adminInfo.adminUUID;
        report.claimedAt = new Date();
        report.lockExpireAt = new Date(Date.now() + 30 * 60 * 1000); // 30分钟
        report.status = 'in_review';
        await report.save();

        console.log('[认领工单] 认领成功:', {
            reportId,
            claimedBy: adminInfo.adminUUID,
            lockExpireAt: report.lockExpireAt
        });
        console.log('[认领工单] ========== 认领完成 ==========');

        res.json({
            success: true,
            message: '工单已认领，请在30分钟内完成审核',
            data: { claimedBy: report.claimedBy, lockExpireAt: report.lockExpireAt }
        });

    } catch (error) {
        console.error('[认领工单] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};


/**
 * 释放举报工单认领
 * 仅认领者本人或超级管理员可释放
 *
 * @route POST /api/admin/reports/:reportId/release
 * @access 已登录管理员
 */
exports.releaseReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const adminInfo = req.admin;

        console.log('[释放工单] ========== 开始释放 ==========');
        console.log('[释放工单] 参数:', { reportId, adminUUID: adminInfo.adminUUID });

        // ========== 1. 查询工单 ==========
        const report = await CommentReport.findById(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: '工单不存在' });
        }

        if (report.status !== 'in_review') {
            return res.status(400).json({
                success: false,
                message: `工单状态为"${report.status}"，无需释放`
            });
        }

        // ========== 2. 权限校验：认领者本人或超级管理员 ==========
        if (report.claimedBy !== adminInfo.adminUUID && adminInfo.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: '仅认领者本人或超级管理员可释放工单'
            });
        }

        // ========== 3. 释放认领 ==========
        report.status = 'pending';
        report.claimedBy = null;
        report.claimedAt = null;
        report.lockExpireAt = null;
        await report.save();

        console.log('[释放工单] 释放成功');
        console.log('[释放工单] ========== 释放完成 ==========');

        res.json({
            success: true,
            message: '工单已释放，其他管理员可认领',
            data: { status: report.status }
        });

    } catch (error) {
        console.error('[释放工单] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};

/**
 * 转移举报工单给其他管理员
 * 仅超级管理员可操作
 *
 * @route POST /api/admin/reports/:reportId/transfer
 * @access 仅 super_admin
 */
exports.transferReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { targetAdminUUID } = req.body;
        const adminInfo = req.admin;

        console.log('[转移工单] ========== 开始转移 ==========');
        console.log('[转移工单] 参数:', { reportId, targetAdminUUID });

        // ========== 1. 权限校验 ==========
        if (adminInfo.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: '仅超级管理员可转移工单'
            });
        }

        // ========== 2. 查询工单 ==========
        const report = await CommentReport.findById(reportId);
        if (!report) {
            return res.status(404).json({ success: false, message: '工单不存在' });
        }

        // ========== 3. 执行转移 ==========
        report.claimedBy = targetAdminUUID;
        report.claimedAt = new Date();
        report.lockExpireAt = new Date(Date.now() + 30 * 60 * 1000);
        report.status = 'in_review';
        await report.save();

        console.log('[转移工单] 转移成功:', { targetAdminUUID });
        console.log('[转移工单] ========== 转移完成 ==========');

        res.json({
            success: true,
            message: '工单已转移',
            data: { claimedBy: targetAdminUUID }
        });

    } catch (error) {
        console.error('[转移工单] 失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误：' + error.message });
    }
};

/**
 * 获取申诉列表
 * 查询 CommentReport 中 status === 'appealing' 的记录
 *
 * @route GET /api/admin/appeals
 * @access 已登录管理员
 */
exports.getAppeals = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        console.log('[申诉列表] ========== 开始查询 ==========');

        // ========== 1. 查询申诉中的工单 ==========
        const query = { status: 'appealing' };
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reports = await CommentReport.find(query)
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await CommentReport.countDocuments(query);

        // ========== 2. 关联查询评论信息 ==========
        const commentIds = [...new Set(reports.map(r => r.commentId.toString()))];
        const comments = await Comment.find(
            { _id: { $in: commentIds } },
            'content status violationLevel appealReason appealSubmittedAt appealStatus reviewedAt'
        ).lean();

        const commentMap = {};
        comments.forEach(c => { commentMap[c._id.toString()] = c; });

        // ========== 3. 组装返回数据 ==========
        const enrichedAppeals = reports.map(report => {
            const comment = commentMap[report.commentId?.toString()] || {};
            return {
                ...report,
                comment: {
                    content: comment.content ? comment.content.slice(0, 80) : '已删除',
                    status: comment.status,
                    violationLevel: comment.violationLevel,
                    appealReason: comment.appealReason,
                    appealSubmittedAt: comment.appealSubmittedAt,
                    appealStatus: comment.appealStatus,
                    reviewedAt: comment.reviewedAt
                }
            };
        });

        console.log('[申诉列表] 结果:', { total, returned: enrichedAppeals.length });
        console.log('[申诉列表] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: enrichedAppeals,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('[申诉列表] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 处理申诉
 * upheld → 维持原判，overturned → 撤销违规
 *
 * @route POST /api/admin/appeals/:reportId/process
 * @access 已登录管理员
 */
exports.processAppeal = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { action, reviewNotes } = req.body;
        const adminInfo = req.admin;

        console.log('[处理申诉] ========== 开始处理 ==========');
        console.log('[处理申诉] 参数:', { reportId, action });

        // ========== 1. 参数校验 ==========
        if (!['upheld', 'overturned'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: '操作类型必须为 upheld 或 overturned'
            });
        }

        // ========== 2. 查询工单 ==========
        const report = await CommentReport.findById(reportId);
        if (!report || report.status !== 'appealing') {
            return res.status(400).json({
                success: false,
                message: '工单不存在或不在申诉中'
            });
        }

        // ========== 3. 查询关联评论 ==========
        const comment = await Comment.findById(report.commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: '关联评论不存在' });
        }

        if (action === 'upheld') {
            // ========== 维持原判 ==========
            report.status = 'appeal_upheld';
            comment.appealStatus = 'upheld';
            // 评论保持原状态不变

            console.log('[处理申诉] 维持原判');
        } else {
            // ========== 撤销违规 ==========
            report.status = 'appeal_overturned';
            comment.appealStatus = 'overturned';
            comment.status = 'normal';
            comment.violationLevel = 'none';
            comment.reviewedBy = '';
            comment.reviewedAt = null;

            // 撤销关联的处罚记录

            await UserPenalty.updateMany(
                { relatedReportId: report._id, status: 'active' },
                {
                    $set: {
                        status: 'revoked',
                        revokedBy: adminInfo.adminUUID,
                        revokedAt: new Date(),
                        revokeReason: '申诉撤销违规'
                    }
                }
            );

            // 恢复扣分（从违规记录中加回）

            const violationRecord = await UserViolationRecord.findOne({ userUUID: comment.authorUUID });
            if (violationRecord) {
                const scoreMap = { minor: 5, moderate: 15, severe: 30 };
                const penaltyScore = scoreMap[comment.violationLevel] || 5;
                violationRecord.totalScore = Math.max(0, violationRecord.totalScore + penaltyScore);
                violationRecord.violationCount = Math.max(0, violationRecord.violationCount - 1);
                await violationRecord.save();
            }

            console.log('[处理申诉] 撤销违规，评论已恢复');
        }

        report.reviewNotes = reviewNotes || '';
        report.reviewedAt = new Date();
        report.reviewerUUID = adminInfo.adminUUID;
        await report.save();
        await comment.save();

        // ========== 4.发送申诉结果通知给用户 ==========
        try {
            const Conversation = require('../models/Conversation');
            const Message = require('../models/Message');
            const io = req.app.get('io');
            const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

            const resultLabel = action === 'upheld'
                ? '申诉被驳回'
                : '申诉成功，违规已撤销';

            const notificationContent = JSON.stringify({
                type: 'appeal_result',
                result: action,
                resultLabel: resultLabel,
                commentId: comment._id.toString(),
                content: comment.content.slice(0, 80),
                reviewNotes: reviewNotes || '',
                notifiedAt: new Date().toISOString()
            });

            const conversation = await Conversation.findOrCreate(
                SYSTEM_USER_UUID,
                comment.authorUUID
            );

            const message = await Message.create({
                conversationId: conversation._id,
                senderUUID: SYSTEM_USER_UUID,
                receiverUUID: comment.authorUUID,
                content: notificationContent,
                type: 'text',
                metadata: {
                    action: 'appeal_result',
                    commentId: comment._id
                }
            });

            conversation.lastMessage = {
                content: `【系统通知】申诉${resultLabel}`,
                senderUUID: SYSTEM_USER_UUID,
                sentAt: new Date()
            };
            const unreadMap = conversation.unreadCount instanceof Map
                ? conversation.unreadCount
                : new Map(Object.entries(conversation.unreadCount || {}));
            const currentCount = unreadMap.get(comment.authorUUID) || 0;
            unreadMap.set(comment.authorUUID, currentCount + 1);
            conversation.unreadCount = unreadMap;
            conversation.updatedAt = new Date();
            await conversation.save();

            if (io) {
                io.to(comment.authorUUID).emit('new_message', {
                    message: message.toObject(),
                    conversationId: conversation._id.toString()
                });
                console.log('[处理申诉] 结果通知已推送至:', comment.authorUUID);
            }

            console.log('[处理申诉] 结果通知已创建:', message._id);

            if (redis.isConnected()) {
                await redis.pDel(`chat:conversations:${comment.authorUUID}`);
                console.log('[缓存] 申诉结果通知：已清除接收者会话缓存');
            }

        } catch (notifyError) {
            console.error('[处理申诉] 结果通知发送失败（不阻塞主流程）:', notifyError.message);
        }

        // ========== 5. 记录操作日志 ==========
        await logAdminOperation(
            adminInfo,
            'process_appeal',
            'comment_report',
            report._id,
            `${action === 'upheld' ? '维持原判' : '撤销违规'}`,
            req.ip
        );

        console.log('[处理申诉] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: action === 'upheld' ? '已维持原判' : '已撤销违规',
            data: { action }
        });

    } catch (error) {
        console.error('[处理申诉] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取审核统计数据
 * 包含今日新增、待审核数、驳回率、违规分布、每日趋势、高频用户、审核员工作量
 *
 * @route GET /api/admin/audit-stats
 * @access 已登录管理员
 */
exports.getAuditStats = async (req, res) => {
    try {
        console.log('[审核统计] ========== 开始查询 ==========');

        // ========== 1. 今日新增举报数 ==========
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const dailyReports = await CommentReport.countDocuments({
            createdAt: { $gte: todayStart }
        });

        // ========== 2. 待审核总数 ==========
        const pendingReports = await CommentReport.countDocuments({
            status: { $in: ['pending', 'in_review'] }
        });

        // ========== 3. 今日处理数 ==========
        const processedToday = await CommentReport.countDocuments({
            status: { $in: ['processed', 'dismissed'] },
            reviewedAt: { $gte: todayStart }
        });

        // ========== 4. 今日驳回数 ==========
        const dismissedToday = await CommentReport.countDocuments({
            status: 'dismissed',
            reviewedAt: { $gte: todayStart }
        });

        // ========== 5. 近30天驳回率 ==========
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentTotal = await CommentReport.countDocuments({
            status: { $in: ['processed', 'dismissed'] },
            reviewedAt: { $gte: thirtyDaysAgo }
        });
        const recentDismissed = await CommentReport.countDocuments({
            status: 'dismissed',
            reviewedAt: { $gte: thirtyDaysAgo }
        });
        const dismissedRate = recentTotal > 0 ? Math.round(recentDismissed / recentTotal * 100) : 0;

        // ========== 6. 违规原因分布（饼图数据） ==========
        const violationDistribution = await CommentReport.aggregate([
            { $match: { status: { $in: ['pending', 'in_review', 'processed'] } } },
            { $group: { _id: '$reason', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // ========== 7. 近30天每日举报量（折线图数据） ==========
        const dailyTrend = await CommentReport.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // ========== 8. 被举报最多用户TOP10 ==========
        // 通过聚合 Comment 表获取被举报最多的评论作者
        const topReportedComments = await CommentReport.aggregate([
            { $group: { _id: '$commentId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);

        // 关联查询评论作者
        const topCommentIds = topReportedComments.map(c => c._id);
        const topComments = await Comment.find(
            { _id: { $in: topCommentIds } },
            'authorUUID'
        ).lean();

        // 统计每个作者的被举报次数
        const authorReportCount = {};
        topReportedComments.forEach(rc => {
            const comment = topComments.find(c => c._id.toString() === rc._id.toString());
            if (comment) {
                const authorUUID = comment.authorUUID;
                authorReportCount[authorUUID] = (authorReportCount[authorUUID] || 0) + rc.count;
            }
        });

        // 查询用户信息
        const topAuthorUUIDs = Object.keys(authorReportCount);
        const topUsers = await User.find(
            { userUUID: { $in: topAuthorUUIDs } },
            'userUUID username avatar'
        ).lean();

        // 查询违规次数
        const violationRecords = await UserViolationRecord.find({
            userUUID: { $in: topAuthorUUIDs }
        }).lean();
        const violationMap = {};
        violationRecords.forEach(v => { violationMap[v.userUUID] = v.violationCount || 0; });

        const topReportedUsers = topUsers
            .map(u => ({
                userUUID: u.userUUID,
                username: u.username,
                avatar: u.avatar,
                reportedCount: authorReportCount[u.userUUID] || 0,
                violationCount: violationMap[u.userUUID] || 0
            }))
            .sort((a, b) => b.reportedCount - a.reportedCount)
            .slice(0, 10);

        // ========== 9. 各管理员处理工单数 ==========
        const adminWorkload = await CommentReport.aggregate([
            { $match: { reviewerUUID: { $exists: true, $ne: '' } } },
            { $group: { _id: '$reviewerUUID', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // 查询管理员用户名
        const adminUUIDs = adminWorkload.map(a => a._id);
        const admins = await Admin.find(
            { adminUUID: { $in: adminUUIDs } },
            'adminUUID username'
        ).lean();
        const adminMap = {};
        admins.forEach(a => { adminMap[a.adminUUID] = a.username; });

        const adminWorkloadData = adminWorkload.map(a => ({
            adminUUID: a._id,
            username: adminMap[a._id] || '未知管理员',
            count: a.count
        }));

        console.log('[审核统计] 查询完成:', {
            dailyReports,
            pendingReports,
            processedToday,
            dismissedRate
        });
        console.log('[审核统计] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: {
                dailyReports,
                pendingReports,
                processedToday,
                dismissedToday,
                dismissedRate,
                violationDistribution,
                dailyTrend,
                topReportedUsers,
                adminWorkload: adminWorkloadData
            }
        });

    } catch (error) {
        console.error('[审核统计] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取管理员端举报原因列表
 * @route GET /api/admin/report-reasons
 * @access 已登录管理员
 */
exports.getAdminReportReasons = async (req, res) => {
    try {
        console.log('[举报原因配置] 获取列表');
        const ReportReasonConfig = require('../models/ReportReasonConfig');
        const reasons = await ReportReasonConfig.find().sort({ sortOrder: 1 }).lean();

        res.json({
            success: true,
            data: reasons
        });
    } catch (error) {
        console.error('[举报原因配置] 获取失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 创建举报原因
 * @route POST /api/admin/report-reasons
 * @access 已登录管理员
 */
exports.createReportReason = async (req, res) => {
    try {
        const { reasonKey, label, description, weight, autoThreshold, isActive, sortOrder } = req.body;
        const adminInfo = req.admin;

        console.log('[举报原因配置] 创建:', reasonKey);

        const ReportReasonConfig = require('../models/ReportReasonConfig');

        // 检查是否已存在
        const existing = await ReportReasonConfig.findOne({ reasonKey });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `原因标识"${reasonKey}"已存在`
            });
        }

        const reason = await ReportReasonConfig.create({
            reasonKey,
            label,
            description: description || '',
            weight: weight || 5,
            autoThreshold: autoThreshold || 5,
            isActive: isActive !== false,
            sortOrder: sortOrder || 0,
            createdBy: adminInfo.adminUUID
        });

        console.log('[举报原因配置] 创建成功:', reason._id);

        res.status(201).json({
            success: true,
            message: '举报原因创建成功',
            data: reason
        });
    } catch (error) {
        console.error('[举报原因配置] 创建失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新举报原因
 * @route PUT /api/admin/report-reasons/:reasonKey
 * @access 已登录管理员
 */
exports.updateReportReason = async (req, res) => {
    try {
        const { reasonKey } = req.params;
        const updateData = req.body;

        console.log('[举报原因配置] 更新:', reasonKey);

        const ReportReasonConfig = require('../models/ReportReasonConfig');
        const reason = await ReportReasonConfig.findOneAndUpdate(
            { reasonKey },
            { $set: updateData },
            { new: true }
        );

        if (!reason) {
            return res.status(404).json({
                success: false,
                message: '举报原因不存在'
            });
        }

        console.log('[举报原因配置] 更新成功');

        res.json({
            success: true,
            message: '举报原因已更新',
            data: reason
        });
    } catch (error) {
        console.error('[举报原因配置] 更新失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 删除举报原因
 * @route DELETE /api/admin/report-reasons/:reasonKey
 * @access 已登录管理员
 */
exports.deleteReportReason = async (req, res) => {
    try {
        const { reasonKey } = req.params;

        console.log('[举报原因配置] 删除:', reasonKey);

        const ReportReasonConfig = require('../models/ReportReasonConfig');

        // 检查是否有关联工单
        const reportCount = await CommentReport.countDocuments({ reason: reasonKey });
        if (reportCount > 0) {
            return res.status(400).json({
                success: false,
                message: `该原因下存在${reportCount}条举报工单，无法删除`
            });
        }

        const result = await ReportReasonConfig.findOneAndDelete({ reasonKey });
        if (!result) {
            return res.status(404).json({
                success: false,
                message: '举报原因不存在'
            });
        }

        console.log('[举报原因配置] 删除成功');

        res.json({
            success: true,
            message: '举报原因已删除'
        });
    } catch (error) {
        console.error('[举报原因配置] 删除失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 查看处罚详情
 * @route GET /api/admin/penalties/:penaltyId
 * @access 已登录管理员
 */
exports.getPenaltyDetail = async (req, res) => {
    try {
        const { penaltyId } = req.params;

        console.log('[处罚详情] 查询:', penaltyId);


        const penalty = await UserPenalty.findById(penaltyId)
            .populate('relatedCommentId', 'content status authorUUID')
            .populate('relatedReportId', 'reason status')
            .lean();

        if (!penalty) {
            return res.status(404).json({
                success: false,
                message: '处罚记录不存在'
            });
        }

        res.json({
            success: true,
            data: penalty
        });
    } catch (error) {
        console.error('[处罚详情] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 撤销处罚
 * 仅超级管理员可操作，更新 UserPenalty 和 UserViolationRecord
 *
 * @route POST /api/admin/penalties/:penaltyId/revoke
 * @access 仅 super_admin
 */
exports.revokePenalty = async (req, res) => {
    try {
        const { penaltyId } = req.params;
        const { revokeReason } = req.body;
        const adminInfo = req.admin;

        console.log('[撤销处罚] ========== 开始撤销 ==========');
        console.log('[撤销处罚] 参数:', { penaltyId, revokeReason });

        // ========== 1. 权限校验 ==========
        if (adminInfo.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: '仅超级管理员可撤销处罚'
            });
        }

        // ========== 2. 查询处罚记录 ==========
        const penalty = await UserPenalty.findById(penaltyId);
        if (!penalty) {
            return res.status(404).json({
                success: false,
                message: '处罚记录不存在'
            });
        }

        if (penalty.status === 'revoked') {
            return res.status(400).json({
                success: false,
                message: '处罚已被撤销，无需重复操作'
            });
        }

        // ========== 3. 撤销处罚 ==========
        penalty.status = 'revoked';
        penalty.revokedBy = adminInfo.adminUUID;
        penalty.revokedAt = new Date();
        penalty.revokeReason = revokeReason || '';
        await penalty.save();

        // ========== 4. 恢复用户违规记录 ==========
        const violationRecord = await UserViolationRecord.findOne({ userUUID: penalty.userUUID });
        if (violationRecord) {
            // 恢复扣分
            const scoreMap = { minor: 5, moderate: 15, severe: 30 };
            const penaltyScore = scoreMap[penalty.level] || 5;
            violationRecord.totalScore = Math.max(0, violationRecord.totalScore + penaltyScore);
            violationRecord.violationCount = Math.max(0, violationRecord.violationCount - 1);

            // 如果处罚类型是禁言或封禁，清除限制
            if (penalty.type === 'comment_ban') {
                violationRecord.commentBanUntil = null;
            }
            if (penalty.type === 'account_ban') {
                violationRecord.accountBanUntil = null;
                violationRecord.accountStatus = 'normal';
            }

            await violationRecord.save();
        }

        // ========== 5. 记录操作日志 ==========
        await logAdminOperation(
            adminInfo,
            'revoke_penalty',
            'user_penalty',
            penalty._id,
            `撤销处罚：${revokeReason || '无备注'}`,
            req.ip
        );

        console.log('[撤销处罚] 撤销成功');
        console.log('[撤销处罚] ========== 撤销完成 ==========');

        res.json({
            success: true,
            message: '处罚已撤销',
            data: { penaltyId, status: 'revoked' }
        });

    } catch (error) {
        console.error('[撤销处罚] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};


