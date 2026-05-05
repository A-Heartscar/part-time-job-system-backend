// utils/adminLogHelper.js
// ========== 管理员日志辅助工具 ==========
// 提供登录日志和操作日志的记录函数，记录失败不阻塞主流程
const AdminLoginLog = require('../models/AdminLoginLog');
const AdminOperationLog = require('../models/AdminOperationLog');

/**
 * 记录管理员登录日志
 * @param {Object} adminInfo - 管理员信息 { adminUUID, username }
 * @param {string} ip - 登录IP地址
 * @param {string} userAgent - 浏览器 User-Agent
 * @param {string} result - 登录结果：'success' | 'failed'
 * @param {string} failReason - 失败原因（可选）
 */
const logAdminLogin = async (adminInfo, ip, userAgent, result, failReason = '') => {
    try {
        console.log('[日志] 记录登录日志:', {
            username: adminInfo?.username || 'unknown',
            result
        });

        await AdminLoginLog.create({
            adminUUID: adminInfo?.adminUUID || '',
            username: adminInfo?.username || 'unknown',
            ip: ip || '',
            userAgent: userAgent || '',
            result,
            failReason
        });

        console.log('[日志] 登录日志记录成功');
    } catch (error) {
        // 日志记录失败不阻塞主流程
        console.error('[日志] 登录日志记录失败:', error.message);
    }
};

/**
 * 记录管理员操作日志
 * @param {Object} adminInfo - 管理员信息 { adminUUID, username }
 * @param {string} action - 操作类型（如 'create_admin', 'verify_employer'）
 * @param {string} targetType - 目标类型（如 'admin', 'employer', 'internship'）
 * @param {string} targetUUID - 目标 UUID
 * @param {string} detail - 操作详情
 * @param {string} ip - 操作者 IP
 */
const logAdminOperation = async (adminInfo, action, targetType, targetUUID = '', detail = '', ip = '') => {
    try {
        console.log('[日志] 记录操作日志:', {
            username: adminInfo?.username,
            action,
            targetType
        });

        await AdminOperationLog.create({
            adminUUID: adminInfo?.adminUUID || '',
            username: adminInfo?.username || 'unknown',
            action,
            targetType,
            targetUUID,
            detail,
            ip: ip || ''
        });

        console.log('[日志] 操作日志记录成功');
    } catch (error) {
        // 日志记录失败不阻塞主流程
        console.error('[日志] 操作日志记录失败:', error.message);
    }
};

module.exports = {
    logAdminLogin,
    logAdminOperation
};