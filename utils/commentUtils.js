// utils/commentUtils.js
// ========== 评论工具函数 ==========
// 包含违规词检测和时间格式化功能
const badWords = require('../config/badWords.json');

/**
 * 违规词检测
 * 遍历所有分类的违规词库，检查内容是否包含违规词汇
 *
 * @param {string} content - 待检测的评论内容
 * @returns {Object} { isValid: boolean, reason: string }
 *   isValid: 是否通过检测
 *   reason: 不通过时的原因描述
 */
const checkBadWords = (content) => {
    console.log('[违规词检测] ========== 开始检测 ==========');
    console.log('[违规词检测] 内容长度:', content.length);

    // 转为小写进行不区分大小写匹配
    const lowerContent = content.toLowerCase();

    // 遍历所有违规词分类
    const categories = ['porn', 'violence', 'insult', 'ad'];
    const reasonMap = {
        porn: '包含色情内容',
        violence: '包含暴力内容',
        insult: '包含辱骂内容',
        ad: '包含广告内容'
    };

    for (const category of categories) {
        const words = badWords[category] || [];
        for (const word of words) {
            if (lowerContent.includes(word.toLowerCase())) {
                const reason = reasonMap[category] || '包含违规内容';
                console.log('[违规词检测] 检测到违规词:', {
                    category,
                    word,
                    reason
                });
                console.log('[违规词检测] ========== 检测完成（不通过） ==========');
                return { isValid: false, reason };
            }
        }
    }

    console.log('[违规词检测] ========== 检测完成（通过） ==========');
    return { isValid: true, reason: '' };
};

/**
 * 格式化评论发布时间
 * 根据时间差返回不同的显示格式，适配年轻用户阅读习惯
 *
 * @param {Date|string} date - 评论发布时间
 * @returns {string} 格式化后的时间字符串
 *   示例：刚刚、10分钟前、3小时前、昨天 14:30、5天前、2026-04-15 09:30
 */
const formatCommentTime = (date) => {
    const now = new Date();
    const target = new Date(date);
    const diff = now - target; // 毫秒差
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    console.log('[时间格式化] 计算时间差:', { minutes, hours, days });

    // 不足1分钟
    if (minutes < 1) {
        return '刚刚';
    }
    // 不足1小时
    if (hours < 1) {
        return `${minutes}分钟前`;
    }
    // 不足1天（今天内）
    if (hours < 24) {
        return `${hours}小时前`;
    }
    // 昨天
    if (days === 1) {
        const timeStr = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `昨天 ${timeStr}`;
    }
    // 7天内
    if (days < 7) {
        return `${days}天前`;
    }
    // 超过7天显示具体日期
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const timeStr = target.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `${year}-${month}-${day} ${timeStr}`;
};

/**
 * 格式化点赞数
 * 超过1000时显示为1.2k格式
 *
 * @param {number} count - 点赞数
 * @returns {string} 格式化后的点赞数字符串
 */
const formatLikeCount = (count) => {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`;
    }
    return String(count);
};

module.exports = {
    checkBadWords,
    formatCommentTime,
    formatLikeCount
};