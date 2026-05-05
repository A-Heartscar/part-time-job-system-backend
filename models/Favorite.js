// ========== 岗位收藏模型 ==========
// 独立存储学生的岗位收藏，与投递记录完全解耦
const mongoose = require('mongoose');

const FavoriteSchema = new mongoose.Schema({
    // 学生UUID
    studentUUID: {
        type: String,
        required: [true, '学生UUID不能为空'],
        index: true
    },

    // 关联的岗位ID
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: [true, '岗位ID不能为空'],
        index: true
    },

    // 收藏备注（可选）
    notes: {
        type: String,
        trim: true,
        maxlength: [200, '备注不能超过200个字符'],
        default: ''
    }

}, { timestamps: true });

// ========== 复合唯一索引：同一学生不能重复收藏同一岗位 ==========
FavoriteSchema.index(
    { studentUUID: 1, jobId: 1 },
    { unique: true, name: 'unique_favorite_student_job' }
);

// ========== 静态方法 ==========

/**
 * 检查学生是否已收藏某岗位
 */
FavoriteSchema.statics.isFavorited = async function(studentUUID, jobId) {
    const count = await this.countDocuments({ studentUUID, jobId });
    return count > 0;
};

module.exports = mongoose.model('Favorite', FavoriteSchema);