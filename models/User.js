const mongoose = require('mongoose');

// 学生子文档
const StudentSubSchema = new mongoose.Schema({
    studentCode: { type: String, required: [true, '学号不能为空'], trim: true  },
    studentName: { type: String, required: [true, '学生姓名不能为空'], trim: true  },
    school: { type: String, required: [true, '学校不能为空'], trim: true  },
    major: { type: String, required: [true, '专业不能为空'], trim: true  },
    phone: { type: String, required: [true, '联系电话不能为空'], trim: true },
    skills: { type: [String], default: [] }, // 技能列表（数组）
});

// 个人雇主子文档
const PersonalEmployerSubSchema = new mongoose.Schema({
    realName: { type: String, required: [true, '个人雇主姓名不能为空'], trim: true },
    idCard: {
        type: String,
        required: [true, '身份证号不能为空'],
        trim: true,
        // 身份证正则验证（18位）
        match: [/^\d{17}[\dXx]$/, '请输入正确的18位身份证号']},
    profession: { type: String, required: [true, '个人职业不能为空'], trim: true },
    selfIntro: { type: String, default: '' } // 个人简介
});

// 企业雇主子文档
const CompanyEmployerSubSchema = new mongoose.Schema({
    companyName: { type: String, required: [true, '企业名称不能为空'], trim: true },
    companyType: {type: String, required: [true, '企业类型不能为空'], trim: true},
    creditCode: { type: String, required: [true, '统一社会信用代码不能为空'], trim: true },
    companyAddress: { type: String, required: [true, '企业地址不能为空'], trim: true },
    contactPerson: { type: String, required: [true, '联系人姓名不能为空'], trim: true },
    contactPhone: { type: String, required: [true, '联系人手机号不能为空'], trim: true },
    companyIntro: { type: String, default: '' } // 企业简介
});

const EmployerSubSchema = new mongoose.Schema({
    employerType: {type: String, required: [true, '雇主类型不能为空'], enum: ['personal', 'company'], trim: true},
    personalInfo: {
        type: PersonalEmployerSubSchema,
        required: function() { return this.employerType === 'personal'; }
    },
    companyInfo: {
        type: CompanyEmployerSubSchema,
        required: function() { return this.employerType === 'company'; }
    },

    // ========== 身份验证信息 ==========
    verification: {
        // 验证状态：unverified=未验证(pending=审核中) approved=已验证 rejected=已拒绝
        status: {
            type: String,
            enum: ['unverified', 'pending', 'approved', 'rejected'],
            default: 'unverified'
        },
        // 提交验证时间
        submittedAt: {
            type: Date,
            default: null
        },
        // 审核时间
        reviewedAt: {
            type: Date,
            default: null
        },
        // 审核备注（管理员填写）
        reviewerNotes: {
            type: String,
            default: ''
        },
        // 驳回原因（rejected状态时填写）
        rejectionReason: {
            type: String,
            default: ''
        },
        // 验证类型：real_name=个人实名认证 enterprise=企业认证
        verificationType: {
            type: String,
            enum: ['real_name', 'enterprise'],
            default: null
        }
    }
});

// 主用户
const UserSchema = new mongoose.Schema({
    // 通用字段
    userUUID: {type : String, required : true, unique: true},
    role: { type: String, enum: ['student', 'employer'], required: true },
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false, trim: true },
    email: {type: String, required: true, trim: true},
    avatar: {type: String, default: '', trim: true },
    // 学生子文档
    studentInfo: {
        type: StudentSubSchema,
        required: function() { return this.role === 'student'; } 
    },

    // 雇主子文档
    employerInfo: {
        type: EmployerSubSchema,
        required: function() { return this.role === 'employer'; }
    }
}, { timestamps: true });


module.exports = mongoose.model('User', UserSchema);