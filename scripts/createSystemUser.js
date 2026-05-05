// scripts/createSystemUser.js
// ========== 系统通知用户创建脚本 ==========
// 用法：在项目根目录执行 node scripts/createSystemUser.js
// 创建一个虚拟用户用于发送系统通知（如处罚通知、审核结果等）
// 如果系统用户已存在则跳过（幂等操作）
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// ========== 数据库连接 ==========
const MONGODB_URI = 'mongodb://Heartscar:57xhqzdpMONGODB@localhost:27017/part-time-job';

// ========== 系统用户固定 UUID ==========
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

const createSystemUser = async () => {
    try {
        console.log('========================================');
        console.log('  系统通知用户创建脚本');
        console.log('========================================\n');

        // ========== 1. 连接数据库 ==========
        console.log('[脚本] 正在连接数据库...');
        await mongoose.connect(MONGODB_URI);
        console.log('[脚本] 数据库连接成功\n');

        // ========== 2. 引入 User 模型 ==========
        const User = require('../models/User');

        // ========== 3. 检查系统用户是否已存在 ==========
        const existingUser = await User.findOne({ userUUID: SYSTEM_USER_UUID });
        if (existingUser) {
            console.log('[脚本] 系统通知用户已存在，跳过创建');
            console.log(`  userUUID: ${existingUser.userUUID}`);
            console.log(`  username: ${existingUser.username}`);
            return;
        }

        // ========== 4. 创建系统用户 ==========
        // 生成随机强密码（不可登录，仅占位）
        const salt = await bcrypt.genSalt(10);
        const randomPassword = uuidv4() + uuidv4(); // 无法猜测的随机密码
        const hashedPassword = await bcrypt.hash(randomPassword, salt);

        const systemUser = await User.create({
            userUUID: SYSTEM_USER_UUID,
            username: 'system_notification',
            password: hashedPassword,
            email: 'system@ptjob.internal',
            role: 'student', // 无实际角色意义，仅为满足 Schema 校验
            studentInfo: {
                studentCode: 'SYSTEM000',
                studentName: '系统通知',
                school: '校园兼职系统',
                major: '系统',
                phone: '00000000000'
            }
        });

        console.log('[脚本] ✅ 系统通知用户创建成功：');
        console.log(`  userUUID: ${systemUser.userUUID}`);
        console.log(`  username: ${systemUser.username}`);
        console.log(`  role: ${systemUser.role}`);
        console.log('\n========================================');
        console.log('  创建完成！');
        console.log('========================================');

    } catch (error) {
        console.error('\n❌ 创建失败:', error.message);
        process.exit(1);
    } finally {
        // ========== 5. 断开数据库连接 ==========
        await mongoose.disconnect();
        console.log('[脚本] 数据库连接已断开');
    }
};

// 执行
createSystemUser();