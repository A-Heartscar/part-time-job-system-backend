// scripts/createSuperAdmin.js
// ========== 超级管理员创建脚本 ==========
// 用法：在项目根目录执行 node scripts/createSuperAdmin.js
// 用于首次创建超级管理员账号，后续可通过该账号在管理后台创建子管理员
// 依赖：需要 MongoDB 数据库正常运行
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');

// ========== 数据库连接 ==========
const MONGODB_URI = 'mongodb://Heartscar:57xhqzdpMONGODB@localhost:27017/part-time-job';

// 使用 readline 实现交互式输入
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * 交互式提问
 * @param {string} question - 问题文本
 * @returns {Promise<string>} 用户输入
 */
const askQuestion = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

/**
 * 主执行函数
 */
const createSuperAdmin = async () => {
    try {
        console.log('========================================');
        console.log('  校园兼职系统 - 超级管理员创建工具');
        console.log('========================================\n');

        // ========== 1. 连接数据库 ==========
        console.log('[脚本] 正在连接数据库...');
        await mongoose.connect(MONGODB_URI);
        console.log('[脚本] 数据库连接成功\n');

        // 引入 Admin 模型（确保在 mongoose 连接后引入）
        const Admin = require('../models/Admin');

        // ========== 2. 交互式输入 ==========
        console.log('请输入超级管理员信息：\n');

        const username = await askQuestion('用户名（3-20位）: ');
        if (!username || username.length < 3 || username.length > 20) {
            console.log('\n❌ 错误：用户名长度需在3-20位之间');
            process.exit(1);
        }

        // 检查用户名是否已存在
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) {
            console.log(`\n❌ 错误：用户名 "${username}" 已存在`);
            process.exit(1);
        }

        const password = await askQuestion('密码（至少6位，含字母和数字）: ');
        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(password)) {
            console.log('\n❌ 错误：密码至少6位，且必须包含字母和数字');
            process.exit(1);
        }

        const realName = await askQuestion('真实姓名: ');
        if (!realName) {
            console.log('\n❌ 错误：真实姓名不能为空');
            process.exit(1);
        }

        const email = await askQuestion('邮箱: ');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            console.log('\n❌ 错误：请输入正确的邮箱格式');
            process.exit(1);
        }

        // ========== 3. 确认信息 ==========
        console.log('\n请确认以下信息：');
        console.log(`  用户名: ${username}`);
        console.log(`  真实姓名: ${realName}`);
        console.log(`  邮箱: ${email}`);
        console.log(`  角色: super_admin`);

        const confirm = await askQuestion('\n确认创建？(y/n): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('\n已取消创建');
            process.exit(0);
        }

        // ========== 4. 创建超级管理员 ==========
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const admin = await Admin.create({
            adminUUID: uuidv4(),
            username,
            password: hashedPassword,
            realName,
            role: 'super_admin',
            email,
            status: 'active',
            createdBy: null // 超级管理员无创建者
        });

        // ========== 5. 输出结果 ==========
        console.log('\n========================================');
        console.log('  ✅ 超级管理员创建成功！');
        console.log('========================================');
        console.log(`  adminUUID: ${admin.adminUUID}`);
        console.log(`  用户名: ${admin.username}`);
        console.log(`  真实姓名: ${admin.realName}`);
        console.log(`  角色: ${admin.role}`);
        console.log(`  邮箱: ${admin.email}`);
        console.log('========================================');
        console.log('\n请妥善保管管理员账号信息。');
        console.log('现在可以使用该账号登录管理后台：/admin\n');

    } catch (error) {
        console.error('\n❌ 创建失败:', error.message);
        process.exit(1);
    } finally {
        // ========== 6. 断开数据库连接 ==========
        rl.close();
        await mongoose.disconnect();
        console.log('[脚本] 数据库连接已断开');
    }
};

// 执行
createSuperAdmin();