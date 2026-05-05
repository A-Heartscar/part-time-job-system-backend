const mongoose = require('mongoose');
const redis = require('./redis');
const { testConnection } = require('./emailService');

async function connectDB(){
    try{
        const conn = await mongoose.connect('mongodb://Heartscar:57xhqzdpMONGODB@localhost:27017/part-time-job');
        console.log(`MongoDB 连接成功: ${conn.connection.host}`);

    }catch (error) {
        console.error(`MongoDB 连接失败: ${error.message}`);
        process.exit(1);
    }
}

// ========== 验证 Redis 连接（非阻塞式，延迟 1 秒检查） ==========
setTimeout(async () => {
    try {
        await redis.ping();
        console.log('[系统初始化] Redis 已就绪');
    } catch (err) {
        console.warn('[系统初始化] Redis 连接失败，将使用内存降级方案');
    }
}, 1000);

// ========== 验证邮件服务连接 ==========
testConnection().then(success => {
    if (success) {
        console.log('[系统初始化] 邮件服务就绪');
    } else {
        console.warn('[系统初始化] 邮件服务连接失败，请检查授权码配置');
    }
});

module.exports = connectDB;