// scripts/batchRegisterUsers.js
// ========== 批量注册用户脚本 ==========
// 用法：在项目根目录执行 node scripts/batchRegisterUsers.js
// 学生密码：student123456，雇主密码：employer123456
// 命名规则：testStudent_scriptInsert1 ~ testStudent_scriptInsertN
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ========== 配置项 ==========
const MONGODB_URI = 'mongodb://Heartscar:57xhqzdpMONGODB@localhost:27017/part-time-job';
const STUDENT_COUNT = 10;       // 学生数量
const EMPLOYER_COUNT = 5;       // 雇主数量
const STUDENT_PASSWORD = 'student123456';
const EMPLOYER_PASSWORD = 'employer123456';
const USERNAME_PREFIX = 'testStudent_scriptInsert';
const EMPLOYER_PREFIX = 'testEmployer_scriptInsert';

// ========== 数据库连接 ==========
const connectDB = async () => {
    await mongoose.connect(MONGODB_URI);
    console.log('[脚本] 数据库连接成功');
};

// ========== 随机生成技能 ==========
const SAMPLE_SKILLS = ['编程', '设计', '文案', '翻译', '数据分析', '摄影', '视频剪辑', '家教', '市场营销', '客服'];
const getRandomSkills = () => {
    const count = Math.floor(Math.random() * 4) + 1;
    return [...SAMPLE_SKILLS].sort(() => Math.random() - 0.5).slice(0, count);
};

// ========== 随机选择专业 ==========
const SAMPLE_MAJORS = ['计算机科学与技术', '软件工程', '数据科学', '工商管理', '英语', '设计学', '数学与应用数学', '经济学', '法学', '新闻传播'];
const getRandomMajor = () => SAMPLE_MAJORS[Math.floor(Math.random() * SAMPLE_MAJORS.length)];

// ========== 主函数 ==========
const batchRegister = async () => {
    try {
        await connectDB();
        const User = require('../models/User');
        const salt = await bcrypt.genSalt(10);

        let studentSuccess = 0;
        let employerSuccess = 0;
        let skipped = 0;

        console.log('========================================');
        console.log('  批量注册用户脚本');
        console.log('========================================\n');

        // ========== 注册学生 ==========
        console.log(`[脚本] 开始注册 ${STUDENT_COUNT} 个学生...\n`);
        for (let i = 1; i <= STUDENT_COUNT; i++) {
            const username = `${USERNAME_PREFIX}${i}`;
            const email = `testEmail_scriptInsert${i}@test.com`;

            const existing = await User.findOne({ $or: [{ username }, { email }] });
            if (existing) {
                console.log(`[跳过] ${username} 已存在`);
                skipped++;
                continue;
            }

            try {
                const hashedPassword = await bcrypt.hash(STUDENT_PASSWORD, salt);
                await User.create({
                    userUUID: uuidv4(),
                    username: username,
                    password: hashedPassword,
                    email: email,
                    role: 'student',
                    studentInfo: {
                        studentCode: `S2024${String(i).padStart(4, '0')}`,
                        studentName: `学生${i}号`,
                        school: '测试大学',
                        major: getRandomMajor(),
                        phone: `1380000${String(i).padStart(4, '0')}`,
                        skills: getRandomSkills()
                    }
                });
                studentSuccess++;
                console.log(`[学生] ${username} 注册成功 (${studentSuccess}/${STUDENT_COUNT})`);
            } catch (err) {
                console.error(`[学生] ${username} 注册失败:`, err.message);
            }
        }

        // ========== 注册雇主 ==========
        console.log(`\n[脚本] 开始注册 ${EMPLOYER_COUNT} 个雇主...\n`);
        for (let i = 1; i <= EMPLOYER_COUNT; i++) {
            const username = `${EMPLOYER_PREFIX}${i}`;
            const email = `testEmail_employer_scriptInsert${i}@test.com`;

            const existing = await User.findOne({ $or: [{ username }, { email }] });
            if (existing) {
                console.log(`[跳过] ${username} 已存在`);
                skipped++;
                continue;
            }

            const isCompany = i <= Math.ceil(EMPLOYER_COUNT / 2);

            try {
                const hashedPassword = await bcrypt.hash(EMPLOYER_PASSWORD, salt);
                await User.create({
                    userUUID: uuidv4(),
                    username: username,
                    password: hashedPassword,
                    email: email,
                    role: 'employer',
                    employerInfo: isCompany ? {
                        employerType: 'company',
                        companyInfo: {
                            companyName: `测试企业${i}号`,
                            companyType: '科技公司',
                            creditCode: `91110108MA${String(i).padStart(6, '0')}X`,
                            companyAddress: `北京市海淀区测试路${i}号`,
                            contactPerson: `联系人${i}`,
                            contactPhone: `1390000${String(i).padStart(4, '0')}`,
                            companyIntro: `测试企业${i}号是一家专注于校园兼职的科技公司`
                        }
                    } : {
                        employerType: 'personal',
                        personalInfo: {
                            realName: `雇主${i}号`,
                            idCard: `11010119900101${String(i).padStart(2, '0')}0X`,
                            profession: '自由职业者',
                            selfIntro: `个人雇主${i}号，有丰富的兼职发布经验`
                        }
                    }
                });
                employerSuccess++;
                const typeLabel = isCompany ? '企业' : '个人';
                console.log(`[雇主] ${username} (${typeLabel}) 注册成功 (${employerSuccess}/${EMPLOYER_COUNT})`);
            } catch (err) {
                console.error(`[雇主] ${username} 注册失败:`, err.message);
            }
        }

        // ========== 输出结果 ==========
        console.log('\n========================================');
        console.log('  批量注册完成');
        console.log('========================================');
        console.log(`  学生成功: ${studentSuccess}/${STUDENT_COUNT}`);
        console.log(`  雇主成功: ${employerSuccess}/${EMPLOYER_COUNT}`);
        console.log(`  跳过(已存在): ${skipped}`);

        if (studentSuccess > 0) {
            console.log(`\n  学生登录账号: ${USERNAME_PREFIX}1 ~ ${USERNAME_PREFIX}${STUDENT_COUNT}`);
            console.log(`  学生登录密码: ${STUDENT_PASSWORD}`);
        }
        if (employerSuccess > 0) {
            console.log(`\n  雇主登录账号: ${EMPLOYER_PREFIX}1 ~ ${EMPLOYER_PREFIX}${EMPLOYER_COUNT}`);
            console.log(`  雇主登录密码: ${EMPLOYER_PASSWORD}`);
        }
        console.log('========================================\n');

    } catch (error) {
        console.error('[脚本] 执行失败:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('[脚本] 数据库连接已断开');
    }
};

batchRegister();