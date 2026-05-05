const mongoose = require('mongoose');

const SupportingMaterialSchema = new mongoose.Schema({
    // 业务逻辑类型：区别于物理类型，定义这封材料是什么
    type: {
        type: String,
        enum: ['certificate', 'coursework', 'project_link', 'github', 'website', 'document', 'other'],
        required: true
    },
    // 物理上传类型：区分是用户填写的链接还是系统上传的文件
    uploadType: {
        type: String,
        enum: ['link', 'file'],
        required: true
    },
    // 材料标题
    title: { type: String, trim: true, required: true },
    // 材料详细描述
    description: { type: String, trim: true },
    // 存储路径或URL数组：uploadType为file时存路径，为link时存网页地址
    url: [{ type: String, trim: true }],
    // 文件原名数组：仅当 uploadType 为 file 时生效
    name: [{ type: String, trim: true }],
    // 最后更新时间
    finalUpdateAt: { type: Date, default: Date.now }
});

// 项目经历子文档
const ProjectExperienceSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    projectType: { // 项目类型
        type: String,
        enum: [
            'course_project',    // 课程项目
            'competition',       // 竞赛项目
            'research_project',  // 科研项目
            'club_activity',     // 社团活动
            'volunteer',         // 志愿服务
            'personal_project',  // 个人项目
            'startup_project',   // 创业项目
            'internship_project' // 实习项目
        ],
        required: true
    },
    role: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    technologies: [{ type: String, trim: true }],
    durationWeeks: { type: Number, min: 1 }, // 项目持续周数
    complexity: { // 项目复杂度
        type: Number,
        min: 1,
        max: 5,
        default: 3
    },
    teamSize: { type: Number, min: 1, default: 1 },
    achievements: [{ type: String, trim: true }],
    supportingMaterials: [SupportingMaterialSchema]
});

// 实习经历子文档
const InternshipExperienceSchema = new mongoose.Schema({
    company: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    durationWeeks: { type: Number, min: 1 }, // 实习周数
    responsibilities: [{ type: String, trim: true }],
    skillsGained: [{ type: String, trim: true }],
    supervisorContact: { type: String, trim: true },
    isVerified: { type: Boolean, default: false },// 需要审核进行变化

    verificationRequest: {
        status: {  // 审核状态
            type: String,
            enum: ['none', 'pending', 'approved', 'rejected'],
            default: 'none'
        },
        submittedAt: { type: Date },  // 提交审核时间
        supportingMaterials: [SupportingMaterialSchema],
        reviewerNotes: { type: String, trim: true },  // 审核备注
        reviewedAt: { type: Date },  // 审核时间
        reviewedBy: { type: String }  // 审核人ID
    }
});

// 校园活动子文档
const CampusActivitySchema = new mongoose.Schema({
    organization: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    activityType: {
        type: String,
        enum: ['student_union', 'club', 'volunteer', 'sports', 'art', 'academic'],
        required: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    responsibilities: [{ type: String, trim: true }],
    achievements: [{ type: String, trim: true }]
});

// 技能项子文档
const SkillSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    category: { // 技能分类
        type: String,
        enum: [
            'technical',      // 技术技能
            'language',       // 语言能力
            'office_skill',   // 办公技能
            'design',         // 设计技能
            'communication',  // 沟通能力
            'leadership',     // 领导能力
            'organizational', // 组织能力
            'creative',       // 创意能力
            'other'          // 其他
        ],
        default: 'other'
    },
    proficiency: { // 掌握程度
        type: String,
        enum: [
            'beginner',     // 了解基本概念
            'basic',        // 能够简单应用
            'intermediate', // 能够独立完成任务
            'advanced',     // 能够解决复杂问题
            'expert'       // 能够指导他人
        ],
        default: 'basic'
    },
    description: { type: String, trim: true, default: '' }, // 技能描述/使用场景说明

    supportingMaterials: [SupportingMaterialSchema]
});

// 可工作时间子文档
const AvailableTimeSchema = new mongoose.Schema({
    termTime: { // 学期内时间
        weekdays: [{
            day: { type: Number, min: 1, max: 5 },
            timeSlots: [{
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                preferred: { type: Boolean, default: false } // 偏好时间段
            }]
        }],
        weekends: [{
            day: { type: Number, enum: [6, 7] },
            timeSlots: [{
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                preferred: { type: Boolean, default: false }
            }]
        }]
    },
    holidayTime: { // 假期时间
        isAvailable: { type: Boolean, default: false },
        preferredHoursPerDay: { type: Number, min: 0, max: 12, default: 4 }
    },
    emergencyAvailability: { // 紧急/临时工作可用性
        type: Boolean,
        default: false
    }
});

// 简历主Schema
const ResumeSchema = new mongoose.Schema({
    studentUUID: {
        type: String,
        required: true,
        index: true
    },

    // 学生状态信息
    studentStatus: {
        grade: { type: String, enum: ['freshman', 'sophomore', 'junior', 'senior', 'graduate'], required: true },
        major: { type: String, required: true, trim: true },
        expectedGraduation: { type: Date },
        academicPerformance: { // 学业表现
            gpa: { type: Number, min: 0, max: 4 },
            ranking: { type: String, trim: true }, // 如 "top 10%"
            awards: [{ type: String, trim: true }]
        }
    },

    // 核心经历
    skills: [SkillSchema],
    projectExperiences: [ProjectExperienceSchema],
    internshipExperiences: [InternshipExperienceSchema],
    campusActivities: [CampusActivitySchema],

    // 匹配相关字段
    availableTime: AvailableTimeSchema,
    salaryExpectation: {
        hourly: { min: Number, max: Number },
        daily: { min: Number, max: Number },
        monthly: { min: Number, max: Number },
        flexible: Boolean,
        acceptCommission: { type: Boolean, default: true },
        acceptStipend: { type: Boolean, default: true },
        preferredWorkType: [String]  // 偏好的薪资类型：['hourly', 'daily', 'monthly']
    },

    // 兼职偏好
    jobPreferences: {
        preferredCategories: [{
            type: String,
            enum: [
                'tutoring',          // 家教
                'research_assistant', // 科研助理
                'campus_job',        // 校内工作
                'retail',            // 零售
                'food_service',      // 餐饮
                'customer_service',  // 客服
                'event_staff',       // 活动工作人员
                'content_creation',  // 内容创作
                'data_entry',        // 数据录入
                'design',            // 设计
                'programming',       // 编程
                'marketing',         // 市场推广
                'other'
            ]
        }],
        maxCommuteTime: { type: Number, default: 30 }, // 最大通勤时间（分钟）
        minShiftsPerWeek: { type: Number, default: 1 }, // 每周最少班次
        maxShiftsPerWeek: { type: Number, default: 5 }  // 每周最多班次
    },

    // 向量化表示
    vector: {
        // 技能向量
        skillVector: {
            technical: { type: Map, of: Number, default: {} },
            language: { type: Map, of: Number, default: {} },
            soft: { type: Map, of: Number, default: {} },
            // 技能使用年限（从经历推断）
            skillYears: { type: Map, of: Number, default: {} },
            // 是否有证书
            hasCertification: { type: Map, of: Boolean, default: {} }
        },

        // 经历向量
        experienceVector: {
            projectStats: {
                totalCount: { type: Number, default: 0 },
                teamProjectCount: { type: Number, default: 0 },
                competitionCount: { type: Number, default: 0 },
                researchCount: { type: Number, default: 0 },
                personalCount: { type: Number, default: 0 },
                totalDurationWeeks: { type: Number, default: 0 },
                avgComplexity: { type: Number, default: 0 },
                maxComplexity: { type: Number, default: 0 },
                allTechnologies: [{ type: String }]
            },
            internshipStats: {
                totalCount: { type: Number, default: 0 },
                totalDurationWeeks: { type: Number, default: 0 },
                verifiedCount: { type: Number, default: 0 },
                pendingVerificationCount: { type: Number, default: 0 },
                approvedVerificationCount: { type: Number, default: 0 },
                verificationRate: { type: Number, default: 0 },
                avgDurationWeeks: { type: Number, default: 0 },
                hasSupervisorContact: { type: Boolean, default: false }
            },
            campusStats: {
                totalActivities: { type: Number, default: 0 },
                leadershipRoleCount: { type: Number, default: 0 },
                totalActivityWeeks: { type: Number, default: 0 },
                activityTypeCounts: {
                    student_union: { type: Number, default: 0 },
                    club: { type: Number, default: 0 },
                    volunteer: { type: Number, default: 0 },
                    sports: { type: Number, default: 0 },
                    art: { type: Number, default: 0 },
                    academic: { type: Number, default: 0 }
                }
            },
            academicStats: {
                gpa: { type: Number, default: 0 },
                gpaNormalized: { type: Number, default: 0 },
                ranking: { type: String, default: '' },
                grade: { type: String, default: 'freshman' },
                gradeWeight: { type: Number, default: 0.5 },
                awardCount: { type: Number, default: 0 },
                expectedGraduation: { type: Date }
            }
        },

        // 素质向量（从基础字段推断）
        qualityVector: {
            teamwork: { type: Number, default: 0.3 },
            communication: { type: Number, default: 0.3 },
            initiative: { type: Number, default: 0.3 },
            reliability: { type: Number, default: 0.3 },
            adaptability: { type: Number, default: 0.3 },
            leadership: { type: Number, default: 0.3 },
            learningAbility: { type: Number, default: 0.3 }
        },

        // 时间向量
        timeVector: {
            weeklyAvailableHours: { type: Number, default: 0 },
            weekendAvailabilityScore: { type: Number, default: 0 },
            eveningAvailabilityScore: { type: Number, default: 0 },
            emergencyAvailable: { type: Boolean, default: false },
            holidayAvailable: { type: Boolean, default: false },
            holidayPreferredHours: { type: Number, default: 0 },
            scheduleFlexibility: { type: Number, default: 0.5 },
            timeSlotVector: [{ type: Number, default: 0 }]
        },

        // 薪资向量
        salaryVector: {
            expectedHourlyRate: { type: Number, default: 0 },
            minAcceptable: { type: Number, default: 0 },
            maxExpected: { type: Number, default: 0 },
            isFlexible: { type: Boolean, default: true },
            flexibilityScore: { type: Number, default: 0.5 },
            acceptCommission: { type: Boolean, default: true },
            acceptStipend: { type: Boolean, default: true },
            preferredWorkType: [{ type: String }],
            expectedDailyRate: { type: Number, default: null },
            expectedMonthlyRate: { type: Number, default: null }
        },

        // 偏好向量
        preferenceVector: {
            maxCommuteTime: { type: Number, default: 30 },
            minShiftsPerWeek: { type: Number, default: 1 },
            maxShiftsPerWeek: { type: Number, default: 5 },
            preferredCategories: [{ type: String }]
        },

        // 材料统计
        materialStats: {
            totalMaterials: { type: Number, default: 0 },
            certificateCount: { type: Number, default: 0 },
            projectLinkCount: { type: Number, default: 0 },
            githubCount: { type: Number, default: 0 },
            websiteCount: { type: Number, default: 0 },
            documentCount: { type: Number, default: 0 },
            courseworkCount: { type: Number, default: 0 }
        },

        // 综合分数
        compositeScores: {
            overallScore: { type: Number, default: 0 },
            skillScore: { type: Number, default: 0 },
            experienceScore: { type: Number, default: 0 },
            reliabilityScore: { type: Number, default: 0 },
            availabilityScore: { type: Number, default: 0 }
        }
    }
}, { timestamps: true });

// ============================================
// 常量定义
// ============================================
const PROFICIENCY_WEIGHTS = {
    'beginner': 0.3,
    'basic': 0.5,
    'intermediate': 0.7,
    'advanced': 0.85,
    'expert': 1.0
};

const GRADE_VALUES = {
    'freshman': 0.25,
    'sophomore': 0.5,
    'junior': 0.75,
    'senior': 1.0,
    'graduate': 1.2
};

// 软技能分类
const SOFT_SKILL_CATEGORIES = ['communication', 'leadership', 'organizational', 'creative'];

// 素质维度推断规则
const QUALITY_INFERENCE_RULES = {
    teamwork: {
        sources: ['projectExperiences'],
        calculator: (resume) => {
            const projects = resume.projectExperiences || [];
            if (projects.length === 0) return 0.3;
            const teamProjects = projects.filter(p => (p.teamSize || 1) > 1);
            const teamRatio = teamProjects.length / projects.length;
            return Math.min(0.3 + teamRatio * 0.6, 1.0);
        }
    },
    communication: {
        sources: ['campusActivities', 'internshipExperiences'],
        calculator: (resume) => {
            let score = 0.3;
            const campus = resume.campusActivities || [];
            const leadershipCount = campus.filter(a => {
                const pos = (a.position || '').toLowerCase();
                return pos.includes('president') || pos.includes('chair') ||
                    pos.includes('leader') || pos.includes('director') ||
                    pos.includes('head') || pos.includes('部长') ||
                    pos.includes('代表') || pos.includes('负责');
            }).length;
            if (leadershipCount > 0) score += 0.3;

            const internships = resume.internshipExperiences || [];
            if (internships.length > 0) score += 0.2;

            return Math.min(score, 1.0);
        }
    },
    initiative: {
        sources: ['projectExperiences'],
        calculator: (resume) => {
            let score = 0.3;
            const projects = resume.projectExperiences || [];
            const personalProjects = projects.filter(p =>
                p.projectType === 'personal_project' || p.projectType === 'startup_project'
            ).length;
            const competitions = projects.filter(p => p.projectType === 'competition').length;

            score += personalProjects * 0.15 + competitions * 0.1;
            return Math.min(score, 1.0);
        }
    },
    reliability: {
        sources: ['internshipExperiences', 'studentStatus'],
        calculator: (resume) => {
            let score = 0.3;
            const internships = resume.internshipExperiences || [];
            const verifiedCount = internships.filter(i => i.isVerified).length;
            const verificationRate = internships.length > 0 ? verifiedCount / internships.length : 0;
            score += verificationRate * 0.4;

            const gpa = resume.studentStatus?.academicPerformance?.gpa || 0;
            if (gpa >= 3.5) score += 0.2;
            else if (gpa >= 3.0) score += 0.1;

            return Math.min(score, 1.0);
        }
    },
    adaptability: {
        sources: ['skills', 'projectExperiences'],
        calculator: (resume) => {
            let score = 0.3;
            const skills = resume.skills || [];
            const skillCategories = new Set(skills.map(s => s.category));
            score += (skillCategories.size - 1) * 0.1;

            const projects = resume.projectExperiences || [];
            const projectTypes = new Set(projects.map(p => p.projectType));
            score += (projectTypes.size - 1) * 0.1;

            return Math.min(score, 1.0);
        }
    },
    leadership: {
        sources: ['campusActivities'],
        calculator: (resume) => {
            const campus = resume.campusActivities || [];
            const leadershipCount = campus.filter(a => {
                const pos = (a.position || '').toLowerCase();
                return pos.includes('president') || pos.includes('chair') ||
                    pos.includes('leader') || pos.includes('director') ||
                    pos.includes('head') || pos.includes('部长');
            }).length;

            if (leadershipCount >= 2) return 0.9;
            if (leadershipCount === 1) return 0.7;
            if (campus.length > 0) return 0.4;
            return 0.2;
        }
    },
    learningAbility: {
        sources: ['skills', 'academicPerformance'],
        calculator: (resume) => {
            let score = 0.3;
            const skills = resume.skills || [];
            const advancedSkills = skills.filter(s =>
                s.proficiency === 'advanced' || s.proficiency === 'expert'
            ).length;
            score += Math.min(advancedSkills * 0.1, 0.3);

            const gpa = resume.studentStatus?.academicPerformance?.gpa || 0;
            if (gpa >= 3.7) score += 0.3;
            else if (gpa >= 3.3) score += 0.2;
            else if (gpa >= 3.0) score += 0.1;

            return Math.min(score, 1.0);
        }
    }
};

// ============================================
// 向量更新方法（完全重构）
// ============================================
ResumeSchema.methods.updateVector = function() {
    const resume = this;

    // 1. 技能向量
    const skillVector = {
        technical: new Map(),
        language: new Map(),
        soft: new Map(),
        skillYears: new Map(),
        hasCertification: new Map()
    };

    // 处理显式声明的技能
    resume.skills.forEach(skill => {
        const weight = PROFICIENCY_WEIGHTS[skill.proficiency] || 0.5;
        const skillName = skill.name.toLowerCase();

        // 根据分类存储
        if (skill.category === 'technical' || skill.category === 'design' ||
            skill.category === 'office_skill' || skill.category === 'other') {
            skillVector.technical.set(skillName, weight);
        } else if (skill.category === 'language') {
            skillVector.language.set(skillName, weight);
        } else if (SOFT_SKILL_CATEGORIES.includes(skill.category)) {
            skillVector.soft.set(skillName, weight);
        }

        // 检查证书
        const hasCert = skill.supportingMaterials?.some(m => m.type === 'certificate') || false;
        if (hasCert) {
            skillVector.hasCertification.set(skillName, true);
        }
    });

    // 从经历推断技能年限
    const skillYearsMap = new Map();
    resume.projectExperiences?.forEach(proj => {
        const weeks = proj.durationWeeks || 0;
        proj.technologies?.forEach(tech => {
            const techLower = tech.toLowerCase();
            const current = skillYearsMap.get(techLower) || 0;
            skillYearsMap.set(techLower, current + weeks / 52);
        });
    });
    resume.internshipExperiences?.forEach(intern => {
        const weeks = intern.durationWeeks || 0;
        intern.skillsGained?.forEach(skill => {
            const skillLower = skill.toLowerCase();
            const current = skillYearsMap.get(skillLower) || 0;
            skillYearsMap.set(skillLower, current + weeks / 52);
        });
    });
    skillVector.skillYears = skillYearsMap;

    // 2. 经历向量
    const projectStats = {
        totalCount: resume.projectExperiences?.length || 0,
        teamProjectCount: resume.projectExperiences?.filter(p => (p.teamSize || 1) > 1).length || 0,
        competitionCount: resume.projectExperiences?.filter(p => p.projectType === 'competition').length || 0,
        researchCount: resume.projectExperiences?.filter(p => p.projectType === 'research_project').length || 0,
        personalCount: resume.projectExperiences?.filter(p => p.projectType === 'personal_project').length || 0,
        totalDurationWeeks: resume.projectExperiences?.reduce((sum, p) => sum + (p.durationWeeks || 0), 0) || 0,
        avgComplexity: resume.projectExperiences?.length > 0
            ? resume.projectExperiences.reduce((sum, p) => sum + (p.complexity || 3), 0) / resume.projectExperiences.length
            : 0,
        maxComplexity: resume.projectExperiences?.length > 0
            ? Math.max(...resume.projectExperiences.map(p => p.complexity || 3))
            : 0,
        allTechnologies: [...new Set(resume.projectExperiences?.flatMap(p => p.technologies || []) || [])]
    };

    const totalInternships = resume.internshipExperiences?.length || 0;
    const totalInternWeeks = resume.internshipExperiences?.reduce((sum, i) => sum + (i.durationWeeks || 0), 0) || 0;
    const verifiedCount = resume.internshipExperiences?.filter(i => i.isVerified === true).length || 0;

    const internshipStats = {
        totalCount: totalInternships,
        totalDurationWeeks: totalInternWeeks,
        verifiedCount: verifiedCount,
        pendingVerificationCount: resume.internshipExperiences?.filter(i => i.verificationRequest?.status === 'pending').length || 0,
        approvedVerificationCount: resume.internshipExperiences?.filter(i => i.verificationRequest?.status === 'approved').length || 0,
        verificationRate: totalInternships > 0 ? verifiedCount / totalInternships : 0,
        avgDurationWeeks: totalInternships > 0 ? totalInternWeeks / totalInternships : 0,
        hasSupervisorContact: resume.internshipExperiences?.some(i => i.supervisorContact) || false
    };

    const campusStats = {
        totalActivities: resume.campusActivities?.length || 0,
        leadershipRoleCount: resume.campusActivities?.filter(a => {
            const pos = (a.position || '').toLowerCase();
            return pos.includes('president') || pos.includes('chair') ||
                pos.includes('leader') || pos.includes('director') ||
                pos.includes('head') || pos.includes('部长');
        }).length || 0,
        totalActivityWeeks: resume.campusActivities?.reduce((sum, a) => {
            if (!a.startDate) return sum;
            const start = new Date(a.startDate);
            const end = a.endDate ? new Date(a.endDate) : new Date();
            return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24 * 7));
        }, 0) || 0,
        activityTypeCounts: {
            student_union: resume.campusActivities?.filter(a => a.activityType === 'student_union').length || 0,
            club: resume.campusActivities?.filter(a => a.activityType === 'club').length || 0,
            volunteer: resume.campusActivities?.filter(a => a.activityType === 'volunteer').length || 0,
            sports: resume.campusActivities?.filter(a => a.activityType === 'sports').length || 0,
            art: resume.campusActivities?.filter(a => a.activityType === 'art').length || 0,
            academic: resume.campusActivities?.filter(a => a.activityType === 'academic').length || 0
        }
    };

    const academicStats = {
        gpa: resume.studentStatus?.academicPerformance?.gpa || 0,
        gpaNormalized: (resume.studentStatus?.academicPerformance?.gpa || 0) / 4.0,
        ranking: resume.studentStatus?.academicPerformance?.ranking || '',
        grade: resume.studentStatus?.grade || 'freshman',
        gradeWeight: GRADE_VALUES[resume.studentStatus?.grade] || 0.5,
        awardCount: resume.studentStatus?.academicPerformance?.awards?.length || 0,
        expectedGraduation: resume.studentStatus?.expectedGraduation || null
    };

    // 3. 素质向量（从基础字段推断）
    const qualityVector = {};
    Object.keys(QUALITY_INFERENCE_RULES).forEach(quality => {
        qualityVector[quality] = QUALITY_INFERENCE_RULES[quality].calculator(resume);
    });

    // 4. 时间向量
    let weeklyHours = 0;
    let eveningHours = 0;
    let weekendHours = 0;
    const timeSlotVector = new Array(168).fill(0);

    const termTime = resume.availableTime?.termTime;
    if (termTime) {
        termTime.weekdays?.forEach(daySlot => {
            const dayOffset = (daySlot.day - 1) * 48;
            daySlot.timeSlots?.forEach(slot => {
                if (slot.start && slot.end) {
                    const [startH, startM] = slot.start.split(':').map(Number);
                    const [endH, endM] = slot.end.split(':').map(Number);
                    const hours = (endH + endM/60) - (startH + startM/60);

                    if (hours > 0) {
                        weeklyHours += hours;
                        if (endH >= 18) {
                            eveningHours += Math.min(hours, Math.max(0, endH - Math.max(startH, 18)));
                        }

                        const startSlot = dayOffset + Math.floor(startH * 2 + startM/30);
                        const endSlot = dayOffset + Math.ceil(endH * 2 + endM/30);
                        const weight = slot.preferred ? 1.0 : 0.7;

                        for (let i = startSlot; i < endSlot && i < 120; i++) {
                            timeSlotVector[i] = Math.max(timeSlotVector[i], weight);
                        }
                    }
                }
            });
        });

        termTime.weekends?.forEach(daySlot => {
            const dayOffset = (daySlot.day === 6 ? 5 : 6) * 24;
            daySlot.timeSlots?.forEach(slot => {
                if (slot.start && slot.end) {
                    const [startH, startM] = slot.start.split(':').map(Number);
                    const [endH, endM] = slot.end.split(':').map(Number);
                    const hours = (endH + endM/60) - (startH + startM/60);

                    if (hours > 0) {
                        weekendHours += hours;
                        weeklyHours += hours;

                        const startSlot = dayOffset + Math.floor(startH * 2 + startM/30);
                        const endSlot = dayOffset + Math.ceil(endH * 2 + endM/30);
                        const weight = slot.preferred ? 1.0 : 0.7;

                        for (let i = startSlot; i < endSlot && i < 168; i++) {
                            timeSlotVector[i] = Math.max(timeSlotVector[i], weight);
                        }
                    }
                }
            });
        });
    }

    const hasPreferred = termTime?.weekdays?.some(d => d.timeSlots?.some(s => s.preferred)) ||
        termTime?.weekends?.some(d => d.timeSlots?.some(s => s.preferred));

    const timeVector = {
        weeklyAvailableHours: Math.round(weeklyHours * 10) / 10,
        weekendAvailabilityScore: Math.min(weekendHours / 16, 1.0),
        eveningAvailabilityScore: Math.min(eveningHours / 20, 1.0),
        emergencyAvailable: resume.availableTime?.emergencyAvailability || false,
        holidayAvailable: resume.availableTime?.holidayTime?.isAvailable || false,
        holidayPreferredHours: resume.availableTime?.holidayTime?.preferredHoursPerDay || 0,
        scheduleFlexibility: hasPreferred ? 0.8 : 0.4,
        timeSlotVector
    };

    // 5. 薪资向量
    const hourlyMin = resume.salaryExpectation?.hourly?.min || resume.salaryExpectation?.min || 0;
    const hourlyMax = resume.salaryExpectation?.hourly?.max || resume.salaryExpectation?.max || 0;
    const dailyMin = resume.salaryExpectation?.daily?.min || 0;
    const dailyMax = resume.salaryExpectation?.daily?.max || 0;
    const monthlyMin = resume.salaryExpectation?.monthly?.min || 0;
    const monthlyMax = resume.salaryExpectation?.monthly?.max || 0;

    // 计算等效时薪（优先使用 hourly，其次通过 min/max 兼容旧数据）
    let effectiveHourlyMin = hourlyMin;
    let effectiveHourlyMax = hourlyMax;

    // 兼容旧数据：如果没有 hourly 但是有旧的 min/max
    if (effectiveHourlyMin === 0 && effectiveHourlyMax === 0) {
        effectiveHourlyMin = resume.salaryExpectation?.min || 0;
        effectiveHourlyMax = resume.salaryExpectation?.max || 0;
    }

    const salaryVector = {
        expectedHourlyRate: (effectiveHourlyMin + effectiveHourlyMax) / 2,
        minAcceptable: effectiveHourlyMin,
        maxExpected: effectiveHourlyMax,
        // 新增：多种薪资类型期望
        expectedDailyRate: dailyMin > 0 ? (dailyMin + dailyMax) / 2 : null,
        expectedMonthlyRate: monthlyMin > 0 ? (monthlyMin + monthlyMax) / 2 : null,
        isFlexible: resume.salaryExpectation?.flexible !== false,
        flexibilityScore: resume.salaryExpectation?.flexible !== false ? 0.8 : 0.2,
        // 薪资类型偏好
        acceptCommission: resume.salaryExpectation?.acceptCommission !== false,
        acceptStipend: resume.salaryExpectation?.acceptStipend !== false,
        preferredWorkType: resume.salaryExpectation?.preferredWorkType || ['hourly']
    };

    console.log('[Resume向量化] 薪资向量:', {
        hourlyRange: `${effectiveHourlyMin}-${effectiveHourlyMax}`,
        hasDaily: dailyMin > 0,
        hasMonthly: monthlyMin > 0,
        acceptCommission: salaryVector.acceptCommission,
        acceptStipend: salaryVector.acceptStipend,
        preferredTypes: salaryVector.preferredWorkType
    });

    // 6. 偏好向量
    const preferenceVector = {
        maxCommuteTime: resume.jobPreferences?.maxCommuteTime || 30,
        minShiftsPerWeek: resume.jobPreferences?.minShiftsPerWeek || 1,
        maxShiftsPerWeek: resume.jobPreferences?.maxShiftsPerWeek || 5,
        preferredCategories: resume.jobPreferences?.preferredCategories || []
    };

    // 7. 材料统计
    const materialStats = {
        totalMaterials: 0,
        certificateCount: 0,
        projectLinkCount: 0,
        githubCount: 0,
        websiteCount: 0,
        documentCount: 0,
        courseworkCount: 0
    };

    const collectMaterials = (materials) => {
        if (!materials) return;
        materials.forEach(m => {
            materialStats.totalMaterials++;
            switch(m.type) {
                case 'certificate': materialStats.certificateCount++; break;
                case 'project_link': materialStats.projectLinkCount++; break;
                case 'github': materialStats.githubCount++; break;
                case 'website': materialStats.websiteCount++; break;
                case 'document': materialStats.documentCount++; break;
                case 'coursework': materialStats.courseworkCount++; break;
            }
        });
    };

    resume.skills?.forEach(s => collectMaterials(s.supportingMaterials));
    resume.projectExperiences?.forEach(p => collectMaterials(p.supportingMaterials));
    resume.internshipExperiences?.forEach(i => collectMaterials(i.verificationRequest?.supportingMaterials));

    // 8. 综合分数
    const skillScore = Math.min(
        (skillVector.technical.size * 8) +
        (skillVector.language.size * 5) +
        Array.from(skillVector.technical.values()).reduce((a, b) => a + b, 0) * 10,
        100
    );

    const experienceScore = Math.min(
        (projectStats.totalCount * 8) +
        (projectStats.competitionCount * 5) +
        (projectStats.researchCount * 6) +
        (internshipStats.totalCount * 12) +
        (internshipStats.verifiedCount * 10) +
        (campusStats.leadershipRoleCount * 6) +
        (academicStats.awardCount * 4) +
        (academicStats.gradeWeight * 15),
        100
    );

    const reliabilityScore = Math.min(
        (internshipStats.verificationRate * 35) +
        (internshipStats.hasSupervisorContact ? 10 : 0) +
        (materialStats.certificateCount * 5) +
        (projectStats.totalCount >= 2 ? 10 : 0) +
        (academicStats.awardCount >= 1 ? 10 : 0) + 30,
        100
    );

    const availabilityScore = Math.min(
        (timeVector.weeklyAvailableHours / 40) * 50 +
        timeVector.weekendAvailabilityScore * 20 +
        timeVector.eveningAvailabilityScore * 15 +
        (timeVector.emergencyAvailable ? 10 : 0) +
        (timeVector.holidayAvailable ? 5 : 0),
        100
    );

    const compositeScores = {
        overallScore: Math.round(skillScore * 0.25 + experienceScore * 0.30 + reliabilityScore * 0.25 + availabilityScore * 0.20),
        skillScore: Math.round(skillScore),
        experienceScore: Math.round(experienceScore),
        reliabilityScore: Math.round(reliabilityScore),
        availabilityScore: Math.round(availabilityScore)
    };

    // 更新向量
    resume.vector = {
        skillVector,
        experienceVector: { projectStats, internshipStats, campusStats, academicStats },
        qualityVector,
        timeVector,
        salaryVector,
        preferenceVector,
        materialStats,
        compositeScores
    };

    return resume;
};

ResumeSchema.pre('save', function(next) {
    const resume = this;

    // 自动更新所有补充材料的最后更新时间
    const updateMaterialTime = (materials) => {
        if (materials && materials.length > 0) {
            materials.forEach(m => {
                if (m.isModified()) m.finalUpdateAt = new Date();
            });
        }
    };

    resume.skills.forEach(s => updateMaterialTime(s.supportingMaterials));
    resume.projectExperiences.forEach(p => updateMaterialTime(p.supportingMaterials));
    resume.internshipExperiences.forEach(i => updateMaterialTime(i.verificationRequest?.supportingMaterials));

    // 增强时间计算的安全性 (防止 split 导致的 NaN)
    let weeklyHours = 0;
    const termTime = resume.availableTime?.termTime;
    if (termTime) {
        ['weekdays', 'weekends'].forEach(dayType => {
            if (Array.isArray(termTime[dayType])) {
                termTime[dayType].forEach(slot => {
                    if (slot.start && slot.end && slot.start.includes(':') && slot.end.includes(':')) {
                        const start = parseInt(slot.start.split(':')[0], 10);
                        const end = parseInt(slot.end.split(':')[0], 10);
                        if (!isNaN(start) && !isNaN(end)) {
                            weeklyHours += (end - start) * (slot.preferred ? 1.2 : 1);
                        }
                    }
                });
            }
        });
    }

});


module.exports = mongoose.model('Resume', ResumeSchema);