// models/AdminLoginLog.js
// ========== 管理员登录日志模型 ==========
// 独立于普通用户系统，记录管理员每次登录的详细信息
const mongoose = require('mongoose');

const AdminLoginLogSchema = new mongoose.Schema({
    // 管理员 UUID
    adminUUID: {
        type: String,
        required: true,
        index: true
    },

    // 管理员用户名（冗余存储，便于快速查看）
    username: {
        type: String,
        required: true
    },

    // 登录IP地址
    ip: {
        type: String,
        default: ''
    },

    // 浏览器 User-Agent
    userAgent: {
        type: String,
        default: ''
    },

    // 登录结果：success / failed
    result: {
        type: String,
        enum: ['success', 'failed'],
        required: true
    },

    // 登录失败原因（仅 result = 'failed' 时填写）
    failReason: {
        type: String,
        default: ''
    }

}, { timestamps: true }); // 自动添加 createdAt

// ========== 索引配置 ==========
AdminLoginLogSchema.index({ adminUUID: 1, createdAt: -1 });
AdminLoginLogSchema.index({ result: 1 });

module.exports = mongoose.model('AdminLoginLog', AdminLoginLogSchema);