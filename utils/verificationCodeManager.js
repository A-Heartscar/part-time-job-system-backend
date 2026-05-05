// utils/verificationCodeManager.js
// ========== 邮箱验证码缓存管理器 ==========
// 使用内存Map存储验证码，服务重启后清空
// 支持注册验证码和密码重置验证码共用

const redis = require('../config/redis');

// ========== 常量定义 ==========
const CODE_LENGTH = 6;           // 验证码长度（6位纯数字）
const CODE_EXPIRE_MINUTES = 10;  // 验证码过期时间（10分钟）
const RESEND_COOLDOWN_SECONDS = 60; // 重新发送冷却时间（60秒）

// ========== 验证码存储 Map ==========
// key: email（邮箱地址）
// value: { code, expireAt, lastSentAt }
const codeStore = new Map();

/**
 * 生成6位随机数字验证码
 * @returns {string} 6位数字验证码
 */
const generateCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('[验证码管理器] 生成验证码:', code);
    return code;
};

/**
 * 为指定邮箱生成验证码并存储
 * @param {string} email - 邮箱地址
 * @returns {Object} { code, expireAt }
 */
const generate = (email) => {
    const code = generateCode();
    const now = new Date();
    const expireAt = new Date(now.getTime() + CODE_EXPIRE_MINUTES * 60 * 1000);

    if (redis.isConnected()) {
        // Redis 可用：使用 Hash 合并存储验证码
        const emailKey = `email:${email}`;
        const cooldownKey = `email:cooldown:${email}`;

        // 存储验证码和发送时间到 Hash
        redis.pHset(emailKey, 'code', code);
        redis.pHset(emailKey, 'sentAt', Date.now().toString());
        redis.pExpire(emailKey, CODE_EXPIRE_MINUTES * 60); // 10分钟过期

        // 设置冷却标记
        redis.pSetex(cooldownKey, RESEND_COOLDOWN_SECONDS, '1');

        console.log('[验证码管理器] 验证码已存储到 Redis:', {
            email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
            ttl: CODE_EXPIRE_MINUTES * 60
        });
    } else {
        // Redis 不可用：回退到内存 Map
        codeStore.set(email, {
            code,
            expireAt,
            lastSentAt: now
        });
        console.log('[验证码管理器] 验证码已存储到内存（降级模式）');
    }

    return { code, expireAt };
};

/**
 * 验证邮箱验证码是否正确且未过期
 * @param {string} email - 邮箱地址
 * @param {string} code - 用户输入的验证码
 * @returns {Object} { valid: boolean, message: string }
 */
const verify = async (email, code) => {
    console.log('[验证码管理器] 验证验证码:', {
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2')
    });

    if (redis.isConnected()) {
        // Redis 可用：读取 Hash 中的验证码
        const emailKey = `email:${email}`;
        const data = await redis.pHgetall(emailKey);

        if (!data || Object.keys(data).length === 0) {
            console.log('[验证码管理器] Redis 中未找到验证码记录');
            return { valid: false, message: '验证码不存在或已过期，请重新获取' };
        }

        if (data.code !== code) {
            console.log('[验证码管理器] 验证码不匹配');
            return { valid: false, message: '验证码错误' };
        }

        // 验证通过后清除验证码
        await redis.pDel(emailKey);
        console.log('[验证码管理器] 验证码验证通过（Redis），已清除');

        return { valid: true, message: '验证通过' };
    } else {
        // Redis 不可用：回退到内存 Map
        const record = codeStore.get(email);
        if (!record) {
            return { valid: false, message: '验证码不存在或已过期，请重新获取' };
        }
        if (new Date() > record.expireAt) {
            codeStore.delete(email);
            return { valid: false, message: '验证码已过期，请重新获取' };
        }
        if (record.code !== code) {
            return { valid: false, message: '验证码错误' };
        }
        console.log('[验证码管理器] 验证码验证通过（内存降级模式）');
        return { valid: true, message: '验证通过' };
    }
};

/**
 * 删除指定邮箱的验证码记录（验证通过后清理）
 * @param {string} email - 邮箱地址
 */
const remove = async (email) => {
    console.log('[验证码管理器] 删除验证码记录:', email.replace(/(.{2}).*(@.*)/, '$1***$2'));

    if (redis.isConnected()) {
        await redis.pDel(`email:${email}`);
    }
    // 同时清除内存中的记录（无论 Redis 是否可用）
    codeStore.delete(email);
};

/**
 * 检查是否可以重新发送验证码（冷却时间校验）
 * @param {string} email - 邮箱地址
 * @returns {Object} { canResend: boolean, remainingSeconds: number }
 */
const canResend = async (email) => {
    if (redis.isConnected()) {
        // Redis 可用：通过冷却标记的 TTL 判断
        const cooldownKey = `email:cooldown:${email}`;
        const remaining = await redis.pTtl(cooldownKey);

        if (remaining > 0) {
            console.log('[验证码管理器] 冷却中（Redis），剩余秒数:', remaining);
            return { canResend: false, remainingSeconds: remaining };
        }

        console.log('[验证码管理器] 冷却已过（Redis），可以重新发送');
        return { canResend: true, remainingSeconds: 0 };
    } else {
        // Redis 不可用：回退到内存时间差判断
        const record = codeStore.get(email);

        if (!record) {
            return { canResend: true, remainingSeconds: 0 };
        }

        const elapsed = Math.floor((Date.now() - record.lastSentAt.getTime()) / 1000);
        const remaining = RESEND_COOLDOWN_SECONDS - elapsed;

        if (remaining > 0) {
            console.log('[验证码管理器] 冷却中（内存），剩余秒数:', remaining);
            return { canResend: false, remainingSeconds: remaining };
        }

        console.log('[验证码管理器] 冷却已过（内存），可以重新发送');
        return { canResend: true, remainingSeconds: 0 };
    }
};

/**
 * 获取验证码存储大小（用于监控）
 * @returns {number} 当前存储的验证码数量
 */
const getStoreSize = () => {
    return codeStore.size;
};

module.exports = {
    generate,
    verify,
    remove,
    canResend,
    getStoreSize,
    CODE_LENGTH,
    CODE_EXPIRE_MINUTES,
    RESEND_COOLDOWN_SECONDS
};