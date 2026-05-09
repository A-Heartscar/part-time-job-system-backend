// scripts/initPhaseTestData.js
// ========== 阶段验收测试数据初始化脚本 ==========
// 用法：在项目根目录执行 node scripts/initPhaseTestData.js
// 前置条件：已执行 batchRegisterUsers.js
// 为第一个学生创建简历，为第一个雇主创建5个岗位
const mongoose = require('mongoose');

// ========== 配置项 ==========
const MONGODB_URI = 'mongodb://Heartscar:57xhqzdpMONGODB@localhost:27017/part-time-job';
const STUDENT_USERNAME = 'testStudent_scriptInsert1';
const EMPLOYER_USERNAME = 'testEmployer_scriptInsert1';

// ========== 辅助函数：递归将向量中所有 Map 转换为普通对象 ==========
const convertMapsToObjects = (obj) => {
    if (obj instanceof Map) {
        const converted = {};
        obj.forEach((v, k) => { converted[k] = convertMapsToObjects(v); });
        return converted;
    }
    if (Array.isArray(obj)) return obj.map(v => convertMapsToObjects(v));
    if (obj && typeof obj === 'object' && obj.constructor === Object) {
        const result = {};
        Object.keys(obj).forEach(k => { result[k] = convertMapsToObjects(obj[k]); });
        return result;
    }
    return obj;
};

// ========== 数据库连接 ==========
const connectDB = async () => {
    await mongoose.connect(MONGODB_URI);
    console.log('[脚本] 数据库连接成功');
};

// ========== 岗位模板 ==========
const JOB_TEMPLATES = [
    {
        title: '校园大使招募',
        category: 'campus_job',
        description: '负责在本校推广校园兼职平台，组织线下宣传活动，扩大平台影响力。工作轻松，时间自由，适合课余时间充裕的同学。',
        jobNature: 'regular',
        vacancies: 3,
        duration: 'one_semester',
        skillRequirements: [
            { name: '沟通能力', category: 'communication', minProficiency: 'basic', isMandatory: true, priority: 4 },
            { name: '社交媒体运营', category: 'other', minProficiency: 'basic', isMandatory: false, priority: 3 }
        ],
        responsibilities: [
            { description: '在本校社交媒体平台发布宣传内容', estimatedHours: 3 },
            { description: '组织线下推广活动', estimatedHours: 2 },
            { description: '收集学生反馈并提交周报', estimatedHours: 1 }
        ],
        workSchedule: {
            scheduleType: 'flexible_hours',
            flexibility: { minWeeklyHours: 4, maxWeeklyHours: 12, allowShiftSwap: true, allowTimePreference: true }
        },
        salary: {
            baseRate: 25, rateType: 'hourly', paymentSchedule: 'monthly',
            benefits: { mealAllowance: 0, transportationAllowance: 0, trainingProvided: true, certificateProvided: true },
            performanceBonus: { attendanceBonus: 200, completionBonus: 500, qualityBonus: 300 },
            studentBenefits: { flexiblePayment: true, studyLeave: true, referenceLetter: true }
        },
        location: { campusArea: true, remoteAllowed: false, hybridAllowed: false },
        applicationRequirements: { resumeRequired: true, portfolioRequired: false, interviewRequired: true, trainingRequired: true }
    },
    {
        title: '计算机编程助教',
        category: 'tutoring',
        description: '协助教师进行编程课程的教学辅导，为学生解答编程相关问题，批改作业等。要求熟练掌握至少一门编程语言。',
        jobNature: 'regular',
        vacancies: 2,
        duration: 'one_semester',
        skillRequirements: [
            { name: 'Python', category: 'technical', minProficiency: 'intermediate', isMandatory: true, priority: 5 },
            { name: 'Java', category: 'technical', minProficiency: 'basic', isMandatory: false, priority: 3 },
            { name: '沟通能力', category: 'communication', minProficiency: 'basic', isMandatory: true, priority: 3 }
        ],
        responsibilities: [
            { description: '辅导学生编程作业', estimatedHours: 6 },
            { description: '协助批改作业和考试', estimatedHours: 3 },
            { description: '参与教学研讨会议', estimatedHours: 1 }
        ],
        workSchedule: {
            scheduleType: 'fixed_shifts',
            termSchedule: {
                weekdays: [
                    { day: 1, shifts: [{ start: '14:00', end: '17:00', requiredStaff: 1 }] },
                    { day: 3, shifts: [{ start: '14:00', end: '17:00', requiredStaff: 1 }] },
                    { day: 5, shifts: [{ start: '09:00', end: '12:00', requiredStaff: 1 }] }
                ],
                weekends: []
            },
            flexibility: { minWeeklyHours: 6, maxWeeklyHours: 12, allowShiftSwap: true, allowTimePreference: false }
        },
        salary: {
            baseRate: 35, rateType: 'hourly', paymentSchedule: 'monthly',
            benefits: { mealAllowance: 15, transportationAllowance: 0, trainingProvided: false, certificateProvided: true },
            performanceBonus: { attendanceBonus: 0, completionBonus: 800, qualityBonus: 0 },
            studentBenefits: { flexiblePayment: false, studyLeave: true, referenceLetter: true }
        },
        location: { campusArea: true, campusBuilding: '计算机学院教学楼', remoteAllowed: false, hybridAllowed: false },
        applicationRequirements: { resumeRequired: true, portfolioRequired: true, interviewRequired: true, trainingRequired: false },
        experienceRequirements: {
            academicRequirements: { minGrade: 'sophomore', gpaRequirement: 3.0, requireAwards: false }
        }
    },
    {
        title: '校园活动摄影师',
        category: 'event_staff',
        description: '负责学校各类活动、讲座、比赛的现场拍摄和后期处理，为学校宣传部门提供高质量的活动照片。需要自备摄影器材。',
        jobNature: 'event_based',
        vacancies: 5,
        duration: 'flexible',
        skillRequirements: [
            { name: '摄影', category: 'creative', minProficiency: 'intermediate', isMandatory: true, priority: 5 },
            { name: 'Photoshop', category: 'design', minProficiency: 'basic', isMandatory: true, priority: 4 },
            { name: '视频剪辑', category: 'creative', minProficiency: 'basic', isMandatory: false, priority: 2 }
        ],
        responsibilities: [
            { description: '活动现场拍摄', estimatedHours: 4 },
            { description: '照片后期处理', estimatedHours: 2 },
            { description: '按时提交照片素材', estimatedHours: 1 }
        ],
        workSchedule: {
            scheduleType: 'event_based',
            flexibility: { minWeeklyHours: 2, maxWeeklyHours: 10, allowShiftSwap: true, allowTimePreference: true }
        },
        salary: {
            baseRate: 150, rateType: 'per_shift', paymentSchedule: 'upon_completion',
            benefits: { mealAllowance: 0, transportationAllowance: 20, trainingProvided: false, certificateProvided: true },
            studentBenefits: { flexiblePayment: true, studyLeave: true, referenceLetter: false }
        },
        location: { campusArea: true, remoteAllowed: false, hybridAllowed: false },
        applicationRequirements: { resumeRequired: true, portfolioRequired: true, interviewRequired: false, trainingRequired: false },
        materialRequirements: { required: ['portfolio'], optional: ['certificate'], minMaterialsCount: 1 }
    },
    {
        title: '数据录入实习生',
        category: 'data_entry',
        description: '协助部门进行数据的录入、整理、核对工作。要求细心认真，熟练使用 Excel 等办公软件。可远程工作。',
        jobNature: 'regular',
        vacancies: 4,
        duration: 'one_month',
        skillRequirements: [
            { name: 'Excel', category: 'office_skill', minProficiency: 'intermediate', isMandatory: true, priority: 5 },
            { name: '打字速度', category: 'other', minProficiency: 'intermediate', isMandatory: true, priority: 4 }
        ],
        responsibilities: [
            { description: '数据录入和整理', estimatedHours: 10 },
            { description: '数据核对和校验', estimatedHours: 5 },
            { description: '提交每日工作报告', estimatedHours: 1 }
        ],
        workSchedule: {
            scheduleType: 'flexible_hours',
            flexibility: { minWeeklyHours: 8, maxWeeklyHours: 20, allowShiftSwap: false, allowTimePreference: true }
        },
        salary: {
            baseRate: 20, rateType: 'hourly', paymentSchedule: 'weekly',
            benefits: { mealAllowance: 0, transportationAllowance: 0, trainingProvided: true, certificateProvided: true },
            performanceBonus: { attendanceBonus: 100, completionBonus: 300, qualityBonus: 200 },
            studentBenefits: { flexiblePayment: true, studyLeave: true, referenceLetter: false }
        },
        location: { campusArea: false, remoteAllowed: true, hybridAllowed: false },
        applicationRequirements: { resumeRequired: true, portfolioRequired: false, interviewRequired: false, trainingRequired: true }
    },
    {
        title: '校园超市兼职店员',
        category: 'retail',
        description: '在校园超市从事商品整理、收银、货架补货等日常工作。工作时间灵活，可根据课表安排。',
        jobNature: 'regular',
        vacancies: 6,
        duration: 'ongoing',
        skillRequirements: [
            { name: '服务意识', category: 'communication', minProficiency: 'basic', isMandatory: true, priority: 4 }
        ],
        responsibilities: [
            { description: '商品陈列和补货', estimatedHours: 5 },
            { description: '收银结算', estimatedHours: 5 },
            { description: '店内卫生维护', estimatedHours: 2 }
        ],
        workSchedule: {
            scheduleType: 'fixed_shifts',
            termSchedule: {
                weekdays: [
                    { day: 2, shifts: [{ start: '10:00', end: '14:00', requiredStaff: 2 }, { start: '14:00', end: '18:00', requiredStaff: 2 }] },
                    { day: 4, shifts: [{ start: '10:00', end: '14:00', requiredStaff: 2 }, { start: '14:00', end: '18:00', requiredStaff: 2 }] }
                ],
                weekends: [
                    { day: 6, shifts: [{ start: '09:00', end: '13:00', requiredStaff: 3 }, { start: '13:00', end: '17:00', requiredStaff: 3 }] }
                ]
            },
            flexibility: { minWeeklyHours: 8, maxWeeklyHours: 16, allowShiftSwap: true, allowTimePreference: false },
            holidaySchedule: { available: true, hoursPerDay: 6 },
            studentStatusPreference: { examPeriodFlexibility: 'flexible', acceptFreshman: true, acceptGraduating: true }
        },
        salary: {
            baseRate: 18, rateType: 'hourly', paymentSchedule: 'weekly',
            benefits: { mealAllowance: 10, transportationAllowance: 0, trainingProvided: true, certificateProvided: false },
            premiumRates: { weekendMultiplier: 1.2, eveningMultiplier: 1.0, holidayMultiplier: 1.5 },
            performanceBonus: { attendanceBonus: 50, completionBonus: 0, qualityBonus: 100 },
            studentBenefits: { flexiblePayment: false, studyLeave: true, referenceLetter: false }
        },
        location: { campusArea: true, campusBuilding: '学生服务中心一楼', remoteAllowed: false, hybridAllowed: false },
        applicationRequirements: { resumeRequired: false, portfolioRequired: false, interviewRequired: true, trainingRequired: true },
        experienceRequirements: {
            academicRequirements: { minGrade: 'freshman', gpaRequirement: 0, requireAwards: false }
        }
    }
];

// ========== 学生简历模板 ==========
// ========== 学生简历模板 ==========
const RESUME_TEMPLATE = {
    studentStatus: {
        grade: 'junior',
        major: '软件工程',
        expectedGraduation: new Date('2026-06-30'),
        academicPerformance: {
            gpa: 3.4,
            ranking: '前20%',
            awards: ['校级优秀学生干部', '全国大学生计算机设计大赛三等奖']
        }
    },
    skills: [
        {
            name: 'Java',
            category: 'technical',
            proficiency: 'advanced',
            description: '熟练掌握 Java 面向对象编程，有 Spring Boot 框架实际项目开发经验，熟悉多线程与集合框架'
        },
        {
            name: 'Python',
            category: 'technical',
            proficiency: 'intermediate',
            description: '掌握 Python 数据分析基础，熟练使用 Pandas、NumPy 进行数据处理，了解 Flask Web 框架'
        },
        {
            name: 'MySQL',
            category: 'technical',
            proficiency: 'intermediate',
            description: '熟练编写 SQL 查询语句，了解索引优化和数据库设计规范，有数据库课程设计经验'
        },
        {
            name: '沟通表达',
            category: 'communication',
            proficiency: 'advanced',
            description: '曾任学院辩论队副队长，具备良好的逻辑表达和团队协作能力，多次主持学院大型活动'
        },
        {
            name: '英语',
            category: 'language',
            proficiency: 'intermediate',
            description: 'CET-6 520分，能够阅读英文技术文档，进行日常英语交流'
        }
    ],
    projectExperiences: [
        {
            title: '在线考试管理系统',
            projectType: 'course_project',
            role: '后端开发与数据库设计',
            description: '作为团队核心成员，使用 Spring Boot + Vue 完成在线考试系统的开发。负责数据库表结构设计、RESTful API 接口开发、用户认证与授权模块实现。系统支持试题管理、自动组卷、在线答题、成绩统计等功能，课程设计获得优秀评级。',
            technologies: ['Spring Boot', 'Vue.js', 'MySQL', 'Redis', 'JWT'],
            durationWeeks: 14,
            complexity: 4,
            teamSize: 4,
            achievements: ['课程设计优秀评级', '系统通过学院验收并部署使用']
        },
        {
            title: '校园社团活动小程序',
            projectType: 'personal_project',
            role: '全栈开发',
            description: '独立开发面向校内社团的活动发布与报名微信小程序。实现社团入驻、活动创建、在线报名、消息通知、数据看板等功能。采用微信云开发作为后端服务，上线一个月内覆盖了校内12个社团。',
            technologies: ['微信小程序', 'JavaScript', '云开发', 'CSS'],
            durationWeeks: 8,
            complexity: 3,
            teamSize: 1,
            achievements: ['覆盖校内12个社团', '累计服务用户500+']
        }
    ],
    internshipExperiences: [
        {
            company: '南京智联科技有限公司',
            position: 'Java 开发实习生',
            startDate: new Date('2025-07-01'),
            endDate: new Date('2025-08-30'),
            durationWeeks: 9,
            responsibilities: [
                '参与公司内部OA系统的功能迭代开发',
                '负责部分接口的单元测试编写与代码审查',
                '协助修复测试环境中的Bug并编写修复文档'
            ],
            skillsGained: [
                'Spring Boot',
                'Git',
                '敏捷开发流程',
                '代码审查规范'
            ],
            supervisorContact: 'mentor@zltech.com',
            isVerified: false,
            verificationRequest: {
                status: 'none',
                submittedAt: null,
                supportingMaterials: [],
                reviewerNotes: '',
                reviewedAt: null,
                reviewedBy: ''
            }
        }
    ],
    campusActivities: [
        {
            organization: '校学生会文艺部',
            position: '副部长',
            activityType: 'student_union',
            startDate: new Date('2024-09-01'),
            endDate: new Date('2025-09-01'),
            responsibilities: [
                '策划并组织校级迎新晚会、校园歌手大赛等大型活动',
                '协调部门内部成员分工和排练安排',
                '负责活动赞助商的联络与洽谈'
            ],
            achievements: [
                '成功举办校级大型活动3场',
                '拉取活动赞助金额累计超2万元'
            ]
        },
        {
            organization: '青年志愿者协会',
            position: '志愿者',
            activityType: 'volunteer',
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-06-30'),
            responsibilities: [
                '参与社区义务支教活动',
                '协助组织校园环保宣传活动'
            ],
            achievements: [
                '累计志愿服务时长达40小时',
                '获得优秀志愿者称号'
            ]
        }
    ],
    salaryExpectation: {
        hourly: { min: 25, max: 50 },
        daily: { min: 150, max: 300 },
        monthly: { min: 2000, max: 4000 },
        flexible: true,
        acceptCommission: true,
        acceptStipend: true,
        preferredWorkType: ['hourly', 'daily', 'monthly']
    },
    jobPreferences: {
        preferredCategories: [
            'tutoring',
            'programming',
            'research_assistant',
            'campus_job',
            'content_creation'
        ],
        maxCommuteTime: 30,
        minShiftsPerWeek: 2,
        maxShiftsPerWeek: 5
    },
    availableTime: {
        termTime: {
            weekdays: [
                {
                    day: 1,
                    timeSlots: [
                        { start: '14:00', end: '18:00', preferred: true }
                    ]
                },
                {
                    day: 2,
                    timeSlots: [
                        { start: '10:00', end: '12:00', preferred: false },
                        { start: '14:00', end: '18:00', preferred: true }
                    ]
                },
                {
                    day: 3,
                    timeSlots: [
                        { start: '14:00', end: '18:00', preferred: true }
                    ]
                },
                {
                    day: 4,
                    timeSlots: [
                        { start: '10:00', end: '12:00', preferred: false },
                        { start: '14:00', end: '18:00', preferred: true }
                    ]
                },
                {
                    day: 5,
                    timeSlots: [
                        { start: '09:00', end: '12:00', preferred: false },
                        { start: '14:00', end: '17:00', preferred: true }
                    ]
                }
            ],
            weekends: [
                {
                    day: 6,
                    timeSlots: [
                        { start: '09:00', end: '18:00', preferred: true }
                    ]
                }
            ]
        },
        holidayTime: {
            isAvailable: true,
            preferredHoursPerDay: 6
        },
        emergencyAvailability: true
    }
};

// ========== 主函数 ==========
const initPhaseTestData = async () => {
    try {
        await connectDB();

        const User = require('../models/User');
        const Resume = require('../models/Resume');
        const Job = require('../models/Job');

        console.log('========================================');
        console.log('  阶段验收测试数据初始化脚本');
        console.log('========================================\n');

        // ========== 1. 为学生创建简历 ==========
        console.log('[脚本] 查找学生:', STUDENT_USERNAME);
        const student = await User.findOne({ username: STUDENT_USERNAME, role: 'student' });
        if (!student) {
            console.log('[脚本] 学生不存在，请先运行 batchRegisterUsers.js');
            process.exit(1);
        }

        const existingResume = await Resume.findOne({ studentUUID: student.userUUID });
        if (existingResume) {
            console.log('[脚本] 学生已有简历，跳过创建');
        } else {
            const resume = new Resume({
                ...RESUME_TEMPLATE,
                studentUUID: student.userUUID
            });
            resume.updateVector();

            // ========== 关键修复：将 Mongoose 文档转为普通对象，再递归转换 Map ==========
            const plainVector = resume.toObject().vector;
            resume.vector = convertMapsToObjects(plainVector);

            await resume.save();
            console.log('[脚本] 简历创建成功:', { resumeId: resume._id, studentName: student.username });
        }

        // ========== 2. 为雇主创建岗位 ==========
        console.log('\n[脚本] 查找雇主:', EMPLOYER_USERNAME);
        const employer = await User.findOne({ username: EMPLOYER_USERNAME, role: 'employer' });
        if (!employer) {
            console.log('[脚本] 雇主不存在，请先运行 batchRegisterUsers.js');
            process.exit(1);
        }

        let jobSuccess = 0;
        for (const template of JOB_TEMPLATES) {
            const existingJob = await Job.findOne({
                employerUUID: employer.userUUID,
                title: template.title,
                status: { $ne: 'deleted' }
            });

            if (existingJob) {
                console.log(`[跳过] 岗位"${template.title}"已存在`);
                continue;
            }

            const job = new Job({
                ...template,
                employerUUID: employer.userUUID,
                status: 'published',
                startDate: new Date('2026-03-01'),
                applicationDeadline: new Date('2026-06-30')
            });
            job.updateVector();
            // ========== 同样处理岗位的向量 Map ==========
            const plainJobVector = job.toObject().vector;
            job.vector = convertMapsToObjects(plainJobVector);

            await job.save();
            jobSuccess++;
            console.log(`[岗位] "${template.title}" 创建成功 (${jobSuccess}/${JOB_TEMPLATES.length})`);
        }

        // ========== 3. 输出结果 ==========
        console.log('\n========================================');
        console.log('  测试数据初始化完成');
        console.log('========================================');
        console.log(`  学生: ${STUDENT_USERNAME}（简历已创建）`);
        console.log(`  雇主: ${EMPLOYER_USERNAME}（岗位: ${jobSuccess}/${JOB_TEMPLATES.length}）`);
        console.log('========================================\n');

    } catch (error) {
        console.error('[脚本] 执行失败:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('[脚本] 数据库连接已断开');
    }
};

initPhaseTestData();