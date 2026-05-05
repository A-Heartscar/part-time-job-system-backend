// ========== 岗位路由 ==========
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const jobController = require('../controllers/jobController');

/**
 * 岗位管理路由
 * 所有路由都需要身份验证
 * 雇主用户可以管理自己的岗位
 */

// 所有岗位路由都需要身份验证
router.use(authMiddleware);

// ========== 学生浏览相关 ==========
// 获取筛选选项
router.get('/browse/filters', jobController.getFilterOptions);

// 浏览岗位列表（支持筛选、排序、分页）
router.get('/browse', jobController.browseJobs);

// 获取岗位详情（学生视角）
router.get('/browse/:id', jobController.getJobDetail);


// ========== 岗位推荐 ==========
router.get('/recommended', authMiddleware, jobController.getRecommendedJobs);

// ========== 人才推荐 ==========
router.get('/:jobId/recommended-resumes', authMiddleware, jobController.getRecommendedResumes);

// ========== 薪资统计 ==========
router.get('/salary-stats', authMiddleware, jobController.getSalaryStats);
router.get('/salary-comparison', authMiddleware, jobController.getSalaryComparison);


// ========== 雇主管理相关 ==========
// 获取当前雇主的岗位列表（必须放在 /:id 之前，避免路径冲突）
router.get('/my-jobs', jobController.getMyJobs);

// 创建岗位
router.post('/',
    jobController.jobValidation,
    jobController.createJob
);

// 获取单个岗位详情
router.get('/:id', jobController.getJob);

// 更新岗位
router.put('/:id',
    jobController.jobValidation,
    jobController.updateJob
);

// 删除岗位
router.delete('/:id', jobController.deleteJob);

// 更新岗位状态
router.patch('/:id/status', jobController.updateJobStatus);


module.exports = router;