import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadFiles, urls } from '../api.js';
import {
  ArrowLeft,
  ArrowUp,
  Archive,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  File as FileIcon,
  FolderPlus,
  Grid,
  Inbox,
  Info,
  ListIcon,
  LogOut,
  More,
  Move,
  Pencil,
  Plus,
  Refresh,
  Search,
  Settings as SettingsIcon,
  Trash,
  Upload,
  User as UserIcon,
  Close,
} from '../icons.jsx';
import { formatBytes, useIsMobile, useLongPress } from '../utils.js';
import { FileCard, FileRow } from '../components/FileItem.jsx';
import { ActionSheet, ConfirmDialog, ContextMenu, Modal, toast } from '../components/Common.jsx';
import FolderPicker from '../components/FolderPicker.jsx';
import { TaskDock, UploadDock } from '../components/TaskDock.jsx';
import Preview from '../components/Preview.jsx';
import Settings from '../components/Settings.jsx';

const VIEW_KEY = 'filenest.view';
const PREVIEWABLE = new Set(['image', 'video', 'audio', 'text', 'code', 'pdf']);

function parentOf(path) {
  if (path === '/') return '/';
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

function joinPath(dir, name) {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

function readHashPath() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return '/';
  try {
    return decodeURI(raw) || '/';
  } catch {
    return '/';
  }
}

export default function Browser({ user, site, onLogout, theme, setTheme, onUserUpdate }) {
  const isMobile = useIsMobile();

  const [path, setPath] = useState(readHashPath);
  const [data, setData] = useState({ entries: [], breadcrumbs: [{ name: '我的文件', path: '/' }], parent: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid');
  const [selected, setSelected] = useState(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [focused, setFocused] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const anchorRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [sheetEntry, setSheetEntry] = useState(null);
  const [sheetMenu, setSheetMenu] = useState(null);
  const [preview, setPreview] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dismissedTasks, setDismissedTasks] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [storage, setStorage] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);

  const fileInput = useRef(null);
  const searchInputRef = useRef(null);
  const dirInput = useRef(null);
  const abortMap = useRef(new Map());
  const dragCounter = useRef(0);
  const prevTaskStatus = useRef(new Map());
  const pullStart = useRef(null);
  const contentRef = useRef(null);

  /* ---------------- 目录加载 ---------------- */

  const load = useCallback(
    async (target, { silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError('');
      try {
        const result = await api.list(target);
        setData(result);
        setSelected(new Set());
      } catch (err) {
        if (!silent) setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(path);
  }, [path, load]);

  useEffect(() => {
    api.storage().then(setStorage).catch(() => {});
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = readHashPath();
      setPath((current) => (current === next ? current : next));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next, { replace = false } = {}) => {
    const normalized = next || '/';
    const url = `#${encodeURI(normalized)}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
    setPath(normalized);
    setSearchResult(null);
    setSearchOpen(false);
    setKeyword('');
    setSelectMode(false);
    setSelected(new Set());
    setFocused(null);
    anchorRef.current = null;
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', `#${encodeURI(path)}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- 任务轮询 ---------------- */

  const activeTasks = tasks.some((t) => t.status === 'running' || t.status === 'queued');

  useEffect(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const result = await api.tasks();
        if (alive) setTasks(result.tasks.slice(0, 8));
      } catch {
        /* 静默失败 */
      }
      if (alive) timer = setTimeout(tick, activeTasks ? 900 : 6000);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [activeTasks]);

  useEffect(() => {
    let shouldRefresh = false;
    for (const task of tasks) {
      const before = prevTaskStatus.current.get(task.id);
      if (before && before !== 'done' && task.status === 'done') shouldRefresh = true;
      prevTaskStatus.current.set(task.id, task.status);
    }
    if (shouldRefresh) {
      setDismissedTasks(false);
      load(path, { silent: true });
      api.storage().then(setStorage).catch(() => {});
    }
  }, [tasks, path, load]);

  /* ---------------- 选择 ---------------- */

  const selectedEntries = useMemo(
    () => data.entries.filter((entry) => selected.has(entry.path)),
    [data.entries, selected]
  );

  const handleSelect = useCallback(
    (entry, event, keepOnly = false) => {
      // 右键：仅高亮当前项；若该项已在多选集合内则保留集合
      if (keepOnly) {
        setFocused(entry.path);
        anchorRef.current = entry.path;
        setSelected((current) => (current.has(entry.path) ? current : new Set()));
        return;
      }

      // Shift 连选（桌面）
      if (event?.shiftKey && anchorRef.current) {
        const list = data.entries;
        const from = list.findIndex((item) => item.path === anchorRef.current);
        const to = list.findIndex((item) => item.path === entry.path);
        if (from >= 0 && to >= 0) {
          const [start, end] = from < to ? [from, to] : [to, from];
          const next = new Set();
          for (let index = start; index <= end; index += 1) next.add(list[index].path);
          setFocused(null);
          setSelected(next);
          return;
        }
      }

      // 多选模式 或 Cmd/Ctrl 组合键：点击即切换勾选
      if (selectMode || event?.metaKey || event?.ctrlKey) {
        setFocused(null);
        anchorRef.current = entry.path;
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
        return;
      }

      // 桌面端普通单击：只高亮这一项，不进入多选
      setFocused(entry.path);
      anchorRef.current = entry.path;
      setSelected(new Set());
    },
    [data.entries, selectMode]
  );

  const enterSelectMode = useCallback((entry) => {
    setSelectMode(true);
    setFocused(null);
    setMenu(null);
    setSheetEntry(null);
    if (entry) {
      anchorRef.current = entry.path;
      setSelected(new Set([entry.path]));
    }
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    setFocused(null);
    anchorRef.current = null;
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((current) => {
      const all = data.entries;
      if (current.size === all.length && all.length > 0) return new Set();
      return new Set(all.map((entry) => entry.path));
    });
  }, [data.entries]);

  const openEntry = useCallback(
    (entry) => {
      if (entry.isDir) {
        navigate(entry.path);
        return;
      }
      if (PREVIEWABLE.has(entry.kind)) setPreview(entry);
      else toast('该文件类型暂不支持预览，可长按下载', 'info');
    },
    [navigate]
  );

  /* ---------------- 上传 ---------------- */

  const runUpload = useCallback(
    async (files, targetPath) => {
      if (!files.length) return;
      const id = `up-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      const label =
        files.length === 1 ? files[0].name : `${files[0].name} 等 ${files.length} 个文件`;

      setUploads((prev) => [
        { id, name: label, size: total, loaded: 0, progress: 0, status: 'uploading', target: targetPath },
        ...prev,
      ]);

      const controller = new AbortController();
      abortMap.current.set(id, controller);

      try {
        await uploadFiles(targetPath, files, {
          signal: controller.signal,
          onProgress: (ratio, loaded) => {
            setUploads((prev) =>
              prev.map((item) => (item.id === id ? { ...item, progress: ratio, loaded } : item))
            );
          },
        });
        setUploads((prev) =>
          prev.map((item) => (item.id === id ? { ...item, progress: 1, status: 'done' } : item))
        );
        if (targetPath === path) load(path, { silent: true });
        else toast(`已上传到 ${targetPath}`, 'success');
      } catch (err) {
        setUploads((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: 'error', error: err.message } : item
          )
        );
        if (err.message !== '上传已取消') toast(err.message, 'error');
      } finally {
        abortMap.current.delete(id);
      }
    },
    [path, load]
  );

  const pickFiles = () => fileInput.current?.click();
  const pickFolder = () => dirInput.current?.click();

  const onFileInput = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) runUpload(files, path);
  };

  /* ---------------- 拖拽 ---------------- */

  const onDragEnter = (event) => {
    if (isMobile) return;
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragCounter.current += 1;
    setDragging(true);
  };
  const onDragOver = (event) => {
    if (isMobile) return;
    event.preventDefault();
  };
  const onDragLeave = (event) => {
    if (isMobile) return;
    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  };
  const onDrop = (event) => {
    if (isMobile) return;
    event.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) runUpload(files, path);
  };

  /* ---------------- 下拉刷新（移动端） ---------------- */

  const onTouchStart = (event) => {
    if (!isMobile) return;
    const scroller = contentRef.current;
    if (!scroller || scroller.scrollTop > 0) {
      pullStart.current = null;
      return;
    }
    pullStart.current = event.touches[0].clientY;
  };
  const onTouchMove = (event) => {
    if (!isMobile || pullStart.current == null) return;
    const delta = event.touches[0].clientY - pullStart.current;
    if (delta > 0) setPullDistance(Math.min(74, delta * 0.55));
  };
  const onTouchEnd = async () => {
    if (!isMobile) return;
    const distance = pullDistance;
    pullStart.current = null;
    setPullDistance(0);
    if (distance >= 52) {
      setRefreshing(true);
      await load(path, { silent: true });
      setRefreshing(false);
    }
  };

  /* ---------------- 搜索 ---------------- */

  const runSearch = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setSearchResult(null);
      return;
    }
    try {
      const result = await api.search(path, trimmed);
      setSearchResult(result);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  useEffect(() => {
    if (!searchOpen) {
      setSearchResult(null);
      setKeyword('');
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!keyword.trim()) {
      setSearchResult(null);
      return undefined;
    }
    const timer = setTimeout(() => runSearch(keyword), 320);
    return () => clearTimeout(timer);
  }, [keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- 操作 ---------------- */

  const doMkdir = () => {
    setDialog({
      type: 'mkdir',
      title: '新建文件夹',
      label: '文件夹名称',
      value: '',
      confirmText: '创建',
      onSubmit: async (value) => {
        await api.mkdir(path, value);
        toast('已创建文件夹', 'success');
        load(path, { silent: true });
      },
    });
  };

  const doRename = (entry) => {
    setDialog({
      type: 'rename',
      title: '重命名',
      label: '新名称',
      value: entry.name,
      confirmText: '保存',
      onSubmit: async (value) => {
        await api.rename(entry.path, value);
        toast('已重命名', 'success');
        load(path, { silent: true });
      },
    });
  };

  const doDelete = (entries) => {
    const list = entries.filter(Boolean);
    if (!list.length) return;
    setConfirm({
      title: list.length === 1 ? `删除「${list[0].name}」？` : `删除 ${list.length} 个项目？`,
      description: '文件将被永久删除，此操作无法撤销。',
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        const result = await api.remove(list.map((entry) => entry.path));
        const failed = result.results.filter((item) => !item.ok);
        if (failed.length) toast(`${failed.length} 个项目删除失败`, 'error');
        else toast('已删除', 'success');
        setConfirm(null);
        setSelected(new Set());
        setSelectMode(false);
        load(path, { silent: true });
        api.storage().then(setStorage).catch(() => {});
      },
    });
  };

  /* 复制 / 移动：先弹目录选择器，再执行 */
  const requestTransfer = (mode, entries) => {
    const list = (entries || []).filter(Boolean);
    if (!list.length) return;
    setTransfer({ mode, entries: list });
  };

  const runTransfer = async (target) => {
    if (!transfer) return;
    const list = transfer.entries;
    const paths = list.map((entry) => entry.path);
    if (transfer.mode === 'move') {
      const result = await api.move(paths, target);
      if (result.skipped) {
        toast('这些项目已经在目标文件夹里了', 'info');
      } else {
        toast('已在后台开始移动', 'success');
        setDismissedTasks(false);
      }
    } else {
      await api.copy(paths, target);
      toast(`已在后台开始复制 ${list.length} 项`, 'success');
      setDismissedTasks(false);
    }
    setSelected(new Set());
    setSelectMode(false);
    setFocused(null);
    anchorRef.current = null;
    load(path, { silent: true });
    api.storage().then(setStorage).catch(() => {});
  };

  const doMove = (entries) => requestTransfer('move', entries);
  const doCopyMany = (entries) => requestTransfer('copy', entries);
  const doCopy = (entry) => requestTransfer('copy', [entry]);

  const doExtract = async (entry, sameFolder) => {
    try {
      await api.extract(entry.path, sameFolder);
      toast('已在服务器上开始解压', 'success');
      setDismissedTasks(false);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const doCompress = async (entries) => {
    const list = entries.filter(Boolean);
    if (!list.length) return;
    const defaultName =
      list.length === 1 ? `${list[0].name.replace(/\.[^.]+$/, '') || '归档'}.zip` : '归档.zip';
    setDialog({
      type: 'compress',
      title: '压缩为 ZIP',
      label: '压缩包名称',
      value: defaultName,
      hint: '压缩在服务器上完成，无需下载后再上传',
      confirmText: '开始压缩',
      onSubmit: async (value) => {
        const name = value.trim() || defaultName;
        await api.compress(list.map((entry) => entry.path), { path, name });
        toast('已开始压缩', 'success');
        setDismissedTasks(false);
      },
    });
  };

  const doDownload = (entry) => {
    const anchor = document.createElement('a');
    anchor.href = urls.download(entry.path);
    anchor.download = entry.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  /* ---------------- 菜单项 ---------------- */

  const buildFileMenu = (entry) => {
    const items = [];
    if (entry.isDir) {
      items.push({ label: '打开', icon: <ChevronRight size={15} />, onClick: () => openEntry(entry) });
    } else if (PREVIEWABLE.has(entry.kind)) {
      items.push({ label: '预览', icon: <Info size={15} />, onClick: () => setPreview(entry) });
    }
    if (!entry.isDir) {
      items.push({ label: '下载', icon: <Download size={15} />, onClick: () => doDownload(entry) });
    }
    if (entry.archive) {
      items.push({
        label: '解压到当前文件夹',
        icon: <Archive size={15} />,
        onClick: () => doExtract(entry, true),
      });
      items.push({
        label: '解压到同名文件夹',
        icon: <Archive size={15} />,
        onClick: () => doExtract(entry, false),
      });
    }
    items.push({
      label: '压缩为 ZIP',
      icon: <Archive size={15} />,
      onClick: () => doCompress([entry]),
    });
    items.push({ sep: true });
    items.push({ label: '重命名', icon: <Pencil size={15} />, onClick: () => doRename(entry) });
    items.push({ label: '移动到…', icon: <Move size={15} />, onClick: () => doMove([entry]) });
    items.push({ label: '复制到…', icon: <Copy size={15} />, onClick: () => doCopy(entry) });
    if (!selectMode) {
      items.push({ sep: true });
      items.push({ label: '多选…', icon: <Check size={15} />, onClick: () => enterSelectMode(entry) });
    }
    items.push({ sep: true });
    items.push({
      label: '删除',
      icon: <Trash size={15} />,
      destructive: true,
      onClick: () => doDelete([entry]),
    });
    return items;
  };

  const buildBlankMenu = () => [
    { label: '新建文件夹', icon: <FolderPlus size={15} />, onClick: doMkdir },
    { label: '上传文件', icon: <Upload size={15} />, onClick: pickFiles },
    { label: '上传文件夹', icon: <Upload size={15} />, onClick: pickFolder },
    { sep: true },
    selectMode
      ? { label: '退出多选', icon: <Close size={15} />, onClick: exitSelectMode }
      : { label: '多选…', icon: <Check size={15} />, onClick: () => enterSelectMode() },
    { label: '刷新', icon: <Refresh size={15} />, onClick: () => load(path, { silent: true }) },
    { label: '设置', icon: <SettingsIcon size={15} />, onClick: () => setSettingsOpen(true) },
  ];

  const openMenuFor = (entry, event) => {
    if (!event) return;
    const x = event.clientX ?? event.pageX ?? 0;
    const y = event.clientY ?? event.pageY ?? 0;
    if (isMobile) {
      setSheetEntry(entry);
      return;
    }
    setMenu({ x, y, items: buildFileMenu(entry) });
  };

  const entries = searchResult ? searchResult.entries : data.entries;
  const showEmpty = !loading && entries.length === 0;

  const pullStyle =
    pullDistance > 0
      ? {
          transform: `translateY(${pullDistance}px)`,
          transition: 'none',
        }
      : { transform: 'translateY(0)', transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)' };

  return (
    <div className="shell">
      {/* ---------------- 侧栏 ---------------- */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Cloud size={18} />
          </div>
          <div className="brand-name">{site?.name || 'FileNest'}</div>
        </div>

        <button
          type="button"
          className={`nav-item${path === '/' ? ' active' : ''}`}
          onClick={() => navigate('/')}
        >
          <Cloud size={17} />
          我的文件
        </button>
        <button type="button" className="nav-item" onClick={() => navigate(parentOf(path))}>
          <ArrowUp size={17} />
          上级目录
        </button>
        <button
          type="button"
          className="nav-item"
          onClick={() => {
            if (isMobile) {
              setSearchOpen(true);
              return;
            }
            // 桌面端搜索框常驻顶栏：聚焦并把光标定位进去，避免点了没反应
            if (searchInputRef.current) {
              setSearchOpen(true);
              searchInputRef.current.focus();
              searchInputRef.current.select();
            }
          }}
        >
          <Search size={17} />
          搜索
        </button>

        <div className="nav-group-label">操作</div>
        <button type="button" className="nav-item" onClick={pickFiles}>
          <Upload size={17} />
          上传文件
        </button>
        <button type="button" className="nav-item" onClick={doMkdir}>
          <FolderPlus size={17} />
          新建文件夹
        </button>

        <div className="sidebar-footer">
          {storage ? (
            <div className="storage-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-2)' }}>
                <Archive size={13} />
                存储空间
              </div>
              <div className="storage-bar">
                <div
                  className="storage-fill"
                  style={{ width: `${Math.min(100, (storage.used / (storage.total || 1)) * 100)}%` }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                已用 {storage.usedLabel} / {storage.totalLabel}
              </div>
            </div>
          ) : null}

          <button type="button" className="nav-item" onClick={() => setSettingsOpen(true)}>
            <UserIcon size={17} />
            {user?.username}
            {user?.totpEnabled ? <span className="count">2FA</span> : null}
          </button>
          <button type="button" className="nav-item" onClick={onLogout}>
            <LogOut size={17} />
            退出登录
          </button>

          <div
            style={{
              padding: '8px 12px 0',
              fontSize: 11,
              color: 'var(--text-3)',
              opacity: 0.75,
              letterSpacing: '0.02em',
            }}
          >
            {site?.version ? `v${site.version}` : ''}
          </div>
        </div>
      </aside>

      {/* ---------------- 主区 ---------------- */}
      <div
        className="main"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="topbar">
          {isMobile ? (
            path !== '/' && !searchOpen ? (
              <button type="button" className="icon-btn" onClick={() => navigate(parentOf(path))}>
                <ArrowLeft size={19} />
              </button>
            ) : null
          ) : null}

          {isMobile && searchOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div className="search-field" style={{ flex: 1, width: 'auto' }}>
                <Search size={15} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />
                <input
                  autoFocus
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="在当前目录中搜索…"
                />
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setSearchOpen(false);
                  setKeyword('');
                  setSearchResult(null);
                }}
              >
                <Close size={17} />
              </button>
            </div>
          ) : (
            <>
              <div className="crumbs">
                {data.breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={crumb.path}>
                    {index > 0 ? (
                      <span className="crumb-sep">
                        <ChevronRight size={13} />
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={`crumb${index === data.breadcrumbs.length - 1 ? ' current' : ''}`}
                      onClick={() => navigate(crumb.path)}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {!isMobile ? (
                <div className="search-field">
                  <Search size={15} style={{ color: 'var(--text-3)', flex: '0 0 auto' }} />
                  <input
                    ref={searchInputRef}
                    value={keyword}
                    onChange={(event) => {
                      setKeyword(event.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="搜索"
                  />
                </div>
              ) : (
                <button type="button" className="icon-btn" onClick={() => setSearchOpen(true)}>
                  <Search size={19} />
                </button>
              )}

              <div className="segmented">
                <button
                  type="button"
                  className={view === 'grid' ? 'on' : ''}
                  onClick={() => {
                    setView('grid');
                    localStorage.setItem(VIEW_KEY, 'grid');
                  }}
                  title="网格视图"
                >
                  <Grid size={15} />
                </button>
                <button
                  type="button"
                  className={view === 'list' ? 'on' : ''}
                  onClick={() => {
                    setView('list');
                    localStorage.setItem(VIEW_KEY, 'list');
                  }}
                  title="列表视图"
                >
                  <ListIcon size={15} />
                </button>
              </div>

              {entries.length > 0 ? (
                <button
                  type="button"
                  className={isMobile ? 'icon-btn' : 'btn'}
                  onClick={() => (selectMode ? exitSelectMode() : enterSelectMode())}
                  title={selectMode ? '退出多选' : '多选'}
                  aria-label={selectMode ? '退出多选' : '多选'}
                >
                  <Check size={isMobile ? 19 : 15} />
                  {isMobile ? null : selectMode ? '完成' : '多选'}
                </button>
              ) : null}

              {!isMobile ? (
                <>
                  <button type="button" className="btn" onClick={doMkdir}>
                    <FolderPlus size={15} />
                    新建
                  </button>
                  <button type="button" className="btn primary" onClick={pickFiles}>
                    <Upload size={15} />
                    上传
                  </button>
                </>
              ) : null}

              <button
                type="button"
                className="icon-btn"
                onClick={(event) => {
                  const items = selected.size > 0 ? buildSelectionMenu() : buildBlankMenu();
                  if (isMobile) {
                    setSheetMenu({ title: '更多操作', items });
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ x: rect.right - 210, y: rect.bottom + 6, items });
                }}
              >
                <More size={18} />
              </button>
            </>
          )}
        </div>

        <div
          ref={contentRef}
          className="content scroll-area"
          style={pullStyle}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onContextMenu={(event) => {
            if (isMobile) return;
            if (!event.target.closest?.('.card, .row')) {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, items: buildBlankMenu() });
            }
          }}
          onClick={(event) => {
            // 点空白处清空选择；但多选横幅 / 工具条内部的点击不能触发清空
            if (!event.target.closest?.('.card, .row, .selbanner, .selbar, .toolbar')) {
              setSelected(new Set());
              setFocused(null);
              anchorRef.current = null;
            }
          }}
        >
          {pullDistance > 0 || refreshing ? (
            <div
              style={{
                display: 'grid',
                placeItems: 'center',
                height: 44,
                marginTop: -44,
                opacity: Math.min(1, pullDistance / 52),
              }}
            >
              <div className={refreshing ? 'spinner' : ''}>
                {refreshing ? null : <ArrowUp size={18} style={{ transform: 'rotate(180deg)', color: 'var(--text-3)' }} />}
              </div>
            </div>
          ) : null}

          {!isMobile && (selectMode || selected.size > 0) ? (
            <div className="selbanner">
              <span className="selbanner-count">
                {selected.size > 0 ? `已选择 ${selected.size} 项` : '点选文件以多选'}
              </span>
              <button type="button" className="btn" onClick={toggleSelectAll}>
                {selected.size === entries.length && entries.length > 0 ? '全不选' : '全选'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={selected.size === 0}
                onClick={() => doMove(selectedEntries)}
              >
                移动…
              </button>
              <button
                type="button"
                className="btn"
                disabled={selected.size === 0}
                onClick={() => doCopyMany(selectedEntries)}
              >
                复制…
              </button>
              <button
                type="button"
                className="btn"
                disabled={selected.size === 0}
                onClick={() => doCompress(selectedEntries)}
              >
                压缩
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={selected.size === 0}
                onClick={() => doDelete(selectedEntries)}
              >
                删除
              </button>
              <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} onClick={exitSelectMode} title="退出多选">
                <Close size={14} />
              </button>
            </div>
          ) : null}

          {searchResult ? (
            <div className="section-title" style={{ marginBottom: 12 }}>
              搜索结果 · {searchResult.entries.length} 项{searchResult.truncated ? '（已截断）' : ''}
            </div>
          ) : null}

          {error ? (
            <div className="empty">
              <Inbox size={54} />
              <div className="empty-title">无法打开该目录</div>
              <div className="empty-sub">{error}</div>
              <button type="button" className="btn" onClick={() => load(path)} style={{ marginTop: 6 }}>
                重试
              </button>
            </div>
          ) : loading ? (
            <div className="grid">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="skeleton" style={{ height: 138 }} />
              ))}
            </div>
          ) : showEmpty ? (
            <div className="empty">
              <Inbox size={54} />
              <div className="empty-title">{searchResult ? '没有匹配的文件' : '这里还没有文件'}</div>
              <div className="empty-sub">
                {searchResult ? '换个关键词试试' : '拖拽文件到此处即可上传，或点击下方按钮'}
              </div>
              {!searchResult ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn" onClick={doMkdir}>
                    <FolderPlus size={15} />
                    新建文件夹
                  </button>
                  <button type="button" className="btn primary" onClick={pickFiles}>
                    <Upload size={15} />
                    上传文件
                  </button>
                </div>
              ) : null}
            </div>
          ) : view === 'grid' ? (
            <div className="grid">
              {entries.map((entry) => (
                <FileCard
                  key={entry.path}
                  entry={entry}
                  selected={selected.has(entry.path)}
                  focused={focused === entry.path}
                  selectMode={selectMode}
                  isMobile={isMobile}
                  onOpen={openEntry}
                  onSelect={handleSelect}
                  onMenu={openMenuFor}
                />
              ))}
            </div>
          ) : (
            <div className="rows">
              {entries.map((entry) => (
                <FileRow
                  key={entry.path}
                  entry={entry}
                  selected={selected.has(entry.path)}
                  focused={focused === entry.path}
                  selectMode={selectMode}
                  isMobile={isMobile}
                  onOpen={openEntry}
                  onSelect={handleSelect}
                  onMenu={openMenuFor}
                />
              ))}
            </div>
          )}
        </div>

        {dragging ? (
          <div className="dropzone">
            <div className="dropzone-inner">
              <ArrowUp size={30} />
              松开即可上传到「{path === '/' ? '我的文件' : path.split('/').pop()}」
            </div>
          </div>
        ) : null}

        {isMobile && !selectMode ? (
          <button type="button" className="fab" onClick={pickFiles} aria-label="上传">
            <Plus size={24} />
          </button>
        ) : null}
      </div>

      {/* ---------------- 移动端多选操作条 ---------------- */}
      {isMobile && selectMode ? (
        <nav className="selbar">
          <div className="selbar-head">
            <button type="button" className="selbar-cancel" onClick={exitSelectMode}>
              取消
            </button>
            <span className="selbar-count">{selected.size > 0 ? `已选择 ${selected.size} 项` : '请选择文件'}</span>
            <button type="button" className="selbar-all" onClick={toggleSelectAll}>
              {selected.size === entries.length && entries.length > 0 ? '全不选' : '全选'}
            </button>
          </div>
          <div className="selbar-actions">
            <button type="button" disabled={selected.size === 0} onClick={() => doMove(selectedEntries)}>
              <Move size={19} />
              移动
            </button>
            <button type="button" disabled={selected.size === 0} onClick={() => doCopyMany(selectedEntries)}>
              <Copy size={19} />
              复制
            </button>
            <button type="button" disabled={selected.size === 0} onClick={() => doCompress(selectedEntries)}>
              <Archive size={19} />
              压缩
            </button>
            <button type="button" className="danger" disabled={selected.size === 0} onClick={() => doDelete(selectedEntries)}>
              <Trash size={19} />
              删除
            </button>
          </div>
        </nav>
      ) : null}

      {/* ---------------- 移动端底栏 ---------------- */}
      {isMobile && !selectMode ? (
        <nav className="tabbar">
          <button type="button" className={`tab${path === '/' ? ' active' : ''}`} onClick={() => navigate('/')}>
            <Cloud size={19} />
            文件
          </button>
          <button type="button" className="tab" onClick={() => setSearchOpen(true)}>
            <Search size={19} />
            搜索
          </button>
          <button type="button" className="tab" onClick={doMkdir}>
            <FolderPlus size={19} />
            新建
          </button>
          <button type="button" className="tab" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={19} />
            设置
          </button>
        </nav>
      ) : null}

      {/* ---------------- 浮层 ---------------- */}
      <div className="dock">
        <TaskDock
          tasks={dismissedTasks && !activeTasks ? [] : tasks}
          onCancel={(id) => api.cancelTask(id).catch(() => {})}
          onDismiss={() => setDismissedTasks(true)}
        />
        <UploadDock
          uploads={uploads}
          onClearFinished={() => setUploads((prev) => prev.filter((item) => item.status === 'uploading'))}
          onCancel={(id) => abortMap.current.get(id)?.abort()}
        />
      </div>

      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}

      <ActionSheet
        open={Boolean(sheetEntry)}
        title={sheetEntry?.name}
        items={sheetEntry ? buildFileMenu(sheetEntry) : []}
        onClose={() => setSheetEntry(null)}
      />

      <ActionSheet
        open={Boolean(sheetMenu)}
        title={sheetMenu?.title}
        items={sheetMenu?.items || []}
        onClose={() => setSheetMenu(null)}
      />

      {preview ? (
        <Preview
          entry={preview}
          entries={entries}
          onClose={() => setPreview(null)}
          onNavigate={(next) => setPreview(next)}
        />
      ) : null}

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        site={site}
        onUserUpdate={onUserUpdate}
        onLogout={onLogout}
        theme={theme}
        setTheme={setTheme}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        description={confirm?.description}
        confirmText={confirm?.confirmText}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await confirm.onConfirm();
          } catch (err) {
            toast(err.message, 'error');
            setConfirm(null);
          }
        }}
      />

      <Modal open={Boolean(dialog)} onClose={() => setDialog(null)} width={420}>
        {dialog ? (
          <DialogForm
            dialog={dialog}
            onClose={() => setDialog(null)}
            onSubmit={async (value) => {
              try {
                await dialog.onSubmit(value);
                setDialog(null);
              } catch (err) {
                toast(err.message, 'error');
              }
            }}
          />
        ) : null}
      </Modal>

      <FolderPicker
        open={Boolean(transfer)}
        title={
          transfer
            ? transfer.mode === 'move'
              ? `移动 ${transfer.entries.length} 项到…`
              : `复制 ${transfer.entries.length} 项到…`
            : ''
        }
        confirmText={transfer?.mode === 'move' ? '移动到这里' : '复制到这里'}
        initialPath={path}
        excludePaths={
          transfer && transfer.mode === 'move'
            ? transfer.entries.filter((entry) => entry.isDir).map((entry) => entry.path)
            : []
        }
        onClose={() => setTransfer(null)}
        onConfirm={runTransfer}
      />

      <input ref={fileInput} type="file" multiple hidden onChange={onFileInput} />
      <input
        ref={dirInput}
        type="file"
        multiple
        hidden
        webkitdirectory=""
        directory=""
        onChange={onFileInput}
      />
    </div>
  );

  function buildSelectionMenu() {
    return [
      {
        label: `压缩 ${selected.size} 项为 ZIP`,
        icon: <Archive size={15} />,
        onClick: () => doCompress(selectedEntries),
      },
      { label: '移动到…', icon: <Move size={15} />, onClick: () => doMove(selectedEntries) },
      { label: `复制 ${selected.size} 项到…`, icon: <Copy size={15} />, onClick: () => doCopyMany(selectedEntries) },
      {
        label: selected.size === entries.length ? '取消全选' : `全选（${entries.length} 项）`,
        icon: <Check size={15} />,
        onClick: toggleSelectAll,
      },
      { sep: true },
      {
        label: `删除 ${selected.size} 项`,
        icon: <Trash size={15} />,
        destructive: true,
        onClick: () => doDelete(selectedEntries),
      },
      { label: '退出多选', icon: <Close size={15} />, onClick: exitSelectMode },
    ];
  }
}

/* ------------------------------------------------------------------ */
/* 输入对话框                                                          */
/* ------------------------------------------------------------------ */

function DialogForm({ dialog, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog.value || '');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    await onSubmit(value);
    setBusy(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="modal-head">
        <div className="modal-title">{dialog.title}</div>
        <button type="button" className="icon-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
          <Close size={17} />
        </button>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>{dialog.label}</label>
        <input
          className="input"
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => {
            if (dialog.type === 'rename') {
              const dot = event.target.value.lastIndexOf('.');
              event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
            }
          }}
        />
        {dialog.hint ? <div className="hint">{dialog.hint}</div> : null}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button type="submit" className="btn primary" disabled={busy || !value.trim()}>
          {busy ? <span className="spinner" /> : null}
          {dialog.confirmText}
        </button>
      </div>
    </form>
  );
}
