// models/BlockedUser.js
// ========== 屏蔽用户模型 ==========
// 记录岗位拥有者屏蔽的用户，被屏蔽用户无法在该岗位下发布评论
const mongoose = require('mongoose');

const BlockedUserSchema = new mongoose.Schema({
    // 关联的岗位ID
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: [true, '岗位ID不能为空'],
        index: true
    },

    // 被屏蔽用户UUID
    blockedUUID: {
        type: String,
        required: [true, '被屏蔽用户UUID不能为空']
    },

    // 操作者UUID（岗位拥有者）
    blockedBy: {
        type: String,
        required: [true, '操作者UUID不能为空']
    }

}, {
    timestamps: true
});

// ========== 唯一复合索引：同一岗位下不能重复屏蔽同一用户 ==========
BlockedUserSchema.index(
    { jobId: 1, blockedUUID: 1 },
    { unique: true, name: 'unique_job_blocked_user' }
);

// ========== 静态方法 ==========

/**
 * 检查用户是否被屏蔽
 * @param {string} jobId - 岗位ID
 * @param {string} userUUID - 用户UUID
 * @returns {boolean} 是否被屏蔽
 */
BlockedUserSchema.statics.isBlocked = async function(jobId, userUUID) {
    if (!jobId || !userUUID) return false;
    const count = await this.countDocuments({ jobId, blockedUUID: userUUID });
    return count > 0;
};

module.exports = mongoose.model('BlockedUser', BlockedUserSchema);