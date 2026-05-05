// ========== QQ邮箱 SMTP 邮件发送服务 ==========
const nodemailer = require('nodemailer');

// QQ邮箱 SMTP 配置
const SMTP_CONFIG = {
    host: 'smtp.qq.com',
    port: 465,
    secure: true, // 使用 SSL
    auth: {
        user: 'heartscar-zero@qq.com', // 发信邮箱，后续这里可以改为网站的企业邮箱，这里的邮箱仅做测试使用
        pass: process.env.EMAIL_AUTH_CODE || 'your-16-digit-code' // QQ邮箱授权码（16位）
    }
};

// 创建邮件传输器（单例）
let transporter = null;

/**
 * 获取邮件传输器实例
 * 延迟初始化，确保环境变量已加载
 */
const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport(SMTP_CONFIG);
        console.log('[邮件服务] 初始化完成');
    }
    return transporter;
};

/**
 * 发送面试通知邮件
 *
 * @param {Object} options - 邮件参数
 * @param {string} options.to - 收件人邮箱地址
 * @param {string} options.studentName - 学生姓名
 * @param {string} options.jobTitle - 岗位标题
 * @param {string} options.companyName - 雇主/公司名称
 * @param {string} options.interviewTime - 面试时间（可选，如未指定则提示待定）
 * @param {string} options.interviewLocation - 面试地点/方式（可选）
 * @param {string} options.employerNotes - 雇主备注（可选）
 * @returns {Promise<boolean>} 发送是否成功
 */
const sendInterviewEmail = async (options) => {
    const {
        to,
        studentName,
        jobTitle,
        companyName,
        interviewTime = '待定（请关注站内信通知）',
        interviewLocation = '待定（请关注站内信通知）',
        employerNotes = ''
    } = options;

    console.log('[邮件服务] ========== 准备发送面试通知邮件 ==========');
    console.log('[邮件服务] 收件人:', to);
    console.log('[邮件服务] 学生姓名:', studentName);
    console.log('[邮件服务] 岗位:', jobTitle);

    try {
        const transporter = getTransporter();

        // ========== 构建邮件HTML内容 ==========
        const mailHtml = `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                <h2 style="color: #fff; margin: 0;">面试通知</h2>
            </div>
            <div style="background: #fff; padding: 24px; border: 1px solid #e8e8e8; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; color: #333;">亲爱的 <strong>${studentName}</strong> 同学：</p>
                <p style="font-size: 15px; color: #555; line-height: 1.8;">
                    恭喜！您投递的岗位 <strong style="color: #1890ff;">${jobTitle}</strong> 已被雇主查看，并邀请您进入面试环节。
                </p>

                <div style="background: #f5f7fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <h4 style="margin: 0 0 12px 0; color: #333;">面试信息</h4>
                    <table style="width: 100%; font-size: 14px; color: #555;">
                        <tr>
                            <td style="padding: 6px 0; width: 80px; color: #888;">雇主：</td>
                            <td>${companyName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #888;">岗位：</td>
                            <td>${jobTitle}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #888;">面试时间：</td>
                            <td>${interviewTime}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #888;">面试方式：</td>
                            <td>${interviewLocation}</td>
                        </tr>
                        ${employerNotes ? `
                        <tr>
                            <td style="padding: 6px 0; color: #888;">雇主留言：</td>
                            <td>${employerNotes}</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>

                <p style="font-size: 14px; color: #888;">
                    请登录 <a href="http://localhost:3000" style="color: #1890ff;">校园兼职系统</a> 查看详情，
                    并及时与雇主沟通面试安排。
                </p>

                <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 20px 0;" />

                <p style="font-size: 12px; color: #bbb; text-align: center;">
                    此邮件由校园兼职系统自动发送，请勿回复。
                </p>
            </div>
        </div>`;

        // ========== 发送邮件 ==========
        const info = await transporter.sendMail({
            from: `"校园兼职系统" <heartscar-zero@qq.com>`,
            to: to,
            subject: `【面试通知】${companyName} - ${jobTitle}`,
            html: mailHtml
        });

        console.log('[邮件服务] 发送成功:', info.messageId);
        console.log('[邮件服务] ========== 邮件发送完成 ==========');

        return true;
    } catch (error) {
        console.error('[邮件服务] 发送失败:', error.message);
        // 不抛出异常，邮件发送失败不应阻塞主流程
        return false;
    }
};

/**
 * 测试邮件服务连接
 * @returns {Promise<boolean>} 连接是否成功
 */
const testConnection = async () => {
    try {
        const transporter = getTransporter();
        await transporter.verify();
        console.log('[邮件服务] 连接验证成功');
        return true;
    } catch (error) {
        console.error('[邮件服务] 连接验证失败:', error.message);
        return false;
    }
};


/**
 * 发送邮箱验证码（通用方法，支持密码重置和注册两种场景）
 *
 * @param {Object} options - 邮件参数
 * @param {string} options.to - 收件人邮箱地址
 * @param {string} options.code - 6位数字验证码
 * @param {string} options.purpose - 验证码用途：'reset_password' | 'register'
 * @returns {Promise<boolean>} 发送是否成功
 */
const sendVerificationCode = async (options) => {
    const { to, code, purpose = 'register' } = options;

    console.log('[邮件服务] ========== 准备发送验证码邮件 ==========');
    console.log('[邮件服务] 收件人:', to);
    console.log('[邮件服务] 用途:', purpose);

    // ========== 测试邮箱判断：以 testEmail 开头不实际发送 ==========
    // [测试] 测试邮箱，跳过实际发送，打印验证码到控制台
    if (to.startsWith('testEmail')) {
        console.log(`[邮件服务] 测试邮箱，跳过发送，验证码: ${code}`);
        console.log('[邮件服务] ========== 测试邮箱处理完成 ==========');
        return true;
    }

    try {
        const transporter = getTransporter();

        // ========== 根据用途构建不同的邮件内容 ==========
        let subject = '';
        let mailText = '';

        if (purpose === 'reset_password') {
            subject = '【校园兼职系统】密码重置验证码';
            mailText = `您的密码重置验证码为：${code}，有效期10分钟，请勿泄露给他人。`;
        } else if (purpose === 'register') {
            subject = '【校园兼职系统】注册验证码';
            mailText = `您的注册验证码为：${code}，有效期10分钟，请勿泄露给他人。`;
        } else {
            subject = '【校园兼职系统】验证码';
            mailText = `您的验证码为：${code}，有效期10分钟，请勿泄露给他人。`;
        }

        // ========== 构建纯文本邮件（兼容性更好） ==========
        const mailHtml = `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                <h2 style="color: #fff; margin: 0;">校园兼职系统</h2>
            </div>
            <div style="background: #fff; padding: 24px; border: 1px solid #e8e8e8; border-top: none; border-radius: 0 0 10px 10px;">
                <p style="font-size: 16px; color: #333;">您好：</p>
                <p style="font-size: 15px; color: #555; line-height: 1.8;">
                    ${purpose === 'reset_password' ? '您正在重置账号密码，' : '您正在注册校园兼职系统账号，'}验证码如下：
                </p>
                <div style="text-align: center; margin: 24px 0;">
                    <span style="display: inline-block; padding: 12px 32px; background: #f0f5ff; border: 2px solid #1890ff; border-radius: 8px; font-size: 28px; font-weight: 700; color: #1890ff; letter-spacing: 6px;">
                        ${code}
                    </span>
                </div>
                <p style="font-size: 14px; color: #888;">
                    验证码有效期10分钟，请勿泄露给他人。
                </p>
                <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 20px 0;" />
                <p style="font-size: 12px; color: #bbb; text-align: center;">
                    此邮件由校园兼职系统自动发送，请勿回复。
                </p>
            </div>
        </div>`;

        // ========== 发送邮件 ==========
        const info = await transporter.sendMail({
            from: '"校园兼职系统" <heartscar-zero@qq.com>',
            to: to,
            subject: subject,
            html: mailHtml
        });

        console.log('[邮件服务] 验证码发送成功:', info.messageId);
        console.log('[邮件服务] ========== 邮件发送完成 ==========');

        return true;
    } catch (error) {
        console.error('[邮件服务] 验证码发送失败:', error.message);
        return false;
    }
};

module.exports = {
    sendInterviewEmail,
    sendVerificationCode,
    testConnection
};
