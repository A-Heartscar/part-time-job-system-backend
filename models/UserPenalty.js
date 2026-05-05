// models/UserPenalty.js
// ========== 用户处罚记录模型 ==========
// 记录管理员对违规用户的所有处罚操作，与 UserViolationRecord 配合使用
const mongoose = require('mongoose');

const UserPenaltySchema = new mongoose.Schema({
    // 被处罚用户UUID
    userUUID: {
        type: String,
        required: true,
        index: true
    },

    // 处罚类型：warning=警告, score_deduct=扣分, comment_ban=禁言, account_ban=封禁账号
    type: {
        type: String,
        enum: ['warning', 'score_deduct', 'comment_ban', 'account_ban'],
        required: true
    },

    // 处罚等级：minor=轻微, moderate=一般, severe=严重
    level: {
        type: String,
        enum: ['minor', 'moderate', 'severe'],
        required: true
    },

    // 处罚原因描述
    reason: {
        type: String,
        required: [true, '处罚原因不能为空']
    },

    // 处罚持续时间（天数，永久为 -1）
    duration: {
        type: Number,
        required: true,
        default: 0
    },

    // 处罚开始时间
    startAt: {
        type: Date,
        default: Date.now
    },

    // 处罚结束时间（永久处罚时为 null）
    endAt: {
        type: Date,
        default: null
    },

    // 关联的评论ID
    relatedCommentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },

    // 关联的举报工单ID
    relatedReportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommentReport',
        default: null
    },

    // 审核管理员UUID
    reviewedBy: {
        type: String,
        default: ''
    },

    // 处罚状态：active=生效中, expired=已过期, revoked=已撤销
    status: {
        type: String,
        enum: ['active', 'expired', 'revoked'],
        default: 'active'
    },

    // 撤销操作者UUID
    revokedBy: {
        type: String,
        default: ''
    },

    // 撤销时间
    revokedAt: {
        type: Date,
        default: null
    },

    // 撤销原因
    revokeReason: {
        type: String,
        default: ''
    }

}, { timestamps: true });

// ========== 索引配置 ==========
UserPenaltySchema.index({ userUUID: 1, createdAt: -1 });
UserPenaltySchema.index({ status: 1, endAt: 1 });
UserPenaltySchema.index({ relatedCommentId: 1 });

module.exports = mongoose.model('UserPenalty', UserPenaltySchema);