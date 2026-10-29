import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

const DB_FILE = path.join(config.dataDir, 'users.json');

export const hashPassword = (pw) =>
  new Promise((resolve, reject) => bcrypt.hash(pw, 10, (err, hash) => (err ? reject(err) : resolve(hash))));

export const checkPassword = (pw, hash) =>
  new Promise((resolve, reject) => bcrypt.compare(pw, hash, (err, ok) => (err ? reject(err) : resolve(ok))));

let db = { version: 1, users: [] };
let writeChain = Promise.resolve();

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = { version: 1, users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    db = { version: 1, users: [] };
  }
  return db;
}

function persist() {
  const snapshot = JSON.stringify(db, null, 2);
  // catch() 隔离上一次失败：否则 writeChain 一旦 reject 就永久污染，后续写入全部沿用旧错误
  writeChain = writeChain.catch(() => {}).then(async () => {
    const tmp = `${DB_FILE}.${process.pid}.${Date.now().toString(36)}.tmp`;
    await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.promises.rename(tmp, DB_FILE);
  });
  return writeChain;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    totpEnabled: Boolean(user.totpEnabled),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

export const users = {
  async init() {
    load();
    if (db.users.length === 0) {
      await users.create({
        username: config.defaultUser.username,
        password: config.defaultUser.password,
        role: 'admin',
      });
      console.log(`[store] 已创建默认账户 ${config.defaultUser.username} / ${config.defaultUser.password}（请尽快修改）`);
    }
  },
  count() {
    return db.users.length;
  },
  all() {
    return db.users;
  },
  findByName(username) {
    const key = String(username || '').toLowerCase();
    return db.users.find((u) => u.username.toLowerCase() === key) || null;
  },
  findById(id) {
    return db.users.find((u) => u.id === id) || null;
  },
  async create({ username, password, role = 'user' }) {
    const name = String(username || '').trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) {
      throw Object.assign(new Error('用户名需为 3-32 位字母、数字、下划线、点或短横线'), { status: 400 });
    }
    if (String(password || '').length < 4) {
      throw Object.assign(new Error('密码至少 4 位'), { status: 400 });
    }
    if (users.findByName(name)) {
      throw Object.assign(new Error('该用户名已被占用'), { status: 409 });
    }
    const user = {
      id: crypto.randomUUID(),
      username: name,
      passwordHash: await hashPassword(String(password)),
      role,
      totpSecret: null,
      totpEnabled: false,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };
    db.users.push(user);
    try {
      await persist();
    } catch (err) {
      db.users.pop();
      throw err;
    }
    return user;
  },
  async update(id, patch) {
    const user = users.findById(id);
    if (!user) return null;
    const backup = {};
    for (const key of Object.keys(patch)) backup[key] = user[key];
    Object.assign(user, patch);
    try {
      await persist();
    } catch (err) {
      // 落盘失败必须回滚内存，否则会出现「内存新密码、磁盘旧密码」的分裂状态
      Object.assign(user, backup);
      throw err;
    }
    return user;
  },
  async remove(id) {
    const index = db.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    const [removed] = db.users.splice(index, 1);
    try {
      await persist();
    } catch (err) {
      db.users.splice(index, 0, removed);
      throw err;
    }
    return true;
  },
  async reload() {
    load();
  },
};
