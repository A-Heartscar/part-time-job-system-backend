// models/ReportReasonConfig.js
// ========== 举报原因配置模型 ==========
// 管理员可动态配置举报原因的类型、权重、自动阈值等
const mongoose = require('mongoose');

const ReportReasonConfigSchema = new mongoose.Schema({
    // 唯一标识键（如 'politics', 'porn', 'ad', 'insult' 等）
    reasonKey: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    // 显示标签（如 "涉政敏感"）
    label: {
        type: String,
        required: [true, '标签名不能为空'],
        trim: true
    },

    // 描述说明
    description: {
        type: String,
        default: ''
    },

    // 权重（1-10，影响自动审核阈值和审核排序）
    weight: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
    },

    // 自动触发阈值（该原因累计举报数达到此值时自动隐藏评论）
    autoThreshold: {
        type: Number,
        default: 5,
        min: 1
    },

    // 是否启用
    isActive: {
        type: Boolean,
        default: true
    },

    // 排序序号
    sortOrder: {
        type: Number,
        default: 0
    },

    // 创建者adminUUID
    createdBy: {
        type: String,
        default: ''
    }

}, { timestamps: true });

// ========== 索引配置 ==========
ReportReasonConfigSchema.index({ isActive: 1, sortOrder: 1 });
ReportReasonConfigSchema.index({ reasonKey: 1 });

module.exports = mongoose.model('ReportReasonConfig', ReportReasonConfigSchema);