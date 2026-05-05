// models/UserPreference.js
// ========== 用户偏好设置模型 ==========
// 存储学生对匹配算法的权重偏好

const mongoose = require('mongoose');

/**
 * 权重配置子文档
 * 存储归一化后的权重值（0-1之间，总和为1）
 */
const WeightConfigSchema = new mongoose.Schema({
    // 主维度权重
    dimensions: {
        skills: { type: Number, default: 0.25, min: 0, max: 1 },
        experience: { type: Number, default: 0.20, min: 0, max: 1 },
        qualities: { type: Number, default: 0.10, min: 0, max: 1 },
        time: { type: Number, default: 0.20, min: 0, max: 1 },
        salary: { type: Number, default: 0.10, min: 0, max: 1 },
        location: { type: Number, default: 0.10, min: 0, max: 1 },
        materials: { type: Number, default: 0.05, min: 0, max: 1 }
    },

    // 技能子维度权重
    skillSubWeights: {
        technical: { type: Number, default: 0.50 },
        language: { type: Number, default: 0.20 },
        soft: { type: Number, default: 0.20 },
        certification: { type: Number, default: 0.10 }
    },

    // 经历子维度权重
    experienceSubWeights: {
        project: { type: Number, default: 0.35 },
        internship: { type: Number, default: 0.40 },
        campus: { type: Number, default: 0.15 },
        academic: { type: Number, default: 0.10 }
    },

    // 素质子维度权重
    qualitySubWeights: {
        teamwork: { type: Number, default: 0.15 },
        communication: { type: Number, default: 0.20 },
        initiative: { type: Number, default: 0.15 },
        reliability: { type: Number, default: 0.20 },
        adaptability: { type: Number, default: 0.10 },
        leadership: { type: Number, default: 0.10 },
        learningAbility: { type: Number, default: 0.10 }
    },

    // 时间子维度权重
    timeSubWeights: {
        hoursMatch: { type: Number, default: 0.30 },
        timeSlotOverlap: { type: Number, default: 0.35 },
        weekendEvening: { type: Number, default: 0.15 },
        flexibility: { type: Number, default: 0.10 },
        emergency: { type: Number, default: 0.10 }
    },

    // 薪资子维度权重
    salarySubWeights: {
        rateMatch: { type: Number, default: 0.60 },
        negotiable: { type: Number, default: 0.20 },
        benefits: { type: Number, default: 0.20 }
    },

    // 地点子维度权重
    locationSubWeights: {
        commuteTime: { type: Number, default: 0.50 },
        remoteHybrid: { type: Number, default: 0.30 },
        onCampus: { type: Number, default: 0.20 }
    },

    // 材料子维度权重
    materialSubWeights: {
        required: { type: Number, default: 0.60 },
        count: { type: Number, default: 0.25 },
        verification: { type: Number, default: 0.15 }
    }
}, { _id: false });

/**
 * 原始喜好度评分（1-10分）
 * 用于前端展示和重新计算
 */
const RawPreferenceSchema = new mongoose.Schema({
    dimensions: {
        skills: { type: Number, default: 5, min: 1, max: 10 },
        experience: { type: Number, default: 5, min: 1, max: 10 },
        qualities: { type: Number, default: 5, min: 1, max: 10 },
        time: { type: Number, default: 5, min: 1, max: 10 },
        salary: { type: Number, default: 5, min: 1, max: 10 },
        location: { type: Number, default: 5, min: 1, max: 10 },
        materials: { type: Number, default: 5, min: 1, max: 10 }
    },
    // 子维度原始评分（可选，高级模式使用）
    skillSubScores: {
        technical: { type: Number, default: 5 },
        language: { type: Number, default: 5 },
        soft: { type: Number, default: 5 },
        certification: { type: Number, default: 5 }
    },
    experienceSubScores: {
        project: { type: Number, default: 5 },
        internship: { type: Number, default: 5 },
        campus: { type: Number, default: 5 },
        academic: { type: Number, default: 5 }
    },
    qualitySubScores: {
        teamwork: { type: Number, default: 5 },
        communication: { type: Number, default: 5 },
        initiative: { type: Number, default: 5 },
        reliability: { type: Number, default: 5 },
        adaptability: { type: Number, default: 5 },
        leadership: { type: Number, default: 5 },
        learningAbility: { type: Number, default: 5 }
    },
    timeSubScores: {
        hoursMatch: { type: Number, default: 5 },
        timeSlotOverlap: { type: Number, default: 5 },
        weekendEvening: { type: Number, default: 5 },
        flexibility: { type: Number, default: 5 },
        emergency: { type: Number, default: 5 }
    },
    salarySubScores: {
        rateMatch: { type: Number, default: 5 },
        negotiable: { type: Number, default: 5 },
        benefits: { type: Number, default: 5 }
    },
    locationSubScores: {
        commuteTime: { type: Number, default: 5 },
        remoteHybrid: { type: Number, default: 5 },
        onCampus: { type: Number, default: 5 }
    },
    materialSubScores: {
        required: { type: Number, default: 5 },
        count: { type: Number, default: 5 },
        verification: { type: Number, default: 5 }
    }
}, { _id: false });

/**
 * 用户偏好主Schema
 */
const UserPreferenceSchema = new mongoose.Schema({
    userUUID: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    userType: {
        type: String,
        enum: ['student', 'employer'],
        required: true
    },

    // 偏好模式：'simple' 普通模式，'advanced' 高级模式
    mode: {
        type: String,
        enum: ['simple', 'advanced'],
        default: 'simple'
    },

    // 原始喜好度评分（1-10分）
    rawPreferences: {
        type: RawPreferenceSchema,
        default: () => ({})
    },

    // 归一化后的权重（可直接用于匹配算法）
    weights: {
        type: WeightConfigSchema,
        default: () => ({})
    },

    // 是否启用自定义权重
    enabled: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

// ========== 实例方法 ==========

/**
 * 根据原始评分计算归一化权重
 * @param {string} mode - 'simple' 或 'advanced'
 * @returns {Object} 归一化后的权重配置
 */
UserPreferenceSchema.methods.calculateWeights = function(mode = null) {
    const calcMode = mode || this.mode;
    const raw = this.rawPreferences;

    console.log('[偏好计算] 开始计算权重:', {
        userUUID: this.userUUID,
        userType: this.userType,
        mode: calcMode
    });

    const weights = {
        dimensions: {},
        skillSubWeights: {},
        experienceSubWeights: {},
        qualitySubWeights: {},
        timeSubWeights: {},
        salarySubWeights: {},
        locationSubWeights: {},
        materialSubWeights: {}
    };

    if (calcMode === 'simple') {
        // ========== 普通模式：只根据主维度评分计算 ==========
        // 主维度归一化
        const dimSum = Object.values(raw.dimensions).reduce((a, b) => a + b, 0);
        Object.keys(raw.dimensions).forEach(key => {
            weights.dimensions[key] = raw.dimensions[key] / dimSum;
        });

        // 子维度使用默认权重
        weights.skillSubWeights = { technical: 0.50, language: 0.20, soft: 0.20, certification: 0.10 };
        weights.experienceSubWeights = { project: 0.35, internship: 0.40, campus: 0.15, academic: 0.10 };
        weights.qualitySubWeights = { teamwork: 0.15, communication: 0.20, initiative: 0.15, reliability: 0.20, adaptability: 0.10, leadership: 0.10, learningAbility: 0.10 };
        weights.timeSubWeights = { hoursMatch: 0.30, timeSlotOverlap: 0.35, weekendEvening: 0.15, flexibility: 0.10, emergency: 0.10 };
        weights.salarySubWeights = { rateMatch: 0.60, negotiable: 0.20, benefits: 0.20 };
        weights.locationSubWeights = { commuteTime: 0.50, remoteHybrid: 0.30, onCampus: 0.20 };
        weights.materialSubWeights = { required: 0.60, count: 0.25, verification: 0.15 };

    } else {
        // ========== 高级模式：同时计算主维度和子维度 ==========

        // 1. 计算主维度权重
        const dimSum = Object.values(raw.dimensions).reduce((a, b) => a + b, 0);
        Object.keys(raw.dimensions).forEach(key => {
            weights.dimensions[key] = raw.dimensions[key] / dimSum;
        });

        // 2. 计算各子维度权重
        const calculateSubWeights = (subScores, defaultWeights) => {
            const sum = Object.values(subScores).reduce((a, b) => a + b, 0);
            const result = {};
            Object.keys(subScores).forEach(key => {
                result[key] = subScores[key] / sum;
            });
            return result;
        };

        weights.skillSubWeights = calculateSubWeights(raw.skillSubScores);
        weights.experienceSubWeights = calculateSubWeights(raw.experienceSubScores);
        weights.qualitySubWeights = calculateSubWeights(raw.qualitySubScores);
        weights.timeSubWeights = calculateSubWeights(raw.timeSubScores);
        weights.salarySubWeights = calculateSubWeights(raw.salarySubScores);
        weights.locationSubWeights = calculateSubWeights(raw.locationSubScores);
        weights.materialSubWeights = calculateSubWeights(raw.materialSubScores);
    }

    console.log('[偏好计算] 计算结果:', {
        dimensions: weights.dimensions,
        sample: weights.skillSubWeights
    });

    return weights;
};

/**
 * 保存前自动计算权重
 */
UserPreferenceSchema.pre('save', function() {
    if (this.enabled) {
        this.weights = this.calculateWeights();
    }
});

/**
 * 获取或创建用户偏好
 */
UserPreferenceSchema.statics.getOrCreate = async function(userUUID, userType) {
    let preference = await this.findOne({ userUUID });

    if (!preference) {
        console.log('[偏好设置] 创建默认偏好:', { userUUID, userType });
        preference = new this({ userUUID, userType });
        preference.weights = preference.calculateWeights();
        await preference.save();
    }

    return preference;
};

/**
 * 重置为默认权重
 */
UserPreferenceSchema.methods.resetToDefault = function() {
    const defaultRaw = {
        dimensions: { skills: 5, experience: 5, qualities: 5, time: 5, salary: 5, location: 5, materials: 5 },
        skillSubScores: { technical: 5, language: 5, soft: 5, certification: 5 },
        experienceSubScores: { project: 5, internship: 5, campus: 5, academic: 5 },
        qualitySubScores: { teamwork: 5, communication: 5, initiative: 5, reliability: 5, adaptability: 5, leadership: 5, learningAbility: 5 },
        timeSubScores: { hoursMatch: 5, timeSlotOverlap: 5, weekendEvening: 5, flexibility: 5, emergency: 5 },
        salarySubScores: { rateMatch: 5, negotiable: 5, benefits: 5 },
        locationSubScores: { commuteTime: 5, remoteHybrid: 5, onCampus: 5 },
        materialSubScores: { required: 5, count: 5, verification: 5 }
    };

    this.rawPreferences = defaultRaw;
    this.mode = 'simple';
    this.weights = this.calculateWeights();

    return this;
};

module.exports = mongoose.model('UserPreference', UserPreferenceSchema);