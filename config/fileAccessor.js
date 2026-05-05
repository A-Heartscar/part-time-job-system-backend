const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

/**
 * 文件访问器类
 * 负责文件权限验证、路径解析、文件信息获取等功能
 *
 * findByFileName 方法：通过文件名在材料数组中查找对应的URL
 * extractUserUUIDFromPath：从路径中提取用户UUID
 *
 */
class FileAccessor {
    constructor() {
        this.baseUploadPath = path.join(__dirname, '../public/uploads');
        this.userFilePrefix = 'userFile';

        console.log('[FileAccessor] 初始化完成');
        console.log('[FileAccessor] 基础路径:', this.baseUploadPath);
    }

    /**
     * 通过文件名查找对应的文件URL
     *
     * 核心逻辑：
     * 1. 接收文件名和用户UUID
     * 2. 在用户的简历材料中查找 name 数组包含该文件名的材料
     * 3. 找到后返回相同下标对应的 url 数组元素
     *
     * @param {string} fileName - 要查找的文件名
     * @param {string} userUUID - 用户UUID
     * @param {object} resumeData - 用户的简历数据（可选，如果不传则从数据库查询）
     * @returns {object|null} - 包含 url 和 materialInfo 的对象
     */
    async findByFileName(fileName, userUUID, resumeData = null) {
        try {
            console.log('[FileAccessor] 通过文件名查找:', { fileName, userUUID });

            // 如果没有传入简历数据，从数据库查询
            if (!resumeData) {
                const Resume = require('../models/Resume');
                resumeData = await Resume.findOne({ studentUUID: userUUID });

                if (!resumeData) {
                    console.warn('[FileAccessor] 未找到用户简历:', userUUID);
                    return null;
                }
            }

            // 在所有材料中搜索文件名
            const searchResult = this.searchFileNameInResume(fileName, resumeData);

            if (!searchResult) {
                console.warn('[FileAccessor] 未找到匹配的文件:', fileName);
                return null;
            }

            console.log('[FileAccessor] 找到文件映射:', {
                fileName: fileName,
                matchedUrl: searchResult.url,
                materialType: searchResult.materialType,
                parentType: searchResult.parentType
            });

            return searchResult;

        } catch (error) {
            console.error('[FileAccessor] 文件名查找失败:', error);
            return null;
        }
    }

    /**
     * 在简历数据中搜索文件名
     *
     * 搜索策略：
     * 1. 遍历技能、项目、实习三个模块的材料
     * 2. 在每个材料的 name 数组中查找匹配的文件名
     * 3. 找到后返回相同下标的 url 元素
     *
     * @param {string} fileName - 要查找的文件名
     * @param {object} resume - 简历对象
     * @returns {object|null} - 包含 url 和上下文信息的对象
     */
    searchFileNameInResume(fileName, resume) {
        // 定义要搜索的材料来源
        const searchSources = [
            {
                name: 'skills',
                getMaterials: (item) => item.supportingMaterials || [],
                getParentInfo: (item, index) => ({ skillName: item.name, skillIndex: index })
            },
            {
                name: 'projectExperiences',
                getMaterials: (item) => item.supportingMaterials || [],
                getParentInfo: (item, index) => ({ projectTitle: item.title, projectIndex: index })
            },
            {
                name: 'internshipExperiences',
                getMaterials: (item) => item.verificationRequest?.supportingMaterials || [],
                getParentInfo: (item, index) => ({ company: item.company, internshipIndex: index })
            }
        ];

        // 遍历所有来源
        for (const source of searchSources) {
            const items = resume[source.name] || [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const materials = source.getMaterials(item);

                for (let j = 0; j < materials.length; j++) {
                    const material = materials[j];

                    // 检查 name 数组是否存在且包含目标文件名
                    if (material.name && Array.isArray(material.name)) {
                        const nameIndex = material.name.indexOf(fileName);

                        if (nameIndex !== -1) {
                            // 确保 url 数组存在且对应下标有效
                            if (material.url && Array.isArray(material.url) && material.url[nameIndex]) {
                                return {
                                    url: material.url[nameIndex],
                                    materialType: material.type,
                                    materialTitle: material.title,
                                    parentType: source.name,
                                    parentInfo: source.getParentInfo(item, i),
                                    materialIndex: j,
                                    fileIndex: nameIndex
                                };
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * 检查用户是否有权限访问文件
     * @param {string} filePath - 文件路径（完整URL路径或相对路径）
     * @param {object} user - 当前登录用户信息
     * @returns {boolean} 是否有权限
     */
    checkAccess(filePath, user) {
        try {
            const userUUID = this.extractUserUUIDFromPath(filePath);

            if (!userUUID) {
                console.warn('[FileAccessor] 无法从路径提取用户UUID:', filePath);
                return false;
            }

            const currentUserUUID = user.userUUID || user.id;

            console.log('[FileAccessor] 权限检查:', {
                fileOwner: userUUID,
                currentUser: currentUserUUID,
                hasAccess: userUUID === currentUserUUID
            });

            return userUUID === currentUserUUID;
        } catch (error) {
            console.error('[FileAccessor] 权限检查失败:', error);
            return false;
        }
    }

    /**
     * 从文件路径中提取用户UUID
     * 路径格式: /uploads/userFile/{userUUID}/...
     *
     * @param {string} filePath - 文件路径
     * @returns {string|null} 用户UUID
     */
    extractUserUUIDFromPath(filePath) {
        const pathParts = filePath.split('/');
        const userFileIndex = pathParts.indexOf(this.userFilePrefix);

        if (userFileIndex === -1 || userFileIndex + 1 >= pathParts.length) {
            return null;
        }

        return pathParts[userFileIndex + 1];
    }

    /**
     * 获取文件的绝对路径
     * @param {string} relativeUrl - 相对URL或完整URL
     * @returns {string} 绝对路径
     */
    getAbsolutePath(relativeUrl) {
        let cleanPath = relativeUrl;

        // 移除协议和域名部分
        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
            try {
                const urlObj = new URL(cleanPath);
                cleanPath = urlObj.pathname;
            } catch (e) {
                console.error('[FileAccessor] URL解析失败:', e);
            }
        }

        // 移除 /uploads/ 前缀
        if (cleanPath.startsWith('/uploads/')) {
            cleanPath = cleanPath.substring(9);
        } else if (cleanPath.startsWith('uploads/')) {
            cleanPath = cleanPath.substring(8);
        }

        cleanPath = cleanPath.replace(/^\/+/, '');

        return path.join(this.baseUploadPath, cleanPath);
    }

    /**
     * 验证文件是否存在
     * @param {string} filePath - 文件路径
     * @returns {boolean} 是否存在
     */
    fileExists(filePath) {
        const absolutePath = this.getAbsolutePath(filePath);
        return fs.existsSync(absolutePath);
    }

    /**
     * 获取文件MIME类型
     * @param {string} filePath - 文件路径
     * @returns {string} MIME类型
     */
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return mime.lookup(ext) || 'application/octet-stream';
    }

    /**
     * 检查是否为可预览的文件类型
     * @param {string} filePath - 文件路径
     * @returns {boolean} 是否可预览
     */
    isPreviewable(filePath) {
        const previewableTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        const mimeType = this.getMimeType(filePath);
        return previewableTypes.includes(mimeType);
    }

    /**
     * 获取文件信息
     * @param {string} filePath - 文件路径
     * @returns {object|null} 文件信息
     */
    getFileInfo(filePath) {
        const absolutePath = this.getAbsolutePath(filePath);

        if (!fs.existsSync(absolutePath)) {
            return null;
        }

        const stats = fs.statSync(absolutePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();

        return {
            name: fileName,
            path: absolutePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            mimeType: this.getMimeType(filePath),
            extension: ext,
            isPreviewable: this.isPreviewable(filePath)
        };
    }

    /**
     * 获取文件的流式读取
     * @param {string} filePath - 文件路径
     * @returns {fs.ReadStream|null} 文件流
     */
    getFileStream(filePath) {
        const absolutePath = this.getAbsolutePath(filePath);

        if (!fs.existsSync(absolutePath)) {
            return null;
        }

        return fs.createReadStream(absolutePath);
    }

    /**
     * 安全地获取文件名（防止路径遍历）
     * @param {string} filePath - 原始路径
     * @returns {string} 安全的文件名
     */
    getSafeFileName(filePath) {
        return path.basename(filePath).replace(/[^a-zA-Z0-9.\u4e00-\u9fa5_-]/g, '_');
    }

    /**
     * URL解码文件名
     * @param {string} encodedFileName - 编码的文件名
     * @returns {string} 解码后的文件名
     */
    decodeFileName(encodedFileName) {
        try {
            return decodeURIComponent(encodedFileName);
        } catch (e) {
            console.warn('[FileAccessor] 文件名解码失败:', encodedFileName);
            return encodedFileName;
        }
    }
}

module.exports = new FileAccessor();