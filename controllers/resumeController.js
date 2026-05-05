// ========== 简历控制器 ==========
const Resume = require('../models/Resume');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const { generateFileUrl } = require('../middleware/uploadMiddleware');
const fileService = require('../utils/fileService')
const fs = require('fs');
const path = require('path');
const redis = require('../config/redis');

// 验证结果处理中间件(测试用，后续记得删）
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('[验证错误]', errors.array());
        return res.status(400).json({
            success: false,
            message: errors.array().map(e => e.msg).join('; ')
        });
    }
    next();
};

// 简历数据验证规则
exports.resumeValidation = [
    // 基础信息验证
    body('studentUUID')
        .notEmpty().withMessage('学生UUID不能为空')
        .trim()
        .isString().withMessage('学生UUID需为字符串'),
    
    // 学生状态验证
    body('studentStatus.grade')
        .notEmpty().withMessage('年级不能为空')
        .isIn(['freshman', 'sophomore', 'junior', 'senior', 'graduate'])
        .withMessage('年级必须是有效的选项'),
    
    body('studentStatus.major')
        .notEmpty().withMessage('专业不能为空')
        .trim()
        .isString().withMessage('专业需为字符串'),
    
    // 薪资期望验证
    body('salaryExpectation.min')
        .notEmpty().withMessage('最低薪资期望不能为空')
        .isFloat({ min: 0 }).withMessage('最低薪资期望必须大于等于0'),
    
    body('salaryExpectation.max')
        .notEmpty().withMessage('最高薪资期望不能为空')
        .isFloat({ min: 0 }).withMessage('最高薪资期望必须大于等于0')
        .custom((value, { req }) => {
            if (parseFloat(value) < parseFloat(req.body.salaryExpectation?.min || 0)) {
                throw new Error('最高薪资期望不能低于最低薪资期望');
            }
            return true;
        }),
    
    // 技能验证（可选）
    body('skills.*.name')
        .if(body('skills').exists())
        .notEmpty().withMessage('技能名称不能为空')
        .trim()
        .isString().withMessage('技能名称需为字符串'),
    
    body('skills.*.proficiency')
        .if(body('skills').exists())
        .isIn(['beginner', 'basic', 'intermediate', 'advanced', 'expert'])
        .withMessage('技能掌握程度必须是有效的选项'),
    
    // 项目经历验证（可选）
    body('projectExperiences.*.title')
        .if(body('projectExperiences').exists())
        .notEmpty().withMessage('项目标题不能为空')
        .trim()
        .isString().withMessage('项目标题需为字符串'),
    
    // 实习经历验证（可选）
    body('internshipExperiences.*.company')
        .if(body('internshipExperiences').exists())
        .notEmpty().withMessage('公司名称不能为空')
        .trim()
        .isString().withMessage('公司名称需为字符串'),
    
    body('internshipExperiences.*.position')
        .if(body('internshipExperiences').exists())
        .notEmpty().withMessage('职位不能为空')
        .trim()
        .isString().withMessage('职位需为字符串')
];

// 创建简历
exports.createResume = async (req, res) => {
    try {
        console.log('[简历创建] 开始处理请求:', {
            userId: req.user?.id,
            hasFiles: !!req.files,
            timestamp: new Date().toISOString()
        });

        console.log('[简历创建] req.user 详情:', JSON.stringify(req.user, null, 2));

        // 解析从 FormData 传来的 JSON 字符串
        if (!req.body.resumeData) {
            console.error('[简历创建] 错误: 缺少简历数据');
            return res.status(400).json({
                success: false,
                message: '缺少简历数据'
            });
        }

        let resumeData;
        try {
            resumeData = JSON.parse(req.body.resumeData);
            console.log('[简历创建] 解析简历数据成功:', {
                studentUUID: resumeData.studentUUID,
                hasSkills: !!resumeData.skills,
                skillsCount: resumeData.skills?.length || 0
            });
        } catch (parseError) {
            console.error('[简历创建] JSON解析失败:', parseError);
            return res.status(400).json({
                success: false,
                message: '简历数据格式错误'
            });
        }

        // 检查学生是否存在
        const user = await User.findOne({ userUUID: resumeData.studentUUID });
        if (!user) {
            console.error('[简历创建] 错误: 学生不存在', { studentUUID: resumeData.studentUUID });
            return res.status(404).json({
                success: false,
                message: '学生不存在'
            });
        }

        // 检查是否已有简历
        const existingResume = await Resume.findOne({ studentUUID: resumeData.studentUUID });
        if (existingResume) {
            console.error('[简历创建] 错误: 简历已存在', { studentUUID: resumeData.studentUUID });
            return res.status(400).json({
                success: false,
                message: '该学生已存在简历，请使用更新功能'
            });
        }

        // 处理文件映射
        // 文件命名规则：{type}_{parentIndex}_{materialIndex}_{fileIndex}
        // 例如：skill_0_1_2 表示第0个技能的第1个材料的第2个文件
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const parts = file.fieldname.split('_');
                const type = parts[0]; // skill, project, intern
                const parentIdx = parseInt(parts[1]);
                const materialIdx = parseInt(parts[2]);
                const fileIdx = parseInt(parts[3]);

                // 根据不同的 type 分配正确的子文件夹名
                let subFolder = 'others';
                if (type === 'skill') subFolder = 'skills';
                else if (type === 'project') subFolder = 'projects';
                else if (type === 'intern') subFolder = 'internships';

                const fileUrl = `/uploads/userFile/${resumeData.studentUUID}/${subFolder}/${file.filename}`;

                // 根据类型存储到对应位置
                if (type === 'skill' && resumeData.skills?.[parentIdx]?.supportingMaterials?.[materialIdx]) {
                    const material = resumeData.skills[parentIdx].supportingMaterials[materialIdx];
                    if (!material.url) material.url = [];
                    if (!material.name) material.name = [];
                    material.url.push(fileUrl);
                    material.name.push(file.originalname);
                } else if (type === 'project' && resumeData.projectExperiences?.[parentIdx]?.supportingMaterials?.[materialIdx]) {
                    const material = resumeData.projectExperiences[parentIdx].supportingMaterials[materialIdx];
                    if (!material.url) material.url = [];
                    if (!material.name) material.name = [];
                    material.url.push(fileUrl);
                    material.name.push(file.originalname);
                } else if (type === 'intern' && resumeData.internshipExperiences?.[parentIdx]?.verificationRequest?.supportingMaterials?.[materialIdx]) {
                    const material = resumeData.internshipExperiences[parentIdx].verificationRequest.supportingMaterials[materialIdx];
                    if (!material.url) material.url = [];
                    if (!material.name) material.name = [];
                    material.url.push(fileUrl);
                    material.name.push(file.originalname);
                }
            });
        }

        // 在创建简历之前，清理临时字段
        const cleanMaterials = (materials) => {
            if (!materials) return materials;
            return materials.map(material => {
                const cleaned = { ...material };
                delete cleaned._isDeleted;
                delete cleaned._isNew;
                delete cleaned._existingUrl;
                delete cleaned._existingName;
                delete cleaned.fileList;
                return cleaned;
            });
        };

        // 清理所有数据中的临时字段
        if (resumeData.skills) {
            resumeData.skills = resumeData.skills.map(skill => ({
                ...skill,
                supportingMaterials: cleanMaterials(skill.supportingMaterials || [])
            }));
        }
        if (resumeData.projectExperiences) {
            resumeData.projectExperiences = resumeData.projectExperiences.map(project => ({
                ...project,
                supportingMaterials: cleanMaterials(project.supportingMaterials || [])
            }));
        }
        if (resumeData.internshipExperiences) {
            resumeData.internshipExperiences = resumeData.internshipExperiences.map(intern => ({
                ...intern,
                verificationRequest: {
                    ...intern.verificationRequest,
                    supportingMaterials: cleanMaterials(intern.verificationRequest?.supportingMaterials || [])
                }
            }));
        }


        // 创建简历
        const newResume = new Resume({
            ...resumeData,
            user: req.user.id || req.user._id
        });

        // 更新向量表示
        newResume.updateVector();

        await newResume.save();
        console.log('[简历创建] 简历保存成功:', { resumeId: newResume._id });

        if (redis.isConnected()) {
            await redis.pDel(`resume:data:${newResume.studentUUID}`);
            console.log('[缓存] 简历创建：已清除简历缓存');
        }

        res.status(201).json({
            success: true,
            message: '简历创建成功',
            data: newResume
        });

    } catch (error) {
        console.error('创建简历失败：', error);

        if (error.name === 'ValidationError') {
            const errMsg = Object.values(error.errors).map(item => item.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errMsg
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// 获取简历（根据studentUUID）
exports.getResume = async (req, res) => {
    try {
        const { studentUUID } = req.params;
        // ========== 缓存读取 ==========
        if (redis.isConnected()) {
            const cacheKey = `resume:data:${studentUUID}`;
            const cached = await redis.pGet(cacheKey);
            if (cached) {
                console.log('[简历] 缓存命中:', studentUUID);
                return res.json({ success: true, data: JSON.parse(cached) });
            }
        }


        // ========== 非缓存读取 ==========
        console.log('[获取简历] 请求参数:', { studentUUID });

        const resume = await Resume.findOne({ studentUUID });
        if (!resume) {
            console.log('[获取简历] 简历不存在');
            return res.status(404).json({
                success: false,
                message: '简历不存在'
            });
        }

        console.log('[获取简历] 获取成功:', { resumeId: resume._id });

        // ========== 缓存回写 ==========
        if (redis.isConnected() && resume) {
            await redis.pSetex(`resume:data:${resume.studentUUID}`, 1800, JSON.stringify(resume));
            console.log('[简历] 缓存已写入');
        }


        res.json({
            success: true,
            data: resume
        });

    } catch (error) {
        console.error('[获取简历] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// ========== 辅助函数：收集简历中所有文件URL ==========

/**
 * 收集简历中所有的文件URL
 * 用于删除简历或删除整个模块时清理物理文件
 *
 * @param {Object} resumeData - 简历数据对象
 * @returns {Array} 文件URL数组
 */
const collectAllFileUrls = (resumeData) => {
    const urls = [];

    // 收集技能模块的文件
    if (resumeData.skills) {
        resumeData.skills.forEach(skill => {
            if (skill.supportingMaterials) {
                skill.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        urls.push(...material.url.filter(u => u));
                    }
                });
            }
        });
    }

    // 收集项目模块的文件
    if (resumeData.projectExperiences) {
        resumeData.projectExperiences.forEach(project => {
            if (project.supportingMaterials) {
                project.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        urls.push(...material.url.filter(u => u));
                    }
                });
            }
        });
    }

    // 收集实习模块的文件
    if (resumeData.internshipExperiences) {
        resumeData.internshipExperiences.forEach(internship => {
            const materials = internship.verificationRequest?.supportingMaterials;
            if (materials) {
                materials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        urls.push(...material.url.filter(u => u));
                    }
                });
            }
        });
    }

    return urls;
};

/**
 * 比较新旧简历数据，收集被删除的模块中的所有文件
 *
 * @param {Object} oldResume - 旧简历数据
 * @param {Object} newResumeData - 新简历数据
 * @returns {Array} 需要删除的文件URL数组
 */
const collectDeletedModuleFiles = (oldResume, newResumeData) => {
    const urlsToDelete = [];

    // 比较技能模块：找出被完全删除的技能
    if (oldResume.skills && newResumeData.skills) {
        // 如果新数据中的技能数量减少，说明有技能被删除
        // 注意：这里只能通过比较数量来判断，更精确的方式是在前端传递删除标记
        // 但为了处理直接删除整个技能的情况，我们需要在更新时收集

        // 获取旧数据中所有技能的文件URL
        const oldSkillUrls = [];
        oldResume.skills.forEach(skill => {
            if (skill.supportingMaterials) {
                skill.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        oldSkillUrls.push(...material.url.filter(u => u));
                    }
                });
            }
        });

        // 获取新数据中所有技能的文件URL
        const newSkillUrls = [];
        newResumeData.skills.forEach(skill => {
            if (skill.supportingMaterials) {
                skill.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        newSkillUrls.push(...material.url.filter(u => u));
                    }
                });
            }
        });

        // 找出在新数据中不存在的URL
        oldSkillUrls.forEach(url => {
            if (!newSkillUrls.includes(url)) {
                urlsToDelete.push(url);
            }
        });
    }

    // 同样处理项目和实习模块
    if(oldResume.projectExperiences && newResumeData.projectExperiences){
        const oldProjectUrls = [];
        oldResume.projectExperiences.forEach(project => {
            if(project.supportingMaterials) {
                project.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        oldProjectUrls.push(...material.url.filter(u => u));
                    }
                })
            }
        })

        const newProjectUrls = [];
        newResumeData.projectExperiences.forEach(project => {
            if (project.supportingMaterials) {
                project.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        newProjectUrls.push(...material.url.filter(u => u));
                    }
                });
            }
        });

        oldProjectUrls.forEach(url => {
            if(!newProjectUrls.includes(url)){
                urlsToDelete.push(url);
            }
        })
    }

    if(oldResume.internshipExperiences && newResumeData.internshipExperiences){

        const oldInternshipUrls = [];
        oldResume.internshipExperiences.forEach(internship => {
            if(internship.verificationRequest.supportingMaterials) {
                internship.verificationRequest.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        oldInternshipUrls.push(...material.url.filter(u => u));
                    }
                })
            }
        })

        const newInternshipUrls = [];
        newResumeData.internshipExperiences.forEach(internship => {
            if(internship.verificationRequest.supportingMaterials) {
                internship.verificationRequest.supportingMaterials.forEach(material => {
                    if (material.url && Array.isArray(material.url)) {
                        newInternshipUrls.push(...material.url.filter(u => u));
                    }
                })
            }
        })

        oldInternshipUrls.forEach(url => {
            if (!newInternshipUrls .includes(url)){
                urlsToDelete.push(url)
            }
        })
    }



    return urlsToDelete;
};

// 更新简历
exports.updateResume = async (req, res) => {
    try {
        console.log('[简历更新] 开始处理请求:', {
            resumeId: req.params.id,
            userId: req.user?.id,
            hasFiles: !!req.files,
            timestamp: new Date().toISOString()
        });

        // 解析从 FormData 传来的 JSON 字符串
        if (!req.body.resumeData) {
            console.error('[简历更新] 错误: 缺少简历数据');
            return res.status(400).json({
                success: false,
                message: '缺少简历数据'
            });
        }

        let resumeData;
        try {
            resumeData = JSON.parse(req.body.resumeData);
            console.log('[简历更新] 解析简历数据成功');
        } catch (parseError) {
            console.error('[简历更新] JSON解析失败:', parseError);
            return res.status(400).json({
                success: false,
                message: '简历数据格式错误'
            });
        }

        // 查找旧简历（用于对比文件变化）
        const oldResume = await Resume.findById(req.params.id);
        if (!oldResume) {
            console.error('[简历更新] 错误: 简历不存在', { resumeId: req.params.id });
            return res.status(404).json({
                success: false,
                message: '简历不存在'
            });
        }

        // 检查权限
        if (oldResume.studentUUID !== resumeData.studentUUID) {
            console.error('[简历更新] 权限错误: 用户无权更新此简历');
            return res.status(403).json({
                success: false,
                message: '无权更新此简历'
            });
        }

        console.log('[简历更新调试] ========== 开始检查删除标记 ==========');
        // 下边几个都是检查代码，后续记得删。
        // 检查技能中的删除标记
        if (resumeData.skills) {
            resumeData.skills.forEach((skill, sIdx) => {
                if (skill.supportingMaterials) {
                    skill.supportingMaterials.forEach((mat, mIdx) => {
                        console.log(`[调试] 技能${sIdx}-材料${mIdx}:`, {
                            _isDeleted: mat._isDeleted,
                            _deletedUrls: mat._deletedUrls,
                            _existingUrl: mat._existingUrl,
                            type: mat.type,
                            title: mat.title
                        });
                    });
                }
            });
        }

        // 检查项目中的删除标记
        if (resumeData.projectExperiences) {
            resumeData.projectExperiences.forEach((proj, pIdx) => {
                if (proj.supportingMaterials) {
                    proj.supportingMaterials.forEach((mat, mIdx) => {
                        console.log(`[调试] 项目${pIdx}-材料${mIdx}:`, {
                            _isDeleted: mat._isDeleted,
                            _deletedUrls: mat._deletedUrls,
                            _existingUrl: mat._existingUrl,
                            type: mat.type,
                            title: mat.title
                        });
                    });
                }
            });
        }

        // 检查实习中的删除标记
        if (resumeData.internshipExperiences) {
            resumeData.internshipExperiences.forEach((intern, iIdx) => {
                const materials = intern.verificationRequest?.supportingMaterials;
                if (materials) {
                    materials.forEach((mat, mIdx) => {
                        console.log(`[调试] 实习${iIdx}-材料${mIdx}:`, {
                            _isDeleted: mat._isDeleted,
                            _deletedUrls: mat._deletedUrls,
                            _existingUrl: mat._existingUrl,
                            type: mat.type,
                            title: mat.title
                        });
                    });
                }
            });
        }

        // 收集需要删除的文件（标记为 _isDeleted 的材料）
        const urlsToDelete = [];

        // 1. 收集被标记为删除的材料中的文件
        const collectDeletedUrlsFromMaterials = (materials) => {
            if (!materials || !Array.isArray(materials)) return;
            materials.forEach(material => {
                // 情况1：整个材料被标记为删除
                if (material._isDeleted === true) {
                    // 收集该材料的所有文件URL
                    if (material._existingUrl && Array.isArray(material._existingUrl)) {
                        console.log('[简历更新] 发现整个材料被删除，收集文件:', material._existingUrl);
                        urlsToDelete.push(...material._existingUrl);
                    }
                    if (material.url && Array.isArray(material.url)) {
                        urlsToDelete.push(...material.url.filter(u => u));
                    }
                }

                // 情况2：材料内部分文件被删除（_deletedUrls 字段）
                if (material._deletedUrls && Array.isArray(material._deletedUrls)) {
                    console.log('[简历更新] 发现部分文件被删除:', material._deletedUrls);
                    urlsToDelete.push(...material._deletedUrls);
                }
            });
        };

        // 收集所有标记删除的文件
        if (resumeData.skills) {
            resumeData.skills.forEach(skill => {
                collectDeletedUrlsFromMaterials(skill.supportingMaterials);
            });
        }
        if (resumeData.projectExperiences) {
            resumeData.projectExperiences.forEach(project => {
                collectDeletedUrlsFromMaterials(project.supportingMaterials);
            });
        }
        if (resumeData.internshipExperiences) {
            resumeData.internshipExperiences.forEach(internship => {
                collectDeletedUrlsFromMaterials(internship.verificationRequest?.supportingMaterials);
            });
        }

        // 2. 收集被完全删除的技能/项目/实习中的文件
        // 通过比较新旧数据的数量来检测被删除的整个模块
        const detectDeletedModules = () => {
            // 技能模块
            const oldSkillCount = oldResume.skills?.length || 0;
            const newSkillCount = resumeData.skills?.length || 0;
            if (newSkillCount < oldSkillCount) {
                console.log(`[简历更新] 检测到技能被删除: ${oldSkillCount} -> ${newSkillCount}`);
                // 收集所有旧技能的文件，然后排除新技能中仍存在的文件
                const oldSkillUrls = [];
                oldResume.skills.forEach(skill => {
                    if (skill.supportingMaterials) {
                        skill.supportingMaterials.forEach(material => {
                            if (material.url && Array.isArray(material.url)) {
                                oldSkillUrls.push(...material.url.filter(u => u));
                            }
                        });
                    }
                });

                const newSkillUrls = [];
                resumeData.skills.forEach(skill => {
                    if (skill.supportingMaterials) {
                        skill.supportingMaterials.forEach(material => {
                            if (material.url && Array.isArray(material.url)) {
                                newSkillUrls.push(...material.url.filter(u => u));
                            }
                            if (material._existingUrl && Array.isArray(material._existingUrl)) {
                                newSkillUrls.push(...material._existingUrl.filter(u => u));
                            }
                        });
                    }
                });

                oldSkillUrls.forEach(url => {
                    if (!newSkillUrls.includes(url)) {
                        console.log('[简历更新] 添加被删除技能的文件:', url);
                        urlsToDelete.push(url);
                    }
                });
            }

            // 项目模块（类似处理）
            const oldProjectCount = oldResume.projectExperiences?.length || 0;
            const newProjectCount = resumeData.projectExperiences?.length || 0;
            if (newProjectCount < oldProjectCount) {
                console.log(`[简历更新] 检测到项目被删除: ${oldProjectCount} -> ${newProjectCount}`);
                const oldProjectUrls = [];
                oldResume.projectExperiences.forEach(project => {
                    if (project.supportingMaterials) {
                        project.supportingMaterials.forEach(material => {
                            if (material.url && Array.isArray(material.url)) {
                                oldProjectUrls.push(...material.url.filter(u => u));
                            }
                        });
                    }
                });

                const newProjectUrls = [];
                resumeData.projectExperiences.forEach(project => {
                    if (project.supportingMaterials) {
                        project.supportingMaterials.forEach(material => {
                            if (material.url && Array.isArray(material.url)) {
                                newProjectUrls.push(...material.url.filter(u => u));
                            }
                            if (material._existingUrl && Array.isArray(material._existingUrl)) {
                                newProjectUrls.push(...material._existingUrl.filter(u => u));
                            }
                        });
                    }
                });

                oldProjectUrls.forEach(url => {
                    if (!newProjectUrls.includes(url)) {
                        console.log('[简历更新] 添加被删除项目的文件:', url);
                        urlsToDelete.push(url);
                    }
                });
            }

            // 实习模块（类似处理）
            const oldInternCount = oldResume.internshipExperiences?.length || 0;
            const newInternCount = resumeData.internshipExperiences?.length || 0;
            if (newInternCount < oldInternCount) {
                console.log(`[简历更新] 检测到实习被删除: ${oldInternCount} -> ${newInternCount}`);
                const oldInternUrls = [];
                oldResume.internshipExperiences.forEach(internship => {
                    const materials = internship.verificationRequest?.supportingMaterials;
                    if (materials) {
                        materials.forEach(material => {
                            if (material.url && Array.isArray(material.url)) {
                                oldInternUrls.push(...material.url.filter(u => u));
                            }
                        });
                    }
                });

                const newInternUrls = [];
                resumeData.internshipExperiences.forEach(internship => {
                    const materials = internship.verificationRequest?.supportingMaterials;
                    if (materials) {
                        materials.forEach(material => {
                            if (material.url && Array.isArray(material.url)) {
                                newInternUrls.push(...material.url.filter(u => u));
                            }
                            if (material._existingUrl && Array.isArray(material._existingUrl)) {
                                newInternUrls.push(...material._existingUrl.filter(u => u));
                            }
                        });
                    }
                });

                oldInternUrls.forEach(url => {
                    if (!newInternUrls.includes(url)) {
                        console.log('[简历更新] 添加被删除实习的文件:', url);
                        urlsToDelete.push(url);
                    }
                });
            }
        };

        detectDeletedModules();

        // 去重
        const uniqueUrlsToDelete = [...new Set(urlsToDelete.filter(u => u))];

        // 删除物理文件
        if (uniqueUrlsToDelete.length > 0) {
            console.log('[简历更新] 准备删除文件，数量:', uniqueUrlsToDelete.length);
            console.log('[简历更新] 待删除URL列表:', uniqueUrlsToDelete);

            const deleteResult = await fileService.deleteByUrls(uniqueUrlsToDelete);
            console.log('[简历更新] 文件删除结果:', deleteResult);

            if (deleteResult.failed > 0) {
                console.warn('[简历更新] 部分文件删除失败');
            }
        }



        // 处理文件上传
        if (req.files && req.files.length > 0) {
            console.log('[简历更新] 处理新上传文件，数量:', req.files.length);

            // 【调试】打印所有上传文件的信息
            req.files.forEach((file, index) => {
                console.log(`[简历更新] 文件${index}:`, {
                    fieldname: file.fieldname,
                    originalname: file.originalname,
                    filename: file.filename,
                    path: file.path
                });
            });

            for (const file of req.files) {
                const parts = file.fieldname.split('_');

                console.log('[简历更新] 解析 fieldname:', file.fieldname, '-> parts:', parts);

                const type = parts[0];
                const parentIdx = parseInt(parts[1]);
                const materialIdx = parseInt(parts[2]);
                const fileIdx = parseInt(parts[3]);

                console.log('[简历更新] 解析结果:', { type, parentIdx, materialIdx, fileIdx });


                let subFolder = 'others';
                if (type === 'skill') subFolder = 'skills';
                else if (type === 'project') subFolder = 'projects';
                else if (type === 'intern') subFolder = 'internships';

                const fileUrl = `/uploads/userFile/${resumeData.studentUUID}/${subFolder}/${file.filename}`;
                const originalName = file.originalname;

                console.log('[简历更新] 生成的文件URL:', fileUrl);

                // 根据类型存储到对应位置
                if (type === 'skill' && resumeData.skills?.[parentIdx]?.supportingMaterials?.[materialIdx]) {
                    const material = resumeData.skills[parentIdx].supportingMaterials[materialIdx];

                    console.log('[简历更新] 找到技能材料:', {
                        parentIdx,
                        materialIdx,
                        materialType: material.type,
                        currentUrl: material.url,
                        currentName: material.name
                    });

                    // 修复：确保 url 和 name 是数组
                    if (!Array.isArray(material.url)) material.url = [];
                    if (!Array.isArray(material.name)) material.name = [];

                    // 修复：只有当文件索引有效且不重复时才添加
                    // 检查是否已存在相同URL（避免重复处理）
                    if (!material.url.includes(fileUrl)) {
                        material.url.push(fileUrl);
                        material.name.push(originalName);
                        console.log(`[简历更新] 添加技能文件: ${originalName} -> ${fileUrl}`);

                        console.log(`[简历更新] 更新后的url数组:`, material.url);
                        console.log(`[简历更新] 更新后的name数组:`, material.name);
                    } else {
                        console.warn(`[简历更新] 跳过重复文件: ${originalName}`);
                    }

                } else if (type === 'project' && resumeData.projectExperiences?.[parentIdx]?.supportingMaterials?.[materialIdx]) {
                    const material = resumeData.projectExperiences[parentIdx].supportingMaterials[materialIdx];

                    if (!Array.isArray(material.url)) material.url = [];
                    if (!Array.isArray(material.name)) material.name = [];

                    if (!material.url.includes(fileUrl)) {
                        material.url.push(fileUrl);
                        material.name.push(originalName);
                        console.log(`[简历更新] 添加项目文件: ${originalName} -> ${fileUrl}`);
                    } else {
                        console.warn(`[简历更新] 跳过重复文件: ${originalName}`);
                    }

                } else if (type === 'intern' && resumeData.internshipExperiences?.[parentIdx]?.verificationRequest?.supportingMaterials?.[materialIdx]) {
                    const material = resumeData.internshipExperiences[parentIdx].verificationRequest.supportingMaterials[materialIdx];

                    if (!Array.isArray(material.url)) material.url = [];
                    if (!Array.isArray(material.name)) material.name = [];

                    if (!material.url.includes(fileUrl)) {
                        material.url.push(fileUrl);
                        material.name.push(originalName);
                        console.log(`[简历更新] 添加实习文件: ${originalName} -> ${fileUrl}`);
                    } else {
                        console.warn(`[简历更新] 跳过重复文件: ${originalName}`);
                    }
                } else {
                    console.warn('[简历更新] 未找到对应的材料:', {
                        type,
                        parentIdx,
                        materialIdx,
                        hasSkills: !!resumeData.skills,
                        skillsLength: resumeData.skills?.length,
                        hasParent: !!resumeData.skills?.[parentIdx],
                        hasMaterials: !!resumeData.skills?.[parentIdx]?.supportingMaterials,
                        materialsLength: resumeData.skills?.[parentIdx]?.supportingMaterials?.length
                    });
                }
            }
        }

        // ========== 清理临时字段并同步 url 和 name 数组 ==========
        const cleanAndSyncMaterials = (materials) => {
            if (!materials) return materials;

            return materials
                .filter(material => !material._isDeleted)
                .map(material => {
                    const cleaned = { ...material };

                    // 删除临时字段
                    delete cleaned._isDeleted;
                    delete cleaned._isNew;
                    delete cleaned._existingUrl;
                    delete cleaned._existingName;
                    delete cleaned._deletedUrls;
                    delete cleaned.fileList;

                    // 不要覆盖已经存在的 url 和 name
                    // 如果 cleaned.url 为空，但有 _existingUrl，则使用 _existingUrl
                    // 注意：由于我们在前面删除了 _existingUrl，所以需要从原始 material 获取
                    let finalUrl = cleaned.url || [];
                    let finalName = cleaned.name || [];

                    // 如果当前 url 为空，尝试从原始材料的 _existingUrl 恢复
                    if ((!finalUrl || finalUrl.length === 0) && material._existingUrl) {
                        finalUrl = [...material._existingUrl];
                        console.log('[简历更新] 从 _existingUrl 恢复 url:', finalUrl);
                    }
                    if ((!finalName || finalName.length === 0) && material._existingName) {
                        finalName = [...material._existingName];
                        console.log('[简历更新] 从 _existingName 恢复 name:', finalName);
                    }

                    // 确保是数组
                    if (!Array.isArray(finalUrl)) finalUrl = [];
                    if (!Array.isArray(finalName)) finalName = [];

                    // 过滤空值
                    finalUrl = finalUrl.filter(u => u && typeof u === 'string');
                    finalName = finalName.filter(n => n && typeof n === 'string');

                    if (cleaned.uploadType === 'link') {
                        // 链接类型：只保留 url，清空 name
                        cleaned.url = finalUrl;
                        cleaned.name = [];  // 链接类型不需要 name

                        console.log('[简历更新] 清理后的链接材料:', {
                            type: cleaned.type,
                            uploadType: cleaned.uploadType,
                            url: cleaned.url
                        });
                    } else {
                        // 文件类型：需要同步 url 和 name 的长度
                        if (finalUrl.length !== finalName.length) {
                            console.warn('[简历更新] url和name数组长度不一致，进行同步:', {
                                type: cleaned.type,
                                uploadType: cleaned.uploadType,
                                urlLength: finalUrl.length,
                                nameLength: finalName.length
                            });

                            // 以较短的为准
                            const minLength = Math.min(finalUrl.length, finalName.length);
                            finalUrl = finalUrl.slice(0, minLength);
                            finalName = finalName.slice(0, minLength);
                        }

                        cleaned.url = finalUrl;
                        cleaned.name = finalName;

                        console.log('[简历更新] 清理后的文件材料:', {
                            type: cleaned.type,
                            uploadType: cleaned.uploadType,
                            url: cleaned.url,
                            name: cleaned.name
                        });
                    }

                    cleaned.finalUpdateAt = new Date();

                    return cleaned;
                });
        };

        // 清理所有数据
        if (resumeData.skills) {
            resumeData.skills = resumeData.skills.map(skill => ({
                ...skill,
                supportingMaterials: cleanAndSyncMaterials(skill.supportingMaterials || [])
            }));
        }
        if (resumeData.projectExperiences) {
            resumeData.projectExperiences = resumeData.projectExperiences.map(project => ({
                ...project,
                supportingMaterials: cleanAndSyncMaterials(project.supportingMaterials || [])
            }));
        }
        if (resumeData.internshipExperiences) {
            resumeData.internshipExperiences = resumeData.internshipExperiences.map(intern => ({
                ...intern,
                verificationRequest: {
                    ...intern.verificationRequest,
                    supportingMaterials: cleanAndSyncMaterials(intern.verificationRequest?.supportingMaterials || [])
                }
            }));
        }

        console.log('[简历更新] 文件处理完成');

        // 更新字段
        Object.keys(resumeData).forEach(key => {
            if (key !== '_id' && key !== 'studentUUID' && key !== 'user' && key !== '__v') {
                oldResume[key] = resumeData[key];
            }
        });

        // 更新向量表示
        oldResume.updateVector();

        await oldResume.save();

        // ========== 清除缓存 ==========
        if (redis.isConnected()) {
            await redis.pDel(`resume:data:${oldResume.studentUUID}`);
            await redis.pDel(`jobs:recommended:${oldResume.studentUUID}`);
            console.log('[缓存] 简历更新：已清除简历缓存 + 推荐缓存');
        }

        console.log('[简历更新] 简历更新成功:', { resumeId: oldResume._id });

        res.json({
            success: true,
            message: '简历更新成功',
            data: oldResume
        });

    } catch (error) {
        console.error('[简历更新] 失败:', error);

        if (error.name === 'ValidationError') {
            const errMsg = Object.values(error.errors).map(item => item.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errMsg
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// 删除简历
exports.deleteResume = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[简历删除] 开始处理:', { resumeId: id, userId: req.user?.id });

        const resume = await Resume.findById(id);
        if (!resume) {
            console.error('[简历删除] 错误: 简历不存在');
            return res.status(404).json({
                success: false,
                message: '简历不存在'
            });
        }

        // 检查权限（只能删除自己的简历）
        const user = await User.findById(req.user.id);
        if (resume.studentUUID !== user.userUUID) {
            console.error('[简历删除] 权限错误: 用户无权删除此简历');
            return res.status(403).json({
                success: false,
                message: '无权删除此简历'
            });
        }

        // 删除用户的所有文件
        await fileService.deleteUserFiles(resume.studentUUID);

        await Resume.findByIdAndDelete(id);
        console.log('[简历删除] 简历删除成功');

        if (redis.isConnected()) {
            await redis.pDel(`resume:data:${resume.studentUUID}`);
            await redis.pDel(`jobs:recommended:${resume.studentUUID}`);
            console.log('[缓存] 简历删除：已清除简历缓存 + 推荐缓存');
        }
        
        res.json({
            success: true,
            message: '简历删除成功'
        });

    } catch (error) {
        console.error('[简历删除] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};

// 获取当前用户的简历
exports.getMyResume = async (req, res) => {
    try {
        // 缓存读取
        const user = await User.findById(req.user.id);
        if (redis.isConnected()) {
            const cacheKey = `resume:data:${user.userUUID}`;
            const cached = await redis.pGet(cacheKey);
            if (cached) {
                console.log('[简历] 缓存命中（我的简历）:', user.userUUID);
                return res.json({ success: true, data: JSON.parse(cached) });
            }
        }


        // 非缓存读取
        console.log('[获取我的简历] 用户ID:', req.user?.id);

        if (!user) {
            console.error('[获取我的简历] 错误: 用户不存在');
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        const resume = await Resume.findOne({ studentUUID: user.userUUID });
        if (!resume) {
            console.log('[获取我的简历] 尚未创建简历');
            return res.status(404).json({
                success: false,
                message: '尚未创建简历'
            });
        }

        console.log('[获取我的简历] 获取成功:', { resumeId: resume._id });
        // ========== 缓存回写 ==========
        if (redis.isConnected() && resume) {
            await redis.pSetex(`resume:data:${resume.studentUUID}`, 1800, JSON.stringify(resume));
            console.log('[简历] 缓存已写入（我的简历）');
        }

        res.json({
            success: true,
            data: resume
        });

    } catch (error) {
        console.error('[获取我的简历] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};


// 处理上传的文件（创建时使用）
async function processUploadedFiles(req, resumeData) {
    const processedData = { ...resumeData };

    if (!req.files) {
        console.log('[文件处理] 无上传文件');
        return processedData;
    }

    console.log('[文件处理] 开始处理上传文件');

    // 处理技能证明材料
    if (req.files.document || req.files.certificate || req.files.recommendation ||
        req.files.work_sample || req.files.portfolio) {

        if (!processedData.skills) {
            processedData.skills = [];
        }

        // 处理各种类型的文件
        const fileTypes = ['certificate', 'recommendation', 'work_sample', 'portfolio', 'document'];

        for (const fileType of fileTypes) {
            const files = req.files[fileType];
            if (!files || files.length === 0) continue;

            const fileList = Array.isArray(files) ? files : [files];

            for (const file of fileList) {
                if (!file) continue;

                const fileUrl = generateFileUrl(req, file);

                // 根据文件类型确定技能信息
                const skillInfo = getSkillInfoByFileType(fileType);

                // 查找或创建技能条目
                let skill = processedData.skills.find(s => s.name === skillInfo.name);
                if (!skill) {
                    skill = {
                        name: skillInfo.name,
                        category: skillInfo.category,
                        proficiency: 'intermediate',
                        description: `系统标注：通过${fileType}文件证明`,
                        supportingMaterials: []
                    };
                    processedData.skills.push(skill);
                }

                // 确保supportingMaterials存在
                if (!skill.supportingMaterials) {
                    skill.supportingMaterials = [];
                }

                // 添加证明材料（存储URL）
                skill.supportingMaterials.push({
                    type: fileType,
                    title: file.originalname,
                    url: fileUrl,      // 统一使用 url
                    description: `上传的${typeInfo.name}`,
                    uploadedAt: new Date()
                });
            }
        }
    }

    // 处理实习经历证明材料
    if (req.files.document && processedData.internshipExperiences) {
        const documentFiles = Array.isArray(req.files.document) ? req.files.document : [req.files.document];
        let docIndex = 0;

        for (const internship of processedData.internshipExperiences) {
            if (docIndex >= documentFiles.length) break;

            if (!internship.verificationRequest) {
                internship.verificationRequest = {
                    status: 'none',
                    materials: []
                };
            }

            const file = documentFiles[docIndex];
            const fileUrl = generateFileUrl(req, file);

            internship.verificationRequest.materials.push({
                type: 'document',
                url: fileUrl,
                description: `实习证明材料：${file.originalname}`
            });

            docIndex++;
        }
    }

    console.log('[文件处理] 处理完成');
    return processedData;
}

// 处理上传的文件（更新时使用，保留原有文件URL）
async function processUploadedFilesForUpdate(req, existingResume, resumeData) {
    const processedData = { ...resumeData };

    if (!req.files) {
        console.log('[文件处理-更新] 无新上传文件');
        return processedData;
    }

    console.log('[文件处理-更新] 开始处理新上传文件');

    // 保留原有的技能和证明材料
    if (!processedData.skills) {
        processedData.skills = [...(existingResume.skills || [])];
    }

    // 处理各种类型的文件
    const fileTypes = ['certificate', 'recommendation', 'work_sample', 'portfolio', 'document'];

    for (const fileType of fileTypes) {
        const files = req.files[fileType];
        if (!files || files.length === 0) continue;

        const fileList = Array.isArray(files) ? files : [files];

        for (const file of fileList) {
            if (!file) continue;

            const fileUrl = generateFileUrl(req, file);
            const skillInfo = getSkillInfoByFileType(fileType);

            // 查找现有技能或创建新技能
            let skill = processedData.skills.find(s => s.name === skillInfo.name);
            if (!skill) {
                skill = {
                    name: skillInfo.name,
                    category: skillInfo.category,
                    proficiency: 'intermediate',
                    description: `通过${fileType}文件证明`,
                    supportingMaterials: []
                };
                processedData.skills.push(skill);
            }

            if (!skill.supportingMaterials) {
                skill.supportingMaterials = [];
            }

            // 添加新的证明材料
            skill.supportingMaterials.push({
                type: fileType,
                title: file.originalname,
                url: fileUrl,
                description: `上传的${typeInfo.name}`,
                uploadedAt: new Date()
            });
        }
    }

    // 处理实习经历证明材料（保留原有的，添加新的）
    if (req.files.document && processedData.internshipExperiences) {
        const documentFiles = Array.isArray(req.files.document) ? req.files.document : [req.files.document];
        let docIndex = 0;

        for (const internship of processedData.internshipExperiences) {
            if (docIndex >= documentFiles.length) break;

            // 保留原有的materials
            const existingInternship = existingResume.internshipExperiences?.find(
                (exp, idx) => idx === processedData.internshipExperiences.indexOf(internship)
            );

            if (existingInternship?.verificationRequest?.materials) {
                internship.verificationRequest = internship.verificationRequest || {};
                internship.verificationRequest.materials = [
                    ...(existingInternship.verificationRequest.materials || []),
                    ...(internship.verificationRequest?.materials || [])
                ];
            }

            if (!internship.verificationRequest) {
                internship.verificationRequest = {
                    status: 'none',
                    materials: []
                };
            }

            const file = documentFiles[docIndex];
            const fileUrl = generateFileUrl(req, file);

            internship.verificationRequest.materials.push({
                type: 'document',
                url: fileUrl,
                description: `实习证明材料：${file.originalname}`
            });

            docIndex++;
        }
    }

    console.log('[文件处理-更新] 处理完成');
    return processedData;
}

// 根据文件类型获取技能信息
function getSkillInfoByFileType(fileType) {
    const skillMap = {
        'certificate': { name: '证书认证', category: 'technical' },
        'recommendation': { name: '推荐信', category: 'communication' },
        'work_sample': { name: '作品样例', category: 'creative' },
        'portfolio': { name: '作品集', category: 'design' },
        'document': { name: '文档证明', category: 'office_skill' }
    };

    return skillMap[fileType] || { name: '其他证明', category: 'other' };
}

// 删除简历关联的文件
async function deleteResumeFiles(resume) {
    const baseUploadPath = path.join(__dirname, '../public/uploads/userFile');
    const userId = resume.studentUUID;

    // 收集所有文件URL
    const fileUrls = [];

    // 从技能中收集文件URL
    if (resume.skills) {
        for (const skill of resume.skills) {
            if (skill.supportingMaterials) {
                for (const material of skill.supportingMaterials) {
                    if (material.url) fileUrls.push(material.url);
                    if (material.fileUrl) fileUrls.push(material.fileUrl);
                }
            }
        }
    }

    // 从实习经历中收集文件URL
    if (resume.internshipExperiences) {
        for (const internship of resume.internshipExperiences) {
            if (internship.verificationRequest?.materials) {
                for (const material of internship.verificationRequest.materials) {
                    if (material.url) fileUrls.push(material.url);
                }
            }
        }
    }

    // 删除文件
    for (const fileUrl of fileUrls) {
        try {
            // 从URL中提取文件路径
            const urlPath = fileUrl.replace(/^.*\/uploads\//, '');
            const filePath = path.join(__dirname, '../public/uploads', urlPath);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('[文件删除] 删除成功:', filePath);
            }
        } catch (err) {
            console.error('[文件删除] 删除失败:', fileUrl, err.message);
        }
    }
}

// 单独上传证明材料
exports.uploadVerificationMaterial = async (req, res) => {
    try {
        console.log('[证明材料上传] 开始处理:', {
            resumeId: req.params.id,
            userId: req.user?.id,
            hasFile: !!req.file
        });

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '请选择要上传的文件'
            });
        }

        const { materialType, description } = req.body;
        const resumeId = req.params.id;

        if (!resumeId || !materialType) {
            return res.status(400).json({
                success: false,
                message: '简历ID和材料类型不能为空'
            });
        }

        // 查找简历
        const resume = await Resume.findById(resumeId);
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: '简历不存在'
            });
        }

        // 检查权限
        const user = await User.findById(req.user.id);
        if (resume.studentUUID !== user.userUUID) {
            return res.status(403).json({
                success: false,
                message: '无权为此简历上传材料'
            });
        }

        // 生成文件URL
        const fileUrl = generateFileUrl(req, req.file);

        // 创建证明材料对象
        const material = {
            type: materialType,
            title: req.file.originalname,
            url: fileUrl,
            fileUrl: fileUrl,
            description: description || `上传的${materialType}文件`,
            uploadedAt: new Date()
        };

        // 根据材料类型存储到不同位置
        switch (materialType) {
            case 'certificate':
            case 'recommendation':
            case 'work_sample':
            case 'portfolio':
                if (!resume.skills) resume.skills = [];

                let skill = resume.skills.find(s =>
                    s.name === (materialType === 'certificate' ? '证书认证' :
                        materialType === 'portfolio' ? '作品集' : '证明材料'));

                if (!skill) {
                    skill = {
                        name: materialType === 'certificate' ? '证书认证' :
                            materialType === 'portfolio' ? '作品集' : '证明材料',
                        category: 'other',
                        proficiency: 'intermediate',
                        description: `通过${materialType}文件证明`,
                        supportingMaterials: []
                    };
                    resume.skills.push(skill);
                }

                if (!skill.supportingMaterials) skill.supportingMaterials = [];
                skill.supportingMaterials.push(material);
                break;

            case 'document':
                if (resume.internshipExperiences && resume.internshipExperiences.length > 0) {
                    const lastInternship = resume.internshipExperiences[resume.internshipExperiences.length - 1];
                    if (!lastInternship.verificationRequest) {
                        lastInternship.verificationRequest = {
                            status: 'none',
                            materials: []
                        };
                    }
                    lastInternship.verificationRequest.materials.push({
                        type: 'document',
                        url: fileUrl,
                        description: description || req.file.originalname
                    });
                }
                break;
        }

        await resume.save();
        console.log('[证明材料上传] 上传成功');

        res.json({
            success: true,
            message: '材料上传成功',
            data: {
                material: material,
                resumeId: resume._id
            }
        });

    } catch (error) {
        console.error('[证明材料上传] 失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误：' + error.message
        });
    }
};