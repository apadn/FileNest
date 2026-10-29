import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { ArrowUp, ChevronRight, Folder, FolderPlus, Close } from '../icons.jsx';
import { Modal, toast } from './Common.jsx';

const ROOT = { name: '我的文件', path: '/' };

function parentOf(path) {
  if (!path || path === '/') return '/';
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

/**
 * 目录选择器：列出文件夹让用户逐级选择，替代手填路径。
 * excludePaths 内的目录（及子目录）会被禁用，用于「移动到自身内部」的场景。
 */
export default function FolderPicker({
  open,
  title = '选择目标文件夹',
  confirmText = '选择此文件夹',
  initialPath = '/',
  excludePaths = [],
  onClose,
  onConfirm,
}) {
  const [target, setTarget] = useState(initialPath || '/');
  const [dirs, setDirs] = useState([]);
  const [crumbs, setCrumbs] = useState([ROOT]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  /* 每次打开都回到调用方给的起始目录 */
  useEffect(() => {
    if (!open) return;
    setTarget(initialPath || '/');
    setCreating(false);
    setNewName('');
    setError('');
  }, [open, initialPath]);

  const loadDir = useCallback(async (dirPath) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.list(dirPath);
      const folders = (result.entries || [])
        .filter((entry) => entry.isDir)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      setDirs(folders);
      setCrumbs(result.breadcrumbs?.length ? result.breadcrumbs : [ROOT]);
    } catch (err) {
      setDirs([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadDir(target);
  }, [open, target, loadDir]);

  const blocked = useCallback(
    (dirPath) => excludePaths.some((p) => dirPath === p || dirPath.startsWith(`${p}/`)),
    [excludePaths]
  );

  const invalid = useMemo(() => blocked(target), [blocked, target]);

  const createFolder = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.mkdir(target, name);
      setNewName('');
      setCreating(false);
      toast('已创建文件夹', 'success');
      loadDir(target);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const submit = async () => {
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onConfirm(target);
      onClose?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width={480}>
      <div className="modal-head">
        <div className="modal-title">{title}</div>
        <button type="button" className="icon-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
          <Close size={17} />
        </button>
      </div>

      <div className="picker-crumbs">
        {crumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 0 ? <ChevronRight size={12} className="picker-sep" /> : null}
            <button
              type="button"
              className={`picker-crumb${crumb.path === target ? ' active' : ''}`}
              onClick={() => setTarget(crumb.path)}
            >
              {index === 0 ? '我的文件' : crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="picker-list scroll-area">
        {target !== '/' ? (
          <button
            type="button"
            className="picker-item picker-up"
            onClick={() => setTarget(parentOf(target))}
          >
            <ArrowUp size={16} className="picker-icon" />
            <span className="picker-name">上级目录</span>
          </button>
        ) : null}

        {loading ? (
          <div className="picker-empty">
            <span className="spinner" />
          </div>
        ) : error ? (
          <div className="picker-empty">{error}</div>
        ) : dirs.length === 0 ? (
          <div className="picker-empty">这里没有子文件夹</div>
        ) : (
          dirs.map((dir) => {
            const isBlocked = blocked(dir.path);
            return (
              <button
                key={dir.path}
                type="button"
                className={`picker-item${isBlocked ? ' blocked' : ''}`}
                disabled={isBlocked}
                onClick={() => setTarget(dir.path)}
              >
                <Folder size={16} className="picker-icon" />
                <span className="picker-name">{dir.name}</span>
                {isBlocked ? (
                  <span className="picker-tag">不可选</span>
                ) : (
                  <ChevronRight size={14} className="picker-go" />
                )}
              </button>
            );
          })
        )}
      </div>

      {creating ? (
        <div className="picker-new">
          <input
            className="input"
            autoFocus
            placeholder="新建文件夹名称"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createFolder();
              } else if (event.key === 'Escape') {
                event.stopPropagation();
                setCreating(false);
                setNewName('');
              }
            }}
          />
          <button type="button" className="btn" onClick={createFolder} disabled={!newName.trim()}>
            创建
          </button>
        </div>
      ) : null}

      <div className="picker-foot">
        <span className="picker-path" title={target}>
          {target === '/' ? '我的文件' : target}
        </span>
        {invalid ? <span className="picker-warn">不能选择源文件夹自身或子目录</span> : null}
        <button
          type="button"
          className="picker-newbtn"
          onClick={() => setCreating((prev) => !prev)}
          disabled={invalid}
        >
          <FolderPlus size={13} />
          新建
        </button>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button type="button" className="btn primary" onClick={submit} disabled={invalid || busy}>
          {busy ? <span className="spinner" /> : null}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
