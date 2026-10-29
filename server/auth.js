import express from 'express';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { config } from './config.js';
import { users, checkPassword, hashPassword, publicUser } from './store.js';

const router = express.Router();

/* ---------- 登录限速 ---------- */
const WINDOW_MS = 10 * 60 * 1000;

function createLimiter({ windowMs, max, keyOf }) {
  const store = new Map();
  // 定期清理过期记录：否则伪造来源可以让 Map 无限增长（慢速内存 DoS）
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of store) {
      if (now > item.resetAt) store.delete(key);
    }
  }, Math.min(windowMs, 60 * 1000));
  timer.unref?.();

  return {
    assert(req) {
      const key = keyOf(req);
      const item = store.get(key);
      if (!item) return;
      if (Date.now() > item.resetAt) {
        store.delete(key);
        return;
      }
      if (item.count >= max) {
        const secs = Math.ceil((item.resetAt - Date.now()) / 1000);
        throw Object.assign(new Error(`尝试过于频繁，请 ${secs} 秒后再试`), { status: 429 });
      }
    },
    noteFailure(req) {
      const key = keyOf(req);
      const item = store.get(key);
      if (!item || Date.now() > item.resetAt) {
        store.set(key, { count: 1, resetAt: Date.now() + windowMs });
      } else {
        item.count += 1;
      }
    },
    clear(req) {
      store.delete(keyOf(req));
    },
  };
}

/* 未登录请求按来源 IP 限速 */
const loginLimiter = createLimiter({
  windowMs: WINDOW_MS,
  max: 8,
  keyOf: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
});

/* 已登录的敏感操作（改密码/改用户名/关 2FA）按账户限速 */
const secretLimiter = createLimiter({
  windowMs: WINDOW_MS,
  max: 12,
  keyOf: (req) => req.user?.id || 'anonymous',
});

/** 用户不存在时也跑一次等价耗时的 bcrypt，避免通过响应时间枚举用户名 */
const DUMMY_HASH = '$2a$10$M39.A4vYWY95vK24hDW6ouu7Sb8uVx157AiPQQQYza4XmjxqUBOHm';

async function verifyLoginPassword(user, password) {
  const ok = await checkPassword(String(password || ''), user ? user.passwordHash : DUMMY_HASH);
  return Boolean(user) && ok;
}

/* ---------- Token ---------- */
export function issueToken(user) {
  return jwt.sign({ sub: user.id, name: user.username, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.tokenTtl,
  });
}

function setAuthCookie(req, res, token) {
  res.cookie?.('fn_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: config.tokenTtlMs,
  });
}

/* 只有 <img>/<video>/<iframe>/下载链接需要 query token，其余路径一律不接受 */
const QUERY_TOKEN_PATHS = new Set(['/api/files/raw', '/api/files/download']);

function queryTokenAllowed(req) {
  if (req.method !== 'GET') return false;
  const pathname = String(req.originalUrl || '').split('?')[0];
  return QUERY_TOKEN_PATHS.has(pathname);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const queryToken =
    queryTokenAllowed(req) && typeof req.query?.token === 'string' ? req.query.token : null;
  const token = bearer || req.cookies?.fn_token || queryToken || null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const user = users.findById(payload.sub);
    if (!user) return res.status(401).json({ error: '账户不存在' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: '登录状态已过期' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

/* ---------- TOTP ---------- */
function buildTotp(secretBase32, username) {
  return new OTPAuth.TOTP({
    issuer: config.siteName,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

function verifyTotp(secretBase32, username, token) {
  const code = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const totp = buildTotp(secretBase32, username);
  return totp.validate({ token: code, window: 1 }) !== null;
}

/* ---------- 路由 ---------- */
router.get('/config', (req, res) => {
  res.json({
    site: { name: config.siteName, allowRegistration: config.allowRegistration, version: config.version },
    hasUsers: users.count() > 0,
  });
});

router.post('/login', async (req, res, next) => {
  try {
    loginLimiter.assert(req);
    const { username, password, code } = req.body || {};
    const user = users.findByName(username);
    // 用户不存在时也做一次 bcrypt 比对，让两条路径耗时一致
    const ok = await verifyLoginPassword(user, password);
    if (!user || !ok) {
      loginLimiter.noteFailure(req);
      return res.status(401).json({ error: '用户名或密码不正确' });
    }
    if (user.totpEnabled) {
      if (!code) {
        return res.status(200).json({ need2fa: true, username: user.username });
      }
      if (!verifyTotp(user.totpSecret, user.username, code)) {
        loginLimiter.noteFailure(req);
        return res.status(401).json({ error: '动态验证码不正确', need2fa: true });
      }
    }
    loginLimiter.clear(req);
    await users.update(user.id, { lastLoginAt: new Date().toISOString() });
    const token = issueToken(user);
    setAuthCookie(req, res, token);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    if (!config.allowRegistration) return res.status(403).json({ error: '站点已关闭注册' });
    loginLimiter.assert(req);
    const { username, password } = req.body || {};
    const role = users.count() === 0 ? 'admin' : 'user';
    const user = await users.create({ username, password, role });
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: publicUser(req.user),
    site: { name: config.siteName, allowRegistration: config.allowRegistration, version: config.version },
    hasOtherUsers: users.count() > 1,
  });
});

router.post('/password', requireAuth, async (req, res, next) => {
  try {
    secretLimiter.assert(req);
    const { currentPassword, newPassword } = req.body || {};
    if (!(await checkPassword(String(currentPassword || ''), req.user.passwordHash))) {
      secretLimiter.noteFailure(req);
      return res.status(400).json({ error: '当前密码不正确' });
    }
    if (String(newPassword || '').length < 4) return res.status(400).json({ error: '新密码至少 4 位' });
    await users.update(req.user.id, { passwordHash: await hashPassword(String(newPassword)) });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* 修改用户名：默认 admin 只是初始值，可随时换成自己的名字，避免被猜到 */
router.post('/username', requireAuth, async (req, res, next) => {
  try {
    secretLimiter.assert(req);
    const { username, password } = req.body || {};
    if (!(await checkPassword(String(password || ''), req.user.passwordHash))) {
      secretLimiter.noteFailure(req);
      return res.status(400).json({ error: '当前密码不正确' });
    }
    const name = String(username || '').trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) {
      return res.status(400).json({ error: '用户名需为 3-32 位字母、数字、下划线、点或短横线' });
    }
    if (name.toLowerCase() === req.user.username.toLowerCase()) {
      return res.status(400).json({ error: '新用户名与当前用户名相同' });
    }
    const existing = users.findByName(name);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: '该用户名已被占用' });
    }
    const updated = await users.update(req.user.id, { username: name });
    // 用户名变了，重签 token，避免旧 token 内的 name 与实际不一致
    const token = issueToken(updated);
    setAuthCookie(req, res, token);
    res.json({ ok: true, token, user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    if (req.user.totpEnabled) return res.status(400).json({ error: '两步验证已启用' });
    const secret = new OTPAuth.Secret({ size: 20 });
    await users.update(req.user.id, { totpPending: secret.base32 });
    const uri = buildTotp(secret.base32, req.user.username).toString();
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 480, errorCorrectionLevel: 'M' });
    res.json({ secret: secret.base32, uri, qr });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/enable', requireAuth, async (req, res, next) => {
  try {
    const pending = req.user.totpPending;
    if (!pending) return res.status(400).json({ error: '请先获取密钥' });
    if (!verifyTotp(pending, req.user.username, req.body?.code)) {
      return res.status(400).json({ error: '验证码不正确，请检查手机上的动态口令' });
    }
    await users.update(req.user.id, { totpSecret: pending, totpEnabled: true, totpPending: null });
    res.json({ ok: true, user: publicUser(users.findById(req.user.id)) });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/disable', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.totpEnabled) return res.json({ ok: true });
    secretLimiter.assert(req);
    const { password, code } = req.body || {};
    const passwordOk = password ? await checkPassword(String(password), req.user.passwordHash) : false;
    const codeOk = code ? verifyTotp(req.user.totpSecret, req.user.username, code) : false;
    if (!passwordOk && !codeOk) {
      secretLimiter.noteFailure(req);
      return res.status(400).json({ error: '请输入正确的密码或动态验证码' });
    }    await users.update(req.user.id, { totpEnabled: false, totpSecret: null, totpPending: null });
    res.json({ ok: true, user: publicUser(users.findById(req.user.id)) });
  } catch (err) {
    next(err);
  }
});

export default router;
