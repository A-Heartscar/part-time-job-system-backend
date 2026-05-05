// ========== 消息模型 ==========
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    // 所属会话
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },

    // 发送者UUID
    senderUUID: {
        type: String,
        required: true,
        index: true
    },

    // 接收者UUID
    receiverUUID: {
        type: String,
        required: true,
        index: true
    },

    // 消息内容
    content: {
        type: String,
        required: true,
        maxlength: 2000
    },

    // 消息类型：text 普通消息，invitation 岗位邀请
    type: {
        type: String,
        enum: ['text', 'invitation'],
        default: 'text'
    },

    // 扩展元数据（邀请消息包含岗位信息）
    metadata: {
        jobId: { type: mongoose.Schema.Types.ObjectId },
        jobTitle: { type: String },
        action: {
            type: String,
            enum: ['invite', 'accept', 'decline', 'status_change', 'interview_notification',
                'result_notification', 'interview_accept', 'interview_reschedule',
                'reschedule_accept', 'reschedule_reject', 'penalty_notification',
                'comment_notification', 'comment_report', 'appeal_submitted', 'appeal_result']
        },
    },

    // 阅读时间
    readAt: {
        type: Date,
        default: null
    }

}, { timestamps: true });

// 按会话和时间查询
MessageSchema.index({ conversationId: 1, createdAt: -1 });

/**
 * 获取会话的消息列表（分页）
 */
MessageSchema.statics.getConversationMessages = async function(conversationId, page = 1, limit = 30) {
    const skip = (page - 1) * limit;

    const messages = await this.find({ conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await this.countDocuments({ conversationId });

    return {
        messages: messages.reverse(), // 返回正序
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

module.exports = mongoose.model('Message', MessageSchema);