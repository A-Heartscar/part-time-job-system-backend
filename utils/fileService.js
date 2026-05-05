const fs = require('fs');
const path = require('path');

class FileService {
    constructor() {
        this.baseUploadPath = path.join(__dirname, '../public/uploads');
        this.userFilePrefix = 'userFile';

        // 打印初始化信息
        console.log('[FileService] 初始化完成');
        console.log('[FileService] 基础路径:', this.baseUploadPath);
        console.log('[FileService] 路径是否存在:', fs.existsSync(this.baseUploadPath));
    }

    /**
     * 根据URL删除文件
     */
    async deleteByUrl(fileUrl) {
        try {
            console.log('\n[FileService] ========== 开始删除文件 ==========');
            console.log('[FileService] 原始URL:', fileUrl);

            const filePath = this.urlToPath(fileUrl);

            console.log('[FileService] 解析后的路径:', filePath);

            // 检查文件是否存在
            const exists = fs.existsSync(filePath);
            console.log('[FileService] 文件是否存在:', exists);

            if (!exists) {
                // 尝试列出目录内容以帮助调试
                const dirPath = path.dirname(filePath);
                console.log('[FileService] 检查目录:', dirPath);


                if (fs.existsSync(dirPath)) {
                    const files = fs.readdirSync(dirPath);
                    console.log('[FileService] 目录中的文件:', files);

                    // 检查是否有类似文件名
                    const fileName = path.basename(filePath);
                    console.log('[FileService] 查找文件名:', fileName);

                    const similarFiles = files.filter(f => f.includes(fileName.split('-')[0]));
                    if (similarFiles.length > 0) {
                        console.log('[FileService] 找到相似文件:', similarFiles);
                    }
                } else {
                    console.log('[FileService] 目录不存在:', dirPath);
                }

                return false;
            }

            // 删除文件
            await fs.promises.unlink(filePath);
            console.log('[FileService] ✅ 文件删除成功:', filePath);
            return true;
        } catch (error) {
            console.error('[FileService] 删除文件失败:', fileUrl, error);
            return false;
        }
    }

    /**
     * 批量删除文件
     */
    async deleteByUrls(urls) {
        console.log('[FileService] 批量删除文件，数量:', urls.length);
        const results = await Promise.allSettled(
            urls.map(url => this.deleteByUrl(url))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failed = results.length - succeeded;

        console.log(`[FileService] 批量删除完成: 成功 ${succeeded}, 失败 ${failed}`);

        return { succeeded, failed, total: urls.length };
    }

    /**
     * 删除用户的所有文件
     */
    async deleteUserFiles(userUUID) {
        const userPath = path.join(this.baseUploadPath, this.userFilePrefix, userUUID);

        console.log('[FileService] 删除用户文件夹:', userPath);
        try {
            if (fs.existsSync(userPath)) {
                await fs.promises.rm(userPath, { recursive: true, force: true });
                console.log('[FileService] 用户文件夹删除成功:', userPath);
                return true;
            }
            console.log('[FileService] 用户文件夹不存在:', userPath);
            return false;
        } catch (error) {
            console.error('[FileService] 删除用户文件夹失败:', error);
            return false;
        }
    }

    /**
     * URL转文件系统路径
     */
    urlToPath(fileUrl) {

        console.log('[FileService] URL转路径 - 输入:', fileUrl);
        // 移除协议和域名部分
        let urlPath = fileUrl;

        // 如果是完整URL，提取路径部分
        if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
            try {
                const urlObj = new URL(urlPath);
                urlPath = urlObj.pathname;
                console.log('[FileService] 提取的路径名:', urlPath);
            } catch (e) {
                console.error('[FileService] URL解析失败:', e);
            }
        }

        // 处理不同的路径格式
        let relativePath = urlPath;

        // 移除各种可能的前缀
        if (relativePath.startsWith('/uploads/')) {
            relativePath = relativePath.substring(9);
            console.log('[FileService] 移除/uploads/后:', relativePath);
        } else if (relativePath.startsWith('uploads/')) {
            relativePath = relativePath.substring(8);
            console.log('[FileService] 移除uploads/后:', relativePath);
        }

        // 确保路径中不包含开头的斜杠
        relativePath = relativePath.replace(/^\/+/, '');

        // 构建完整路径
        const fullPath = path.join(this.baseUploadPath, relativePath);
        console.log('[FileService] 最终路径:', fullPath);

        return fullPath;
    }

    /**
     * 验证文件是否存在
     */
    exists(fileUrl) {
        const filePath = this.urlToPath(fileUrl);
        return fs.existsSync(filePath);
    }

    /**
     * 获取文件信息
     */
    getFileInfo(fileUrl) {
        const filePath = this.urlToPath(fileUrl);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        const stats = fs.statSync(filePath);
        return {
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            exists: true
        };
    }
}

module.exports = new FileService();