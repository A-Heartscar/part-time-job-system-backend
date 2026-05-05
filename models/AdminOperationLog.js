// models/AdminOperationLog.js
// ========== 管理员操作日志模型 ==========
// 记录管理员的所有业务操作（审核、创建、修改等）
const mongoose = require('mongoose');

const AdminOperationLogSchema = new mongoose.Schema({
    // 操作者 UUID
    adminUUID: {
        type: String,
        required: true,
        index: true
    },

    // 操作者用户名（冗余存储）
    username: {
        type: String,
        required: true
    },

    // 操作类型（如 'create_admin', 'verify_internship', 'verify_employer' 等）
    action: {
        type: String,
        required: true
    },

    // 操作目标类型（如 'admin', 'internship', 'employer', 'resume'）
    targetType: {
        type: String,
        required: true
    },

    // 操作目标 UUID
    targetUUID: {
        type: String,
        default: ''
    },

    // 操作详情（可读文本或 JSON 字符串）
    detail: {
        type: String,
        default: ''
    },

    // 操作者 IP
    ip: {
        type: String,
        default: ''
    }

}, { timestamps: true }); // 自动添加 createdAt

// ========== 索引配置 ==========
AdminOperationLogSchema.index({ adminUUID: 1, createdAt: -1 });
AdminOperationLogSchema.index({ action: 1 });
AdminOperationLogSchema.index({ targetType: 1, targetUUID: 1 });

module.exports = mongoose.model('AdminOperationLog', AdminOperationLogSchema);