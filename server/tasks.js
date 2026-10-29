import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { extract as tarExtract } from 'tar';
import archiver from 'archiver';
import yauzl from 'yauzl';
import { config } from './config.js';
import { normalizeRel } from './fsutil.js';

/* ------------------------------------------------------------------ */
/* 基础队列                                                             */
/* ------------------------------------------------------------------ */

const TASK_KEEP = 40;
const tasks = new Map(); // id -> task
const queue = [];
let running = 0;

function nowIso() {
  return new Date().toISOString();
}

function emit() {
  // 简单版本号，供前端做轻量 ETag
  taskVersion += 1;
}
let taskVersion = 1;

function snapshot(task) {
  return {
    id: task.id,
    type: task.type,
    label: task.label,
    status: task.status,
    progress: task.progress,
    processed: task.processed,
    total: task.total,
    bytes: task.bytes,
    current: task.current,
    message: task.message,
    error: task.error,
    result: task.result,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    cancellable: task.status === 'running' || task.status === 'queued',
  };
}

function trim() {
  const finished = [...tasks.values()]
    .filter((t) => t.status === 'done' || t.status === 'error' || t.status === 'cancelled')
    .sort((a, b) => (a.finishedAt || '').localeCompare(b.finishedAt || ''));
  while (finished.length > TASK_KEEP) {
    const t = finished.shift();
    tasks.delete(t.id);
  }
}

function pump() {
  while (running < config.maxConcurrentTasks && queue.length) {
    const task = queue.shift();
    if (task.cancelled) {
      task.status = 'cancelled';
      task.finishedAt = nowIso();
      continue;
    }
    running += 1;
    task.status = 'running';
    task.startedAt = nowIso();
    emit();
    Promise.resolve()
      .then(() => task._runner(task))
      .then((result) => {
        if (task.cancelled) {
          task.status = 'cancelled';
        } else {
          task.status = 'done';
          task.progress = 100;
          task.result = result || task.result || null;
        }
      })
      .catch((err) => {
        if (task.cancelled) {
          task.status = 'cancelled';
        } else {
          task.status = 'error';
          task.error = err?.message || String(err);
        }
      })
      .finally(() => {
        task.finishedAt = nowIso();
        task.current = '';
        running -= 1;
        trim();
        emit();
        pump();
      });
  }
}

export function createTask({ type, label, runner, userId }) {
  const task = {
    id: crypto.randomUUID(),
    type,
    label,
    userId: userId || null,
    status: 'queued',
    progress: 0,
    processed: 0,
    total: 0,
    bytes: 0,
    current: '',
    message: '',
    error: null,
    result: null,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    cancelled: false,
    _runner: runner,
    _abort: new AbortController(),
  };
  tasks.set(task.id, task);
  queue.push(task);
  emit();
  pump();
  return snapshot(task);
}

export function listTasks(userId) {
  return {
    version: taskVersion,
    tasks: [...tasks.values()]
      .filter((t) => !userId || !t.userId || t.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(snapshot),
  };
}

export function getTask(id, userId) {
  const task = tasks.get(id);
  if (!task) return null;
  if (userId && task.userId && task.userId !== userId) return null;
  return snapshot(task);
}

export function cancelTask(id, userId) {
  const task = tasks.get(id);
  if (!task) return null;
  if (userId && task.userId && task.userId !== userId) return null;
  if (task.status === 'queued') {
    task.cancelled = true;
    const i = queue.indexOf(task);
    if (i >= 0) queue.splice(i, 1);
    task.status = 'cancelled';
    task.finishedAt = nowIso();
    emit();
  } else if (task.status === 'running') {
    task.cancelled = true;
    task.message = '正在中止…';
    try {
      task._abort?.abort();
    } catch {
      /* ignore */
    }
    emit();
  }
  return snapshot(task);
}

export function hasActiveTasks() {
  return running > 0 || queue.length > 0;
}

/* ------------------------------------------------------------------ */
/* zip 文件名解码（UTF-8 优先，回退 GBK）                                */
/* ------------------------------------------------------------------ */

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
let gbkDecoder = null;
try {
  gbkDecoder = new TextDecoder('gbk');
} catch {
  gbkDecoder = null;
}

function decodeZipName(buffer) {
  if (typeof buffer === 'string') return buffer;
  try {
    return utf8Strict.decode(buffer);
  } catch {
    if (gbkDecoder) {
      try {
        return gbkDecoder.decode(buffer);
      } catch {
        /* fallthrough */
      }
    }
    return buffer.toString('latin1');
  }
}

/* ------------------------------------------------------------------ */
/* 解压：zip                                                           */
/* ------------------------------------------------------------------ */

function openZip(absPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(absPath, { lazyEntries: true, autoClose: true, decodeStrings: false }, (err, zipfile) => {
      if (err) reject(err);
      else resolve(zipfile);
    });
  });
}

function openZipEntryStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  });
}

function isSymlinkEntry(entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

async function extractZip(absZip, destRoot, task) {
  const zipfile = await openZip(absZip);
  const total = zipfile.entryCount || 0;
  if (total > config.maxExtractEntries) {
    try {
      zipfile.close();
    } catch {
      /* ignore */
    }
    throw new Error(`压缩包条目过多（${total}），上限 ${config.maxExtractEntries}`);
  }
  task.total = total;
  task.message = '正在读取压缩包目录…';

  let files = 0;
  let bytes = 0;
  let declared = 0; // 已声明的解压后字节数，用于提前拦截 zip 炸弹
  const createdDirs = new Set();

  const ensureDir = async (dir) => {
    if (createdDirs.has(dir)) return;
    await fsp.mkdir(dir, { recursive: true });
    createdDirs.add(dir);
  };

  await new Promise((resolve, reject) => {
    let chain = Promise.resolve();
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      reject(err);
    };

    zipfile.on('error', fail);
    zipfile.on('end', () => {
      chain.then(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, fail);
    });

    zipfile.on('entry', (entry) => {
      chain = chain
        .then(async () => {
          if (task.cancelled) {
            try {
              zipfile.close();
            } catch {
              /* ignore */
            }
            throw Object.assign(new Error('任务已取消'), { cancelled: true });
          }
          const rawName = decodeZipName(entry.fileName);
          const rel = normalizeRel(rawName);
          const relName = rel.replace(/^\/+/, '');
          if (!relName) {
            zipfile.readEntry();
            return;
          }
          const target = path.resolve(destRoot, relName);
          if (!target.startsWith(path.resolve(destRoot) + path.sep) && target !== path.resolve(destRoot)) {
            zipfile.readEntry();
            return;
          }

          if (isSymlinkEntry(entry)) {
            // 不解压符号链接，避免越界写入
            zipfile.readEntry();
            return;
          }

          const isDirEntry = /\/$/.test(rawName) || relName.endsWith('/');
          if (isDirEntry) {
            await ensureDir(target);
          } else {
            // zip 炸弹护栏：先把声明的解压体积累加起来，超限立即中止
            declared += entry.uncompressedSize || 0;
            if (declared > config.maxExtractBytes) {
              throw new Error(
                `解压后体积超过上限（${Math.round(config.maxExtractBytes / 1024 / 1024)}MB），已中止`
              );
            }
            await ensureDir(path.dirname(target));
            const stream = await openZipEntryStream(zipfile, entry);
            await pipeline(stream, fs.createWriteStream(target));
            files += 1;
            bytes += entry.uncompressedSize || 0;
            task.bytes = bytes;
            task.current = relName;
            task.processed = files;
            task.progress = total > 0 ? Math.min(99, Math.round((files / total) * 100)) : 0;
            emit();
          }
          zipfile.readEntry();
        })
        .catch(fail);
    });

    zipfile.readEntry();
  });

  return { files, bytes, destRoot };
}

/* ------------------------------------------------------------------ */
/* 解压：tar / tar.gz                                                  */
/* ------------------------------------------------------------------ */

async function extractTar(absFile, destRoot, task, gzip = false) {
  task.message = '正在解压归档…';
  let files = 0;
  let bytes = 0;
  let declared = 0;
  let declaredEntries = 0;
  let limitError = null;
  const createdDirs = new Set();

  const onEntry = (entry) => {
    if (task.cancelled) {
      entry.resume?.();
      return;
    }
    const rel = normalizeRel(entry.path);
    const relName = rel.replace(/^\/+/, '');
    if (relName) {
      if (entry.type === 'Directory') {
        createdDirs.add(relName);
      } else if (entry.type === 'File') {
        files += 1;
        bytes += entry.size || 0;
      }
      task.processed = files;
      task.bytes = bytes;
      task.current = relName;
      // 总数未知 → 用渐近进度表示仍在推进
      task.progress = Math.min(95, Math.round((1 - 1 / (1 + files / 40)) * 100));
      emit();
    }
  };

  await tarExtract({
    file: absFile,
    cwd: destRoot,
    gzip,
    preservePaths: false,
    strict: false,
    chmod: true,
    processUmask: 0o22,
    onReadEntry: onEntry,
    filter: (entryPath, entry) => {
      if (task.cancelled) return false;
      if (entry.type === 'SymbolicLink' || entry.type === 'Link') return false;
      if (limitError) return false;
      if (entry.type === 'File') {
        // 归档头里已声明大小，先累加再决定是否继续解压
        declared += entry.size || 0;
        declaredEntries += 1;
        if (declared > config.maxExtractBytes) {
          limitError = `解压后体积超过上限（${Math.round(config.maxExtractBytes / 1024 / 1024)}MB），已中止`;
          return false;
        }
        if (declaredEntries > config.maxExtractEntries) {
          limitError = `归档条目过多（上限 ${config.maxExtractEntries}），已中止`;
          return false;
        }
      }
      return true;
    },
  });

  if (limitError) throw new Error(limitError);

  return { files, bytes, destRoot };
}

/* ------------------------------------------------------------------ */
/* 压缩：zip                                                           */
/* ------------------------------------------------------------------ */

async function countForZip(absPaths) {
  let bytes = 0;
  let files = 0;
  const stack = [...absPaths];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try {
      stat = await fsp.lstat(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      let list = [];
      try {
        list = await fsp.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const item of list) stack.push(path.join(current, item.name));
    } else if (stat.isFile()) {
      bytes += stat.size;
      files += 1;
    }
  }
  return { bytes, files };
}

async function createZip(absPaths, destFile, task) {
  task.message = '正在统计文件…';
  const { bytes, files } = await countForZip(absPaths);
  task.total = bytes;
  task.message = '正在压缩…';

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destFile);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);
    archive.on('progress', (data) => {
      task.bytes = data.fs.processedBytes || 0;
      task.progress = bytes > 0 ? Math.min(99, Math.round((task.bytes / bytes) * 100)) : 0;
      emit();
      if (task.cancelled) {
        archive.abort();
        output.destroy();
      }
    });

    archive.pipe(output);
    for (const abs of absPaths) {
      const base = path.basename(abs);
      let stat;
      try {
        stat = fs.lstatSync(abs);
      } catch {
        continue;
      }
      if (stat.isDirectory()) archive.directory(abs, base);
      else archive.file(abs, { name: base });
    }
    archive.finalize().catch(reject);
  });

  return { files, bytes, file: destFile };
}

/* ------------------------------------------------------------------ */
/* 复制 / 移动（同样在主机侧执行，逐文件流式搬运）                        */
/* ------------------------------------------------------------------ */

function abortError() {
  return Object.assign(new Error('任务已取消'), { cancelled: true });
}

function checkCancelled(task) {
  if (task.cancelled) throw abortError();
}

/** 统计一棵子树的文件数与总字节数（用于百分比进度） */
async function scanTree(absRoot) {
  let files = 0;
  let bytes = 0;
  const stack = [absRoot];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try {
      stat = await fsp.lstat(current);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue; // 不跟随符号链接
    if (stat.isDirectory()) {
      let list = [];
      try {
        list = await fsp.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const item of list) stack.push(path.join(current, item.name));
    } else if (stat.isFile()) {
      files += 1;
      bytes += stat.size;
    }
  }
  return { files, bytes };
}

function reportProgress(task, stats, absTarget) {
  const now = Date.now();
  // 节流：前端 900ms 轮询一次，这里 150ms 一次足够，避免大目录下过度写状态
  if (now - stats.lastEmit < 150) return;
  stats.lastEmit = now;
  task.processed = stats.files;
  task.bytes = stats.bytes;
  task.current = absTarget.startsWith(config.filesDir)
    ? absTarget.slice(config.filesDir.length) || '/'
    : path.basename(absTarget);
  task.progress =
    stats.totalBytes > 0
      ? Math.min(99, Math.round((stats.bytes / stats.totalBytes) * 100))
      : Math.min(95, Math.round((1 - 1 / (1 + stats.files / 40)) * 100));
  emit();
}

async function copyNode(task, srcAbs, dstAbs, stats) {
  checkCancelled(task);
  let stat;
  try {
    stat = await fsp.lstat(srcAbs);
  } catch {
    return; // 源已消失（并发删除），跳过
  }
  if (stat.isSymbolicLink()) return;

  if (stat.isDirectory()) {
    await fsp.mkdir(dstAbs, { recursive: true });
    let list = [];
    try {
      list = await fsp.readdir(srcAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of list) {
      await copyNode(task, path.join(srcAbs, item.name), path.join(dstAbs, item.name), stats);
    }
    try {
      await fsp.chmod(dstAbs, stat.mode & 0o777);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!stat.isFile()) return;

  try {
    await pipeline(fs.createReadStream(srcAbs), fs.createWriteStream(dstAbs), {
      signal: task._abort?.signal,
    });
  } catch (err) {
    if (task.cancelled || err?.name === 'AbortError') throw abortError();
    throw err;
  }
  try {
    await fsp.chmod(dstAbs, stat.mode & 0o777);
  } catch {
    /* ignore */
  }
  stats.files += 1;
  stats.bytes += stat.size;
  reportProgress(task, stats, dstAbs);
}

export function startCopy({ items, destLabel, label, userId }) {
  return createTask({
    type: 'copy',
    label,
    userId,
    runner: async (task) => {
      task.message = '正在统计文件…';
      let totalBytes = 0;
      for (const item of items) {
        const info = await scanTree(item.srcAbs);
        totalBytes += info.bytes;
      }
      task.total = totalBytes;
      task.message = '正在复制…';
      const stats = { files: 0, bytes: 0, totalBytes, lastEmit: 0, lastBytes: -1, lastFiles: -1 };
      for (let i = 0; i < items.length; i += 1) {
        checkCancelled(task);
        const item = items[i];
        await copyNode(task, item.srcAbs, item.targetAbs, stats);
        task.progress = Math.min(99, Math.round(((i + 1) / items.length) * 100));
        emit();
      }
      task.current = '';
      // 节流会吞掉最后一次更新，收尾时强制对齐真实值
      task.processed = stats.files;
      task.bytes = stats.bytes;
      return { kind: 'copy', files: stats.files, bytes: stats.bytes, destLabel };
    },
  });
}

export function startMove({ items, destLabel, label, userId }) {
  return createTask({
    type: 'move',
    label,
    userId,
    runner: async (task) => {
      let moved = 0;
      let files = 0;
      let bytes = 0;
      for (let i = 0; i < items.length; i += 1) {
        checkCancelled(task);
        const item = items[i];
        task.message = '正在移动…';
        try {
          // 同一文件系统内 rename 是瞬间操作，不产生任何数据拷贝
          await fsp.rename(item.srcAbs, item.targetAbs);
        } catch (err) {
          if (err.code !== 'EXDEV') throw err;
          // 跨挂载点：退化为「复制 + 删除」，仍然全程在主机侧完成
          const info = await scanTree(item.srcAbs);
          task.total = info.bytes;
          const stats = {
            files: 0,
            bytes: 0,
            totalBytes: info.bytes,
            lastEmit: 0,
            lastBytes: -1,
            lastFiles: -1,
          };
          await copyNode(task, item.srcAbs, item.targetAbs, stats);
          await fsp.rm(item.srcAbs, { recursive: true, force: true });
          files += stats.files;
          bytes += stats.bytes;
        }
        moved += 1;
        task.processed = moved;
        task.current = item.name;
        task.progress = Math.min(99, Math.round((moved / items.length) * 100));
        emit();
      }
      task.current = '';
      return { kind: 'move', files: moved, bytes, destLabel };
    },
  });
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                            */
/* ------------------------------------------------------------------ */

export function startUnzip({ absArchive, destRoot, format, label, userId }) {
  return createTask({
    type: 'unzip',
    label,
    userId,
    runner: async (task) => {
      await fsp.mkdir(destRoot, { recursive: true });
      const result =
        format === 'zip'
          ? await extractZip(absArchive, destRoot, task)
          : await extractTar(absArchive, destRoot, task, format === 'tgz');
      task.message = '已完成';
      return { ...result, kind: 'unzip' };
    },
  });
}

export function startZip({ absPaths, destFile, label, userId }) {
  return createTask({
    type: 'zip',
    label,
    userId,
    runner: async (task) => {
      await fsp.mkdir(path.dirname(destFile), { recursive: true });
      const result = await createZip(absPaths, destFile, task);
      task.message = '已完成';
      return { ...result, kind: 'zip' };
    },
  });
}
