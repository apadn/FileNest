import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { users } from './store.js';
import authRouter, { requireAuth, requireAdmin } from './auth.js';
import filesRouter from './files.js';
import { listTasks, getTask, cancelTask } from './tasks.js';

await users.init();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', true);

/* ---------- 安全响应头 ---------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'self'",
  "frame-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: config.version, uptime: Math.round(process.uptime()) });
});

app.use('/api/auth', authRouter);
// 单用户模式：文件与任务只对管理员开放，避免注册用户共享同一份文件树造成越权
app.use('/api/files', requireAuth, requireAdmin, filesRouter);

app.get('/api/tasks', requireAuth, requireAdmin, (req, res) => {
  const data = listTasks(req.user?.id);
  const ifNoneMatch = req.headers['if-none-match'];
  const etag = `"t${data.version}"`;
  if (ifNoneMatch === etag) return res.status(304).end();
  res.setHeader('ETag', etag);
  res.json(data);
});

app.get('/api/tasks/:id', requireAuth, requireAdmin, (req, res) => {
  const task = getTask(req.params.id, req.user?.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});

app.post('/api/tasks/:id/cancel', requireAuth, requireAdmin, (req, res) => {
  const task = cancelTask(req.params.id, req.user?.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});

/* ---------- 前端静态资源 ---------- */
const hasDist = fs.existsSync(path.join(config.distDir, 'index.html'));

if (hasDist) {
  app.use(
    express.static(config.distDir, {
      index: false,
      maxAge: '7d',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(config.distDir, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res
      .status(503)
      .type('html')
      .send('<h1>FileNest</h1><p>前端尚未构建，请先执行 <code>npm run build</code>。</p>');
  });
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  // 5xx 不回传原始 message，避免泄露绝对路径等内部信息
  const message = status >= 500 ? '服务器内部错误' : err.message || '请求失败';
  res.status(status).json({ error: message });
});

/* ---------- 清理上次中断的上传临时文件 ---------- */
async function cleanupTempUploads(dir, depth = 0) {
  if (depth > 3) return;
  let dirents = [];
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    if (dirent.name.startsWith('.upload-')) {
      fsp.unlink(full).catch(() => {});
    } else if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
      await cleanupTempUploads(full, depth + 1);
    }
  }
}
cleanupTempUploads(config.filesDir).catch(() => {});

const server = app.listen(config.port, config.host, () => {
  console.log(`\n  ${config.siteName} 已启动`);
  console.log(`  ➜  本地访问:  http://localhost:${config.port}`);
  console.log(`  ➜  文件目录:  ${config.filesDir}`);
  console.log(`  ➜  默认账户:  ${config.defaultUser.username} / ${config.defaultUser.password}\n`);
});

function shutdown() {
  console.log('[server] 正在关闭…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
