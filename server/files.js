import express from 'express';
import multer from 'multer';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import {
  safeResolve,
  normalizeRel,
  sanitizeName,
  uniquePath,
  toEntry,
  kindOf,
  extOf,
  archiveFormat,
  rawMode,
  compareEntries,
  humanSize,
  dirSize,
} from './fsutil.js';
import { startUnzip, startZip, startCopy, startMove } from './tasks.js';

const router = express.Router();

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* 目录 lstat 并发度：64 路在本地实测已接近最优，再高会压满 fd */
const STAT_CONCURRENCY = 64;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

/* ------------------------------------------------------------------ */
/* 目录列表                                                            */
/* ------------------------------------------------------------------ */

router.get(
  '/list',
  asyncRoute(async (req, res) => {
    const { real: abs, rel } = await safeResolve(config.filesDir, req.query.path);
    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      throw fail(404, '目录不存在');
    }
    if (!stat.isDirectory()) throw fail(400, '不是目录');

    let dirents = [];
    try {
      dirents = await fsp.readdir(abs, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'EACCES') throw fail(403, '没有访问该目录的权限');
      throw err;
    }

    const visible = dirents.filter((d) => !d.name.startsWith('.upload-'));
    // 并发 lstat：万级目录下串行 181ms → 并发 72ms，且不再逐个阻塞事件循环
    const entries = [];
    for (let i = 0; i < visible.length; i += STAT_CONCURRENCY) {
      const chunk = visible.slice(i, i + STAT_CONCURRENCY);
      const batch = await Promise.all(chunk.map((dirent) => toEntry(abs, rel, dirent)));
      for (const entry of batch) if (entry) entries.push(entry);
    }

    entries.sort(compareEntries);

    // 面包屑
    const parts = rel.split('/').filter(Boolean);
    const breadcrumbs = [{ name: '我的文件', path: '/' }];
    let acc = '';
    for (const part of parts) {
      acc += '/' + part;
      breadcrumbs.push({ name: part, path: acc });
    }

    res.json({
      path: rel,
      breadcrumbs,
      entries,
      writable: await isWritable(abs),
      parent: rel === '/' ? null : path.posix.dirname(rel) || '/',
    });
  })
);

async function isWritable(dir) {
  try {
    await fsp.access(dir, fs.constants.W_OK | fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 下载 / 预览                                                          */
/* ------------------------------------------------------------------ */

function disposition(type, filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

router.get(
  '/download',
  asyncRoute(async (req, res) => {
    const { real: abs } = await safeResolve(config.filesDir, req.query.path);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat) throw fail(404, '文件不存在');
    if (stat.isDirectory()) throw fail(400, '目录不支持直接下载');
    res.setHeader('Content-Disposition', disposition('attachment', path.basename(abs)));
    res.sendFile(abs, { dotfiles: 'allow', acceptRanges: true, cacheControl: false });
  })
);

/*
 * /raw 需要同时满足 <img>/<video>/<iframe> 预览与「不能被当成同源页面执行脚本」：
 * 媒体与 PDF 内联；SVG 内联但加 CSP sandbox；其余（html/xml/js…）一律强制下载。
 */
router.get(
  '/raw',
  asyncRoute(async (req, res) => {
    const { real: abs } = await safeResolve(config.filesDir, req.query.path);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) throw fail(404, '文件不存在');

    const mode = rawMode(path.basename(abs));
    if (mode === 'attachment') {
      res.setHeader('Content-Disposition', disposition('attachment', path.basename(abs)));
      res.setHeader('Content-Type', 'application/octet-stream');
    } else {
      res.setHeader('Content-Disposition', disposition('inline', path.basename(abs)));
      if (mode === 'sandbox') {
        // 顶层打开 SVG 时不会执行内部脚本，但仍可作为 <img> 正常显示
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      }
    }
    res.sendFile(abs, { dotfiles: 'allow', acceptRanges: true, cacheControl: false });
  })
);

router.get(
  '/text',
  asyncRoute(async (req, res) => {
    const { real: abs } = await safeResolve(config.filesDir, req.query.path);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) throw fail(404, '文件不存在');
    const limit = Math.min(config.maxTextPreview, stat.size);
    const handle = await fsp.open(abs, 'r');
    try {
      const buffer = Buffer.alloc(limit);
      await handle.read(buffer, 0, limit, 0);
      if (buffer.includes(0) && limit > 8192) {
        return res.json({ binary: true, size: stat.size });
      }
      res.json({
        binary: false,
        size: stat.size,
        truncated: stat.size > limit,
        text: buffer.toString('utf8'),
      });
    } finally {
      await handle.close();
    }
  })
);

/* ------------------------------------------------------------------ */
/* 上传                                                                */
/* ------------------------------------------------------------------ */

const storage = multer.diskStorage({
  destination(req, file, cb) {
    safeResolve(config.filesDir, req.query.path)
      .then(({ real }) => {
        fs.mkdir(real, { recursive: true }, (err) => {
          if (err) return cb(err);
          cb(null, real);
        });
      })
      .catch(cb);
  },
  filename(req, file, cb) {
    cb(null, `.upload-${crypto.randomBytes(10).toString('hex')}`);
  },
});

const uploader = multer({
  storage,
  limits: {
    files: 200,
    ...(config.maxUploadBytes > 0 ? { fileSize: config.maxUploadBytes } : {}),
  },
});

function uploadMiddleware(req, res, next) {
  uploader.array('files', 200)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(fail(413, '文件超过大小限制'));
    next(fail(400, err.message || '上传失败'));
  });
}

router.post(
  '/upload',
  uploadMiddleware,
  asyncRoute(async (req, res) => {
    const { real: destDir, rel: destRel } = await safeResolve(config.filesDir, req.query.path);
    const files = req.files || [];
    if (files.length === 0) throw fail(400, '没有收到文件');

    const rawNames = req.body?.names;
    const names = Array.isArray(rawNames) ? rawNames : rawNames ? [rawNames] : [];
    const saved = [];

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        let desired = names[i] || file.originalname || `file-${i}`;
        // 修复 busboy 以 latin1 解码 UTF-8 文件名的情况
        if (/[\u00c0-\u00ff]/.test(desired) && !/[\u4e00-\u9fa5]/.test(desired)) {
          const repaired = Buffer.from(desired, 'latin1').toString('utf8');
          if (!repaired.includes('\ufffd')) desired = repaired;
        }

        const relParts = normalizeRel('/' + desired).split('/').filter(Boolean);
        if (relParts.length === 0) continue;
        const fileName = sanitizeName(relParts.pop());
        const parentDir = path.join(destDir, ...relParts.map((p) => sanitizeName(p)));
        await fsp.mkdir(parentDir, { recursive: true });

        const { abs, name } = await uniquePath(parentDir, fileName);
        await fsp.rename(file.path, abs);
        saved.push({
          name,
          size: file.size,
          path: path.posix.join(destRel, ...relParts, name),
        });
      }
    } catch (err) {
      // 清理已落盘的临时文件，避免残留
      for (const file of files) {
        fsp.unlink(file.path).catch(() => {});
      }
      throw err;
    }

    res.json({ files: saved });
  })
);

/* ------------------------------------------------------------------ */
/* 目录 / 文件操作                                                      */
/* ------------------------------------------------------------------ */

router.post(
  '/mkdir',
  asyncRoute(async (req, res) => {
    const { real: parent } = await safeResolve(config.filesDir, req.body?.path);
    const name = sanitizeName(req.body?.name);
    const target = path.join(parent, name);
    try {
      await fsp.mkdir(target);
    } catch (err) {
      if (err.code === 'EEXIST') throw fail(409, '同名文件或文件夹已存在');
      throw err;
    }
    res.json({ ok: true, path: path.posix.join(normalizeRel(req.body?.path), name) });
  })
);

router.post(
  '/rename',
  asyncRoute(async (req, res) => {
    const { real: abs, rel } = await safeResolve(config.filesDir, req.body?.path);
    if (rel === '/') throw fail(400, '无法重命名根目录');
    const name = sanitizeName(req.body?.name);
    const target = path.join(path.dirname(abs), name);
    if (target === abs) return res.json({ ok: true, path: rel });
    try {
      await fsp.access(target);
      throw fail(409, '同名文件或文件夹已存在');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await fsp.rename(abs, target);
    res.json({ ok: true, path: path.posix.join(path.posix.dirname(rel), name) });
  })
);

router.post(
  '/delete',
  asyncRoute(async (req, res) => {
    const list = Array.isArray(req.body?.paths) ? req.body.paths : [];
    if (list.length === 0) throw fail(400, '没有指定要删除的项目');
    const results = [];
    for (const item of list) {
      const { real: abs, rel } = await safeResolve(config.filesDir, item);
      if (rel === '/') throw fail(400, '无法删除根目录');
      try {
        await fsp.rm(abs, { recursive: true, force: false, maxRetries: 2 });
        results.push({ path: rel, ok: true });
      } catch (err) {
        if (err.code === 'ENOENT') results.push({ path: rel, ok: true, missing: true });
        else results.push({ path: rel, ok: false, error: err.message });
      }
    }
    res.json({ results });
  })
);

router.post(
  '/move',
  asyncRoute(async (req, res) => {
    const sources = Array.isArray(req.body?.from) ? req.body.from : [];
    const { real: destDir, rel: destRel } = await safeResolve(config.filesDir, req.body?.to);
    const stat = await fsp.stat(destDir).catch(() => null);
    if (!stat || !stat.isDirectory()) throw fail(400, '目标不是有效目录');
    if (sources.length === 0) throw fail(400, '没有指定源文件');

    const items = [];
    for (const item of sources) {
      const { real: src, rel: srcRel } = await safeResolve(config.filesDir, item);
      if (srcRel === '/') throw fail(400, '无法移动根目录');
      if (destDir === src || destDir.startsWith(src + path.sep)) {
        throw fail(400, `不能把「${path.basename(src)}」移动到自身内部`);
      }
      if (path.dirname(src) === destDir) continue; // 已在目标目录，无需处理
      const { abs: target, name } = await uniquePath(destDir, path.basename(src));
      items.push({ srcAbs: src, targetAbs: target, name, srcRel });
    }
    if (items.length === 0) return res.json({ ok: true, skipped: true, task: null });

    const task = startMove({
      items,
      destLabel: destRel,
      label:
        items.length === 1
          ? `移动「${items[0].name}」→ ${destRel}`
          : `移动 ${items.length} 个项目 → ${destRel}`,
      userId: req.user?.id,
    });
    res.status(202).json({ ok: true, task });
  })
);

router.post(
  '/copy',
  asyncRoute(async (req, res) => {
    const sources = Array.isArray(req.body?.from) ? req.body.from : [];
    const { real: destDir, rel: destRel } = await safeResolve(config.filesDir, req.body?.to);
    const stat = await fsp.stat(destDir).catch(() => null);
    if (!stat || !stat.isDirectory()) throw fail(400, '目标不是有效目录');
    if (sources.length === 0) throw fail(400, '没有指定源文件');

    const items = [];
    for (const item of sources) {
      const { real: src, rel: srcRel } = await safeResolve(config.filesDir, item);
      if (srcRel === '/') throw fail(400, '无法复制根目录');
      if (destDir === src || destDir.startsWith(src + path.sep)) {
        throw fail(400, `不能把「${path.basename(src)}」复制到自身内部`);
      }
      const { abs: target, name } = await uniquePath(destDir, path.basename(src));
      items.push({ srcAbs: src, targetAbs: target, name, srcRel });
    }

    const task = startCopy({
      items,
      destLabel: destRel,
      label:
        items.length === 1
          ? `复制「${items[0].name}」→ ${destRel}`
          : `复制 ${items.length} 个项目 → ${destRel}`,
      userId: req.user?.id,
    });
    res.status(202).json({ ok: true, task });
  })
);

/* ------------------------------------------------------------------ */
/* 搜索 / 容量                                                         */
/* ------------------------------------------------------------------ */

router.get(
  '/search',
  asyncRoute(async (req, res) => {
    const keyword = String(req.query.q || '').trim().toLowerCase();
    if (!keyword) return res.json({ entries: [], truncated: false });
    const { real: base } = await safeResolve(config.filesDir, req.query.path);
    const results = [];
    const stack = [{ dir: base, rel: normalizeRel(req.query.path), depth: 0 }];
    let truncated = false;

    while (stack.length && !truncated) {
      const { dir, rel, depth } = stack.pop();
      if (depth > 12) continue;
      let dirents = [];
      try {
        dirents = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      const visible = dirents.filter((d) => !d.name.startsWith('.upload-'));

      for (let i = 0; i < visible.length; i += STAT_CONCURRENCY) {
        const chunk = visible.slice(i, i + STAT_CONCURRENCY);
        const batch = await Promise.all(chunk.map((dirent) => toEntry(dir, rel, dirent)));
        for (const entry of batch) {
          if (!entry) continue;
          if (entry.name.toLowerCase().includes(keyword)) {
            results.push(entry);
            // 命中达到上限即停：此前只在 while 顶部判断，单层大目录会被静默截断而不上报
            if (results.length >= config.maxSearchResults) {
              truncated = true;
              break;
            }
          }
        }
        if (truncated) break;
        for (const dirent of chunk) {
          if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
            stack.push({ dir: path.join(dir, dirent.name), rel: path.posix.join(rel, dirent.name), depth: depth + 1 });
          }
        }
      }
    }

    res.json({ entries: results.slice(0, config.maxSearchResults), truncated });
  })
);

router.get(
  '/storage',
  asyncRoute(async (req, res) => {
    try {
      const stats = await fsp.statfs(config.filesDir);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      res.json({
        total,
        free,
        used: total - free,
        totalLabel: humanSize(total),
        freeLabel: humanSize(free),
        usedLabel: humanSize(total - free),
      });
    } catch {
      res.json({ total: 0, free: 0, used: 0, totalLabel: '-', freeLabel: '-', usedLabel: '-' });
    }
  })
);

router.get(
  '/entry',
  asyncRoute(async (req, res) => {
    const { real: abs, rel } = await safeResolve(config.filesDir, req.query.path);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat) throw fail(404, '文件不存在');
    const isDir = stat.isDirectory();
    const info = {
      name: path.basename(abs),
      path: rel,
      isDir,
      size: stat.size,
      mtime: stat.mtimeMs,
      kind: kindOf(path.basename(abs), isDir),
      ext: isDir ? '' : extOf(path.basename(abs)),
      archive: isDir ? null : archiveFormat(path.basename(abs)),
    };
    if (isDir) {
      const children = await fsp.readdir(abs).catch(() => []);
      const counted = await dirSize(abs);
      info.children = children.filter((n) => !n.startsWith('.upload-')).length;
      info.recursiveFiles = counted.files;
      info.recursiveSize = counted.bytes;
      // 超大目录不再无限遍历：3 秒或 20 万条目即返回近似值
      if (counted.truncated) info.recursiveApprox = true;
    }
    res.json(info);
  })
);

/* ------------------------------------------------------------------ */
/* 后台任务：解压 / 压缩                                                */
/* ------------------------------------------------------------------ */

router.post(
  '/archive/extract',
  asyncRoute(async (req, res) => {
    const { real: abs, rel } = await safeResolve(config.filesDir, req.body?.path);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) throw fail(404, '压缩包不存在');
    const format = archiveFormat(path.basename(abs));
    if (!format) throw fail(400, '暂不支持该压缩格式（支持 zip / tar / tar.gz）');

    const baseName = path.basename(abs).replace(/\.(zip|tar\.gz|tar|tgz|gz)$/i, '');
    let destAbs;
    let destRel;
    if (req.body?.sameFolder) {
      destAbs = path.dirname(abs);
      destRel = path.posix.dirname(rel);
    } else {
      const { abs: uAbs, name } = await uniquePath(path.dirname(abs), baseName || 'extracted');
      destAbs = uAbs;
      destRel = path.posix.join(path.posix.dirname(rel), name);
    }

    const task = startUnzip({
      absArchive: abs,
      destRoot: destAbs,
      format,
      label: `解压 ${path.basename(abs)}`,
      userId: req.user?.id,
    });
    res.json({ task, dest: destRel });
  })
);

router.post(
  '/archive/compress',
  asyncRoute(async (req, res) => {
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
    if (paths.length === 0) throw fail(400, '请选择要压缩的文件');
    const resolved = await Promise.all(paths.map((p) => safeResolve(config.filesDir, p)));

    let destDirAbs;
    let baseName;
    if (req.body?.name) {
      const { real: dirAbs } = await safeResolve(config.filesDir, req.body?.path);
      destDirAbs = dirAbs;
      baseName = sanitizeName(req.body.name);
      if (!/\.zip$/i.test(baseName)) baseName += '.zip';
    } else if (resolved.length === 1) {
      destDirAbs = path.dirname(resolved[0].abs);
      baseName = `${path.basename(resolved[0].abs)}.zip`;
    } else {
      throw fail(400, '请指定压缩包名称');
    }

    const { abs: destFile, name } = await uniquePath(destDirAbs, baseName);
    const task = startZip({
      absPaths: resolved.map((r) => r.abs),
      destFile,
      label: `压缩 ${name}`,
      userId: req.user?.id,
    });
    res.json({
      task,
      dest: path.posix.join(path.relative(config.filesDir, destDirAbs).split(path.sep).join('/') || '/', name),
    });
  })
);

export default router;
