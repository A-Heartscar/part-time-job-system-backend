// models/Comment.js
// ========== 评论模型 ==========
// 存储用户对岗位的评价及回复，支持嵌套回复结构
const mongoose = require('mongoose');

/**
 * 评论 Schema
 * 采用 parentId + rootId 实现两级嵌套回复
 * parentId = null 表示主评论
 * parentId 不为 null 表示回复，rootId 指向根评论
 */
const CommentSchema = new mongoose.Schema({
    // ========== 关联信息 ==========
    // 关联的岗位ID
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: [true, '岗位ID不能为空'],
        index: true
    },

    // 父评论ID（null = 主评论，非null = 子回复）
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },

    // 根评论ID（所有回复都指向主评论，便于查询完整回复树）
    rootId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },

    // ========== 用户信息 ==========
    // 评论者UUID
    authorUUID: {
        type: String,
        required: [true, '评论者UUID不能为空'],
        index: true
    },

    // 评论者角色（用于雇主标识展示）
    authorRole: {
        type: String,
        enum: ['student', 'employer'],
        required: [true, '评论者角色不能为空']
    },

    // ========== 评论内容 ==========
    // 评论内容（1-500字）
    content: {
        type: String,
        required: [true, '评论内容不能为空'],
        trim: true,
        minlength: [1, '评论内容至少1个字符'],
        maxlength: [500, '评论内容不能超过500个字符']
    },

    // 被回复者UUID（回复时记录）
    replyToUUID: {
        type: String,
        default: ''
    },

    // 被回复者昵称（前端展示"回复@昵称"使用）
    replyToName: {
        type: String,
        default: ''
    },

    // ========== 状态标记 ==========
    // 是否已编辑
    isEdited: {
        type: Boolean,
        default: false
    },

    // 编辑时间
    editedAt: {
        type: Date,
        default: null
    },

    // 是否置顶（仅主评论可置顶）
    isPinned: {
        type: Boolean,
        default: false,
        index: true
    },

    // 置顶时间
    pinnedAt: {
        type: Date,
        default: null
    },

    // 置顶操作者UUID
    pinnedBy: {
        type: String,
        default: ''
    },

    // 是否被隐藏（审核违规或管理员操作）
    isHidden: {
        type: Boolean,
        default: false
    },

    // 隐藏原因
    hiddenReason: {
        type: String,
        default: ''
    },

    // 软删除标记
    isDeleted: {
        type: Boolean,
        default: false
    },

    // ========== 评论状态（统一管理 isHidden/isDeleted） ==========
    // 状态说明：
    //   normal: 正常显示
    //   pending_review: 待人工审核（预留）
    //   auto_hidden: 自动审核隐藏（阈值触发）
    //   hidden: 管理员隐藏（违规属实）
    //   deleted: 管理员删除（严重违规）
    //   appealing: 申诉中
    status: {
        type: String,
        enum: ['normal', 'pending_review', 'auto_hidden', 'hidden', 'deleted', 'appealing'],
        default: 'normal',
        index: true
    },

    // ========== 违规等级 ==========
    violationLevel: {
        type: String,
        enum: ['none', 'minor', 'moderate', 'severe'],
        default: 'none'
    },

    // ========== 审核管理员UUID ==========
    reviewedBy: {
        type: String,
        default: ''
    },

    // ========== 审核时间 ==========
    reviewedAt: {
        type: Date,
        default: null
    },

    // ========== 申诉理由 ==========
    appealReason: {
        type: String,
        default: ''
    },

    // ========== 申诉提交时间 ==========
    appealSubmittedAt: {
        type: Date,
        default: null
    },

    // ========== 申诉状态 ==========
    appealStatus: {
        type: String,
        enum: ['none', 'pending', 'upheld', 'overturned'],
        default: 'none'
    },

    // ========== 举报聚合字段（性能优化，避免频繁 count 查询） ==========
    reportSummary: {
        totalReports: { type: Number, default: 0 },
        uniqueReporters: { type: Number, default: 0 },
        reasonBreakdown: {
            insult_attack: { type: Number, default: 0 },
            ad_spam: { type: Number, default: 0 },
            porn_violence: { type: Number, default: 0 },
            other: { type: Number, default: 0 }
        },
        lastReportedAt: { type: Date, default: null },
        isUnderReview: { type: Boolean, default: false }
    },

    // ========== 计数统计（冗余存储，避免频繁 count 查询） ==========
    // 点赞数
    likeCount: {
        type: Number,
        default: 0
    },

    // 子回复数
    replyCount: {
        type: Number,
        default: 0
    },

    // 被举报次数
    reportedCount: {
        type: Number,
        default: 0
    },

    // ========== @提及用户列表（用于通知） ==========
    // 被@的用户UUID数组
    mentionedUsers: [{
        type: String
    }]

}, {
    timestamps: true // 自动添加 createdAt 和 updatedAt
});

// ========== 索引配置 ==========
// 按岗位+时间排序（默认排序）
CommentSchema.index(
    { jobId: 1, createdAt: -1 },
    { name: 'idx_job_time' }
);

// 按岗位+置顶优先+时间排序
CommentSchema.index(
    { jobId: 1, isPinned: -1, createdAt: -1 },
    { name: 'idx_job_pinned_time' }
);

// 按岗位+点赞数排序（热度排序）
CommentSchema.index(
    { jobId: 1, likeCount: -1 },
    { name: 'idx_job_likes' }
);

// 按根评论ID+时间排序（查询子回复）
CommentSchema.index(
    { rootId: 1, createdAt: 1 },
    { name: 'idx_root_time' }
);

// ========== 静态方法 ==========

/**
 * 获取岗位的评论列表（含分页和排序）
 * @param {string} jobId - 岗位ID
 * @param {Object} options - 查询选项
 * @param {number} options.page - 页码
 * @param {number} options.limit - 每页条数
 * @param {string} options.sort - 排序方式：'time' | 'hot'
 * @returns {Object} 评论列表 + 分页信息
 */
CommentSchema.statics.getCommentsByJob = async function(jobId, options = {}) {
    const { page = 1, limit = 20, sort = 'time' } = options;

    console.log('[评论查询] 查询岗位评论:', { jobId, page, limit, sort });

    // 构建查询条件（仅查主评论，排除已删除和已隐藏的）
    const query = {
        jobId: new mongoose.Types.ObjectId(jobId),
        parentId: null,
        status: { $nin: ['hidden', 'deleted', 'auto_hidden'] }
    };

    // 排序配置
    let sortConfig = {};
    if (sort === 'hot') {
        // 热度排序：置顶优先 > 点赞数+回复数
        sortConfig = { isPinned: -1, likeCount: -1, replyCount: -1, createdAt: -1 };
    } else {
        // 时间排序：置顶优先 > 时间倒序
        sortConfig = { isPinned: -1, createdAt: -1 };
    }

    // 分页查询
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const comments = await this.find(query)
        .sort(sortConfig)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await this.countDocuments(query);

    // 查询每条主评论的子回复
    const rootIds = comments.map(c => c._id);
    const replies = await this.find({
        rootId: { $in: rootIds },
        status: { $nin: ['hidden', 'deleted', 'auto_hidden'] }
    })
        .sort({ createdAt: 1 })
        .lean();

    // 按 rootId 分组子回复
    const repliesMap = {};
    replies.forEach(reply => {
        const rootIdStr = reply.rootId.toString();
        if (!repliesMap[rootIdStr]) {
            repliesMap[rootIdStr] = [];
        }
        repliesMap[rootIdStr].push(reply);
    });

    console.log('[评论查询] 结果:', {
        total,
        returned: comments.length,
        repliesTotal: replies.length
    });

    return {
        comments,
        repliesMap,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    };
};

/**
 * 增加子回复计数
 * @param {string} commentId - 评论ID
 * @returns {Promise} 更新结果
 */
CommentSchema.statics.incrementReplyCount = async function(commentId) {
    console.log('[评论计数] 增加回复计数:', commentId);
    return this.findByIdAndUpdate(
        commentId,
        { $inc: { replyCount: 1 } },
        { new: true }
    );
};

/**
 * 增加举报计数并更新举报聚合字段
 * @param {string} commentId - 评论ID
 * @param {string} reason - 举报理由（对应 reasonBreakdown 中的 key）
 * @returns {Promise} 更新结果
 */
CommentSchema.statics.incrementReportCount = async function(commentId, reason) {
    // 构建更新对象
    const updateFields = {
        $inc: {
            'reportSummary.totalReports': 1
        },
        $set: {
            'reportSummary.lastReportedAt': new Date()
        }
    };

    // 根据举报理由增加对应分类计数
    const reasonMap = {
        'insult_attack': 'reportSummary.reasonBreakdown.insult_attack',
        'ad_spam': 'reportSummary.reasonBreakdown.ad_spam',
        'porn_violence': 'reportSummary.reasonBreakdown.porn_violence',
        'other': 'reportSummary.reasonBreakdown.other'
    };

    if (reasonMap[reason]) {
        updateFields.$inc[reasonMap[reason]] = 1;
    } else {
        // 未知理由归于 other
        updateFields.$inc['reportSummary.reasonBreakdown.other'] = 1;
    }

    // 更新评论的举报计数
    await this.findByIdAndUpdate(commentId, updateFields);

    // 重新查询该评论的所有举报记录，计算 uniqueReporters
    const CommentReport = mongoose.model('CommentReport');
    const uniqueReporterCount = await CommentReport.distinct('reporterUUID', { commentId: commentId }).then(arr => arr.length);

    // 更新 uniqueReporters
    await this.findByIdAndUpdate(commentId, {
        $set: { 'reportSummary.uniqueReporters': uniqueReporterCount }
    });

    console.log('[Comment] 举报计数更新完成:', {
        commentId,
        reason,
        uniqueReporters: uniqueReporterCount
    });
};

/**
 * 获取评论的点赞状态
 * @param {string} commentId - 评论ID
 * @param {string} userUUID - 用户UUID
 * @returns {boolean} 是否已点赞
 */
CommentSchema.statics.isLikedByUser = async function(commentId, userUUID) {
    const CommentLike = mongoose.model('CommentLike');
    const count = await CommentLike.countDocuments({ commentId, userUUID });
    return count > 0;
};

// ========== pre-save 钩子：保证 status 与 isHidden/isDeleted 双向同步 ==========
CommentSchema.pre('save', function(next) {
    // 根据 status 同步 isHidden 和 isDeleted（向后兼容）
    const statusMap = {
        'normal': { isHidden: false, isDeleted: false },
        'pending_review': { isHidden: false, isDeleted: false },
        'auto_hidden': { isHidden: true, isDeleted: false },
        'hidden': { isHidden: true, isDeleted: false },
        'deleted': { isHidden: true, isDeleted: true },
        'appealing': { isHidden: false, isDeleted: false }
    };

    const mapping = statusMap[this.status];
    if (mapping) {
        this.isHidden = mapping.isHidden;
        this.isDeleted = mapping.isDeleted;
    }
});

module.exports = mongoose.model('Comment', CommentSchema);