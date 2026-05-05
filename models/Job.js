// Job.js
const mongoose = require('mongoose');

// ============================================
// 技能要求子文档
// ============================================
const SkillRequirementSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },

    category: {
        type: String,
        enum: ['technical', 'language', 'office_skill', 'design', 'communication', 'leadership', 'organizational', 'creative', 'other'],
        default: 'other'
    },

    minProficiency: {
        type: String,
        enum: ['beginner', 'basic', 'intermediate', 'advanced', 'expert'],
        default: 'basic'
    },

    isMandatory: { type: Boolean, default: true },
    priority: { type: Number, min: 1, max: 5, default: 3 },
    yearsRequired: { type: Number, default: 0, min: 0 },
    certificationRequired: { type: Boolean, default: false }
});

// ============================================
// 经历要求子文档
// ============================================
const ExperienceRequirementSchema = new mongoose.Schema({
    projectsRequired: {
        minProjects: { type: Number, default: 0 },
        projectTypes: [{
            type: String,
            enum: ['course_project', 'competition', 'research_project', 'club_activity', 'volunteer', 'personal_project', 'startup_project', 'internship_project']
        }],
        minComplexity: { type: Number, min: 1, max: 5, default: 2 },
        preferTeamProject: { type: Boolean, default: false },
        minTeamSize: { type: Number, default: 1 },
        requiredTechnologies: [{ type: String, trim: true }],
        projectDurationPreference: {
            minWeeks: { type: Number, default: 0 },
            maxWeeks: { type: Number }
        }
    },

    internshipsRequired: {
        minInternships: { type: Number, default: 0 },
        minDurationWeeks: { type: Number, default: 0 },
        requireVerification: { type: Boolean, default: false },
        acceptedVerificationStatus: [{
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: ['approved']
        }],
        relevantFields: [{ type: String, trim: true }],
        requireSupervisorContact: { type: Boolean, default: false }
    },

    campusExperienceRequired: {
        leadershipRoles: { type: Boolean, default: false },
        clubMembership: { type: Boolean, default: false },
        eventOrganization: { type: Boolean, default: false },
        preferredActivityTypes: [{
            type: String,
            enum: ['student_union', 'club', 'volunteer', 'sports', 'art', 'academic']
        }],
        minActivityWeeks: { type: Number, default: 0 }
    },

    academicRequirements: {
        minGrade: {
            type: String,
            enum: ['freshman', 'sophomore', 'junior', 'senior', 'graduate'],
            default: 'freshman'
        },
        gpaRequirement: { type: Number, min: 0, max: 5 },
        majorRelevance: [{ type: String, trim: true }],
        requireAwards: { type: Boolean, default: false }
    }
});

// ============================================
// 材料要求子文档
// ============================================
const MaterialRequirementSchema = new mongoose.Schema({
    required: [{
        type: String,
        enum: ['certificate', 'coursework', 'project_link', 'github', 'website', 'document', 'other']
    }],
    optional: [{
        type: String,
        enum: ['certificate', 'coursework', 'project_link', 'github', 'website', 'document', 'other']
    }],
    verificationRequired: { type: Boolean, default: false },
    minMaterialsCount: { type: Number, default: 0 }
});

// ============================================
// 学生状态适配子文档
// ============================================
const StudentStatusPreferenceSchema = new mongoose.Schema({
    preferredGrades: [{
        type: String,
        enum: ['freshman', 'sophomore', 'junior', 'senior', 'graduate']
    }],
    examPeriodFlexibility: {
        type: String,
        enum: ['strict', 'flexible', 'no_work_during_exams'],
        default: 'flexible'
    },
    semesterBreakAvailability: {
        required: { type: Boolean, default: false },
        minWeeks: { type: Number }
    },
    acceptFreshman: { type: Boolean, default: true },
    acceptGraduating: { type: Boolean, default: true }
});

// ============================================
// 工作时间安排子文档
// ============================================
const CampusWorkScheduleSchema = new mongoose.Schema({
    scheduleType: {
        type: String,
        enum: ['fixed_shifts', 'flexible_hours', 'project_based', 'event_based', 'on_demand'],
        required: true
    },

    termSchedule: {
        weekdays: [{
            day: { type: Number, min: 1, max: 5 },
            shifts: [{
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                requiredStaff: { type: Number, min: 1 }
            }]
        }],
        weekends: [{
            day: { type: Number, enum: [6, 7] },
            shifts: [{
                start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
                requiredStaff: { type: Number, min: 1 }
            }]
        }]
    },

    holidaySchedule: {
        available: { type: Boolean, default: false },
        hoursPerDay: { type: Number, min: 0, max: 12, default: 8 }
    },

    flexibility: {
        allowEarlyLeave: { type: Boolean, default: false },
        allowShiftSwap: { type: Boolean, default: false },
        minWeeklyHours: { type: Number, default: 4 },
        maxWeeklyHours: { type: Number, default: 20 },
        allowTimePreference: { type: Boolean, default: false }
    },

    studentStatusPreference: StudentStatusPreferenceSchema
});

// ============================================
// 薪资结构子文档
// ============================================
const CampusSalarySchema = new mongoose.Schema({
    baseRate: { type: Number, required: true, min: 0 },

    rateType: {
        type: String,
        enum: ['hourly', 'per_shift', 'per_project', 'commission', 'stipend'],
        default: 'hourly'
    },

    premiumRates: {
        weekendMultiplier: { type: Number, default: 1.2 },
        eveningMultiplier: { type: Number, default: 1.1 },
        holidayMultiplier: { type: Number, default: 1.5 }
    },

    performanceBonus: {
        attendanceBonus: { type: Number, default: 0 },
        completionBonus: { type: Number, default: 0 },
        qualityBonus: { type: Number, default: 0 }
    },

    benefits: {
        mealAllowance: { type: Number, default: 0 },
        transportationAllowance: { type: Number, default: 0 },
        trainingProvided: { type: Boolean, default: false },
        certificateProvided: { type: Boolean, default: true }
    },

    paymentSchedule: {
        type: String,
        enum: ['weekly', 'biweekly', 'monthly', 'upon_completion'],
        default: 'monthly'
    },

    negotiable: { type: Boolean, default: true },

    salaryRange: {
        min: { type: Number, min: 0 },
        max: { type: Number, min: 0 }
    },

    studentBenefits: {
        flexiblePayment: { type: Boolean, default: false },
        studyLeave: { type: Boolean, default: false },
        referenceLetter: { type: Boolean, default: false }
    }
});

// ============================================
// 岗位主Schema
// ============================================
const JobSchema = new mongoose.Schema({
    employerUUID: {
        type: String,
        required: true,
        index: true
    },

    // 基本信息
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    category: {
        type: String,
        enum: [
            'campus_job', 'tutoring', 'research_assistant', 'library_assistant',
            'lab_assistant', 'event_staff', 'retail', 'food_service',
            'customer_service', 'content_creation', 'data_entry', 'design',
            'programming', 'marketing', 'delivery', 'surveys', 'other'
        ],
        required: true
    },

    jobNature: {
        type: String,
        enum: ['regular', 'one_time', 'seasonal', 'project_based', 'emergency'],
        default: 'regular'
    },

    // 核心要求
    skillRequirements: [SkillRequirementSchema],
    experienceRequirements: { type: ExperienceRequirementSchema, default: () => ({}) },
    materialRequirements: { type: MaterialRequirementSchema, default: () => ({}) },

    // 岗位职责
    responsibilities: [{
        description: { type: String, required: true, trim: true },
        estimatedHours: { type: Number, default: 0 }
    }],

    // 工作安排
    workSchedule: {
        type: CampusWorkScheduleSchema, required: true,
        estimatedHoursPerShift: Number,  // 每班次预计小时数（用于折算）
        estimatedTotalHours: Number,     // 预计总工时（项目制使用）
        estimatedWorkDays: Number        // 预估工作天数（用于福利计算）
    },

    // 薪资
    salary: { type: CampusSalarySchema, required: true },

    // 工作地点
    location: {
        campusArea: { type: Boolean, default: false },
        campusBuilding: { type: String, trim: true },
        offCampusAddress: { type: String, trim: true },
        remoteAllowed: { type: Boolean, default: false },
        hybridAllowed: { type: Boolean, default: false },
        coordinates: {
            latitude: { type: Number },
            longitude: { type: Number }
        },
        estimatedCommuteFromCampus: { type: Number, default: 0 }
    },

    // 招聘信息
    vacancies: { type: Number, required: true, min: 1 },
    applicationDeadline: { type: Date },
    startDate: { type: Date, required: true },
    duration: {// 时长
        type: String,
        enum: ['one_week', 'two_weeks', 'one_month', 'one_semester', 'flexible', 'ongoing'],
        default: 'flexible'
    },

    applicationRequirements: {
        resumeRequired: { type: Boolean, default: true },
        portfolioRequired: { type: Boolean, default: false },
        interviewRequired: { type: Boolean, default: true },
        trainingRequired: { type: Boolean, default: false }
    },

    // 岗位状态
    status: {
        type: String,
        enum: ['draft', 'published', 'closed', 'filled', 'expired','deleted'],
        default: 'draft',
        index: true
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },

    // ============================================
    // 向量化表示（用于快速匹配）
    // ============================================
    vector: {
        // 技能要求向量
        skillVector: {
            technical: { type: Map, of: Object, default: {} },
            language: { type: Map, of: Number, default: {} },
            soft: { type: Map, of: Number, default: {} },
            certifications: { type: Map, of: Boolean, default: {} }
        },

        // 经历要求向量
        experienceVector: {
            project: {
                minCount: { type: Number, default: 0 },
                minComplexity: { type: Number, default: 0 },
                teamPreference: { type: Number, default: 0 },
                typeWeights: { type: Map, of: Number, default: {} },
                requiredTechs: [{ type: String }],
                minWeeks: { type: Number, default: 0 }
            },
            internship: {
                minCount: { type: Number, default: 0 },
                minWeeks: { type: Number, default: 0 },
                verificationWeight: { type: Number, default: 0 },
                relevantFields: [{ type: String }]
            },
            campus: {
                leadershipWeight: { type: Number, default: 0 },
                clubWeight: { type: Number, default: 0 },
                typeWeights: { type: Map, of: Number, default: {} },
                minWeeks: { type: Number, default: 0 }
            },
            academic: {
                minGradeValue: { type: Number, default: 0 },
                gpaRequired: { type: Number, default: 0 },
                majorKeywords: [{ type: String }],
                awardsWeight: { type: Number, default: 0 }
            }
        },

        // 素质要求向量
        qualityVector: {
            teamwork: { type: Number, default: 0 },
            communication: { type: Number, default: 0 },
            initiative: { type: Number, default: 0 },
            reliability: { type: Number, default: 0.3 },
            adaptability: { type: Number, default: 0 },
            leadership: { type: Number, default: 0 },
            learningAbility: { type: Number, default: 0.3 }
        },

        // 时间要求向量
        timeVector: {
            weeklyHoursMin: { type: Number, default: 0 },
            weeklyHoursMax: { type: Number, default: 40 },
            weekendWeight: { type: Number, default: 0 },
            eveningWeight: { type: Number, default: 0 },
            emergencyWeight: { type: Number, default: 0 },
            holidayWeight: { type: Number, default: 0 },
            flexibilityWeight: { type: Number, default: 0.5 },
            timeSlots: [{ type: Number, default: 0 }],
            gradeWeights: { type: Map, of: Number, default: {} },
            examFlexibility: { type: Number, default: 0.5 }
        },

        // 薪资向量
        salaryVector: {
            baseRate: { type: Number, default: 0 },
            rateType: { type: String, default: 'hourly' },
            rangeMin: { type: Number, default: 0 },
            rangeMax: { type: Number, default: 0 },
            equivalentHourlyMin: { type: Number, default: 0 },     // 新增
            equivalentHourlyMax: { type: Number, default: 0 },     // 新增
            isCommissionBased: { type: Boolean, default: false },  // 新增
            negotiable: { type: Number, default: 0 },
            totalValue: { type: Number, default: 0 },
            benefitWeights: {
                meal: { type: Number, default: 0 },
                transport: { type: Number, default: 0 },
                training: { type: Number, default: 0 },
                certificate: { type: Number, default: 0 },
                reference: { type: Number, default: 0 }
            }
        },

        // 地点向量
        locationVector: {
            onCampus: { type: Number, default: 0 },
            remoteAllowed: { type: Number, default: 0 },
            hybridAllowed: { type: Number, default: 0 },
            commuteMinutes: { type: Number, default: 0 }
        },

        // 材料要求向量
        materialVector: {
            requiredTypes: [{ type: String }],
            optionalTypes: [{ type: String }],
            verificationWeight: { type: Number, default: 0 },
            minCount: { type: Number, default: 0 }
        },

        // 类别偏好向量
        categoryVector: {
            preferredCategories: [{ type: String }]
        }
    }
}, { timestamps: true });

// ============================================
// 常量定义
// ============================================
const PROFICIENCY_WEIGHTS = {
    'beginner': 0.2,
    'basic': 0.4,
    'intermediate': 0.6,
    'advanced': 0.8,
    'expert': 1.0
};

const GRADE_VALUES = {
    'freshman': 0.25,
    'sophomore': 0.5,
    'junior': 0.75,
    'senior': 1.0,
    'graduate': 1.2
};

const EXAM_FLEXIBILITY_VALUES = {
    'strict': 0.2,
    'flexible': 0.6,
    'no_work_during_exams': 0.0
};

// 软技能到素质维度的映射
const SOFT_SKILL_TO_QUALITY_MAP = {
    'teamwork': 'teamwork',
    'collaboration': 'teamwork',
    'communication': 'communication',
    'presentation': 'communication',
    'initiative': 'initiative',
    'proactive': 'initiative',
    'adaptability': 'adaptability',
    'flexibility': 'adaptability',
    'leadership': 'leadership',
    'management': 'leadership',
    'learning': 'learningAbility',
    'quick learner': 'learningAbility'
};

// ============================================
// 向量更新方法
// ============================================
JobSchema.methods.updateVector = function() {
    const job = this;

    // 1. 技能向量
    const skillVector = {
        technical: new Map(),
        language: new Map(),
        soft: new Map(),
        certifications: new Map()
    };

    (job.skillRequirements || []).forEach(req => {
        const baseWeight = PROFICIENCY_WEIGHTS[req.minProficiency] || 0.4;
        const priorityMultiplier = 0.6 + (req.priority / 5) * 0.4;
        const mandatoryMultiplier = req.isMandatory ? 1.0 : 0.5;

        const finalWeight = Math.min(
            baseWeight * priorityMultiplier * mandatoryMultiplier,
            1.0
        );

        const skillName = req.name.toLowerCase();

        // 根据分类存储
        if (['technical', 'design', 'office_skill', 'other'].includes(req.category)) {
            skillVector.technical.set(skillName, {
                weight: finalWeight,
                yearsRequired: req.yearsRequired || 0,
                certification: req.certificationRequired || false
            });
        } else if (req.category === 'language') {
            skillVector.language.set(skillName, finalWeight);
        } else {
            skillVector.soft.set(skillName, finalWeight);
        }

        if (req.certificationRequired) {
            skillVector.certifications.set(skillName, true);
        }
    });

    // 2. 经历向量
    const expReq = job.experienceRequirements || {};

    const experienceVector = {
        project: {
            minCount: expReq.projectsRequired?.minProjects || 0,
            minComplexity: expReq.projectsRequired?.minComplexity || 0,
            teamPreference: expReq.projectsRequired?.preferTeamProject ? 0.8 : 0.2,
            typeWeights: new Map(),
            requiredTechs: expReq.projectsRequired?.requiredTechnologies || [],
            minWeeks: expReq.projectsRequired?.projectDurationPreference?.minWeeks || 0
        },
        internship: {
            minCount: expReq.internshipsRequired?.minInternships || 0,
            minWeeks: expReq.internshipsRequired?.minDurationWeeks || 0,
            verificationWeight: expReq.internshipsRequired?.requireVerification ? 1.0 : 0.0,
            relevantFields: expReq.internshipsRequired?.relevantFields || []
        },
        campus: {
            leadershipWeight: expReq.campusExperienceRequired?.leadershipRoles ? 0.8 : 0.0,
            clubWeight: expReq.campusExperienceRequired?.clubMembership ? 0.6 : 0.0,
            typeWeights: new Map(),
            minWeeks: expReq.campusExperienceRequired?.minActivityWeeks || 0
        },
        academic: {
            minGradeValue: GRADE_VALUES[expReq.academicRequirements?.minGrade] || 0.25,
            gpaRequired: (expReq.academicRequirements?.gpaRequirement || 0) / 4.0,
            majorKeywords: expReq.academicRequirements?.majorRelevance || [],
            awardsWeight: expReq.academicRequirements?.requireAwards ? 0.5 : 0.0
        }
    };

    // 填充Map
    (expReq.projectsRequired?.projectTypes || []).forEach(type => {
        experienceVector.project.typeWeights.set(type, 1.0);
    });
    (expReq.campusExperienceRequired?.preferredActivityTypes || []).forEach(type => {
        experienceVector.campus.typeWeights.set(type, 1.0);
    });

    // 3. 时间向量
    const schedule = job.workSchedule || {};
    const termSchedule = schedule.termSchedule || {};

    let weeklyHoursMin = schedule.flexibility?.minWeeklyHours || 0;
    let weeklyHoursMax = schedule.flexibility?.maxWeeklyHours || 40;
    let calculatedWeeklyHours = 0;

    // 构建168维时间槽向量
    const timeSlots = new Array(168).fill(0);

    const processShifts = (shifts, dayOffset, weightMultiplier = 1.0) => {
        shifts?.forEach(shift => {
            if (shift.start && shift.end) {
                const startParts = shift.start.split(':');
                const endParts = shift.end.split(':');
                const startHour = parseInt(startParts[0]);
                const startMin = parseInt(startParts[1]) || 0;
                const endHour = parseInt(endParts[0]);
                const endMin = parseInt(endParts[1]) || 0;

                const hours = (endHour + endMin/60) - (startHour + startMin/60);
                if (hours > 0) {
                    calculatedWeeklyHours += hours;

                    const startSlot = dayOffset + Math.floor(startHour * 2 + startMin/30);
                    const endSlot = dayOffset + Math.ceil(endHour * 2 + endMin/30);
                    const weight = weightMultiplier / (shift.requiredStaff || 1);

                    for (let i = startSlot; i < endSlot && i < 168; i++) {
                        timeSlots[i] = Math.max(timeSlots[i], weight);
                    }
                }
            }
        });
    };

    (termSchedule.weekdays || []).forEach(daySchedule => {
        const dayOffset = (daySchedule.day - 1) * 48;
        processShifts(daySchedule.shifts, dayOffset, 1.0);
    });

    (termSchedule.weekends || []).forEach(daySchedule => {
        const dayOffset = (daySchedule.day === 6 ? 5 : 6) * 24;
        processShifts(daySchedule.shifts, dayOffset, 1.2);
    });

    // 使用计算出的工时作为参考
    if (calculatedWeeklyHours > 0) {
        weeklyHoursMin = Math.max(weeklyHoursMin, calculatedWeeklyHours * 0.7);
        weeklyHoursMax = Math.max(weeklyHoursMax, calculatedWeeklyHours * 1.3);
    }

    const weekendWeight = termSchedule.weekends?.length > 0 ? 0.8 : 0;
    const eveningWeight = timeSlots.some((v, i) => v > 0 && (i % 48) >= 36) ? 0.7 : 0;
    const emergencyWeight = schedule.scheduleType === 'on_demand' ? 0.9 : 0.2;
    const holidayWeight = schedule.holidaySchedule?.available ? 0.8 : 0;
    const flexibilityWeight = schedule.flexibility?.allowShiftSwap ? 0.8 : 0.3;

    const gradeWeights = new Map();
    (schedule.studentStatusPreference?.preferredGrades || []).forEach(grade => {
        gradeWeights.set(grade, 1.0);
    });

    const examFlexibility = EXAM_FLEXIBILITY_VALUES[
        schedule.studentStatusPreference?.examPeriodFlexibility
        ] || 0.5;

    const timeVector = {
        weeklyHoursMin,
        weeklyHoursMax,
        weekendWeight,
        eveningWeight,
        emergencyWeight,
        holidayWeight,
        flexibilityWeight,
        timeSlots,
        gradeWeights,
        examFlexibility
    };

    // 4. 薪资向量
    const salary = job.salary || {};
    const baseRate = salary.baseRate || 0;
    const rateType = salary.rateType || 'hourly';
    const salaryRange = salary.salaryRange || {};
    const rangeMin = salaryRange.min || baseRate * 0.8;
    const rangeMax = salaryRange.max || baseRate * 1.2;

    // ========== 等效时薪折算 ==========
    let equivalentHourlyMin = rangeMin;
    let equivalentHourlyMax = rangeMax;
    let isCommissionBased = false;
    const workSchedule = job.workSchedule || {};
    const flexibility = workSchedule.flexibility || {};

    // 获取每周工时参考值
    const avgWeeklyHours = ((flexibility.minWeeklyHours || 4) + (flexibility.maxWeeklyHours || 20)) / 2;

    // ==========计算奖金均摊值 ==========
    const performanceBonus = salary.performanceBonus || {};
    const totalBonus = (performanceBonus.attendanceBonus || 0) +
        (performanceBonus.completionBonus || 0) +
        (performanceBonus.qualityBonus || 0);

    // 根据薪资类型确定总工时，用于均摊奖金
    let bonusPerHour = 0;

    console.log('[Job向量化] 薪资类型:', rateType, '基础薪资:', baseRate, '每周工时:', avgWeeklyHours, '奖金总额:', totalBonus);

    switch (rateType) {
        case 'hourly':
            // 时薪：直接使用
            equivalentHourlyMin = rangeMin;
            equivalentHourlyMax = rangeMax;

            // 按预估总工时均摊奖金（假设16周一学期）
            const hourlyTotalHours = avgWeeklyHours * 16;
            bonusPerHour = hourlyTotalHours > 0 ? totalBonus / hourlyTotalHours : 0;

            // 将奖金均摊到等效时薪
            equivalentHourlyMin += bonusPerHour;
            equivalentHourlyMax += bonusPerHour;

            console.log('[Job向量化] 时薪制，预估总工时:', hourlyTotalHours,
                'h，奖金均摊/时:', bonusPerHour.toFixed(2),
                '，等效时薪:', equivalentHourlyMin.toFixed(2), '-', equivalentHourlyMax.toFixed(2));
            break;

        case 'per_shift':
            // 按班次：计算平均班次时长
            const termSchedule = workSchedule.termSchedule || {};
            let avgShiftHours = 4;
            let totalShiftCount = 0;
            const allShifts = [
                ...(termSchedule.weekdays || []),
                ...(termSchedule.weekends || [])
            ];

            if (allShifts.length > 0) {
                let totalHours = 0;
                let shiftCount = 0;
                allShifts.forEach(day => {
                    (day.shifts || []).forEach(shift => {
                        if (shift.start && shift.end) {
                            const [sh, sm] = shift.start.split(':').map(Number);
                            const [eh, em] = shift.end.split(':').map(Number);
                            const hours = (eh + em/60) - (sh + sm/60);
                            if (hours > 0) {
                                totalHours += hours;
                                shiftCount++;
                            }
                        }
                        totalShiftCount++;
                    });
                });
                if (shiftCount > 0) avgShiftHours = totalHours / shiftCount;
            }

            equivalentHourlyMin = avgShiftHours > 0 ? rangeMin / avgShiftHours : rangeMin;
            equivalentHourlyMax = avgShiftHours > 0 ? rangeMax / avgShiftHours : rangeMax;

            // 按预估总班次均摊奖金
            const estimatedTotalShifts = Math.max(totalShiftCount, 1) * 16; // 16周
            bonusPerHour = (estimatedTotalShifts * avgShiftHours) > 0
                ? totalBonus / (estimatedTotalShifts * avgShiftHours)
                : 0;

            // 将奖金均摊到等效时薪
            equivalentHourlyMin += bonusPerHour;
            equivalentHourlyMax += bonusPerHour;

            console.log('[Job向量化] 按班次制，平均班次:', avgShiftHours.toFixed(1),
                'h，预估总班次:', estimatedTotalShifts,
                '，奖金均摊/时:', bonusPerHour.toFixed(2),
                '，等效时薪:', equivalentHourlyMin.toFixed(2), '-', equivalentHourlyMax.toFixed(2));
            break;

        case 'per_project':
            // 按项目：估算总工时
            const durationMap = {
                'one_week': 1, 'two_weeks': 2, 'one_month': 4,
                'one_semester': 16, 'flexible': 8, 'ongoing': 16
            };
            const estimatedWeeks = durationMap[job.duration] || 8;
            const estimatedTotalHours = avgWeeklyHours * estimatedWeeks;

            equivalentHourlyMin = estimatedTotalHours > 0 ? rangeMin / estimatedTotalHours : rangeMin;
            equivalentHourlyMax = estimatedTotalHours > 0 ? rangeMax / estimatedTotalHours : rangeMax;

            // 按项目总工时均摊奖金
            bonusPerHour = estimatedTotalHours > 0 ? totalBonus / estimatedTotalHours : 0;

            // 将奖金均摊到等效时薪
            equivalentHourlyMin += bonusPerHour;
            equivalentHourlyMax += bonusPerHour;

            console.log('[Job向量化] 项目制，预估总工时:', estimatedTotalHours,
                'h，奖金均摊/时:', bonusPerHour.toFixed(2),
                '，等效时薪:', equivalentHourlyMin.toFixed(2), '-', equivalentHourlyMax.toFixed(2));
            break;

        case 'commission':
            // 提成制：标记无法折算
            isCommissionBased = true;
            equivalentHourlyMin = rangeMin;
            equivalentHourlyMax = rangeMax;
            bonusPerHour = 0; // 提成制无法均摊奖金
            console.log('[Job向量化] 提成制，无法折算等效时薪，奖金不参与计算');
            break;

        case 'stipend':
            // 固定津贴：按月折算
            const monthlyHours = avgWeeklyHours * 4;

            // 按工作月数均摊奖金
            let stipendMonths = 3; // 默认3个月
            if (job.duration === 'one_semester') stipendMonths = 4;
            else if (job.duration === 'one_month') stipendMonths = 1;
            else if (job.duration === 'one_week') stipendMonths = 0.25;
            else if (job.duration === 'two_weeks') stipendMonths = 0.5;

            const stipendTotalHours = monthlyHours * stipendMonths;

            equivalentHourlyMin = monthlyHours > 0 ? rangeMin / monthlyHours : rangeMin;
            equivalentHourlyMax = monthlyHours > 0 ? rangeMax / monthlyHours : rangeMax;

            bonusPerHour = stipendTotalHours > 0 ? totalBonus / stipendTotalHours : 0;

            // 将奖金均摊到等效时薪
            equivalentHourlyMin += bonusPerHour;
            equivalentHourlyMax += bonusPerHour;

            console.log('[Job向量化] 固定津贴制，工作月数:', stipendMonths,
                '，总工时:', stipendTotalHours,
                'h，奖金均摊/时:', bonusPerHour.toFixed(2),
                '，等效时薪:', equivalentHourlyMin.toFixed(2), '-', equivalentHourlyMax.toFixed(2));
            break;
    }

    // 计算总价值（含溢价）
    let totalValue = baseRate;
    if (salary.premiumRates && !isCommissionBased) {
        const weekendRatio = (workSchedule.termSchedule?.weekends || []).length > 0 ? 0.3 : 0;
        const holidayRatio = (workSchedule.holidaySchedule || {}).available ? 0.1 : 0;
        totalValue *= (1 +
            ((salary.premiumRates.weekendMultiplier || 1) - 1) * weekendRatio +
            ((salary.premiumRates.eveningMultiplier || 1) - 1) * 0.2 +
            ((salary.premiumRates.holidayMultiplier || 1) - 1) * holidayRatio
        );
    }

    const benefitWeights = {
        meal: (salary.benefits || {}).mealAllowance > 0 ? 0.3 : 0,
        transport: (salary.benefits || {}).transportationAllowance > 0 ? 0.3 : 0,
        training: (salary.benefits || {}).trainingProvided ? 0.4 : 0,
        certificate: (salary.benefits || {}).certificateProvided ? 0.3 : 0,
        reference: (salary.studentBenefits || {}).referenceLetter ? 0.4 : 0
    };

    const salaryVector = {
        baseRate,
        rateType,
        rangeMin,
        rangeMax,
        equivalentHourlyMin: Math.round(equivalentHourlyMin * 100) / 100,
        equivalentHourlyMax: Math.round(equivalentHourlyMax * 100) / 100,
        isCommissionBased,
        negotiable: salary.negotiable ? 1 : 0,
        totalValue,
        benefitWeights
    };

    console.log('[Job向量化] 薪资向量完成:', {
        rateType,
        equivalentRange: `${salaryVector.equivalentHourlyMin}-${salaryVector.equivalentHourlyMax}`,
        bonusPerHour: bonusPerHour.toFixed(2),
        isCommissionBased
    });

    // 5. 地点向量
    const location = job.location || {};
    const locationVector = {
        onCampus: location.campusArea ? 1 : 0,
        remoteAllowed: location.remoteAllowed ? 1 : 0,
        hybridAllowed: location.hybridAllowed ? 1 : 0,
        commuteMinutes: location.estimatedCommuteFromCampus || 60
    };

    // 6. 材料向量
    const materialReq = job.materialRequirements || {};
    const materialVector = {
        requiredTypes: materialReq.required || [],
        optionalTypes: materialReq.optional || [],
        verificationWeight: materialReq.verificationRequired ? 1.0 : 0.0,
        minCount: materialReq.minMaterialsCount || 0
    };

    // 7. 素质向量（从技能要求中提取软技能映射）
    const qualityVector = {
        teamwork: 0,
        communication: 0,
        initiative: 0,
        reliability: 0.3,
        adaptability: 0,
        leadership: 0,
        learningAbility: 0.3
    };

    skillVector.soft.forEach((weight, skillName) => {
        const quality = SOFT_SKILL_TO_QUALITY_MAP[skillName];
        if (quality) {
            qualityVector[quality] = Math.max(qualityVector[quality], weight);
        }
    });

    // 8. 类别偏好向量
    const categoryVector = {
        preferredCategories: [job.category]
    };

    // 更新向量
    job.vector = {
        skillVector,
        experienceVector,
        qualityVector,
        timeVector,
        salaryVector,
        locationVector,
        materialVector,
        categoryVector
    };

    return job;
};

// ============================================
// 钩子
// ============================================
JobSchema.pre('save', function(next) {
    this.updateVector();
});

JobSchema.post('findOneAndUpdate', async function(doc) {
    if (doc) {
        doc.updateVector();
        await doc.save();
    }
});

module.exports = mongoose.model('Job', JobSchema);