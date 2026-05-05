// models/UserViolationRecord.js
// ========== 用户违规记录模型 ==========
// 每个用户仅一条文档，聚合所有违规行为，用于用户画像和行为限制
const mongoose = require('mongoose');

const UserViolationRecordSchema = new mongoose.Schema({
    // 用户UUID（全局唯一，每个用户仅一条）
    userUUID: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // 累计扣分总分
    totalScore: {
        type: Number,
        default: 0
    },

    // 总违规次数
    violationCount: {
        type: Number,
        default: 0
    },

    // 最近一次违规时间
    lastViolationAt: {
        type: Date,
        default: null
    },

    // 禁言截止时间（null 表示未禁言）
    commentBanUntil: {
        type: Date,
        default: null
    },

    // 封禁账号截止时间（null 表示未封禁）
    accountBanUntil: {
        type: Date,
        default: null
    },

    // 账号状态：normal=正常, banned=已封禁
    accountStatus: {
        type: String,
        enum: ['normal', 'banned'],
        default: 'normal'
    },

    // 恶意举报计数（被驳回的举报次数）
    falseReportCount: {
        type: Number,
        default: 0
    },

    // 举报权重（0-1，恶意举报次数越多权重越低）
    reportWeight: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1.0
    },

    // 举报限制截止时间（null 表示无限制）
    reportBanUntil: {
        type: Date,
        default: null
    },

    // 举报限制原因
    reportBanReason: {
        type: String,
        default: ''
    }

}, { timestamps: true });

// ========== 索引配置 ==========
UserViolationRecordSchema.index({ accountStatus: 1 });
UserViolationRecordSchema.index({ reportWeight: 1 });

// ========== 静态方法 ==========

/**
 * 查找或自动创建用户的违规记录
 * @param {string} userUUID - 用户UUID
 * @returns {Promise<Object>} 违规记录文档
 */
UserViolationRecordSchema.statics.getOrCreate = async function(userUUID) {
    console.log('[UserViolationRecord] getOrCreate:', userUUID);

    let record = await this.findOne({ userUUID });

    if (!record) {
        console.log('[UserViolationRecord] 记录不存在，自动创建');
        record = await this.create({
            userUUID,
            totalScore: 0,
            violationCount: 0,
            reportWeight: 1.0
        });
    }

    return record;
};

module.exports = mongoose.model('UserViolationRecord', UserViolationRecordSchema);