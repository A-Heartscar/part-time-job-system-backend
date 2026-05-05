// ========== 会话模型 ==========
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
    // 参与者UUID数组（排序后存储，保证唯一性）
    participants: {
        type: [String],
        required: true,
        validate: {
            validator: (v) => v.length === 2,
            message: '会话必须有2个参与者'
        }
    },

    // 最后一条消息快照
    lastMessage: {
        content: { type: String, default: '' },
        senderUUID: { type: String, default: '' },
        sentAt: { type: Date, default: null }
    },

    // 未读消息计数（按用户UUID）
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    }

}, { timestamps: true });

// 排序索引
ConversationSchema.index({ updatedAt: -1 });

/**
 * 查找或创建会话
 */
ConversationSchema.statics.findOrCreate = async function(user1, user2) {
    // 排序保证一致性
    const participants = [user1, user2].sort();

    console.log('[Conversation] findOrCreate:', { user1, user2, participants });

    // 先查找是否已存在（查询排序后的数组）
    let conversation = await this.findOne({ participants: participants });

    if (!conversation) {
        // 二次检查：防止并发创建
        conversation = await this.findOne({ participants: participants });

        if (!conversation) {
            try {
                conversation = await this.create({
                    participants,
                    unreadCount: new Map([
                        [user1, 0],
                        [user2, 0]
                    ])
                });
                console.log('[Conversation] 创建新会话:', conversation._id);
            } catch (error) {
                // 如果创建失败（并发导致的唯一索引冲突），再次尝试查询
                if (error.code === 11000) {
                    console.log('[Conversation] 并发创建冲突，重新查询');
                    conversation = await this.findOne({ participants: participants });
                } else {
                    throw error;
                }
            }
        }
    } else {
        console.log('[Conversation] 已存在会话:', conversation._id);
    }

    return conversation;
};

/**
 * 获取用户的会话列表
 */
ConversationSchema.statics.getUserConversations = async function(userUUID) {
    const conversations = await this.find({
        participants: userUUID
    })
        .sort({ updatedAt: -1 })
        .lean();

    return conversations;
};

module.exports = mongoose.model('Conversation', ConversationSchema);