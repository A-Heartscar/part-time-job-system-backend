require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

// 引入路由
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const connectDB = require('./config/db');
const resumeRouter = require('./routes/resume');
const filesRouter = require('./routes/files');
const jobsRouter = require('./routes/jobs');
const applicationsRouter = require('./routes/applications');
const preferencesRouter = require('./routes/preferences');
const messagesRouter = require('./routes/messages');
const favoritesRouter = require('./routes/favorites');
const commentsRouter = require('./routes/comments');

// 引入 cors
const cors = require('cors');

const app = express();




connectDB();

app.use(cors({
  origin: 'http://localhost:3000',  // 前端地址
  credentials: true,  // 允许携带Cookie
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(cookieParser());

// 全局错误处理中间件 - 用于捕获 multer 和 express-validator 的错误
app.use((err, req, res, next) => {
  console.error('[全局错误处理] 捕获到错误:', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    code: err.code
  });

  // Multer 错误处理
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `文件上传错误: ${err.message}`
    });
  }

  // Express-validator 验证错误
  if (err.array && typeof err.array === 'function') {
    const errors = err.array();
    return res.status(400).json({
      success: false,
      message: errors.map(e => e.msg).join(', ')
    });
  }

  // 其他错误
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误'
  });
});


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/resumes', resumeRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/comments', commentsRouter);
// 上传的静态资源
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 文件访问路由
app.use('/api/files', filesRouter);

// ========== 管理员路由 ==========
const adminRouter = require('./routes/admin');
app.use('/api/admin', adminRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
