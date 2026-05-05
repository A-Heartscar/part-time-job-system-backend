// ========== 投递记录模型 ==========
// 用于记录学生投递岗位的完整生命周期
const mongoose = require('mongoose');

/**
 * 投递记录 Schema
 * 独立存储每次投递，支持状态流转和历史追踪
 */
const ApplicationSchema = new mongoose.Schema({
    // ========== 关联信息 ==========
    // 关联的岗位ID（引用Job模型）
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: [true, '岗位ID不能为空'],
        index: true  // 建立索引，加速按岗位查询
    },

    // 投递学生的UUID（与User模型中的userUUID对应）
    studentUUID: {
        type: String,
        required: [true, '学生UUID不能为空'],
        index: true  // 建立索引，加速按学生查询
    },

    // 雇主的UUID（冗余存储，避免每次查询都关联Job表）
    employerUUID: {
        type: String,
        required: [true, '雇主UUID不能为空'],
        index: true
    },

    // 使用的简历ID（一个学生可能有多个版本简历）
    resumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume',
        required: [true, '简历ID不能为空']
    },

    // ========== 投递状态 ==========
    /**
     * 状态流转说明：
     * pending   → 待处理（学生刚投递，雇主未查看）
     * reviewing → 雇主已查看（雇主点击查看简历后自动变更）
     * interviewed → 面试中（雇主标记进入面试环节）
     * interview_completed → 面试完成（等待雇主决策）
     * accepted → 已录用（雇主确认录用）
     * rejected → 不合适（雇主拒绝）
     * withdrawn → 已撤回（学生在pending状态下主动撤回）
     */
    status: {
        type: String,
        enum: ['pending', 'reviewing', 'interviewed', 'interview_completed', 'accepted', 'rejected', 'withdrawn', 'completed'],
        default: 'pending',
        index: true
    },

    // ========== 投递内容 ==========
    // 求职信（可选，学生投递时填写）
    coverLetter: {
        type: String,
        trim: true,
        maxlength: [1000, '求职信不能超过1000个字符']
    },

    // 雇主备注（雇主查看时添加的内部备注）
    employerNotes: {
        type: String,
        trim: true,
        maxlength: [500, '备注不能超过500个字符']
    },

    // ========== 时间追踪 ==========
    // 投递时间
    submittedAt: {
        type: Date,
        default: Date.now
    },

    // 雇主首次查看时间
    reviewedAt: {
        type: Date,
        default: null
    },

    // 面试完成时间
    interviewCompletedAt: {
        type: Date,
        default: null
    },

    // 状态最后更新时间
    statusUpdatedAt: {
        type: Date,
        default: Date.now
    },

    // 录用/拒绝时间
    decidedAt: {
        type: Date,
        default: null
    },

    // 工作完成时间
    completedAt: {
        type: Date,
        default: null
    },
    
    // ========== 面试信息（当状态为 interviewed 时填充） ==========
    interview: {
        // 面试时间
        interviewTime: {
            type: Date,
            default: null
        },
        // 面试方式：online（线上）或 offline（线下）
        interviewType: {
            type: String,
            enum: ['online', 'offline'],
            default: 'online'
        },
        // 线下地址（仅 interviewType 为 offline 时使用）
        interviewLocation: {
            type: String,
            trim: true,
            default: ''
        }
    },

}, {
    timestamps: true  // 自动添加 createdAt 和 updatedAt
});

// ========== 索引配置 ==========
// 复合唯一索引：同一学生不能重复投递同一岗位
// 这是防止重复投递的关键约束
ApplicationSchema.index(
    { jobId: 1, studentUUID: 1 },
    { unique: true, name: 'unique_job_student' }
);

// 复合索引：雇主查询某岗位的投递列表（按状态和时间排序）
ApplicationSchema.index(
    { jobId: 1, status: 1, submittedAt: -1 },
    { name: 'idx_job_status_time' }
);

// 复合索引：学生查询自己的投递记录（按时间倒序）
ApplicationSchema.index(
    { studentUUID: 1, submittedAt: -1 },
    { name: 'idx_student_time' }
);

// ========== 实例方法 ==========

/**
 * 更新状态（自动记录时间戳）
 * @param {string} newStatus - 新状态
 * @returns {Promise} 保存结果
 */
ApplicationSchema.methods.updateStatus = async function(newStatus) {
    this.status = newStatus;
    this.statusUpdatedAt = new Date();

    // 根据状态变化记录特定时间
    if (newStatus === 'reviewing' && !this.reviewedAt) {
        this.reviewedAt = new Date();
    }
    // 面试完成时记录时间
    if (newStatus === 'interview_completed' && !this.interviewCompletedAt) {
        this.interviewCompletedAt = new Date();
    }
    if (['accepted', 'rejected'].includes(newStatus) && !this.decidedAt) {
        this.decidedAt = new Date();
    }

    // 工作完成时间
    if (newStatus === 'completed' && !this.completedAt) {
        this.completedAt = new Date();
    }

    return this.save();
};

/**
 * 标记为已查看（雇主点击简历时调用）
 * @returns {Promise} 保存结果
 */
ApplicationSchema.methods.markAsReviewed = async function() {
    if (this.status === 'pending') {
        this.status = 'reviewing';
        this.reviewedAt = new Date();
        this.statusUpdatedAt = new Date();
    }
    return this.save();
};

/**
 * 检查是否可以撤回
 * @returns {boolean} 是否可撤回
 */
ApplicationSchema.methods.canWithdraw = function() {
    // 只有待处理状态可以撤回
    return this.status === 'pending';
};

/**
 * 检查是否可以标记为面试完成
 * 仅有「面试中」状态可以标记为面试完成
 * @returns {boolean} 是否可标记
 */
ApplicationSchema.methods.canMarkCompleted = function() {
    return this.status === 'interviewed';
};

// ========== 静态方法 ==========

/**
 * 检查学生是否已投递某岗位
 * @param {string} jobId - 岗位ID
 * @param {string} studentUUID - 学生UUID
 * @returns {Promise<boolean>} 是否已投递
 */
ApplicationSchema.statics.hasApplied = async function(jobId, studentUUID) {
    const count = await this.countDocuments({ jobId, studentUUID });
    return count > 0;
};

/**
 * 获取岗位的投递统计
 * @param {string} jobId - 岗位ID
 * @returns {Promise<Object>} 统计数据
 */
ApplicationSchema.statics.getJobStats = async function(jobId) {
    const result = await this.aggregate([
        { $match: { jobId: new mongoose.Types.ObjectId(jobId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const stats = {
        total: 0,
        pending: 0,
        reviewing: 0,
        interviewed: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0
    };

    result.forEach(item => {
        stats[item._id] = item.count;
        stats.total += item.count;
    });

    return stats;
};

module.exports = mongoose.model('Application', ApplicationSchema);