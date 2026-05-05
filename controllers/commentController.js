// controllers/commentController.js
// ========== 评论控制器 ==========
// 处理岗位评价模块的所有业务逻辑，包括评论CRUD、点赞、举报、屏蔽等
const Comment = require('../models/Comment');
const CommentLike = require('../models/CommentLike');
const CommentReport = require('../models/CommentReport');
const BlockedUser = require('../models/BlockedUser');
const Job = require('../models/Job');
const User = require('../models/User');
const { checkBadWords, formatCommentTime } = require('../utils/commentUtils');
const { body, validationResult } = require('express-validator');
const redis = require('../config/redis');

// ========== 评论发布验证规则 ==========
exports.commentValidation = [
    body('jobId')
        .notEmpty().withMessage('岗位ID不能为空')
        .isMongoId().withMessage('岗位ID格式无效'),
    body('content')
        .notEmpty().withMessage('评论内容不能为空')
        .trim()
        .isLength({ min: 1, max: 500 }).withMessage('评论内容需在1-500字之间'),

    body('parentId')
        .optional()
        .isMongoId().withMessage('父评论ID格式无效'),

    body('replyToUUID')
        .optional()
        .isString().withMessage('被回复者UUID格式无效')
];

// ========== 举报验证规则 ==========
exports.reportValidation = [
    body('reason')
        .notEmpty().withMessage('举报理由不能为空')
        .isIn(['insult_attack', 'ad_spam', 'porn_violence', 'other'])
        .withMessage('无效的举报理由')
];

/**
 * 发布评论/回复
 * @route POST /api/jobs/:jobId/comments
 * @access 所有已登录用户
 * @description 支持发布主评论和子回复，通过 parentId 区分
 */
exports.createComment = async (req, res) => {
    try {
        console.log('[评论发布] ========== 开始处理 ==========');

        // 验证请求数据
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('[评论发布] 验证失败:', errors.array());
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const { jobId, content, parentId, replyToUUID, replyToName, mentionedUsers } = req.body;
        const authorUUID = req.user.userUUID;
        const authorRole = req.user.role;

        console.log('[评论发布] 请求参数:', {
            jobId,
            authorUUID,
            authorRole,
            parentId: parentId || '无（主评论）',
            contentLength: content.length
        });

        // ========== 1. 验证岗位是否存在 ==========
        const job = await Job.findById(jobId).select('title employerUUID status');
        if (!job) {
            console.log('[评论发布] 岗位不存在:', jobId);
            return res.status(404).json({
                success: false,
                message: '岗位不存在'
            });
        }

        // 非发布状态的岗位不允许评论（已删除的岗位除外，通过前端控制）
        if (job.status === 'deleted') {
            return res.status(400).json({
                success: false,
                message: '该岗位已删除，无法评论'
            });
        }

        console.log('[评论发布] 岗位信息:', { title: job.title, employerUUID: job.employerUUID });

        // ========== 2. 检查用户是否被屏蔽 ==========
        const isBlocked = await BlockedUser.isBlocked(jobId, authorUUID);
        if (isBlocked) {
            console.log('[评论发布] 用户已被屏蔽:', authorUUID);
            return res.status(403).json({
                success: false,
                message: '您已被该岗位的拥有者屏蔽，无法发布评论'
            });
        }

        // ========== 3. 违规词检测 ==========
        const badWordResult = checkBadWords(content);
        if (!badWordResult.isValid) {
            console.log('[评论发布] 违规词检测不通过:', badWordResult.reason);
            return res.status(400).json({
                success: false,
                message: `内容违规：${badWordResult.reason}，请修改后重新发布`
            });
        }

        // ========== 4. 如果是回复，验证父评论是否存在 ==========
        let rootId = null;
        if (parentId) {
            const parentComment = await Comment.findById(parentId).select('_id parentId rootId');
            if (!parentComment) {
                console.log('[评论发布] 父评论不存在:', parentId);
                return res.status(404).json({
                    success: false,
                    message: '被回复的评论不存在'
                });
            }

            // 确定 rootId（所有回复都指向根评论）
            rootId = parentComment.rootId || parentComment._id;
            console.log('[评论发布] 回复评论:', { parentId, rootId });
        }

        // ========== 5. 查询作者用户信息（获取头像URL） ==========
        const author = await User.findOne({ userUUID: authorUUID })
            .select('username avatar employerInfo studentInfo role');
        const authorName = author
            ? (author.role === 'employer'
                ? (author.employerInfo?.companyInfo?.companyName || author.employerInfo?.personalInfo?.realName || author.username)
                : (author.studentInfo?.studentName || author.username))
            : '未知用户';
        const authorAvatar = author?.avatar || '';

        console.log('[评论发布] 作者信息:', { authorName, authorAvatar });

        // ========== 6. 创建评论 ==========
        const commentData = {
            jobId,
            parentId: parentId || null,
            rootId: rootId,
            authorUUID,
            authorRole,
            content,
            replyToUUID: replyToUUID || '',
            replyToName: replyToName || '',
            mentionedUsers: mentionedUsers || []
        };

        const comment = new Comment(commentData);
        await comment.save();

        console.log('[评论发布] 评论创建成功:', {
            commentId: comment._id,
            isReply: !!parentId,
            rootId: rootId
        });

        // ========== 7. 如果是回复，更新父评论的回复计数 ==========
        if (parentId && rootId) {
            await Comment.incrementReplyCount(rootId);
            console.log('[评论发布] 已更新根评论回复计数:', rootId);
        }

        // ========== 8. 发送通知（复用现有站内信系统） ==========
        await sendCommentNotification(req, comment, job, authorName);

        console.log('[评论发布] ========== 处理完成 ==========');

        res.status(201).json({
            success: true,
            message: '评论发布成功',
            data: {
                ...comment.toObject(),
                authorName,
                authorAvatar
            }
        });

    } catch (error) {
        console.error('[评论发布] 失败:', error);

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
 * 获取评论列表
 * @route GET /api/jobs/:jobId/comments
 * @access 所有已登录用户
 * @description 支持分页和排序（time/hot）
 */
exports.getComments = async (req, res) => {
    try {
        const { jobId, page = 1, limit = 20, sort = 'time' } = req.query;
        const currentUserUUID = req.user.userUUID;

        // 参数校验：jobId 不能为空
        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: '岗位ID不能为空'
            });
        }

        console.log('[评论列表] ========== 开始查询 ==========');
        console.log('[评论列表] 请求参数:', { jobId, page, limit, sort });

        // ========== 1. 验证岗位是否存在 ==========
        const job = await Job.findById(jobId).select('employerUUID');
        if (!job) {
            console.log('[评论列表] 岗位不存在:', jobId);
            return res.status(404).json({
                success: false,
                message: '岗位不存在'
            });
        }

        // ========== 2. 查询评论列表 ==========
        const { comments, repliesMap, pagination } = await Comment.getCommentsByJob(jobId, {
            page,
            limit,
            sort
        });

        // ========== 3. 收集所有作者UUID ==========
        const allComments = [...comments];
        Object.values(repliesMap).forEach(replies => {
            allComments.push(...replies);
        });

        const authorUUIDs = [...new Set(allComments.map(c => c.authorUUID))];

        // ========== 4. 批量查询用户信息 ==========
        const users = await User.find(
            { userUUID: { $in: authorUUIDs } },
            'userUUID username avatar employerInfo studentInfo role'
        ).lean();

        const userMap = {};
        users.forEach(u => {
            userMap[u.userUUID] = {
                username: u.username,
                avatar: u.avatar,
                role: u.role,
                displayName: u.role === 'employer'
                    ? (u.employerInfo?.companyInfo?.companyName ||
                        u.employerInfo?.personalInfo?.realName ||
                        u.username)
                    : (u.studentInfo?.studentName || u.username)
            };
        });

        // ========== 5. 批量查询当前用户的点赞状态 ==========
        const commentIds = allComments.map(c => c._id);
        const likes = await CommentLike.find({
            commentId: { $in: commentIds },
            userUUID: currentUserUUID
        }).select('commentId').lean();

        const likedSet = new Set(likes.map(l => l.commentId.toString()));

        // ========== 6. 组装返回数据 ==========
        const enrichedComments = comments.map(comment => ({
            ...comment,
            author: userMap[comment.authorUUID] || {
                username: '未知用户',
                avatar: '',
                displayName: '未知用户'
            },
            isLiked: likedSet.has(comment._id.toString()),
            isOwner: job.employerUUID === currentUserUUID,
            isAuthor: comment.authorUUID === currentUserUUID,
            // 雇主专属标识
            employerBadge: comment.authorRole === 'employer'
                ? (comment.authorUUID === job.employerUUID ? 'owner' : 'employer')
                : null
        }));

        // 子回复也附带用户信息和点赞状态
        const enrichedRepliesMap = {};
        Object.keys(repliesMap).forEach(rootId => {
            enrichedRepliesMap[rootId] = repliesMap[rootId].map(reply => ({
                ...reply,
                author: userMap[reply.authorUUID] || {
                    username: '未知用户',
                    avatar: '',
                    displayName: '未知用户'
                },
                isLiked: likedSet.has(reply._id.toString()),
                isOwner: job.employerUUID === currentUserUUID,
                isAuthor: reply.authorUUID === currentUserUUID
            }));
        });

        console.log('[评论列表] 查询完成:', {
            comments: comments.length,
            repliesTotal: allComments.length - comments.length,
            pagination
        });
        console.log('[评论列表] ========== 查询完成 ==========');

        res.json({
            success: true,
            data: {
                comments: enrichedComments,
                repliesMap: enrichedRepliesMap
            },
            pagination
        });

    } catch (error) {
        console.error('[评论列表] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 编辑评论
 * @route PUT /api/comments/:id
 * @access 仅评论作者本人
 */
exports.updateComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const userUUID = req.user.userUUID;

        console.log('[评论编辑] ========== 开始处理 ==========');
        console.log('[评论编辑] 请求参数:', { id, contentLength: content?.length });

        // ========== 1. 参数校验 ==========
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能为空'
            });
        }

        if (content.length > 500) {
            return res.status(400).json({
                success: false,
                message: '评论内容不能超过500字'
            });
        }

        // ========== 2. 查找评论 ==========
        const comment = await Comment.findById(id);
        if (!comment) {
            console.log('[评论编辑] 评论不存在:', id);
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        // ========== 3. 权限验证 ==========
        if (comment.authorUUID !== userUUID) {
            console.log('[评论编辑] 无权编辑:', { authorUUID: comment.authorUUID, userUUID });
            return res.status(403).json({
                success: false,
                message: '只能编辑自己的评论'
            });
        }

        // ========== 4. 违规词检测 ==========
        const badWordResult = checkBadWords(content);
        if (!badWordResult.isValid) {
            console.log('[评论编辑] 违规词检测不通过:', badWordResult.reason);
            return res.status(400).json({
                success: false,
                message: `内容违规：${badWordResult.reason}，请修改后重新发布`
            });
        }

        // ========== 5. 更新评论 ==========
        comment.content = content;
        comment.isEdited = true;
        comment.editedAt = new Date();
        await comment.save();

        console.log('[评论编辑] 编辑成功:', id);
        console.log('[评论编辑] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '评论已更新',
            data: comment
        });

    } catch (error) {
        console.error('[评论编辑] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 删除评论（软删除）
 * @route DELETE /api/comments/:id
 * @access 评论作者本人 或 岗位拥有者
 */
exports.deleteComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userUUID = req.user.userUUID;

        console.log('[评论删除] ========== 开始处理 ==========');
        console.log('[评论删除] 参数:', { id, userUUID });

        // ========== 1. 查找评论 ==========
        const comment = await Comment.findById(id);
        if (!comment) {
            console.log('[评论删除] 评论不存在:', id);
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        // ========== 2. 权限验证：作者本人 或 岗位拥有者 ==========
        const job = await Job.findById(comment.jobId).select('employerUUID');
        const isAuthor = comment.authorUUID === userUUID;
        const isJobOwner = job && job.employerUUID === userUUID;

        if (!isAuthor && !isJobOwner) {
            console.log('[评论删除] 无权删除:', { isAuthor, isJobOwner });
            return res.status(403).json({
                success: false,
                message: '无权删除此评论'
            });
        }

        // ========== 3. 软删除 ==========
        comment.isDeleted = true;
        await comment.save();

        console.log('[评论删除] 删除成功:', { id, byAuthor: isAuthor, byOwner: isJobOwner });
        console.log('[评论删除] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '评论已删除'
        });

    } catch (error) {
        console.error('[评论删除] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 置顶/取消置顶评论
 * @route PATCH /api/comments/:id/pin
 * @access 仅岗位拥有者
 */
exports.togglePinComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userUUID = req.user.userUUID;

        console.log('[评论置顶] ========== 开始处理 ==========');
        console.log('[评论置顶] 参数:', { id, userUUID });

        // ========== 1. 查找评论 ==========
        const comment = await Comment.findById(id);
        if (!comment) {
            console.log('[评论置顶] 评论不存在:', id);
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        // 仅主评论可置顶
        if (comment.parentId) {
            return res.status(400).json({
                success: false,
                message: '只能置顶主评论'
            });
        }

        // ========== 2. 权限验证（仅岗位拥有者可操作） ==========
        const job = await Job.findById(comment.jobId).select('employerUUID');
        if (!job || job.employerUUID !== userUUID) {
            console.log('[评论置顶] 无权操作');
            return res.status(403).json({
                success: false,
                message: '仅岗位拥有者可操作'
            });
        }

        // ========== 3. 切换置顶状态 ==========
        comment.isPinned = !comment.isPinned;
        if (comment.isPinned) {
            comment.pinnedAt = new Date();
            comment.pinnedBy = userUUID;
        } else {
            comment.pinnedAt = null;
            comment.pinnedBy = '';
        }
        await comment.save();

        console.log('[评论置顶] 操作成功:', { isPinned: comment.isPinned });
        console.log('[评论置顶] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: comment.isPinned ? '评论已置顶' : '已取消置顶',
            data: { isPinned: comment.isPinned }
        });

    } catch (error) {
        console.error('[评论置顶] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 点赞/取消点赞（toggle模式）
 * @route POST /api/comments/:id/like
 * @access 所有已登录用户
 */
exports.toggleLike = async (req, res) => {
    try {
        const { id } = req.params;
        const userUUID = req.user.userUUID;

        console.log('[评论点赞] ========== 开始处理 ==========');
        console.log('[评论点赞] 参数:', { commentId: id, userUUID });

        // ========== 1. 查找评论 ==========
        const comment = await Comment.findById(id).select('_id likeCount');
        if (!comment) {
            console.log('[评论点赞] 评论不存在:', id);
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        // ========== 2. 检查是否已点赞 ==========
        const existingLike = await CommentLike.findOne({
            commentId: id,
            userUUID
        });

        let isLiked;
        if (existingLike) {
            // 取消点赞
            await CommentLike.findByIdAndDelete(existingLike._id);
            comment.likeCount = Math.max(0, comment.likeCount - 1);
            await comment.save();
            isLiked = false;
            console.log('[评论点赞] 取消点赞');
        } else {
            // 添加点赞
            try {
                await CommentLike.create({ commentId: id, userUUID });
                comment.likeCount += 1;
                await comment.save();
                isLiked = true;
                console.log('[评论点赞] 添加点赞');
            } catch (createError) {
                // 并发创建冲突处理
                if (createError.code === 11000) {
                    console.log('[评论点赞] 并发创建冲突，视为已点赞');
                    isLiked = true;
                } else {
                    throw createError;
                }
            }
        }

        console.log('[评论点赞] 操作完成:', { isLiked, likeCount: comment.likeCount });
        console.log('[评论点赞] ========== 处理完成 ==========');

        res.json({
            success: true,
            data: {
                isLiked,
                likeCount: comment.likeCount
            }
        });

    } catch (error) {
        console.error('[评论点赞] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 举报评论
 * 新增接收字段：reportNotes（举报备注）、evidenceUrls（截图URL数组）
 * 举报创建后调用 Comment.incrementReportCount 更新聚合计数
 * 检查是否达到自动审核阈值，达到时自动隐藏评论
 *
 * @route POST /api/comments/:id/report
 * @access 所有已登录用户
 */
exports.reportComment = async (req, res) => {
    try {
        const { id } = req.params;
        // 新增接收 reportNotes 和 evidenceUrls 字段
        const { reason, reportNotes = '', evidenceUrls = [] } = req.body;
        const reporterUUID = req.user.userUUID;

        console.log('[评论举报] ========== 开始处理 (增强版) ==========');
        console.log('[评论举报] 参数:', { commentId: id, reason, reporterUUID, hasNotes: !!reportNotes, evidenceCount: evidenceUrls.length });

        // ========== 1. 验证举报理由 ==========
        const validReasons = ['insult_attack', 'ad_spam', 'porn_violence', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: '无效的举报理由'
            });
        }

        // ========== 2. 校验 evidenceUrls 长度 ==========
        if (evidenceUrls.length > 3) {
            return res.status(400).json({
                success: false,
                message: '截图数量不能超过3张'
            });
        }

        // ========== 3. 查找评论 ==========
        const comment = await Comment.findById(id);
        if (!comment) {
            console.log('[评论举报] 评论不存在:', id);
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        // ========== 4. 获取举报者权重（用于审核排序） ==========
        let reporterWeight = 1.0;
        try {
            const UserViolationRecord = require('../models/UserViolationRecord');
            const violationRecord = await UserViolationRecord.findOne({ userUUID: reporterUUID });
            if (violationRecord) {
                reporterWeight = violationRecord.reportWeight || 1.0;
                console.log('[评论举报] 举报者权重:', reporterWeight);
            }
        } catch (e) {
            // 旧数据兼容，UserViolationRecord 可能不存在
            console.log('[评论举报] 获取举报者权重失败（可能模型不存在），使用默认值1.0');
        }

        // ========== 5. 创建举报记录（唯一索引防止重复举报） ==========
        try {
            await CommentReport.create({
                commentId: id,
                reporterUUID,
                reason,
                // 新增字段
                reportNotes,
                evidenceUrls,
                reporterWeight,
                status: 'pending'
            });

            console.log('[评论举报] 举报记录创建成功');
        } catch (error) {
            if (error.code === 11000) {
                console.log('[评论举报] 重复举报');
                return res.status(400).json({
                    success: false,
                    message: '您已举报过此评论'
                });
            }
            throw error;
        }

        // ========== 6. 更新评论的举报聚合计数 ==========
        await Comment.incrementReportCount(id, reason);

        // ========== 7. 重新获取评论最新状态，检查是否达到自动审核阈值 ==========
        const updatedComment = await Comment.findById(id).lean();
        const reportSummary = updatedComment.reportSummary || {};
        const totalReports = reportSummary.totalReports || 0;

        console.log('[评论举报] 当前举报聚合:', {
            totalReports,
            uniqueReporters: reportSummary.uniqueReporters,
            reasonBreakdown: reportSummary.reasonBreakdown
        });

        // ========== 8. 检查自动审核阈值 ==========
        let autoHidden = false;
        let thresholdReached = 3; // 默认阈值：同一评论被举报3次自动隐藏

        // 尝试从 ReportReasonConfig 获取配置的阈值
        try {
            const ReportReasonConfig = require('../models/ReportReasonConfig');
            const reasonConfig = await ReportReasonConfig.findOne({ reasonKey: reason, isActive: true });
            if (reasonConfig && reasonConfig.autoThreshold) {
                thresholdReached = reasonConfig.autoThreshold;
                console.log('[评论举报] 使用配置阈值:', { reason, threshold: thresholdReached });
            }
        } catch (e) {
            // 模型可能尚未创建，使用默认阈值
            console.log('[评论举报] ReportReasonConfig 不可用，使用默认阈值:', thresholdReached);
        }

        // 检查该原因的具体举报次数是否达到阈值
        const reasonCount = reportSummary.reasonBreakdown?.[reason] || 0;

        if (reasonCount >= thresholdReached && updatedComment.status === 'normal') {
            console.log('[评论举报] 达到自动审核阈值，自动隐藏评论:', {
                reason,
                reasonCount,
                threshold: thresholdReached
            });

            // 自动隐藏评论
            await Comment.findByIdAndUpdate(id, {
                status: 'auto_hidden',
                violationLevel: 'minor',
                reviewedAt: new Date(),
                'reportSummary.isUnderReview': false
            });

            // 同步更新举报工单状态
            await CommentReport.updateMany(
                { commentId: id, status: 'pending' },
                {
                    $set: {
                        status: 'processed',
                        autoProcessed: true,
                        autoProcessRule: `阈值触发（${reason}:${reasonCount}>=${thresholdReached}）`,
                        violationLevel: 'minor',
                        processingResult: '自动审核：达到举报阈值自动隐藏评论',
                        reviewedAt: new Date()
                    }
                }
            );

            autoHidden = true;
            console.log('[评论举报] 评论已自动隐藏');
        }

        // // ========== 9. 通知岗位拥有者（复用现有逻辑） ==========
        // await sendReportNotification(req, comment, reason);

        console.log('[评论举报] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: autoHidden
                ? '举报已提交，评论已达到审核阈值已被自动隐藏'
                : '举报已提交，我们将尽快处理',
            data: {
                autoHidden,
                totalReports
            }
        });

    } catch (error) {
        console.error('[评论举报] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 屏蔽用户
 * @route POST /api/jobs/:jobId/block-user
 * @access 仅岗位拥有者
 */
exports.blockUser = async (req, res) => {
    try {
        const { jobId, blockedUUID } = req.body;
        const operatorUUID = req.user.userUUID;

        // 参数校验
        if (!jobId) {
            return res.status(400).json({
                    success: false,
                    message: '岗位ID不能为空'
            });
        }

        console.log('[屏蔽用户] ========== 开始处理 ==========');
        console.log('[屏蔽用户] 参数:', { jobId, blockedUUID, operatorUUID });

        // ========== 1. 验证岗位所有权 ==========
        const job = await Job.findById(jobId).select('employerUUID');
        if (!job || job.employerUUID !== operatorUUID) {
            console.log('[屏蔽用户] 无权操作');
            return res.status(403).json({
                success: false,
                message: '仅岗位拥有者可操作'
            });
        }

        // ========== 2. 创建屏蔽记录 ==========
        try {
            await BlockedUser.create({
                jobId,
                blockedUUID,
                blockedBy: operatorUUID
            });
            console.log('[屏蔽用户] 屏蔽成功');
        } catch (error) {
            if (error.code === 11000) {
                console.log('[屏蔽用户] 已屏蔽该用户');
                return res.status(400).json({
                    success: false,
                    message: '已屏蔽该用户'
                });
            }
            throw error;
        }

        console.log('[屏蔽用户] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '用户已被屏蔽'
        });

    } catch (error) {
        console.error('[屏蔽用户] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 解除屏蔽用户
 * @route DELETE /api/jobs/:jobId/block-user/:uuid
 * @access 仅岗位拥有者
 */
exports.unblockUser = async (req, res) => {
    try {
        const { uuid } = req.params;
        const { jobId } = req.body;
        const operatorUUID = req.user.userUUID;

        // 参数校验
        if (!jobId) {
            return res.status(400).json({
                    success: false,
                    message: '岗位ID不能为空'
            });
        }
        console.log('[解除屏蔽] ========== 开始处理 ==========');
        console.log('[解除屏蔽] 参数:', { jobId, uuid, operatorUUID });

        // ========== 1. 验证岗位所有权 ==========
        const job = await Job.findById(jobId).select('employerUUID');
        if (!job || job.employerUUID !== operatorUUID) {
            return res.status(403).json({
                success: false,
                message: '仅岗位拥有者可操作'
            });
        }

        // ========== 2. 删除屏蔽记录 ==========
        const result = await BlockedUser.findOneAndDelete({
            jobId,
            blockedUUID: uuid
        });

        if (!result) {
            console.log('[解除屏蔽] 未找到屏蔽记录');
            return res.status(404).json({
                success: false,
                message: '未找到屏蔽记录'
            });
        }

        console.log('[解除屏蔽] 操作成功');
        console.log('[解除屏蔽] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '已解除屏蔽'
        });

    } catch (error) {
        console.error('[解除屏蔽] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// ========== 通知辅助函数 ==========

/**
 * 发送评论相关通知（复用到评论、回复、@提及等场景）
 * 复用现有站内信系统，通过 Conversation.findOrCreate + Message.create
 *
 * @param {Object} req - Express请求对象
 * @param {Object} comment - 评论文档
 * @param {Object} job - 岗位文档
 * @param {string} authorName - 评论者昵称
 */
async function sendCommentNotification(req, comment, job, authorName) {
    console.log('[评论通知] ========== 开始发送通知 ==========');

    try {
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');
        const io = req.app.get('io');

        // 确定通知对象和内容
        let receiverUUID = '';
        let notificationContent = '';

        if (comment.parentId) {
            // 回复通知：通知被回复者
            receiverUUID = comment.replyToUUID;
            notificationContent = JSON.stringify({
                type: 'comment_notification',
                subType: 'reply',
                commentId: comment._id.toString(),
                jobId: comment.jobId.toString(),
                jobTitle: job.title,
                triggerUserName: authorName,
                content: comment.content.slice(0, 100),
                notifiedAt: new Date().toISOString()
            });

            console.log('[评论通知] 回复通知:', { receiverUUID, subType: 'reply' });
        } else {
            // 主评论：不发送通知（岗位拥有者可通过评论区查看）
            console.log('[评论通知] 主评论不发送站内信通知，岗位拥有者可通过评论区查看');
            return;
        }

        if (!receiverUUID) {
            console.log('[评论通知] 无通知对象，跳过');
            return;
        }

        // 查找或创建会话
        const conversation = await Conversation.findOrCreate(comment.authorUUID, receiverUUID);

        // 创建通知消息
        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID: comment.authorUUID,
            receiverUUID: receiverUUID,
            content: notificationContent,
            type: 'text',
            metadata: {
                jobId: comment.jobId,
                jobTitle: job.title,
                action: 'comment_notification'
            }
        });

        // 更新会话
        conversation.lastMessage = {
            content: `【评论通知】${authorName}评论了「${job.title}」`,
            senderUUID: comment.authorUUID,
            sentAt: new Date()
        };
        const unreadMap = conversation.unreadCount instanceof Map
            ? conversation.unreadCount
            : new Map(Object.entries(conversation.unreadCount || {}));
        const currentCount = unreadMap.get(receiverUUID) || 0;
        unreadMap.set(receiverUUID, currentCount + 1);
        conversation.unreadCount = unreadMap;
        conversation.updatedAt = new Date();
        await conversation.save();

        // WebSocket 推送
        if (io) {
            io.to(receiverUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id.toString()
            });
            console.log('[评论通知] WebSocket 已推送至:', receiverUUID);
        }

        console.log('[评论通知] ========== 通知发送完成 ==========');

    } catch (error) {
        console.error('[评论通知] 发送失败:', error);
        // 通知失败不阻塞主流程
    }
}

/**
 * 发送举报通知给岗位拥有者

 *
 * @deprecated 感觉没必要，可以废弃
 *
 * @param {Object} req - Express请求对象
 * @param {Object} comment - 被举报的评论文档
 * @param {string} reason - 举报理由
 */
async function sendReportNotification(req, comment, reason) {
    console.log('[举报通知] ========== 开始发送通知 ==========');

    try {
        const Job = require('../models/Job');
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');
        const io = req.app.get('io');

        const job = await Job.findById(comment.jobId).select('title employerUUID');

        if (job.employerUUID === req.user.userUUID) {
            console.log('[举报通知] 举报者与岗位拥有者为同一人，跳过通知');
            return;
        }

        const reasonMap = {
            insult_attack: '辱骂攻击',
            ad_spam: '广告骚扰',
            porn_violence: '色情暴力',
            other: '其他'
        };

        const notificationContent = JSON.stringify({
            type: 'comment_notification',
            subType: 'report',
            commentId: comment._id.toString(),
            jobId: comment.jobId.toString(),
            jobTitle: job.title,
            reportReason: reasonMap[reason] || reason,
            notifiedAt: new Date().toISOString()
        });

        // 查找或创建会话（举报者与岗位拥有者）
        const conversation = await Conversation.findOrCreate(req.user.userUUID, job.employerUUID);

        const message = await Message.create({
            conversationId: conversation._id,
            senderUUID: req.user.userUUID,
            receiverUUID: job.employerUUID,
            content: notificationContent,
            type: 'text',
            metadata: {
                jobId: comment.jobId,
                action: 'comment_report'
            }
        });

        conversation.lastMessage = {
            content: `【举报通知】有用户举报了「${job.title}」下的评论`,
            senderUUID: req.user.userUUID,
            sentAt: new Date()
        };
        const unreadMap = conversation.unreadCount instanceof Map
            ? conversation.unreadCount
            : new Map(Object.entries(conversation.unreadCount || {}));
        const currentCount = unreadMap.get(job.employerUUID) || 0;
        unreadMap.set(job.employerUUID, currentCount + 1);
        conversation.unreadCount = unreadMap;
        conversation.updatedAt = new Date();
        await conversation.save();

        if (io) {
            io.to(job.employerUUID).emit('new_message', {
                message: message.toObject(),
                conversationId: conversation._id.toString()
            });
            console.log('[举报通知] WebSocket 已推送至:', job.employerUUID);
        }

        console.log('[举报通知] ========== 通知发送完成 ==========');

    } catch (error) {
        console.error('[举报通知] 发送失败:', error);
    }
}

/**
 * 获取举报原因列表（公开接口）
 * 返回启用的举报原因，按 sortOrder 排序
 *
 * @route GET /api/comments/report-reasons
 * @access 公开（无需登录）
 */
exports.getReportReasons = async (req, res) => {
    try {
        console.log('[举报原因] ========== 获取举报原因列表 ==========');

        // 尝试从 ReportReasonConfig 获取动态配置
        try {
            const ReportReasonConfig = require('../models/ReportReasonConfig');
            const reasons = await ReportReasonConfig.find({ isActive: true })
                .sort({ sortOrder: 1 })
                .lean();

            if (reasons && reasons.length > 0) {
                console.log('[举报原因] 从配置获取，数量:', reasons.length);
                return res.json({
                    success: true,
                    data: reasons.map(r => ({
                        value: r.reasonKey,
                        label: r.label,
                        description: r.description,
                        weight: r.weight
                    }))
                });
            }
        } catch (e) {
            console.log('[举报原因] ReportReasonConfig 不可用，使用默认列表');
        }

        // 回退到默认静态列表
        const defaultReasons = [
            { value: 'insult_attack', label: '辱骂攻击', description: '包含人身攻击、侮辱性言论', weight: 7 },
            { value: 'ad_spam', label: '广告骚扰', description: '发布无关广告或垃圾信息', weight: 6 },
            { value: 'porn_violence', label: '色情暴力', description: '包含色情、暴力等违规内容', weight: 9 },
            { value: 'other', label: '其他', description: '其他违规行为', weight: 3 }
        ];

        console.log('[举报原因] 使用默认列表，数量:', defaultReasons.length);
        console.log('[举报原因] ========== 获取完成 ==========');

        res.json({
            success: true,
            data: defaultReasons
        });
    } catch (error) {
        console.error('[举报原因] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

/**
 * 申诉评论
 * 仅被举报评论的作者可申诉，评论状态必须为 'hidden' 或 'deleted'
 * 处罚时间需在7天内，且未提交过申诉
 *
 * @route POST /api/comments/:id/appeal
 * @access 已登录用户（仅评论作者）
 */
exports.appealComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { appealReason } = req.body;
        const userUUID = req.user.userUUID;

        console.log('[评论申诉] ========== 开始处理 ==========');
        console.log('[评论申诉] 参数:', { commentId: id, userUUID, appealReasonLength: appealReason?.length });

        // ========== 1. 参数校验 ==========
        if (!appealReason || appealReason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '申诉理由不能为空'
            });
        }

        if (appealReason.length > 500) {
            return res.status(400).json({
                success: false,
                message: '申诉理由不能超过500字'
            });
        }

        // ========== 2. 查找评论 ==========
        const comment = await Comment.findById(id);
        if (!comment) {
            console.log('[评论申诉] 评论不存在:', id);
            return res.status(404).json({
                success: false,
                message: '评论不存在'
            });
        }

        // ========== 3. 权限验证：仅评论作者可申诉 ==========
        if (comment.authorUUID !== userUUID) {
            console.log('[评论申诉] 非评论作者:', { authorUUID: comment.authorUUID, userUUID });
            return res.status(403).json({
                success: false,
                message: '只能申诉自己的评论'
            });
        }

        // ========== 4. 检查评论状态是否可申诉 ==========
        if (!['hidden', 'deleted'].includes(comment.status)) {
            console.log('[评论申诉] 评论状态不可申诉:', comment.status);
            return res.status(400).json({
                success: false,
                message: `当前评论状态为"${comment.status}"，无法申诉。仅被隐藏或删除的评论可申诉`
            });
        }

        // ========== 5. 检查是否已有申诉 ==========
        if (comment.appealStatus !== 'none') {
            console.log('[评论申诉] 已有申诉记录:', comment.appealStatus);
            return res.status(400).json({
                success: false,
                message: comment.appealStatus === 'pending'
                    ? '申诉正在处理中，请耐心等待'
                    : `申诉已${comment.appealStatus === 'upheld' ? '维持原判' : '撤销违规'}，无法重复申诉`
            });
        }

        // ========== 6. 检查处罚时间是否在7天内 ==========
        if (comment.reviewedAt) {
            const daysSinceReview = (Date.now() - new Date(comment.reviewedAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceReview > 7) {
                console.log('[评论申诉] 超过申诉期限:', { daysSinceReview });
                return res.status(400).json({
                    success: false,
                    message: '申诉期限已过（处罚后7天内可申诉）'
                });
            }
        }

        // ========== 7. 更新评论申诉状态 ==========
        comment.appealStatus = 'pending';
        comment.appealReason = appealReason.trim();
        comment.appealSubmittedAt = new Date();
        comment.status = 'appealing'; // 更新评论状态为申诉中
        await comment.save();

        console.log('[评论申诉] 评论申诉状态已更新:', {
            commentId: id,
            appealStatus: comment.appealStatus,
            newStatus: comment.status
        });

        // ========== 8. 更新关联的举报工单状态为申诉中 ==========
        const updateResult = await CommentReport.updateMany(
            {
                commentId: id,
                status: { $in: ['processed'] } // 只更新已处理的工单
            },
            {
                $set: {
                    status: 'appealing'
                }
            }
        );

        console.log('[评论申诉] 关联工单更新:', {
            matchedCount: updateResult.matchedCount,
            modifiedCount: updateResult.modifiedCount
        });

        // ========== 9. 发送"申诉已提交"通知给申诉用户 ==========
        try {
            const Conversation = require('../models/Conversation');
            const Message = require('../models/Message');
            const io = req.app.get('io');
            const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

            const notificationContent = JSON.stringify({
                type: 'appeal_submitted',
                commentId: id,
                content: comment.content.slice(0, 80),
                appealReason: appealReason.trim().slice(0, 100),
                appealSubmittedAt: new Date().toISOString(),
                notifiedAt: new Date().toISOString()
            });

            const conversation = await Conversation.findOrCreate(
                SYSTEM_USER_UUID,
                userUUID
            );

            const message = await Message.create({
                conversationId: conversation._id,
                senderUUID: SYSTEM_USER_UUID,
                receiverUUID: userUUID,
                content: notificationContent,
                type: 'text',
                metadata: {
                    action: 'appeal_submitted',
                    commentId: comment._id
                }
            });

            conversation.lastMessage = {
                content: `【系统通知】申诉已提交，管理员将重新审核您的评论`,
                senderUUID: SYSTEM_USER_UUID,
                sentAt: new Date()
            };
            const unreadMap = conversation.unreadCount instanceof Map
                ? conversation.unreadCount
                : new Map(Object.entries(conversation.unreadCount || {}));
            const currentCount = unreadMap.get(userUUID) || 0;
            unreadMap.set(userUUID, currentCount + 1);
            conversation.unreadCount = unreadMap;
            conversation.updatedAt = new Date();
            await conversation.save();

            if (io) {
                io.to(userUUID).emit('new_message', {
                    message: message.toObject(),
                    conversationId: conversation._id.toString()
                });
                console.log('[评论申诉] 申诉提交通知已推送至:', userUUID);
            }

            console.log('[评论申诉] 申诉提交通知已创建:', message._id);

            if (redis.isConnected()) {
                await redis.pDel(`chat:conversations:${userUUID}`);
                console.log('[缓存] 申诉提交通知：已清除申诉用户会话缓存');
            }

        } catch (notifyError) {
            console.error('[评论申诉] 申诉提交通知发送失败（不阻塞主流程）:', notifyError.message);
        }

        console.log('[评论申诉] ========== 处理完成 ==========');

        res.json({
            success: true,
            message: '申诉已提交，管理员将重新审核您的评论',
            data: {
                appealStatus: comment.appealStatus,
                appealSubmittedAt: comment.appealSubmittedAt
            }
        });

    } catch (error) {
        console.error('[评论申诉] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};