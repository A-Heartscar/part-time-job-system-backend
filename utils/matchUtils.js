// utils/matchUtils.js
const mongoose = require('mongoose');

// ============================================
// 默认权重配置
// ============================================
const DEFAULT_WEIGHTS = {
    // 主维度权重
    dimensions: {
        skills: 0.25,
        experience: 0.20,
        qualities: 0.10,
        time: 0.20,
        salary: 0.10,
        location: 0.10,
        materials: 0.05
    },

    // 技能子维度权重
    skillSubWeights: {
        technical: 0.50,
        language: 0.20,
        soft: 0.20,
        certification: 0.10
    },

    // 经历子维度权重
    experienceSubWeights: {
        project: 0.35,
        internship: 0.40,
        campus: 0.15,
        academic: 0.10
    },

    // 素质子维度权重
    qualitySubWeights: {
        teamwork: 0.15,
        communication: 0.20,
        initiative: 0.15,
        reliability: 0.20,
        adaptability: 0.10,
        leadership: 0.10,
        learningAbility: 0.10
    },

    // 时间子维度权重
    timeSubWeights: {
        hoursMatch: 0.30,
        timeSlotOverlap: 0.35,
        weekendEvening: 0.15,
        flexibility: 0.10,
        emergency: 0.10
    },

    // 薪资子维度权重
    salarySubWeights: {
        rateMatch: 0.60,
        negotiable: 0.20,
        benefits: 0.20
    },

    // 地点子维度权重
    locationSubWeights: {
        commuteTime: 0.50,
        remoteHybrid: 0.30,
        onCampus: 0.20
    },

    // 材料子维度权重
    materialSubWeights: {
        required: 0.60,
        count: 0.25,
        verification: 0.15
    }
};

// ============================================
// 向量转换辅助函数
// ============================================

/**
 * 将Map类型的技能向量转换为数值数组（用于余弦相似度计算）
 */
const mapToArray = (map, keys) => {
    return keys.map(key => map.get(key) || 0);
};

/**
 * 计算两个向量的余弦相似度
 */
const cosineSimilarity = (vecA, vecB) => {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * 计算两个向量的加权余弦相似度
 */
const weightedCosineSimilarity = (vecA, vecB, weights) => {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    if (!weights || weights.length !== vecA.length) {
        weights = new Array(vecA.length).fill(1);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    let weightSum = 0;

    for (let i = 0; i < vecA.length; i++) {
        const w = weights[i];
        dotProduct += w * vecA[i] * vecB[i];
        normA += w * vecA[i] * vecA[i];
        normB += w * vecB[i] * vecB[i];
        weightSum += w;
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ============================================
// 各维度相似度计算函数
// ============================================

/**
 * 将数据转换为 Map（兼容普通对象和 Map）
 * @param {Map|Object} data - 原始数据
 * @returns {Map} Map 对象
 */
const toMap = (data) => {
    if (data instanceof Map) {
        return data;
    }
    if (data && typeof data === 'object') {
        return new Map(Object.entries(data));
    }
    return new Map();
};

/**
 * 计算技能相似度
 */
const calculateSkillSimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.skillSubWeights, ...weights };

    console.log('[匹配计算] 技能相似度 - 原始数据:', {
        jobVectorType: typeof jobVector,
        jobVectorKeys: jobVector ? Object.keys(jobVector) : null,
        resumeVectorType: typeof resumeVector,
        resumeVectorKeys: resumeVector ? Object.keys(resumeVector) : null
    });

    // ========== 1. 技术技能相似度 ==========
    // 兼容普通对象和 Map
    const rawTechJob = jobVector?.technical || new Map();
    const rawTechResume = resumeVector?.technical || new Map();

    const techJobMap = toMap(rawTechJob);
    const techResumeMap = toMap(rawTechResume);

    console.log('[匹配计算] 技术技能Map:', {
        jobMapSize: techJobMap.size,
        resumeMapSize: techResumeMap.size
    });

    const allTechKeys = new Set([...techJobMap.keys(), ...techResumeMap.keys()]);

    const techJobVec = [];
    const techResumeVec = [];
    const techWeights = [];

    allTechKeys.forEach(key => {
        const jobVal = techJobMap.get(key);
        // 处理 jobVal 可能是对象的情况（Job 模型中存储的是 { weight, yearsRequired, certification }）
        let jobWeight = 0;
        if (typeof jobVal === 'object' && jobVal !== null) {
            jobWeight = jobVal.weight || 0;
        } else {
            jobWeight = jobVal || 0;
        }

        const resumeWeight = techResumeMap.get(key) || 0;

        techJobVec.push(jobWeight);
        techResumeVec.push(resumeWeight);
        techWeights.push(typeof jobVal === 'object' ? (jobVal.weight || 0.5) : 0.5);
    });

    const techSimilarity = techJobVec.length > 0
        ? weightedCosineSimilarity(techJobVec, techResumeVec, techWeights)
        : 0;

    console.log('[匹配计算] 技术技能相似度:', techSimilarity);

    // ========== 2. 语言技能相似度 ==========
    const rawLangJob = jobVector?.language || new Map();
    const rawLangResume = resumeVector?.language || new Map();

    const langJobMap = toMap(rawLangJob);
    const langResumeMap = toMap(rawLangResume);

    const allLangKeys = new Set([...langJobMap.keys(), ...langResumeMap.keys()]);

    const langJobVec = [];
    const langResumeVec = [];

    allLangKeys.forEach(key => {
        langJobVec.push(langJobMap.get(key) || 0);
        langResumeVec.push(langResumeMap.get(key) || 0);
    });

    const langSimilarity = langJobVec.length > 0
        ? cosineSimilarity(langJobVec, langResumeVec)
        : 0;

    console.log('[匹配计算] 语言技能相似度:', langSimilarity);

    // ========== 3. 软技能相似度 ==========
    const rawSoftJob = jobVector?.soft || new Map();
    const rawSoftResume = resumeVector?.soft || new Map();

    const softJobMap = toMap(rawSoftJob);
    const softResumeMap = toMap(rawSoftResume);

    const allSoftKeys = new Set([...softJobMap.keys(), ...softResumeMap.keys()]);

    const softJobVec = [];
    const softResumeVec = [];

    allSoftKeys.forEach(key => {
        softJobVec.push(softJobMap.get(key) || 0);
        softResumeVec.push(softResumeMap.get(key) || 0);
    });

    const softSimilarity = softJobVec.length > 0
        ? cosineSimilarity(softJobVec, softResumeVec)
        : 0;

    console.log('[匹配计算] 软技能相似度:', softSimilarity);

    // ========== 4. 证书匹配度 ==========
    const rawCertJob = jobVector?.certifications || new Map();
    const rawCertResume = resumeVector?.hasCertification || new Map();

    const certJobMap = toMap(rawCertJob);
    const certResumeMap = toMap(rawCertResume);

    let certMatchCount = 0;
    let certTotal = 0;

    certJobMap.forEach((required, skillName) => {
        certTotal++;
        if (certResumeMap.get(skillName)) certMatchCount++;
    });

    const certSimilarity = certTotal > 0 ? certMatchCount / certTotal : 1.0;

    console.log('[匹配计算] 证书相似度:', certSimilarity);

    // ========== 加权综合 ==========
    const result = (
        techSimilarity * subWeights.technical +
        langSimilarity * subWeights.language +
        softSimilarity * subWeights.soft +
        certSimilarity * subWeights.certification
    );

    console.log('[匹配计算] 技能综合相似度:', result);

    return result;
};

/**
 * 计算经历相似度
 */
const calculateExperienceSimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.experienceSubWeights, ...weights };

    const jobExp = jobVector || {};
    const resumeExp = resumeVector || {};

    // 1. 项目经历相似度
    let projectScore = 0;
    const jobProj = jobExp.project || {};
    const resumeProj = resumeExp.projectStats || {};

    if (jobProj.minCount > 0) {
        projectScore += Math.min(resumeProj.totalCount / jobProj.minCount, 1.0) * 0.3;
    } else {
        projectScore += 0.3;
    }

    if (jobProj.minComplexity > 0) {
        projectScore += Math.min(resumeProj.maxComplexity / jobProj.minComplexity, 1.0) * 0.3;
    } else {
        projectScore += 0.3;
    }

    if (jobProj.requiredTechs?.length > 0) {
        const allTechs = resumeProj.allTechnologies || [];
        const matched = jobProj.requiredTechs.filter(t =>
            allTechs.some(at => at.toLowerCase().includes(t.toLowerCase()))
        ).length;
        projectScore += (matched / jobProj.requiredTechs.length) * 0.4;
    } else {
        projectScore += 0.4;
    }

    // 2. 实习经历相似度
    let internshipScore = 0;
    const jobIntern = jobExp.internship || {};
    const resumeIntern = resumeExp.internshipStats || {};

    if (jobIntern.minCount > 0) {
        internshipScore += Math.min(resumeIntern.totalCount / jobIntern.minCount, 1.0) * 0.4;
    } else {
        internshipScore += 0.4;
    }

    if (jobIntern.minWeeks > 0) {
        internshipScore += Math.min(resumeIntern.totalDurationWeeks / jobIntern.minWeeks, 1.0) * 0.3;
    } else {
        internshipScore += 0.3;
    }

    if (jobIntern.verificationWeight > 0) {
        internshipScore += resumeIntern.verificationRate * 0.3;
    } else {
        internshipScore += 0.3;
    }

    // 3. 校园经历相似度
    let campusScore = 0;
    const jobCampus = jobExp.campus || {};
    const resumeCampus = resumeExp.campusStats || {};

    if (jobCampus.leadershipWeight > 0) {
        campusScore += Math.min(resumeCampus.leadershipRoleCount / 2, 1.0) * 0.5;
    } else {
        campusScore += 0.5;
    }

    if (jobCampus.clubWeight > 0) {
        const clubCount = resumeCampus.activityTypeCounts?.club || 0;
        campusScore += (clubCount > 0 ? 0.5 : 0);
    } else {
        campusScore += 0.5;
    }

    // 4. 学业相似度
    let academicScore = 0;
    const jobAcad = jobExp.academic || {};
    const resumeAcad = resumeExp.academicStats || {};

    if (jobAcad.minGradeValue > 0) {
        const gradeRatio = Math.min(resumeAcad.gradeWeight / Math.max(jobAcad.minGradeValue, 0.25), 1.0);
        academicScore += gradeRatio * 0.4;
    } else {
        academicScore += 0.4;
    }

    if (jobAcad.gpaRequired > 0) {
        const gpaRatio = Math.min(resumeAcad.gpaNormalized / jobAcad.gpaRequired, 1.0);
        academicScore += gpaRatio * 0.4;
    } else {
        academicScore += 0.4;
    }

    if (jobAcad.awardsWeight > 0) {
        academicScore += Math.min(resumeAcad.awardCount / 2, 1.0) * 0.2;
    } else {
        academicScore += 0.2;
    }

    return (
        projectScore * subWeights.project +
        internshipScore * subWeights.internship +
        campusScore * subWeights.campus +
        academicScore * subWeights.academic
    );
};

/**
 * 计算素质相似度
 */
const calculateQualitySimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.qualitySubWeights, ...weights };

    const jobQual = jobVector || {};
    const resumeQual = resumeVector || {};

    const dimensions = ['teamwork', 'communication', 'initiative', 'reliability', 'adaptability', 'leadership', 'learningAbility'];

    const jobVec = dimensions.map(d => jobQual[d] || 0);
    const resumeVec = dimensions.map(d => resumeQual[d] || 0.3);
    const dimWeights = dimensions.map(d => subWeights[d] || 0.1);

    return weightedCosineSimilarity(jobVec, resumeVec, dimWeights);
};

/**
 * 计算时间相似度
 */
const calculateTimeSimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.timeSubWeights, ...weights };

    const jobTime = jobVector || {};
    const resumeTime = resumeVector || {};

    // 1. 工时匹配度
    let hoursScore = 0;
    const weeklyHours = resumeTime.weeklyAvailableHours || 0;
    const minHours = jobTime.weeklyHoursMin || 0;
    const maxHours = jobTime.weeklyHoursMax || 40;

    if (weeklyHours >= minHours && weeklyHours <= maxHours) {
        hoursScore = 1.0;
    } else if (weeklyHours >= minHours * 0.7 && weeklyHours <= maxHours * 1.3) {
        hoursScore = 0.7;
    } else if (weeklyHours >= minHours * 0.5) {
        hoursScore = 0.4;
    } else {
        hoursScore = 0.1;
    }

    // 2. 时间槽重叠度
    const jobSlots = jobTime.timeSlots || [];
    const resumeSlots = resumeTime.timeSlotVector || [];

    let timeSlotScore = 0;
    if (jobSlots.length > 0 && resumeSlots.length > 0) {
        const slotsVec = [];
        const resumeVec = [];

        for (let i = 0; i < Math.min(jobSlots.length, resumeSlots.length); i++) {
            slotsVec.push(jobSlots[i] || 0);
            resumeVec.push(resumeSlots[i] || 0);
        }

        timeSlotScore = cosineSimilarity(slotsVec, resumeVec);
    } else {
        timeSlotScore = 0.5;
    }

    // 3. 周末/晚间匹配度
    let weekendEveningScore = 0;
    const jobWeekendWeight = jobTime.weekendWeight || 0;
    const jobEveningWeight = jobTime.eveningWeight || 0;
    const resumeWeekend = resumeTime.weekendAvailabilityScore || 0;
    const resumeEvening = resumeTime.eveningAvailabilityScore || 0;

    if (jobWeekendWeight > 0 && jobEveningWeight > 0) {
        weekendEveningScore = (resumeWeekend * jobWeekendWeight + resumeEvening * jobEveningWeight) /
            (jobWeekendWeight + jobEveningWeight);
    } else if (jobWeekendWeight > 0) {
        weekendEveningScore = resumeWeekend;
    } else if (jobEveningWeight > 0) {
        weekendEveningScore = resumeEvening;
    } else {
        weekendEveningScore = 1.0;
    }

    // 4. 灵活性匹配度
    let flexibilityScore = 0;
    const jobFlex = jobTime.flexibilityWeight || 0.5;
    const resumeFlex = resumeTime.scheduleFlexibility || 0.5;
    flexibilityScore = 1 - Math.abs(jobFlex - resumeFlex) * 0.5;

    // 5. 紧急可用性
    let emergencyScore = 0;
    if (jobTime.emergencyWeight > 0.5) {
        emergencyScore = resumeTime.emergencyAvailable ? 1.0 : 0.2;
    } else {
        emergencyScore = 1.0;
    }

    return (
        hoursScore * subWeights.hoursMatch +
        timeSlotScore * subWeights.timeSlotOverlap +
        weekendEveningScore * subWeights.weekendEvening +
        flexibilityScore * subWeights.flexibility +
        emergencyScore * subWeights.emergency
    );
};

/**
 * 计算薪资相似度
 * 支持等效时薪折算、提成制特殊处理、溢价费率加成
 */
const calculateSalarySimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.salarySubWeights, ...weights };

    const jobSal = jobVector || {};
    const resumeSal = resumeVector || {};

    console.log('[薪资匹配] 开始计算:', {
        jobRateType: jobSal.rateType,
        isCommission: jobSal.isCommissionBased,
        resumeAcceptCommission: resumeSal.acceptCommission,
        resumeAcceptStipend: resumeSal.acceptStipend
    });

    // ========== 提成制特殊处理 ==========
    if (jobSal.isCommissionBased) {
        if (resumeSal.acceptCommission === false) {
            console.log('[薪资匹配] 学生不接受提成制，匹配度=0.1');
            return 0.1;
        }
        const commissionScore = Math.min(
            ((jobSal.negotiable || 0) + (resumeSal.isFlexible ? 1 : 0)) / 2 * 0.6 + 0.2,
            0.7
        );
        console.log('[薪资匹配] 提成制匹配:', commissionScore);
        return commissionScore;
    }

    // ========== 固定津贴特殊处理 ==========
    let stipendPenalty = 1.0;
    if (jobSal.rateType === 'stipend' && resumeSal.acceptStipend === false) {
        stipendPenalty = 0.6;
        console.log('[薪资匹配] 学生不接受固定津贴，匹配度打折');
    }

    // ========== 等效时薪匹配 ==========
    let rateScore = 0;

    const jobMin = jobSal.equivalentHourlyMin || jobSal.rangeMin || 0;
    const jobMax = jobSal.equivalentHourlyMax || jobSal.rangeMax || 100;
    const expected = resumeSal.expectedHourlyRate || 0;
    const minAccept = resumeSal.minAcceptable || 0;

    console.log('[薪资匹配] 等效时薪比较:', {
        studentExpected: expected,
        studentMinAccept: minAccept,
        jobEquivalentRange: `${jobMin}-${jobMax}`
    });

    if (expected >= jobMin && expected <= jobMax) {
        rateScore = 1.0;
    } else if (expected > jobMax) {
        const overRatio = (expected - jobMax) / Math.max(jobMax, 1);
        if (overRatio <= 0.1) {
            rateScore = 0.9;
        } else if (overRatio <= 0.3) {
            rateScore = 0.7 - 0.3 * (overRatio - 0.1);
        } else {
            rateScore = Math.max(0.2, 0.4 - overRatio * 0.3);
        }
    } else {
        const underRatio = (jobMin - expected) / Math.max(jobMin, 1);
        const isFlexible = resumeSal.isFlexible !== false;

        if (isFlexible && minAccept <= jobMax) {
            rateScore = 0.7;
        } else if (underRatio <= 0.3) {
            rateScore = 0.8;
        } else {
            rateScore = Math.max(0.3, 1 - underRatio);
        }
    }

    // ========== 薪资类型偏好调整 ==========
    let rateTypeBonus = 1.0;

    const studentPreferredTypes = resumeSal.preferredWorkType || ['hourly'];
    const jobRateType = jobSal.rateType || 'hourly';

    // 判断岗位薪资类型是否在学生偏好中
    if (studentPreferredTypes.length > 0) {
        // 类型映射：将岗位薪资类型映射到学生偏好类型
        const typeMapping = {
            'hourly': 'hourly',
            'per_shift': 'daily',
            'per_project': 'hourly',
            'commission': 'commission',
            'stipend': 'monthly'
        };
        const mappedType = typeMapping[jobRateType] || 'hourly';

        if (studentPreferredTypes.includes(mappedType)) {
            // 学生偏好此类型，加成5%
            rateTypeBonus = 1.05;
            console.log('[薪资匹配] 薪资类型偏好加成:', {
                jobRateType,
                mappedType,
                studentPreferredTypes,
                bonus: rateTypeBonus
            });
        } else if (mappedType !== 'commission' && mappedType !== 'monthly') {
            // 非偏好的常规类型，轻微降低
            rateTypeBonus = 0.95;
            console.log('[薪资匹配] 非偏好薪资类型，轻微降低:', rateTypeBonus);
        }
    }

    // 应用类型偏好加成
    rateScore = Math.min(rateScore * rateTypeBonus, 1.0);

    // ========== 溢价费率加成 ==========
    // 根据学生的时间可用性，对岗位的溢价进行加成
    let premiumBonus = 1.0;

    // 获取学生的时间信息（从 resumeVector 中）
    const resumeTime = resumeVector.timeVector || resumeVector || {};
    const studentWeekendAvailable = (resumeTime.weekendAvailabilityScore || 0) > 0.3;
    const studentEveningAvailable = (resumeTime.eveningAvailabilityScore || 0) > 0.3;
    const studentHolidayAvailable = resumeTime.holidayAvailable === true;

    // 获取岗位溢价信息（从 jobVector 中，通过 totalValue 与 baseRate 的比值推断）
    const jobTotalValue = jobSal.totalValue || 0;
    const jobBaseRate = jobSal.baseRate || 0;

    if (jobBaseRate > 0 && jobTotalValue > jobBaseRate) {
        const premiumRatio = jobTotalValue / jobBaseRate;

        // 溢价存在时，学生时间越匹配，加成越多
        let matchCount = 0;
        let totalChecks = 0;

        // 周末溢价：学生周末可用则加分
        if (premiumRatio > 1.05) {
            totalChecks++;
            if (studentWeekendAvailable) matchCount++;
        }

        // 晚间溢价（默认含有）：学生晚间可用则加分
        totalChecks++;
        if (studentEveningAvailable) matchCount++;

        // 假期溢价：学生假期可用则加分
        if (studentHolidayAvailable) {
            totalChecks++;
            matchCount++;
        }

        if (totalChecks > 0) {
            const matchRatio = matchCount / totalChecks;
            // 溢价加成：最多增加10%的匹配度
            premiumBonus = 1.0 + matchRatio * 0.1;
            console.log('[薪资匹配] 溢价加成:', {
                premiumRatio: premiumRatio.toFixed(2),
                matchCount,
                totalChecks,
                premiumBonus: premiumBonus.toFixed(2)
            });
        }
    }

    // 应用溢价加成和固定津贴惩罚
    rateScore = Math.min(rateScore * premiumBonus * stipendPenalty, 1.0);

    console.log('[薪资匹配] 核心薪资匹配度（含溢价调整）:', rateScore);

    // ========== 可协商性匹配 ==========
    const jobNeg = jobSal.negotiable || 0;
    const resumeFlex = resumeSal.isFlexible !== false ? 1 : 0;
    const negotiableScore = (jobNeg + resumeFlex) / 2;


    // ========== 福利价值匹配 ==========
    let benefitScore = 0;
    // 使用岗位福利等价值进行匹配
    const jobBenefitValue = jobSal.benefitHourlyValue || 0;
    const benefits = jobSal.benefitWeights || {};

    if (jobBenefitValue > 0) {
        // 有福利等价值，按比例给分
        // 福利价值越高，分数越高（最高1.0）
        benefitScore = Math.min(jobBenefitValue / 5, 1.0);
        console.log('[薪资匹配] 福利等价值匹配:', {
            benefitHourlyValue: jobBenefitValue,
            benefitScore: benefitScore.toFixed(2)
        });
    } else {
        // 回退：使用旧的布尔权重方式
        const benefitValues = Object.values(benefits);
        if (benefitValues.length > 0) {
            benefitScore = benefitValues.reduce((a, b) => a + b, 0) / benefitValues.length;
        } else {
            benefitScore = 0.5;
        }
        console.log('[薪资匹配] 福利布尔匹配:', benefitScore.toFixed(2));
    }

    // ========== 加权综合 ==========
    const result = (
        rateScore * subWeights.rateMatch +
        negotiableScore * subWeights.negotiable +
        benefitScore * subWeights.benefits
    );

    console.log('[薪资匹配] 最终分数:', result.toFixed(4),
        '(rate:', rateScore.toFixed(4),
        'neg:', negotiableScore.toFixed(4),
        'benefit:', benefitScore.toFixed(4), ')');

    return result;
};

/**
 * 计算地点相似度
 */
const calculateLocationSimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.locationSubWeights, ...weights };

    const jobLoc = jobVector || {};
    const resumePref = resumeVector || {};

    // 1. 通勤时间匹配
    let commuteScore = 0;
    const maxCommute = resumePref.maxCommuteTime || 30;
    const jobCommute = jobLoc.commuteMinutes || 0;

    if (jobLoc.onCampus > 0) {
        commuteScore = 1.0;
    } else if (jobCommute <= maxCommute) {
        commuteScore = 1 - (jobCommute / maxCommute) * 0.3;
    } else if (jobCommute <= maxCommute * 1.5) {
        commuteScore = 0.5;
    } else {
        commuteScore = 0.2;
    }

    // 2. 远程/混合匹配
    let remoteScore = 0;
    const jobRemote = jobLoc.remoteAllowed || 0;
    const jobHybrid = jobLoc.hybridAllowed || 0;

    if (jobRemote > 0 || jobHybrid > 0) {
        remoteScore = 1.0;
    } else {
        remoteScore = 0.8;
    }

    // 3. 校内工作偏好
    let onCampusScore = 0;
    if (jobLoc.onCampus > 0) {
        onCampusScore = 1.0;
    } else {
        onCampusScore = 0.7;
    }

    return (
        commuteScore * subWeights.commuteTime +
        remoteScore * subWeights.remoteHybrid +
        onCampusScore * subWeights.onCampus
    );
};

/**
 * 计算材料相似度
 */
const calculateMaterialSimilarity = (jobVector, resumeVector, weights = {}) => {
    const subWeights = { ...DEFAULT_WEIGHTS.materialSubWeights, ...weights };

    const jobMat = jobVector || {};
    const resumeMat = resumeVector || {};

    // 1. 必须材料匹配
    let requiredScore = 0;
    const requiredTypes = jobMat.requiredTypes || [];

    if (requiredTypes.length > 0) {
        let matched = 0;
        requiredTypes.forEach(type => {
            const count = resumeMat[`${type}Count`] || 0;
            if (count > 0) matched++;
        });
        requiredScore = matched / requiredTypes.length;
    } else {
        requiredScore = 1.0;
    }

    // 2. 材料数量匹配
    let countScore = 0;
    const minCount = jobMat.minCount || 0;
    const totalMaterials = resumeMat.totalMaterials || 0;

    if (minCount > 0) {
        countScore = Math.min(totalMaterials / minCount, 1.0);
    } else {
        countScore = 1.0;
    }

    // 3. 验证状态
    let verificationScore = 0;
    if (jobMat.verificationWeight > 0) {
        verificationScore = 1.0;
    } else {
        verificationScore = 1.0;
    }

    return (
        requiredScore * subWeights.required +
        countScore * subWeights.count +
        verificationScore * subWeights.verification
    );
};

/**
 * 计算类别偏好相似度
 */
const calculateCategorySimilarity = (jobVector, resumeVector) => {
    const jobCats = jobVector?.preferredCategories || [];
    const resumeCats = resumeVector?.preferredCategories || [];

    if (jobCats.length === 0) return 1.0;
    if (resumeCats.length === 0) return 0.5;

    const matched = jobCats.filter(cat => resumeCats.includes(cat)).length;
    return matched > 0 ? 1.0 : 0.3;
};

// ============================================
// 主导出函数
// ============================================

/**
 * 计算岗位与简历的匹配分数（基于余弦相似度）
 * @param {Object} job - 岗位文档（已包含vector）
 * @param {Object} resume - 简历文档（已包含vector）
 * @param {Object} customWeights - 自定义权重配置
 * @returns {Object} 匹配结果
 */
const calculateMatchScore = (job, resume, customWeights = {}) => {
    const jobVector = job.vector || {};
    const resumeVector = resume.vector || {};

    // 合并权重配置
    const dimensionWeights = {
        ...DEFAULT_WEIGHTS.dimensions,
        ...(customWeights.dimensions || {})
    };

    // 计算各维度相似度
    const skillScore = calculateSkillSimilarity(
        jobVector.skillVector,
        resumeVector.skillVector,
        customWeights.skillSubWeights
    );

    const experienceScore = calculateExperienceSimilarity(
        jobVector.experienceVector,
        resumeVector.experienceVector,
        customWeights.experienceSubWeights
    );

    const qualityScore = calculateQualitySimilarity(
        jobVector.qualityVector,
        resumeVector.qualityVector,
        customWeights.qualitySubWeights
    );

    const timeScore = calculateTimeSimilarity(
        jobVector.timeVector,
        resumeVector.timeVector,
        customWeights.timeSubWeights
    );

    const salaryScore = calculateSalarySimilarity(
        jobVector.salaryVector,
        resumeVector.salaryVector,
        customWeights.salarySubWeights
    );

    const locationScore = calculateLocationSimilarity(
        jobVector.locationVector,
        resumeVector.preferenceVector,
        customWeights.locationSubWeights
    );

    const materialScore = calculateMaterialSimilarity(
        jobVector.materialVector,
        resumeVector.materialStats,
        customWeights.materialSubWeights
    );

    const categoryScore = calculateCategorySimilarity(
        jobVector.categoryVector,
        resumeVector.preferenceVector
    );

    // 将类别偏好融入技能维度
    const adjustedSkillScore = skillScore * 0.8 + categoryScore * 0.2;

    // 计算总分
    const totalScore = (
        adjustedSkillScore * dimensionWeights.skills +
        experienceScore * dimensionWeights.experience +
        qualityScore * dimensionWeights.qualities +
        timeScore * dimensionWeights.time +
        salaryScore * dimensionWeights.salary +
        locationScore * dimensionWeights.location +
        materialScore * dimensionWeights.materials
    ) * 100;

    return {
        total: Math.round(totalScore * 100) / 100,
        breakdown: {
            skills: Math.round(adjustedSkillScore * 10000) / 100,
            experience: Math.round(experienceScore * 10000) / 100,
            qualities: Math.round(qualityScore * 10000) / 100,
            time: Math.round(timeScore * 10000) / 100,
            salary: Math.round(salaryScore * 10000) / 100,
            location: Math.round(locationScore * 10000) / 100,
            materials: Math.round(materialScore * 10000) / 100
        },
        weights: dimensionWeights
    };
};

/**
 * 为简历查找匹配的岗位
 * @param {Object} resume - 简历文档
 * @param {Object} options - 选项配置
 * @returns {Promise<Array>} 匹配的岗位列表
 */
const findMatchingJobs = async (resume, options = {}) => {
    const {
        minScore = 60,
        limit = 50,
        sortBy = 'score',
        customWeights = {},
        filters = {}
    } = options;

    const Job = mongoose.model('Job');

    // 构建查询条件
    const query = {
        status: 'published',
        applicationDeadline: { $gte: new Date() },
        ...filters
    };

    const jobs = await Job.find(query).lean();

    // 计算每个岗位的匹配分数
    const matches = jobs.map(job => {
        const score = calculateMatchScore(job, resume, customWeights);
        return {
            job: job,
            ...score
        };
    });

    // 过滤低分
    const filteredMatches = matches.filter(m => m.total >= minScore);

    // 排序
    if (sortBy === 'score') {
        filteredMatches.sort((a, b) => b.total - a.total);
    } else if (sortBy === 'date') {
        filteredMatches.sort((a, b) => new Date(b.job.createdAt) - new Date(a.job.createdAt));
    }

    return filteredMatches.slice(0, limit);
};

/**
 * 为岗位查找匹配的简历
 * @param {Object} job - 岗位文档
 * @param {Object} options - 选项配置
 * @returns {Promise<Array>} 匹配的简历列表
 */
const findMatchingResumes = async (job, options = {}) => {
    const {
        minScore = 60,
        limit = 50,
        sortBy = 'score',
        customWeights = {},
        filters = {}
    } = options;

    const Resume = mongoose.model('Resume');

    const query = { ...filters };

    const resumes = await Resume.find(query).lean();

    const matches = resumes.map(resume => {
        const score = calculateMatchScore(job, resume, customWeights);
        return {
            resume: resume,
            ...score
        };
    });

    const filteredMatches = matches.filter(m => m.total >= minScore);

    if (sortBy === 'score') {
        filteredMatches.sort((a, b) => b.total - a.total);
    }

    return filteredMatches.slice(0, limit);
};

/**
 * 获取权重配置（供外部调整）
 */
const getDefaultWeights = () => {
    return JSON.parse(JSON.stringify(DEFAULT_WEIGHTS));
};

/**
 * 更新权重配置
 */
const updateWeights = (newWeights) => {
    if (newWeights.dimensions) {
        Object.assign(DEFAULT_WEIGHTS.dimensions, newWeights.dimensions);
    }
    if (newWeights.skillSubWeights) {
        Object.assign(DEFAULT_WEIGHTS.skillSubWeights, newWeights.skillSubWeights);
    }
    if (newWeights.experienceSubWeights) {
        Object.assign(DEFAULT_WEIGHTS.experienceSubWeights, newWeights.experienceSubWeights);
    }
    if (newWeights.qualitySubWeights) {
        Object.assign(DEFAULT_WEIGHTS.qualitySubWeights, newWeights.qualitySubWeights);
    }
    if (newWeights.timeSubWeights) {
        Object.assign(DEFAULT_WEIGHTS.timeSubWeights, newWeights.timeSubWeights);
    }
    if (newWeights.salarySubWeights) {
        Object.assign(DEFAULT_WEIGHTS.salarySubWeights, newWeights.salarySubWeights);
    }
    if (newWeights.locationSubWeights) {
        Object.assign(DEFAULT_WEIGHTS.locationSubWeights, newWeights.locationSubWeights);
    }
    if (newWeights.materialSubWeights) {
        Object.assign(DEFAULT_WEIGHTS.materialSubWeights, newWeights.materialSubWeights);
    }
};

module.exports = {
    calculateMatchScore,
    findMatchingJobs,
    findMatchingResumes,
    getDefaultWeights,
    updateWeights,
    DEFAULT_WEIGHTS
};



// // 使用示例
// const { findMatchingJobs, calculateMatchScore, getDefaultWeights, updateWeights } = require('./matchUtils');
//
// // 1. 获取默认权重配置
// const defaultWeights = getDefaultWeights();
// console.log('默认权重:', defaultWeights);
//
// // 2. 自定义权重（可根据业务需求调整）
// const customWeights = {
//     dimensions: {
//         skills: 0.30,      // 提高技能权重
//         experience: 0.25,   // 提高经历权重
//         qualities: 0.10,
//         time: 0.15,
//         salary: 0.10,
//         location: 0.05,
//         materials: 0.05
//     },
//     skillSubWeights: {
//         technical: 0.60,    // 更重视技术技能
//         language: 0.15,
//         soft: 0.20,
//         certification: 0.05
//     }
// };
//
// // 3. 为简历查找匹配岗位
// const resume = await Resume.findOne({ studentUUID: 'xxx' });
// const matchingJobs = await findMatchingJobs(resume, {
//     minScore: 65,
//     limit: 20,
//     customWeights: customWeights,
//     filters: {
//         category: 'programming'  // 只匹配编程类岗位
//     }
// });
//
// console.log(`找到 ${matchingJobs.length} 个匹配岗位`);
// matchingJobs.forEach((match, index) => {
//     console.log(`${index + 1}. ${match.job.title} - 匹配度: ${match.total}%`);
//     console.log('   各维度分数:', match.breakdown);
// });
//
// // 4. 计算单个岗位与简历的匹配度
// const job = await Job.findOne({ _id: 'yyy' });
// const singleMatch = calculateMatchScore(job, resume, customWeights);
// console.log('单岗位匹配结果:', singleMatch);
//
// // 5. 为岗位查找匹配简历
// const matchingResumes = await findMatchingResumes(job, {
//     minScore: 70,
//     limit: 30
// });
//
// // 6. 动态更新全局权重（影响后续所有匹配）
// updateWeights({
//     dimensions: {
//         skills: 0.28,
//         experience: 0.22,
//         time: 0.20,
//         salary: 0.12,
//         location: 0.08,
//         qualities: 0.05,
//         materials: 0.05
//     }
// });