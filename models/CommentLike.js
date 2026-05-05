// models/CommentLike.js
// ========== 评论点赞记录模型 ==========
// 记录用户对评论的点赞行为，用于去重和状态查询
const mongoose = require('mongoose');

const CommentLikeSchema = new mongoose.Schema({
    // 关联的评论ID
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        required: [true, '评论ID不能为空'],
        index: true
    },

    // 点赞用户UUID
    userUUID: {
        type: String,
        required: [true, '用户UUID不能为空'],
        index: true
    }

}, {
    timestamps: true
});

// ========== 唯一复合索引：一人一条评论只能点赞一次 ==========
CommentLikeSchema.index(
    { commentId: 1, userUUID: 1 },
    { unique: true, name: 'unique_comment_user_like' }
);

module.exports = mongoose.model('CommentLike', CommentLikeSchema);