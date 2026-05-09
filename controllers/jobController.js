// ========== 岗位控制器 ==========
const Job = require('../models/Job');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const redis = require('../config/redis');
const crypto = require('crypto');

/**
 * 计算筛选条件 + 页码 + 排序的 MD5 hash
 * @param {Object} params - 筛选条件对象
 * @returns {string} MD5 hash 字符串
 */
const getBrowseHash = (params) => {
    const str = JSON.stringify({
        category: params.category,
        minSalary: params.minSalary,
        maxSalary: params.maxSalary,
        scheduleType: params.scheduleType,
        keyword: params.keyword,
        campusArea: params.campusArea,
        remoteAllowed: params.remoteAllowed,
        page: params.page,
        sort: params.sort,
        order: params.order
    });
    return crypto.createHash('md5').update(str).digest('hex');
};

/**
 * 获取岗位浏览缓存版本号
 * @returns {Promise<string>} 版本号字符串
 */
const getBrowseVersion = async () => {
    if (!redis.isConnected()) return 'v0';
    const v = await redis.pGet('jobs:browse:version');
    return v || '1';
};

/**
 * 刷新岗位浏览缓存版本号
 */
const refreshBrowseVersion = async () => {
    if (!redis.isConnected()) return;
    const newVersion = await redis.pIncr('jobs:browse:version');
    console.log('[缓存] 岗位浏览版本号已刷新:', newVersion);
};

/**
 * 岗位数据验证规则
 * 用于创建和更新岗位时的数据校验
 */
exports.jobValidation = [
    // 基本信息验证
    body('title')
        .notEmpty().withMessage('岗位标题不能为空')
        .trim()
        .isLength({ max: 100 }).withMessage('岗位标题不能超过100字符'),

    body('description')
        .notEmpty().withMessage('岗位描述不能为空')
        .trim()
        .isLength({ max: 2000 }).withMessage('岗位描述不能超过2000字符'),

    body('category')
        .notEmpty().withMessage('岗位类别不能为空')
        .isIn([
            'campus_work', 'tutoring', 'research_assistant', 'library_assistant',
            'lab_assistant', 'event_staff', 'retail', 'food_service',
            'customer_service', 'content_creation', 'data_entry', 'design',
            'programming', 'marketing', 'delivery', 'surveys', 'other'
        ]).withMessage('岗位类别无效'),

    body('vacancies')
        .notEmpty().withMessage('招聘人数不能为空')
        .isInt({ min: 1 }).withMessage('招聘人数至少为1'),

    body('startDate')
        .notEmpty().withMessage('开始日期不能为空')
        .isISO8601().withMessage('开始日期格式无效'),

    // 薪资验证
    body('salary.baseRate')
        .notEmpty().withMessage('基础薪资不能为空')
        .isFloat({ min: 0 }).withMessage('基础薪资必须大于等于0'),

    body('salary.rateType')
        .notEmpty().withMessage('薪资类型不能为空')
        .isIn(['hourly', 'per_shift', 'per_project', 'commission', 'stipend'])
        .withMessage('薪资类型无效'),

    // 工作安排验证
    body('workSchedule.scheduleType')
        .notEmpty().withMessage('工作安排类型不能为空')
        .isIn(['fixed_shifts', 'flexible_hours', 'project_based', 'event_based', 'on_demand'])
        .withMessage('工作安排类型无效')
];

/**
 * 创建岗位
 * @route POST /api/jobs
 */
exports.createJob = async (req, res) => {
    try {
        console.log('[岗位创建] 开始处理请求:', {
            userId: req.user?.id,
            employerUUID: req.user?.userUUID,
            timestamp: new Date().toISOString()
        });

        // 验证请求数据
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array().map(e => e.msg).join('; ')
            });
        }

        const employerUUID = req.user.userUUID;

        // 验证雇主是否存在
        const employer = await User.findOne({ userUUID: employerUUID });
        if (!employer) {
            return res.status(404).json({
                success: false,
                message: '雇主不存在'
            });
        }

        // 创建岗位
        const jobData = {
            ...req.body,
            employerUUID: employerUUID
        };


        const newJob = new Job(jobData);

        // 更新向量表示（用于后续匹配算法）
        newJob.updateVector();

        await newJob.save();

        await refreshBrowseVersion();
        if (redis.isConnected()) {
            await redis.pDel('jobs:salary:stats'); // 清除薪资统计缓存
            // 清除所有用户的推荐缓存
            const keys = [];
            const stream = redis.scanStream({ match: 'jobs:recommended:*', count: 100 });
            for await (const batch of stream) {
                keys.push(...batch);
                if (keys.length >= 100) break;
            }
            if (keys.length > 0) await redis.del(keys);
            console.log('[缓存] 岗位创建：已刷新浏览版本 + 清除薪资统计 + 推荐缓存');
        }

        console.log('[岗位创建] 岗位创建成功:', {
            jobId: newJob._id,
            title: newJob.title,
            employerUUID
        });

        await redis.pDel(`jobs:my:${employerUUID}`); // ← 清除雇主岗位列表缓存

        res.status(201).json({
            success: true,
            message: '岗位创建成功',
            data: newJob
        });

    } catch (error) {
        console.error('[岗位创建] 失败:', error);

        if (error.name === 'ValidationError') {
            const errMsg = Object.values(error.errors).map(item => item.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errMsg
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取当前雇主的所有岗位列表
 * @route GET /api/jobs/my-jobs
 */
exports.getMyJobs = async (req, res) => {
    try {
        const employerUUID = req.user.userUUID;

        // ========== 缓存读取 ==========
        if (redis.isConnected()) {
            const cached = await redis.pGet(`jobs:my:${employerUUID}`);
            if (cached) {
                console.log('[雇主岗位] 缓存命中:', employerUUID);
                const jobsWithCount = JSON.parse(cached);
                return res.json({ success: true, data: jobsWithCount, total: jobsWithCount.length });
            }
        }


        console.log('[获取岗位列表] 雇主UUID:', employerUUID);

        const jobs = await Job.find({ employerUUID, status: { $ne: 'deleted' } })
            .sort({ createdAt: -1 }) // 按创建时间倒序
            .select('-vector'); // 列表页不需要向量数据，减少传输量

        console.log('[获取岗位列表] 找到岗位数量:', jobs.length);

        // ========== 批量查询各岗位的评论数量 ==========
        // 使用聚合查询统计每个岗位的主评论+子回复总数
        const Comment = require('../models/Comment');
        const jobIds = jobs.map(j => j._id);
        let countMap = {};

        if (jobIds.length > 0) {
            const commentCounts = await Comment.aggregate([
                {
                    $match: {
                        jobId: { $in: jobIds },
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: '$jobId',
                        count: { $sum: 1 }
                    }
                }
            ]);

            // 构建评论数映射 { jobId: count }
            commentCounts.forEach(item => {
                countMap[item._id.toString()] = item.count;
            });

            console.log('[获取岗位列表] 评论数统计:', countMap);
        }

        // 为每个岗位附加评论数
        const jobsWithCount = jobs.map(job => {
            const jobObj = job.toObject();
            jobObj.commentCount = countMap[job._id.toString()] || 0;
            return jobObj;
        });

        // ========== 缓存回写 ==========
        if (redis.isConnected()) {
            await redis.pSetex(`jobs:my:${employerUUID}`, 300, JSON.stringify(jobsWithCount)); // 5分钟
            console.log('[缓存] 雇主岗位列表已写入');
        }

        res.json({
            success: true,
            data: jobsWithCount,
            total: jobsWithCount.length
        });

    } catch (error) {
        console.error('[获取岗位列表] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取单个岗位详情
 * @route GET /api/jobs/:id
 */
exports.getJob = async (req, res) => {
    try {
        const { id } = req.params;
        const employerUUID = req.user.userUUID;

        console.log('[获取岗位详情] 岗位ID:', id);

        const job = await Job.findOne({
            _id: id,
            employerUUID: employerUUID
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权访问'
            });
        }

        res.json({
            success: true,
            data: job
        });

    } catch (error) {
        console.error('[获取岗位详情] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新岗位
 * @route PUT /api/jobs/:id
 */
exports.updateJob = async (req, res) => {
    try {
        const { id } = req.params;
        const employerUUID = req.user.userUUID;

        console.log('[岗位更新] 开始处理:', { jobId: id, employerUUID });

        // 查找岗位并验证权限
        const job = await Job.findOne({ _id: id, employerUUID });
        if (!job) {
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权修改'
            });
        }

        // 检查岗位状态（已发布的岗位某些字段可能不可修改）
        const isPublished = job.status === 'published';

        // 更新字段（排除不可修改的字段）
        const updateData = { ...req.body };
        delete updateData._id;
        delete updateData.employerUUID;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        // 如果岗位已发布，限制某些字段的修改
        if (isPublished) {
            // 已发布的岗位不允许修改核心信息（可根据业务需求调整）
            delete updateData.title;
            delete updateData.category;
            delete updateData.jobNature;
        }

        // 应用更新
        Object.keys(updateData).forEach(key => {
            if (key !== '__v') {
                job[key] = updateData[key];
            }
        });

        // 更新向量表示
        job.updateVector();

        await job.save();

        await refreshBrowseVersion();
        await redis.pDel('jobs:salary:stats');
        console.log('[缓存] 岗位更新：已刷新浏览版本 + 清除薪资统计缓存');

        console.log('[岗位更新] 更新成功:', { jobId: job._id });

        await redis.pDel(`jobs:my:${employerUUID}`); // ← 清除雇主岗位列表缓存

        res.json({
            success: true,
            message: '岗位更新成功',
            data: job
        });

    } catch (error) {
        console.error('[岗位更新] 失败:', error);

        if (error.name === 'ValidationError') {
            const errMsg = Object.values(error.errors).map(item => item.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errMsg
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 删除岗位
 * @route DELETE /api/jobs/:id
 */
exports.deleteJob = async (req, res) => {
    try {
        const { id } = req.params;
        const employerUUID = req.user.userUUID;

        console.log('[岗位删除] 开始处理:', { jobId: id, employerUUID });

        // 查找并删除岗位
        const job = await Job.findOneAndDelete({
            _id: id,
            employerUUID: employerUUID
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权删除'
            });
        }

        // 软删除：标记状态，记录删除时间
        job.status = 'deleted';
        job.deletedAt = new Date();
        job.deletedBy = employerUUID;
        await job.save();

        await refreshBrowseVersion();
        await redis.pDel('jobs:salary:stats');
        console.log('[缓存] 岗位删除：已刷新浏览版本 + 清除薪资统计缓存');

        console.log('[岗位删除] 软删除成功:', { jobId: id, title: job.title });

        await redis.pDel(`jobs:my:${employerUUID}`); // ← 清除雇主岗位列表缓存

        res.json({
            success: true,
            message: '岗位删除成功'
        });

    } catch (error) {
        console.error('[岗位删除] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 更新岗位状态（发布/下架/关闭等）
 * @route PATCH /api/jobs/:id/status
 */
exports.updateJobStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const employerUUID = req.user.userUUID;

        console.log('[岗位状态更新] 开始处理:', { jobId: id, status, employerUUID });

        // 验证状态值
        const validStatuses = ['draft', 'published', 'closed', 'filled', 'expired'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: '无效的岗位状态'
            });
        }

        const job = await Job.findOne({ _id: id, employerUUID });
        if (!job) {
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权修改'
            });
        }

        job.status = status;
        await job.save();

        await refreshBrowseVersion();
        await redis.pDel('jobs:salary:stats');
        console.log('[缓存] 岗位状态变更：已刷新浏览版本 + 清除薪资统计缓存');

        console.log('[岗位状态更新] 更新成功:', { jobId: id, status });

        await redis.pDel(`jobs:my:${employerUUID}`); // ← 清除雇主岗位列表缓存

        res.json({
            success: true,
            message: '岗位状态更新成功',
            data: { status: job.status }
        });

    } catch (error) {
        console.error('[岗位状态更新] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// 岗位浏览相关方法
/**
 * 学生浏览岗位（支持筛选、排序、分页）
 * @route GET /api/jobs/browse
 * @access 所有已登录用户
 */
exports.browseJobs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            sort = 'createdAt',
            order = 'desc',
            category,
            minSalary,
            maxSalary,
            scheduleType,
            keyword,
            campusArea,
            remoteAllowed
        } = req.query;

        console.log('[岗位浏览] ========== 开始查询 ==========');
        console.log('[岗位浏览] 请求参数:', {
            page, limit, sort, order, category,
            minSalary, maxSalary, scheduleType, keyword,
            campusArea, remoteAllowed,
            userId: req.user?.id
        });

        // ========== 缓存读取 ==========
        const cacheHash = getBrowseHash({
            page, limit, sort, order, category, minSalary, maxSalary,
            scheduleType, keyword, campusArea, remoteAllowed
        });

        if (redis.isConnected()) {
            const version = await getBrowseVersion();
            const cacheKey = `jobs:browse:${version}:${cacheHash}`;
            const cached = await redis.pGet(cacheKey);

            if (cached) {
                const result = JSON.parse(cached);
                console.log('[岗位浏览] 缓存命中:', cacheKey.slice(0, 40) + '...');
                console.log('[岗位浏览] ========== 查询完成（缓存） ==========');
                return res.json({
                    success: true,
                    data: result.data,
                    pagination: result.pagination,
                    filters: result.filters
                });
            }
            console.log('[岗位浏览] 缓存未命中');
        }

        // ========== 1. 构建查询条件 ==========
        const query = {
            status: 'published'  // 只展示已发布的岗位
        };

        // 类别筛选
        if (category) {
            query.category = category;
            console.log('[岗位浏览] 类别筛选:', category);
        }

        // 薪资范围筛选
        if (minSalary || maxSalary) {
            query['salary.baseRate'] = {};
            if (minSalary) {
                query['salary.baseRate'].$gte = parseFloat(minSalary);
            }
            if (maxSalary) {
                query['salary.baseRate'].$lte = parseFloat(maxSalary);
            }
            console.log('[岗位浏览] 薪资范围:', { minSalary, maxSalary });
        }

        // 工作安排类型筛选
        if (scheduleType) {
            query['workSchedule.scheduleType'] = scheduleType;
            console.log('[岗位浏览] 工作安排类型:', scheduleType);
        }

        // 地点筛选
        if (campusArea === 'true') {
            query['location.campusArea'] = true;
            console.log('[岗位浏览] 筛选校内工作');
        }
        if (remoteAllowed === 'true') {
            query['location.remoteAllowed'] = true;
            console.log('[岗位浏览] 筛选远程工作');
        }

        // 关键词搜索（标题和描述）
        if (keyword && keyword.trim()) {
            query.$or = [
                { title: { $regex: keyword.trim(), $options: 'i' } },
                { description: { $regex: keyword.trim(), $options: 'i' } }
            ];
            console.log('[岗位浏览] 关键词搜索:', keyword.trim());
        }

        console.log('[岗位浏览] 最终查询条件:', JSON.stringify(query, null, 2));

        // ========== 2. 排序配置 ==========
        const sortOptions = {};
        const validSortFields = ['createdAt', 'salary.baseRate', 'vacancies', 'startDate'];

        if (validSortFields.includes(sort)) {
            sortOptions[sort] = order === 'desc' ? -1 : 1;
        } else {
            sortOptions.createdAt = -1;
        }

        console.log('[岗位浏览] 排序配置:', sortOptions);

        // ========== 3. 分页查询 ==========
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const jobs = await Job.find(query)
            .select('-vector -__v')  // 排除向量数据减少传输量
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Job.countDocuments(query);

        console.log('[岗位浏览] 查询结果:', {
            found: jobs.length,
            total,
            page,
            limit,
            pages: Math.ceil(total / parseInt(limit))
        });

        // ========== 4. 补充雇主信息 ==========
        const employerUUIDs = [...new Set(jobs.map(j => j.employerUUID))];

        const employers = await User.find(
            { userUUID: { $in: employerUUIDs } },
            'userUUID username avatar employerInfo'
        ).lean();

        const employerMap = {};
        employers.forEach(e => {
            employerMap[e.userUUID] = {
                username: e.username,
                avatar: e.avatar,
                displayName: e.employerInfo?.companyInfo?.companyName ||
                    e.employerInfo?.personalInfo?.realName ||
                    e.username,
                companyType: e.employerInfo?.companyInfo?.companyType || null,
                verified: !!e.employerInfo?.companyInfo?.creditCode  // 简单验证标记
            };
        });

        console.log('[岗位浏览] 雇主信息:', {
            employerCount: employers.length,
            employerUUIDs: employerUUIDs
        });

        // ========== 5. 组装返回数据 ==========
        const enrichedJobs = jobs.map(job => ({
            ...job,
            employer: employerMap[job.employerUUID] || {
                username: '未知雇主',
                displayName: '未知雇主',
                avatar: null
            }
        }));

        // ========== 6. 获取筛选统计数据（用于前端筛选器展示） ==========
        const [categoryStats, salaryStats] = await Promise.all([
            Job.aggregate([
                { $match: { status: 'published' } },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                }
            ]),
            Job.aggregate([
                { $match: { status: 'published' } },
                {
                    $group: {
                        _id: null,
                        min: { $min: '$salary.baseRate' },
                        max: { $max: '$salary.baseRate' }
                    }
                }
            ])
        ]);

        const filters = {
            categories: categoryStats.reduce((acc, cur) => {
                acc[cur._id] = cur.count;
                return acc;
            }, {}),
            salaryRange: salaryStats[0] || { min: 0, max: 100 }
        };

        console.log('[岗位浏览] ========== 查询完成 ==========');

        // ========== 缓存回写 ==========
        if (redis.isConnected()) {
            const version = await getBrowseVersion();
            const cacheKey = `jobs:browse:${version}:${cacheHash}`;
            const cacheData = {
                data: enrichedJobs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                },
                filters
            };
            await redis.pSetex(cacheKey, 180, JSON.stringify(cacheData)); // 3 分钟
            console.log('[岗位浏览] 缓存已写入:', cacheKey.slice(0, 40) + '...');
        }

        res.json({
            success: true,
            data: enrichedJobs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            },
            filters
        });

    } catch (error) {
        console.error('[岗位浏览] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取岗位详情（学生浏览视角）
 * @route GET /api/jobs/browse/:id
 * @access 所有已登录用户
 */
exports.getJobDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUserUUID = req.user.userUUID;
        const userRole = req.user.role;

        console.log('[岗位详情] ========== 开始查询 ==========');
        console.log('[岗位详情] 请求参数:', {
            jobId: id,
            userId: currentUserUUID,
            role: userRole
        });

        // ========== 1. 查询岗位 ==========
        const job = await Job.findOne({
            _id: id,
            status: 'published'
        }).lean();

        if (!job) {
            console.log('[岗位详情] 岗位不存在或已下架:', id);
            return res.status(404).json({
                success: false,
                message: '岗位不存在或已下架'
            });
        }

        console.log('[岗位详情] 岗位信息:', {
            title: job.title,
            category: job.category,
            employerUUID: job.employerUUID
        });

        // ========== 2. 补充雇主详细信息 ==========
        const employer = await User.findOne(
            { userUUID: job.employerUUID },
            'userUUID username avatar employerInfo createdAt'
        ).lean();

        let employerDetail = null;
        if (employer) {
            if (employer.employerInfo?.employerType === 'company') {
                employerDetail = {
                    username: employer.username,
                    avatar: employer.avatar,
                    type: 'company',
                    companyName: employer.employerInfo.companyInfo?.companyName,
                    companyType: employer.employerInfo.companyInfo?.companyType,
                    companyIntro: employer.employerInfo.companyInfo?.companyIntro,
                    companyAddress: employer.employerInfo.companyInfo?.companyAddress,
                    contactPerson: employer.employerInfo.companyInfo?.contactPerson,
                    createdAt: employer.createdAt
                };
            } else {
                employerDetail = {
                    username: employer.username,
                    avatar: employer.avatar,
                    type: 'personal',
                    realName: employer.employerInfo?.personalInfo?.realName,
                    profession: employer.employerInfo?.personalInfo?.profession,
                    selfIntro: employer.employerInfo?.personalInfo?.selfIntro,
                    createdAt: employer.createdAt
                };
            }
            console.log('[岗位详情] 雇主信息:', {
                type: employerDetail.type,
                name: employerDetail.companyName || employerDetail.realName
            });
        }

        // ========== 3. 检查当前用户是否已投递（如果是学生） ==========
        let hasApplied = false;
        let applicationStatus = null;
        let applicationId = null;

        if (userRole === 'student') {
            const Application = require('../models/Application');
            const application = await Application.findOne(
                { jobId: id, studentUUID: currentUserUUID },
                '_id status submittedAt'
            ).lean();

            if (application) {
                hasApplied = true;
                applicationStatus = application.status;
                applicationId = application._id;
                console.log('[岗位详情] 用户已投递:', {
                    applicationId,
                    status: applicationStatus
                });
            } else {
                console.log('[岗位详情] 用户未投递');
            }
        }

        // ========== 4. 获取投递统计 ==========
        const Application = require('../models/Application');
        const applicationStats = await Application.getJobStats(id);

        // ========== 5. 获取学生简历（如果是学生，用于投递时选择） ==========
        let studentResumes = [];
        if (userRole === 'student') {
            const Resume = require('../models/Resume');
            const resumes = await Resume.find(
                { studentUUID: currentUserUUID },
                '_id studentStatus updatedAt'
            ).sort({ updatedAt: -1 }).lean();

            studentResumes = resumes.map(r => ({
                id: r._id,
                grade: r.studentStatus?.grade || '未知年级',
                updatedAt: r.updatedAt
            }));

            console.log('[岗位详情] 学生简历数量:', studentResumes.length);
        }

        console.log('[岗位详情] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: {
                ...job,
                employer: employerDetail,
                applicationStats,
                userContext: {
                    hasApplied,
                    applicationStatus,
                    applicationId,
                    canReapply: ['rejected', 'completed'].includes(applicationStatus),
                    studentResumes: userRole === 'student' ? studentResumes : undefined
                }
            }
        });

    } catch (error) {
        console.error('[岗位详情] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取筛选选项数据
 * @route GET /api/jobs/browse/filters
 * @access 所有已登录用户
 */
exports.getFilterOptions = async (req, res) => {
    try {
        console.log('[筛选选项] ========== 开始查询 ==========');

        // 并行查询各类统计数据
        const [categoryCounts, salaryStats, scheduleTypeCounts] = await Promise.all([
            Job.aggregate([
                { $match: { status: 'published' } },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]),
            Job.aggregate([
                { $match: { status: 'published' } },
                {
                    $group: {
                        _id: null,
                        minSalary: { $min: '$salary.baseRate' },
                        maxSalary: { $max: '$salary.baseRate' },
                        avgSalary: { $avg: '$salary.baseRate' }
                    }
                }
            ]),
            Job.aggregate([
                { $match: { status: 'published' } },
                {
                    $group: {
                        _id: '$workSchedule.scheduleType',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        console.log('[筛选选项] 查询结果:', {
            categoryCount: categoryCounts.length,
            scheduleTypeCount: scheduleTypeCounts.length
        });

        res.json({
            success: true,
            data: {
                categories: categoryCounts,
                salaryRange: salaryStats[0] || { minSalary: 0, maxSalary: 0, avgSalary: 0 },
                scheduleTypes: scheduleTypeCounts
            }
        });

    } catch (error) {
        console.error('[筛选选项] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};


// ========== 岗位推荐相关方法 ==========

/**
 * 获取基于简历匹配的推荐岗位
 * @route GET /api/jobs/recommended
 * @access 仅学生
 */
exports.getRecommendedJobs = async (req, res) => {
    try {

        const studentUUID = req.user.userUUID;
        // ========== 缓存读取 ==========
        if (redis.isConnected()) {
            const cacheKey = `jobs:recommended:${studentUUID}`;
            const cached = await redis.pGet(cacheKey);
            if (cached) {
                const result = JSON.parse(cached);
                console.log('[岗位推荐] 缓存命中:', studentUUID);
                return res.json({ success: true, ...result });
            }
            console.log('[岗位推荐] 缓存未命中:', studentUUID);
        }

        // ========== 非缓存读取 ==========

        const { page = 1, limit = 10, minScore = 50 } = req.query;

        console.log('[岗位推荐] ========== 开始推荐计算 ==========');
        console.log('[岗位推荐] 请求参数:', { studentUUID, page, limit, minScore });

        // ========== 1. 验证用户角色 ==========
        if (req.user.role !== 'student') {
            console.warn('[岗位推荐] 非学生用户尝试访问');
            return res.status(403).json({
                success: false,
                message: '仅学生用户可使用岗位推荐功能'
            });
        }

        // ========== 2. 获取学生简历 ==========
        const Resume = require('../models/Resume');
        const resume = await Resume.findOne({ studentUUID }).lean();

        if (!resume) {
            console.log('[岗位推荐] 学生尚未创建简历');
            return res.status(404).json({
                success: false,
                message: '请先创建简历，以便我们为您推荐合适的岗位'
            });
        }

        console.log('[岗位推荐] 简历信息:', {
            resumeId: resume._id,
            hasVector: !!resume.vector,
            compositeScore: resume.vector?.compositeScores?.overallScore
        });

        // ========== 3. 获取所有已发布的岗位 ==========
        const Job = require('../models/Job');
        const jobs = await Job.find({
            status: 'published',
            applicationDeadline: { $gte: new Date() }  // 只推荐未过期的岗位
        }).lean();

        console.log('[岗位推荐] 获取到已发布岗位数量:', jobs.length);

        if (jobs.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { page: 1, limit, total: 0, pages: 0 },
                message: '暂无可用岗位'
            });
        }

        // ========== 4.在计算匹配分数前，获取用户偏好权重 ==========
        const UserPreference = require('../models/UserPreference');
        const preference = await UserPreference.getOrCreate(studentUUID, 'student');

        let customWeights = null;
        if (preference.enabled) {
            customWeights = preference.weights;
            console.log('[岗位推荐] 使用自定义权重:', {
                mode: preference.mode,
                dimensions: customWeights.dimensions
            });
        } else {
            console.log('[岗位推荐] 使用默认权重');
        }

        // ========== 5. 计算匹配分数 ==========
        const matchUtils = require('../utils/matchUtils');

        // 计算匹配分数时传入自定义权重
        const matches = jobs.map(job => {
            try {
                const scoreResult = matchUtils.calculateMatchScore(job, resume, customWeights);
                return { job, ...scoreResult };
            } catch (error) {
                console.error('[岗位推荐] 计算失败:', { jobId: job._id, error: error.message });
                return null;
            }
        }).filter(m => m !== null);

        console.log('[岗位推荐] 匹配计算完成，有效结果:', matches.length);

        // ========== 6. 过滤低分岗位 ==========
        const minScoreValue = parseFloat(minScore);
        const filteredMatches = matches.filter(m => m.total >= minScoreValue);

        console.log('[岗位推荐] 过滤后结果:', {
            beforeFilter: matches.length,
            afterFilter: filteredMatches.length,
            minScore: minScoreValue
        });

        // ========== 7. 按综合分数排序 ==========
        filteredMatches.sort((a, b) => b.total - a.total);

        // ========== 8. 分页处理 ==========
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedMatches = filteredMatches.slice(startIndex, endIndex);

        // ========== 9. 补充雇主信息 ==========
        const User = require('../models/User');
        const employerUUIDs = [...new Set(paginatedMatches.map(m => m.job.employerUUID))];
        const employers = await User.find(
            { userUUID: { $in: employerUUIDs } },
            'userUUID username avatar employerInfo'
        ).lean();

        const employerMap = {};
        employers.forEach(e => {
            employerMap[e.userUUID] = {
                username: e.username,
                avatar: e.avatar,
                displayName: e.employerInfo?.companyInfo?.companyName ||
                    e.employerInfo?.personalInfo?.realName ||
                    e.username,
                companyType: e.employerInfo?.companyInfo?.companyType || null,
                verified: !!e.employerInfo?.companyInfo?.creditCode
            };
        });

        // ========== 9. 组装返回数据 ==========
        const enrichedMatches = paginatedMatches.map(match => ({
            job: {
                ...match.job,
                employer: employerMap[match.job.employerUUID] || {
                    username: '未知雇主',
                    displayName: '未知雇主'
                }
            },
            matchScore: {
                total: match.total,
                breakdown: match.breakdown
            }
        }));

        // ========== 10. 统计信息 ==========
        const stats = {
            totalRecommended: filteredMatches.length,
            averageScore: filteredMatches.length > 0
                ? Math.round(filteredMatches.reduce((sum, m) => sum + m.total, 0) / filteredMatches.length)
                : 0,
            maxScore: filteredMatches.length > 0
                ? Math.max(...filteredMatches.map(m => m.total))
                : 0
        };

        console.log('[岗位推荐] 推荐统计:', stats);
        console.log('[岗位推荐] ========== 推荐计算完成 ==========');

        // ========== 缓存回写 ==========
        if (redis.isConnected()) {
            const cacheKey = `jobs:recommended:${studentUUID}`;
            const cacheData = {
                data: enrichedMatches,
                stats,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: filteredMatches.length,
                    pages: Math.ceil(filteredMatches.length / limitNum)
                }
            };
            await redis.pSetex(cacheKey, 1800, JSON.stringify(cacheData)); // 30 分钟
            console.log('[岗位推荐] 缓存已写入');
        }


        res.json({
            success: true,
            data: enrichedMatches,
            stats,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: filteredMatches.length,
                pages: Math.ceil(filteredMatches.length / limitNum)
            }
        });

    } catch (error) {
        console.error('[岗位推荐] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};


// ========== 人才推荐相关方法 ==========

/**
 * 获取基于岗位匹配的推荐简历（雇主视角）
 * @route GET /api/jobs/:jobId/recommended-resumes
 * @access 仅雇主
 */
exports.getRecommendedResumes = async (req, res) => {
    try {
        const { jobId } = req.params;
        const employerUUID = req.user.userUUID;
        const { page = 1, limit = 10, minScore = 50 } = req.query;

        console.log('[人才推荐] ========== 开始推荐计算 ==========');
        console.log('[人才推荐] 请求参数:', { jobId, employerUUID, page, limit, minScore });

        // ========== 1. 验证用户角色 ==========
        if (req.user.role !== 'employer') {
            return res.status(403).json({
                success: false,
                message: '仅雇主用户可使用人才推荐功能'
            });
        }

        // ========== 2. 获取岗位信息 ==========
        const Job = require('../models/Job');
        const job = await Job.findOne({ _id: jobId, employerUUID }).lean();

        if (!job) {
            console.log('[人才推荐] 岗位不存在或无权访问');
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权访问'
            });
        }

        console.log('[人才推荐] 岗位信息:', {
            title: job.title,
            hasVector: !!job.vector
        });

        // ========== 3. 获取所有学生简历 ==========
        const Resume = require('../models/Resume');
        const resumes = await Resume.find().lean();

        console.log('[人才推荐] 获取到简历数量:', resumes.length);

        if (resumes.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { page: 1, limit, total: 0, pages: 0 },
                message: '暂无学生简历'
            });
        }

        // ========== 4. 获取雇主偏好权重 ==========
        const UserPreference = require('../models/UserPreference');
        const preference = await UserPreference.getOrCreate(employerUUID, 'employer');
        let customWeights = null;
        if (preference.enabled) {
            customWeights = preference.weights;
            console.log('[人才推荐] 使用自定义权重:', preference.mode);
        }

        // ========== 5. 计算匹配分数 ==========
        const matchUtils = require('../utils/matchUtils');

        const matches = resumes.map(resume => {
            try {
                const scoreResult = matchUtils.calculateMatchScore(job, resume, customWeights);
                return {
                    resume,
                    ...scoreResult
                };
            } catch (error) {
                console.error('[人才推荐] 计算失败:', {
                    resumeId: resume._id,
                    error: error.message
                });
                return null;
            }
        }).filter(m => m !== null);

        console.log('[人才推荐] 匹配计算完成，有效结果:', matches.length);

        // ========== 6. 过滤低分简历 ==========
        const minScoreValue = parseFloat(minScore);
        const filteredMatches = matches.filter(m => m.total >= minScoreValue);

        console.log('[人才推荐] 过滤后结果:', {
            beforeFilter: matches.length,
            afterFilter: filteredMatches.length,
            minScore: minScoreValue
        });

        // ========== 7. 按综合分数排序 ==========
        filteredMatches.sort((a, b) => b.total - a.total);

        // ========== 8. 分页处理 ==========
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedMatches = filteredMatches.slice(startIndex, endIndex);

        // ========== 9. 补充学生用户信息 ==========
        const User = require('../models/User');
        const studentUUIDs = [...new Set(paginatedMatches.map(m => m.resume.studentUUID))];
        const students = await User.find(
            { userUUID: { $in: studentUUIDs } },
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

        // ========== 10. 组装返回数据 ==========
        const enrichedMatches = paginatedMatches.map(match => ({
            resume: match.resume,
            student: studentMap[match.resume.studentUUID] || {
                username: '未知学生',
                studentName: '未知学生'
            },
            matchScore: {
                total: match.total,
                breakdown: match.breakdown
            }
        }));

        // ========== 11. 统计信息 ==========
        const stats = {
            totalRecommended: filteredMatches.length,
            averageScore: filteredMatches.length > 0
                ? Math.round(filteredMatches.reduce((sum, m) => sum + m.total, 0) / filteredMatches.length)
                : 0,
            maxScore: filteredMatches.length > 0
                ? Math.max(...filteredMatches.map(m => m.total))
                : 0
        };

        console.log('[人才推荐] 推荐统计:', stats);
        console.log('[人才推荐] ========== 推荐计算完成 ==========');

        res.json({
            success: true,
            data: enrichedMatches,
            stats,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: filteredMatches.length,
                pages: Math.ceil(filteredMatches.length / limitNum)
            }
        });

    } catch (error) {
        console.error('[人才推荐] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// ========== 薪资统计相关方法 ==========

/**
 * 等效时薪折算辅助函数
 * 将不同类型的薪资统一折算为等效时薪，方便横向比较
 * 与 matchUtils.js 中的折算逻辑保持一致
 */
const calculateEquivalentHourly = (salary, workSchedule) => {
    const baseRate = salary?.baseRate || 0;
    const rateType = salary?.rateType || 'hourly';
    const flexibility = workSchedule?.flexibility || {};
    const avgWeeklyHours = ((flexibility.minWeeklyHours || 4) + (flexibility.maxWeeklyHours || 20)) / 2;

    switch (rateType) {
        case 'hourly':
            return baseRate;
        case 'per_shift': {
            const avgShiftHours = 4; // 默认每班次4小时
            return avgShiftHours > 0 ? baseRate / avgShiftHours : baseRate;
        }
        case 'per_project': {
            const estimatedWeeks = 8; // 默认8周
            const estimatedTotalHours = avgWeeklyHours * estimatedWeeks;
            return estimatedTotalHours > 0 ? baseRate / estimatedTotalHours : baseRate;
        }
        case 'stipend': {
            const monthlyHours = avgWeeklyHours * 4;
            return monthlyHours > 0 ? baseRate / monthlyHours : baseRate;
        }
        case 'commission':
            return null; // 提成制不参与折算
        default:
            return baseRate;
    }
};

/**
 * 获取薪资统计数据（学生端）
 * @route GET /api/jobs/salary-stats
 * @access 所有已登录用户
 * @returns 各岗位类别的平均薪资、分布区间等
 */
exports.getSalaryStats = async (req, res) => {
    try {
        // ========== 缓存读取 ==========
        if (redis.isConnected()) {
            const cached = await redis.pGet('jobs:salary:stats');
            if (cached) {
                console.log('[薪资统计] 缓存命中');
                return res.json({ success: true, data: JSON.parse(cached) });
            }
            console.log('[薪资统计] 缓存未命中');
        }


        console.log('[薪资统计] ========== 开始查询 ==========');

        const Job = require('../models/Job');

        // 获取所有非草稿非删除的岗位
        const jobs = await Job.find({
            status: { $in: ['published', 'closed', 'filled'] }
        }).select('category salary workSchedule').lean();

        console.log('[薪资统计] 岗位总数:', jobs.length);

        if (jobs.length === 0) {
            return res.json({
                success: true,
                data: { categories: [], distribution: [], overall: { avg: 0, max: 0, min: 0 } },
                message: '暂无岗位数据'
            });
        }

        // ========== 1. 按类别分组统计 ==========
        const categoryMap = {};
        const allHourlyRates = []; // 所有等效时薪

        jobs.forEach(job => {
            const equivalentHourly = calculateEquivalentHourly(job.salary, job.workSchedule);
            if (equivalentHourly === null) return; // 提成制跳过

            const category = job.category || 'other';
            if (!categoryMap[category]) {
                categoryMap[category] = {
                    category,
                    count: 0,
                    total: 0,
                    max: 0,
                    min: Infinity,
                    rates: []
                };
            }

            const stats = categoryMap[category];
            stats.count++;
            stats.total += equivalentHourly;
            stats.max = Math.max(stats.max, equivalentHourly);
            stats.min = Math.min(stats.min, equivalentHourly);
            stats.rates.push(equivalentHourly);
            allHourlyRates.push(equivalentHourly);
        });

        // 格式化类别数据
        const categories = Object.values(categoryMap).map(item => ({
            category: item.category,
            count: item.count,
            avgHourly: Math.round(item.total / item.count * 100) / 100,
            maxHourly: Math.round(item.max * 100) / 100,
            minHourly: Math.round(item.min * 100) / 100
        })).sort((a, b) => b.avgHourly - a.avgHourly);

        // ========== 2. 薪资分布（分档） ==========
        const distributionRanges = [0, 10, 20, 30, 50, 80, 100, 200, Infinity];
        const distributionLabels = ['0-10', '10-20', '20-30', '30-50', '50-80', '80-100', '100-200', '200+'];
        const distribution = distributionLabels.map((label, i) => ({
            range: label,
            min: distributionRanges[i],
            max: distributionRanges[i + 1],
            count: 0
        }));

        allHourlyRates.forEach(rate => {
            for (let i = 0; i < distributionRanges.length - 1; i++) {
                if (rate >= distributionRanges[i] && rate < distributionRanges[i + 1]) {
                    distribution[i].count++;
                    break;
                }
            }
        });

        // ========== 3. 整体统计 ==========
        const totalAvg = allHourlyRates.length > 0
            ? Math.round(allHourlyRates.reduce((a, b) => a + b, 0) / allHourlyRates.length * 100) / 100
            : 0;

        const overall = {
            avg: totalAvg,
            max: allHourlyRates.length > 0 ? Math.max(...allHourlyRates) : 0,
            min: allHourlyRates.length > 0 ? Math.min(...allHourlyRates) : 0,
            totalJobs: jobs.length,
            validJobs: allHourlyRates.length
        };

        console.log('[薪资统计] 类别数:', categories.length, '| 总均值:', overall.avg);
        console.log('[薪资统计] ========== 查询完成 ==========');


        // ========== 缓存回写 ==========
        if (redis.isConnected()) {
            const resultData = { categories, distribution, overall };
            await redis.pSetex('jobs:salary:stats', 1800, JSON.stringify(resultData)); // 30 分钟
            console.log('[薪资统计] 缓存已写入');
        }

        
        res.json({
            success: true,
            data: {
                categories,
                distribution,
                overall
            }
        });

    } catch (error) {
        console.error('[薪资统计] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 获取岗位薪资对比数据（雇主端）
 * @route GET /api/jobs/salary-comparison
 * @access 仅雇主（需提供 jobId）
 * @returns 当前岗位与同类岗位的市场薪资对比
 */
exports.getSalaryComparison = async (req, res) => {
    try {
        const { jobId } = req.query;
        const employerUUID = req.user.userUUID;

        console.log('[薪资对比] ========== 开始查询 ==========');

        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: '请提供岗位ID'
            });
        }

        const Job = require('../models/Job');

        // 查询当前岗位
        const currentJob = await Job.findOne({ _id: jobId, employerUUID }).lean();
        if (!currentJob) {
            return res.status(404).json({
                success: false,
                message: '岗位不存在或无权访问'
            });
        }

        const currentHourly = calculateEquivalentHourly(currentJob.salary, currentJob.workSchedule);
        if (currentHourly === null) {
            return res.json({
                success: true,
                data: {
                    currentRate: currentJob.salary?.baseRate || 0,
                    rateType: currentJob.salary?.rateType || 'hourly',
                    isCommissionBased: true,
                    message: '当前岗位为提成制，无法进行等效时薪对比'
                }
            });
        }

        // 查询同类岗位
        const sameCategoryJobs = await Job.find({
            category: currentJob.category,
            status: { $in: ['published', 'closed', 'filled'] },
            _id: { $ne: currentJob._id }
        }).select('category salary workSchedule').lean();

        console.log('[薪资对比] 同类岗位数:', sameCategoryJobs.length);

        // 计算同类岗位等效时薪
        const marketRates = [];
        sameCategoryJobs.forEach(job => {
            const rate = calculateEquivalentHourly(job.salary, job.workSchedule);
            if (rate !== null) marketRates.push(rate);
        });

        // 计算市场统计
        let marketAvg = 0;
        let marketMedian = 0;
        let rankPercent = 100;
        let comparisonText = '';

        if (marketRates.length > 0) {
            marketAvg = Math.round(marketRates.reduce((a, b) => a + b, 0) / marketRates.length * 100) / 100;

            const sorted = [...marketRates].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            marketMedian = sorted.length % 2 === 0
                ? Math.round((sorted[mid - 1] + sorted[mid]) / 2 * 100) / 100
                : Math.round(sorted[mid] * 100) / 100;

            // 当前薪资在同类中的排名
            const lowerCount = marketRates.filter(r => r < currentHourly).length;
            rankPercent = Math.round(lowerCount / marketRates.length * 100);

            const diffPercent = Math.round(Math.abs(currentHourly - marketAvg) / marketAvg * 100);
            if (currentHourly >= marketAvg) {
                comparisonText = `高于同类均值 ${diffPercent}%`;
            } else {
                comparisonText = `低于同类均值 ${diffPercent}%`;
            }
        } else {
            comparisonText = '暂无同类岗位数据对比';
        }

        console.log('[薪资对比] 当前:', currentHourly, '| 市场均值:', marketAvg, '| 排名:', rankPercent + '%');
        console.log('[薪资对比] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: {
                currentRate: Math.round(currentHourly * 100) / 100,
                rateType: currentJob.salary?.rateType || 'hourly',
                isCommissionBased: false,
                marketAvg,
                marketMedian,
                marketSampleSize: marketRates.length,
                rankPercent,
                comparisonText,
                category: currentJob.category
            }
        });

    } catch (error) {
        console.error('[薪资对比] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};