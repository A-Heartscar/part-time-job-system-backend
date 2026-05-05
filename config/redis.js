// config/redis.js
// ========== Redis 连接管理（单例） ==========
// 提供统一的 Redis 操作方法，所有 key 自动添加 REDIS_PREFIX 前缀
// 供 JWT 黑名单、验证码缓存、Socket 在线用户等模块使用
const Redis = require('ioredis');

// ========== 从环境变量读取配置，提供默认值 ==========
const REDIS_PREFIX = process.env.REDIS_PREFIX || 'ptjob';

// ========== 创建 Redis 单例连接 ==========
const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB) || 0,
    retryStrategy: (times) => {
        // 自动重连策略：指数退避，最大间隔 2000ms
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] 第 ${times} 次重连，延迟 ${delay}ms`);
        return delay;
    },
    maxRetriesPerRequest: 3
});

// ========== 连接事件日志 ==========
redis.on('connect', () => {
    console.log('[Redis] 连接成功');
});

redis.on('error', (err) => {
    console.error('[Redis] 连接错误:', err.message);
});

// ========== 连接状态判断 ==========
/**
 * 判断 Redis 是否处于可用状态
 * @returns {boolean} 是否连接就绪
 */
redis.isConnected = () => {
    return redis.status === 'ready';
};

// ========== 辅助函数：添加键名前缀 ==========
const prefixKey = (key) => `${REDIS_PREFIX}:${key}`;

// ========== 封装 String 操作方法 ==========

/**
 * 获取字符串值
 * @param {string} key - 键名（不含前缀）
 * @returns {Promise<string|null>}
 */
redis.pGet = async (key) => {
    return redis.get(prefixKey(key));
};

/**
 * 设置字符串值
 * @param {string} key - 键名（不含前缀）
 * @param {string} value - 值
 * @returns {Promise<'OK'>}
 */
redis.pSet = async (key, value) => {
    return redis.set(prefixKey(key), value);
};

/**
 * 设置带过期时间的字符串值
 * @param {string} key - 键名（不含前缀）
 * @param {number} seconds - 过期秒数
 * @param {string} value - 值
 * @returns {Promise<'OK'>}
 */
redis.pSetex = async (key, seconds, value) => {
    return redis.setex(prefixKey(key), seconds, value);
};

/**
 * 删除键（支持单个 key 字符串）
 * @param {string} key - 键名（不含前缀）
 * @returns {Promise<number>} 删除的键数量
 */
redis.pDel = async (key) => {
    return redis.del(prefixKey(key));
};

/**
 * 检查键是否存在
 * @param {string} key - 键名（不含前缀）
 * @returns {Promise<number>} 1=存在, 0=不存在
 */
redis.pExists = async (key) => {
    return redis.exists(prefixKey(key));
};

/**
 * 获取键的剩余过期时间（秒）
 * @param {string} key - 键名（不含前缀）
 * @returns {Promise<number>} 剩余秒数，-1=永不过期，-2=不存在
 */
redis.pTtl = async (key) => {
    return redis.ttl(prefixKey(key));
};

/**
 * 设置键的过期时间（秒）
 * @param {string} key - 键名（不含前缀）
 * @param {number} seconds - 过期秒数
 * @returns {Promise<number>} 1=成功, 0=键不存在
 */
redis.pExpire = async (key, seconds) => {
    return redis.expire(prefixKey(key), seconds);
};

/**
 * 原子递增键值
 * @param {string} key - 键名（不含前缀）
 * @returns {Promise<number>} 递增后的值
 */
redis.pIncr = async (key) => {
    return redis.incr(prefixKey(key));
};

// ========== 封装 Hash 操作方法 ==========

/**
 * 设置 Hash 字段
 * @param {string} hash - Hash 键名（不含前缀）
 * @param {string} field - 字段名
 * @param {string} value - 字段值
 * @returns {Promise<number>}
 */
redis.pHset = async (hash, field, value) => {
    return redis.hset(prefixKey(hash), field, value);
};

/**
 * 获取 Hash 字段
 * @param {string} hash - Hash 键名（不含前缀）
 * @param {string} field - 字段名
 * @returns {Promise<string|null>}
 */
redis.pHget = async (hash, field) => {
    return redis.hget(prefixKey(hash), field);
};

/**
 * 删除 Hash 字段
 * @param {string} hash - Hash 键名（不含前缀）
 * @param {string} field - 字段名
 * @returns {Promise<number>}
 */
redis.pHdel = async (hash, field) => {
    return redis.hdel(prefixKey(hash), field);
};

/**
 * 获取 Hash 所有字段和值
 * @param {string} hash - Hash 键名（不含前缀）
 * @returns {Promise<Object>}
 */
redis.pHgetall = async (hash) => {
    return redis.hgetall(prefixKey(hash));
};

// ========== 封装 Sorted Set 操作方法 ==========

/**
 * 添加有序集合成员
 * @param {string} key - 键名（不含前缀）
 * @param {number} score - 分值
 * @param {string} member - 成员
 * @returns {Promise<number>}
 */
redis.pZadd = async (key, score, member) => {
    return redis.zadd(prefixKey(key), score, member);
};

/**
 * 删除有序集合成员
 * @param {string} key - 键名（不含前缀）
 * @param {string} member - 成员
 * @returns {Promise<number>}
 */
redis.pZrem = async (key, member) => {
    return redis.zrem(prefixKey(key), member);
};

/**
 * 获取有序集合指定范围成员
 * @param {string} key - 键名（不含前缀）
 * @param {number} start - 起始索引
 * @param {number} stop - 结束索引
 * @returns {Promise<Array<string>>}
 */
redis.pZrange = async (key, start, stop) => {
    return redis.zrange(prefixKey(key), start, stop);
};

/**
 * 删除有序集合中分值在指定范围内的成员（用于清理僵尸用户）
 * @param {string} key - 键名（不含前缀）
 * @param {number|string} min - 最小分值，'-inf' 表示负无穷
 * @param {number|string} max - 最大分值
 * @returns {Promise<number>} 删除的成员数量
 */
redis.pZremrangebyscore = async (key, min, max) => {
    return redis.zremrangebyscore(prefixKey(key), min, max);
};

/**
 * 获取有序集合成员的分值
 * @param {string} key - 键名（不含前缀）
 * @param {string} member - 成员
 * @returns {Promise<string|null>} 分值字符串，不存在返回 null
 */
redis.pZscore = async (key, member) => {
    return redis.zscore(prefixKey(key), member);
};

module.exports = redis;