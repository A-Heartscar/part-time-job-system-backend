// models/CommentReport.js
// ========== 评论举报记录模型 ==========
// 存储用户对违规评论的举报信息，预留审核流程
const mongoose = require('mongoose');

const CommentReportSchema = new mongoose.Schema({
    // 被举报的评论ID
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        required: [true, '评论ID不能为空'],
        index: true
    },

    // 举报者UUID
    reporterUUID: {
        type: String,
        required: [true, '举报者UUID不能为空']
    },

    // 举报理由（枚举值）
    reason: {
        type: String,
        required: [true, '举报理由不能为空'],
        enum: ['insult_attack', 'ad_spam', 'porn_violence', 'other']
    },

    // ========== 处理状态枚举 ==========
    // pending: 待审核 | in_review: 审核中(已被认领) | processed: 已处理(违规属实)
    // dismissed: 已驳回 | appealing: 申诉中 | appeal_upheld: 申诉维持原判 | appeal_overturned: 申诉撤销违规
    status: {
        type: String,
        enum: ['pending', 'in_review', 'processed', 'dismissed', 'appealing', 'appeal_upheld', 'appeal_overturned'],
        default: 'pending',
        index: true
    },

    // ========== 举报详情字段 ==========
    // 举报者填写的备注
    reportNotes: {
        type: String,
        default: ''
    },

    // 举报者上传的截图URL数组（最多3张）
    evidenceUrls: {
        type: [String],
        default: [],
        validate: {
            validator: function(arr) {
                return arr.length <= 3;
            },
            message: '截图数量不能超过3张'
        }
    },

    // ========== 审核处理字段 ==========
    // 处理结果描述
    processingResult: {
        type: String,
        default: ''
    },

    // 违规等级
    violationLevel: {
        type: String,
        enum: ['none', 'minor', 'moderate', 'severe'],
        default: 'none'
    },

    // 是否自动处理
    autoProcessed: {
        type: Boolean,
        default: false
    },

    // 命中的自动审核规则名称
    autoProcessRule: {
        type: String,
        default: ''
    },

    // ========== 审核员认领字段 ==========
    // 认领管理员UUID
    claimedBy: {
        type: String,
        default: null,
        index: true
    },

    // 认领时间
    claimedAt: {
        type: Date,
        default: null
    },

    // 认领锁定过期时间（认领后30分钟自动释放）
    lockExpireAt: {
        type: Date,
        default: null
    },

    // ========== 举报权重快照 ==========
    // 举报时的用户权重（用于审核排序优先级）
    reporterWeight: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1.0
    },

    // 审核者UUID（预留管理员功能）
    reviewerUUID: {
        type: String,
        default: ''
    },

    // 审核备注
    reviewNotes: {
        type: String,
        default: ''
    },

    // 审核时间
    reviewedAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

// ========== 唯一复合索引：一人对一条评论只能举报一次 ==========
CommentReportSchema.index(
    { commentId: 1, reporterUUID: 1 },
    { unique: true, name: 'unique_comment_user_report' }
);

// 按评论ID + 状态 + 创建时间查询（审核列表常用）
CommentReportSchema.index(
    { commentId: 1, status: 1, createdAt: -1 },
    { name: 'idx_comment_status_time' }
);

// 认领锁查询索引
CommentReportSchema.index(
    { claimedBy: 1, lockExpireAt: 1 },
    { name: 'idx_claimed_lock' }
);

module.exports = mongoose.model('CommentReport', CommentReportSchema);