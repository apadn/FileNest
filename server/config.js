import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* 版本号唯一来源：package.json */
const pkg = (() => {
  try {
    return require('../package.json');
  } catch {
    return { version: '0.0.0' };
  }
})();

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const FILES_DIR = path.resolve(process.env.FILES_DIR || path.join(DATA_DIR, 'files'));
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(process.cwd(), 'web', 'dist'));

for (const dir of [DATA_DIR, FILES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function readOrCreateSecret() {
  const file = path.join(DATA_DIR, '.jwt-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* first boot */
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** '7d' / '12h' / '3600s' / '30m' → 毫秒，用于 cookie maxAge 与 TOKEN_TTL 保持一致 */
function ttlToMs(value, fallbackMs) {
  const match = /^(\d+)\s*([smhd])$/i.exec(String(value || '').trim());
  if (!match) return fallbackMs;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factor = { s: 1000, m: 60e3, h: 3600e3, d: 864e5 }[unit] || 1000;
  return n * factor;
}

const tokenTtl = process.env.TOKEN_TTL || '7d';

/* 上传/解压的体积护栏：0 表示不限制 */
function mb(value, fallbackMb) {
  const n = int(value, fallbackMb);
  return n > 0 ? n * 1024 * 1024 : 0;
}

export const config = {
  version: pkg.version || '0.0.0',
  port: int(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir: DATA_DIR,
  filesDir: FILES_DIR,
  distDir: DIST_DIR,
  jwtSecret: readOrCreateSecret(),
  tokenTtl,
  tokenTtlMs: ttlToMs(tokenTtl, 7 * 864e5),
  /* 单用户设计：默认关闭自助注册。开启后新账户角色为 user，仅能登录，没有文件权限 */
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, false),
  /* 默认单文件 2GB 上限，避免任意请求写满磁盘 */
  maxUploadBytes: mb(process.env.MAX_UPLOAD_MB, 2048),
  maxConcurrentTasks: Math.max(1, int(process.env.MAX_CONCURRENT_TASKS, 2)),
  maxTextPreview: 512 * 1024,
  maxSearchResults: 500,
  /* 解压炸弹护栏：解压后总字节与条目数上限 */
  maxExtractBytes: mb(process.env.MAX_EXTRACT_MB, 102400),
  maxExtractEntries: Math.max(1, int(process.env.MAX_EXTRACT_ENTRIES, 200000)),
  /* 只有部署在反向代理之后才应开启；默认 false，否则客户端可伪造 X-Forwarded-For 绕过限速 */
  trustProxy: bool(process.env.TRUST_PROXY, false),
  defaultUser: { username: 'admin', password: 'admin' },
  siteName: process.env.SITE_NAME || 'FileNest',
};
