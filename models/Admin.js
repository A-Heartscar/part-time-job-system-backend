// models/Admin.js
// ========== 管理员模型 ==========
// 独立于 User 模型，管理员和普通用户系统完全隔离
// 不继承、不复用 User 的任何字段或方法
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
    // ========== 基本信息 ==========
    // 管理员唯一标识（UUIDv4）
    adminUUID: {
        type: String,
        required: true,
        unique: true,
        default: () => uuidv4()
    },

    // 用户名（登录凭证，全局唯一）
    username: {
        type: String,
        required: [true, '用户名不能为空'],
        unique: true,
        trim: true,
        minlength: [3, '用户名至少3位'],
        maxlength: [20, '用户名最多20位']
    },

    // 密码（bcrypt加密，查询时默认排除）
    password: {
        type: String,
        required: [true, '密码不能为空'],
        select: false,
        trim: true
    },

    // 真实姓名
    realName: {
        type: String,
        required: [true, '真实姓名不能为空'],
        trim: true
    },

    // 角色：super_admin（超级管理员）/ admin（普通管理员）
    role: {
        type: String,
        enum: ['super_admin', 'admin'],
        default: 'admin'
    },

    // 邮箱
    email: {
        type: String,
        required: [true, '邮箱不能为空'],
        trim: true,
        lowercase: true
    },

    // 头像URL
    avatar: {
        type: String,
        default: ''
    },

    // ========== 状态管理 ==========
    // 账号状态：active（正常）/ disabled（已禁用）
    status: {
        type: String,
        enum: ['active', 'disabled'],
        default: 'active'
    },

    // 创建者 UUID（记录由谁创建，super_admin 可为 null）
    createdBy: {
        type: String,
        default: null
    },

    // ========== 登录信息 ==========
    // 最后登录时间
    lastLoginAt: {
        type: Date,
        default: null
    },

    // 最后登录IP
    lastLoginIP: {
        type: String,
        default: ''
    }

}, { timestamps: true }); // 自动添加 createdAt/updatedAt

// ========== 索引配置 ==========
AdminSchema.index({ role: 1, status: 1 });

// ========== 实例方法 ==========

/**
 * 校验密码
 * @param {string} candidatePassword - 待校验的密码
 * @returns {Promise<boolean>} 密码是否正确
 */
AdminSchema.methods.comparePassword = async function(candidatePassword) {
    console.log('[Admin] 校验密码:', this.username);
    return bcrypt.compare(candidatePassword, this.password);
};

// ========== 静态方法 ==========

/**
 * 检查用户名是否已存在
 * @param {string} username - 待检查的用户名
 * @returns {Promise<boolean>} 是否已存在
 */
AdminSchema.statics.isUsernameTaken = async function(username) {
    const count = await this.countDocuments({ username: username.trim() });
    return count > 0;
};

module.exports = mongoose.model('Admin', AdminSchema);