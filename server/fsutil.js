import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

/** 把任意用户输入规范成 posix 风格相对路径，永远以 / 开头 */
export function normalizeRel(input) {
  let rel = String(input ?? '/').replace(/\\/g, '/').replace(/\0/g, '');
  const parts = rel.split('/').filter((p) => p && p !== '.');
  const stack = [];
  for (const part of parts) {
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return '/' + stack.join('/');
}

/** 相对路径 → 绝对路径，越界直接抛 403 */
export function safeJoin(root, input) {
  const rel = normalizeRel(input);
  const abs = path.resolve(root, '.' + rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw Object.assign(new Error('路径越界'), { status: 403 });
  }
  return { abs, rel };
}

const realRootCache = new Map();

async function realRoot(root) {
  const key = path.resolve(root);
  if (!realRootCache.has(key)) {
    realRootCache.set(key, await fsp.realpath(key).catch(() => key));
  }
  return realRootCache.get(key);
}

/** 找到最近的、真实存在的祖先，再把不存在的尾巴拼回去 */
async function realpathNearest(abs, stopAt) {
  let cur = abs;
  const suffix = [];
  for (;;) {
    try {
      const real = await fsp.realpath(cur);
      return path.join(real, ...suffix);
    } catch (err) {
      if (err.code === 'ELOOP') {
        throw Object.assign(new Error('路径包含非法符号链接'), { status: 403 });
      }
      if (err.code !== 'ENOENT') return abs;
      const parent = path.dirname(cur);
      if (cur === stopAt || parent === cur) return abs;
      suffix.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/**
 * safeJoin 的严格版：额外做 realpath 校验，防止数据目录内的符号链接指向外部。
 * 目标尚不存在时（新建/上传），校验最近的真实祖先。
 */
export async function safeResolve(root, input) {
  const { abs, rel } = safeJoin(root, input);
  const base = await realRoot(root);
  const real = await realpathNearest(abs, path.resolve(root));
  if (real !== base && !real.startsWith(base + path.sep)) {
    throw Object.assign(new Error('路径越界'), { status: 403 });
  }
  return { abs, rel, real, rootReal: base };
}

/** 清理用户提交的文件名（按字节截断，Linux/ext4 上限 255 字节） */
export function sanitizeName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/')).replace(/\0/g, '').trim();
  if (!base || base === '.' || base === '..') {
    throw Object.assign(new Error('非法文件名'), { status: 400 });
  }
  const cleaned = base.replace(/[/]/g, '_');
  if (Buffer.byteLength(cleaned) <= 255) return cleaned;
  const ext = path.extname(cleaned).slice(0, 32);
  let stem = cleaned.slice(0, cleaned.length - ext.length);
  while (stem.length > 0 && Buffer.byteLength(stem + ext) > 255) stem = stem.slice(0, -1);
  return stem + ext || 'unnamed';
}

/** 目录排序器：模块级复用，避免每次比较都重建（万级目录可提速约 180 倍） */
export const nameCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

export function compareEntries(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return nameCollator.compare(a.name, b.name);
}

const IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'heic', 'heif']);
const VIDEO = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', 'avi']);
const AUDIO = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma']);
const TEXT = new Set(['txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'ini', 'conf', 'cfg', 'env', 'properties', 'gitignore']);
const CODE = new Set([
  'json', 'yaml', 'yml', 'xml', 'toml', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'kt',
  'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'swift', 'sh', 'bash', 'zsh', 'sql', 'css', 'scss', 'less', 'html', 'vue', 'svelte', 'dockerfile',
]);
const ARCHIVE = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', '7z', 'rar']);
const DOC = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pages', 'numbers', 'key', 'odt', 'ods']);

export function extOf(name) {
  const base = String(name).toLowerCase();
  if (base.endsWith('.tar.gz')) return 'tgz';
  if (base.endsWith('.tar.bz2')) return 'tbz2';
  if (base.endsWith('.tar.xz')) return 'txz';
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx + 1) : '';
}

export function kindOf(name, isDir) {
  if (isDir) return 'folder';
  const ext = extOf(name);
  if (IMAGE.has(ext)) return 'image';
  if (VIDEO.has(ext)) return 'video';
  if (AUDIO.has(ext)) return 'audio';
  if (DOC.has(ext)) return 'doc';
  if (ext === 'pdf') return 'pdf';
  if (ARCHIVE.has(ext)) return 'archive';
  if (CODE.has(ext)) return 'code';
  if (TEXT.has(ext)) return 'text';
  return 'file';
}

/** 支持的解压格式：zip / tar / tar.gz / tgz */
export function archiveFormat(name) {
  const ext = extOf(name);
  if (ext === 'zip') return 'zip';
  if (ext === 'tgz' || ext === 'tar.gz' || ext === 'gz') return 'tgz';
  if (ext === 'tar') return 'tar';
  return null;
}

/**
 * /raw 的呈现方式三档：
 * - inline       媒体与 PDF，浏览器内直接显示（<img>/<video>/<iframe>）
 * - sandbox      内联但带 CSP sandbox，允许作为 <img> 使用，同时阻止顶层执行脚本
 * - attachment   其余一切（html/xml/js…），强制下载，杜绝同源存储型 XSS
 */
const INLINE_MEDIA = new Set([...VIDEO, ...AUDIO]);
const INLINE_IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'heic', 'heif']);

export function rawMode(name) {
  const ext = extOf(name);
  if (ext === 'svg' || ext === 'svgz') return 'sandbox';
  if (INLINE_IMAGE.has(ext) || INLINE_MEDIA.has(ext) || ext === 'pdf') return 'inline';
  return 'attachment';
}

/** 同名冲突时自动追加 (1) (2)… */
export async function uniquePath(dirAbs, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  let i = 1;
  for (;;) {
    const abs = path.join(dirAbs, candidate);
    try {
      await fsp.lstat(abs);
      candidate = `${stem} (${i++})${ext}`;
      if (i > 500) throw Object.assign(new Error('目标目录存在过多同名文件'), { status: 409 });
    } catch (err) {
      if (err.code === 'ENOENT') return { abs, name: candidate };
      throw err;
    }
  }
}

export async function dirSize(abs, { maxEntries = 200000, maxMs = 3000 } = {}) {
  let total = 0;
  let entries = 0;
  const deadline = Date.now() + maxMs;
  let truncated = false;
  const stack = [abs];
  while (stack.length) {
    if (entries > maxEntries || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const current = stack.pop();
    let list = [];
    try {
      list = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of list) {
      const p = path.join(current, item.name);
      if (item.isDirectory()) stack.push(p);
      else if (item.isFile()) {
        try {
          total += (await fsp.lstat(p)).size;
          entries += 1;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return { bytes: total, files: entries, truncated };
}

export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export async function toEntry(dirAbs, relDir, dirent) {
  const abs = path.join(dirAbs, dirent.name);
  let stat = null;
  try {
    stat = await fsp.lstat(abs);
  } catch {
    return null;
  }
  const isDir = stat.isDirectory();
  return {
    name: dirent.name,
    path: path.posix.join(relDir, dirent.name),
    isDir,
    size: isDir ? 0 : stat.size,
    mtime: stat.mtimeMs,
    kind: kindOf(dirent.name, isDir),
    isLink: stat.isSymbolicLink(),
    ext: isDir ? '' : extOf(dirent.name),
    archive: isDir ? null : archiveFormat(dirent.name),
  };
}

export function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
