import React, { useState } from 'react';
import { formatBytes } from '../utils.js';
import { Close, Check, ArrowUp, Archive, Refresh } from '../icons.jsx';

function ProgressBar({ value, status }) {
  const indeterminate = value == null && status === 'running';
  return (
    <div className="progress">
      <div
        className={`progress-fill${status === 'done' ? ' done' : ''}${status === 'error' ? ' failed' : ''}${
          indeterminate ? ' indeterminate' : ''
        }`}
        style={{ width: `${Math.round((value || 0) * 100)}%` }}
      />
    </div>
  );
}

export function UploadDock({ uploads, onClearFinished, onCancel }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!uploads.length) return null;

  const running = uploads.filter((u) => u.status === 'uploading');
  const finished = uploads.length - running.length;

  return (
    <div className="panel-card">
      <div className="panel-head">
        <ArrowUp size={15} />
        <span>
          {running.length > 0
            ? `正在上传 ${running.length} 个文件`
            : `上传完成 ${finished} 个文件`}
        </span>
        <button
          type="button"
          className="icon-btn"
          style={{ marginLeft: 'auto', width: 24, height: 24 }}
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? '展开' : '收起'}
        >
          <Refresh size={13} style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }} />
        </button>
        {running.length === 0 ? (
          <button
            type="button"
            className="icon-btn"
            style={{ width: 24, height: 24 }}
            onClick={onClearFinished}
            title="清除列表"
          >
            <Close size={13} />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <div className="panel-body scroll-area">
          {uploads.map((item) => (
            <div className="transfer" key={item.id}>
              <div className="transfer-main">
                <div className="transfer-name" title={item.name}>
                  {item.name}
                </div>
                <div className="transfer-sub">
                  {item.status === 'error'
                    ? item.error || '上传失败'
                    : item.status === 'done'
                      ? `${formatBytes(item.size)} · 已完成`
                      : `${formatBytes(item.loaded || 0)} / ${formatBytes(item.size)}`}
                </div>
                <ProgressBar
                  value={item.status === 'done' ? 1 : item.progress}
                  status={item.status}
                />
              </div>
              {item.status === 'uploading' ? (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => onCancel(item.id)}
                  title="取消"
                >
                  <Close size={13} />
                </button>
              ) : item.status === 'done' ? (
                <Check size={15} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TaskDock({ tasks, onCancel, onDismiss }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!tasks.length) return null;

  return (
    <div className="panel-card">
      <div className="panel-head">
        <Archive size={15} />
        <span>后台任务</span>
        <span className="pill run" style={{ marginLeft: 6 }}>
          {tasks.filter((t) => t.status === 'running' || t.status === 'queued').length || 0} 进行中
        </span>
        <button
          type="button"
          className="icon-btn"
          style={{ marginLeft: 'auto', width: 24, height: 24 }}
          onClick={() => setCollapsed((v) => !v)}
        >
          <Refresh size={13} style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }} />
        </button>
        {tasks.every((t) => t.status === 'done' || t.status === 'error' || t.status === 'cancelled') ? (
          <button
            type="button"
            className="icon-btn"
            style={{ width: 24, height: 24 }}
            onClick={onDismiss}
            title="关闭"
          >
            <Close size={13} />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <div className="panel-body scroll-area">
          {tasks.map((task) => (
            <div className="transfer" key={task.id}>
              <div className="transfer-main">
                <div className="transfer-name" title={task.label}>
                  {task.label}
                </div>
                <div className="transfer-sub">
                  {task.status === 'running'
                    ? task.current || task.message || '处理中…'
                    : task.status === 'queued'
                      ? '排队中…'
                      : task.status === 'done'
                        ? `已完成 · ${task.result?.files ?? 0} ${
                            task.type === 'move' ? '个项目' : '个文件'
                          }`
                        : task.status === 'cancelled'
                          ? '已取消'
                          : task.error || '失败'}
                </div>
                <ProgressBar
                  value={task.status === 'done' ? 1 : task.progress / 100}
                  status={
                    task.status === 'done'
                      ? 'done'
                      : task.status === 'error'
                        ? 'error'
                        : task.status === 'cancelled'
                          ? 'error'
                          : 'running'
                  }
                />
              </div>
              {task.status === 'running' || task.status === 'queued' ? (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => onCancel(task.id)}
                  title="取消任务"
                >
                  <Close size={13} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
