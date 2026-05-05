// scripts/initReportReasons.js
// ========== 初始化举报原因配置数据 ==========
// 首次使用时执行此脚本，将默认举报原因写入 ReportReasonConfig 集合
// 用法：在项目根目录执行 node scripts/initReportReasons.js
// 如果已存在数据则跳过（幂等操作）
// 已经进行调用：2026/5/1
const mongoose = require('mongoose');

// ========== 数据库连接 ==========
const MONGODB_URI = 'mongodb://Heartscar:57xhqzdpMONGODB@localhost:27017/part-time-job';

// 默认举报原因配置
const DEFAULT_REASONS = [
    {
        reasonKey: 'politics',
        label: '涉政敏感',
        description: '涉及政治敏感内容，违反国家法律法规',
        weight: 10,
        autoThreshold: 3,
        isActive: true,
        sortOrder: 1
    },
    {
        reasonKey: 'porn_violence',
        label: '色情低俗',
        description: '包含色情、低俗、暴力等不适宜内容',
        weight: 9,
        autoThreshold: 3,
        isActive: true,
        sortOrder: 2
    },
    {
        reasonKey: 'ad_spam',
        label: '广告引流',
        description: '发布无关广告、引流链接或垃圾信息',
        weight: 6,
        autoThreshold: 5,
        isActive: true,
        sortOrder: 3
    },
    {
        reasonKey: 'insult_attack',
        label: '辱骂人身攻击',
        description: '包含人身攻击、辱骂、侮辱性言论',
        weight: 7,
        autoThreshold: 5,
        isActive: true,
        sortOrder: 4
    },
    {
        reasonKey: 'troll',
        label: '引战带节奏',
        description: '故意引发争议、制造对立、带节奏等行为',
        weight: 5,
        autoThreshold: 8,
        isActive: true,
        sortOrder: 5
    },
    {
        reasonKey: 'copyright',
        label: '抄袭侵权',
        description: '侵犯他人知识产权、抄袭他人内容',
        weight: 5,
        autoThreshold: 5,
        isActive: true,
        sortOrder: 6
    },
    {
        reasonKey: 'other',
        label: '其他违规',
        description: '其他不符合社区规范的违规行为',
        weight: 3,
        autoThreshold: 10,
        isActive: true,
        sortOrder: 7
    }
];

/**
 * 主执行函数
 */
const initReportReasons = async () => {
    try {
        console.log('========================================');
        console.log('  举报原因配置初始化脚本');
        console.log('========================================\n');

        // ========== 1. 连接数据库 ==========
        console.log('[脚本] 正在连接数据库...');
        await mongoose.connect(MONGODB_URI);
        console.log('[脚本] 数据库连接成功\n');

        // ========== 2. 引入模型 ==========
        const ReportReasonConfig = require('../models/ReportReasonConfig');

        // ========== 3. 检查是否已存在数据 ==========
        const existingCount = await ReportReasonConfig.countDocuments();
        if (existingCount > 0) {
            console.log(`[脚本] 已存在 ${existingCount} 条举报原因配置，跳过初始化`);
            console.log('[脚本] 如需重新初始化，请先清空 reportreasonconfigs 集合');
            return;
        }

        // ========== 4. 批量插入默认数据 ==========
        console.log('[脚本] 开始插入默认举报原因...');
        const result = await ReportReasonConfig.insertMany(DEFAULT_REASONS);

        console.log(`[脚本] ✅ 成功插入 ${result.length} 条默认举报原因：`);
        result.forEach((reason, index) => {
            console.log(`  ${index + 1}. ${reason.label} (${reason.reasonKey}) - 权重:${reason.weight}, 阈值:${reason.autoThreshold}`);
        });

        console.log('\n========================================');
        console.log('  初始化完成！');
        console.log('========================================');

    } catch (error) {
        console.error('\n❌ 初始化失败:', error.message);
        process.exit(1);
    } finally {
        // ========== 5. 断开数据库连接 ==========
        await mongoose.disconnect();
        console.log('[脚本] 数据库连接已断开');
    }
};

// 执行
initReportReasons();