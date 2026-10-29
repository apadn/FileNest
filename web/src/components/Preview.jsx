import React, { useEffect, useRef, useState } from 'react';
import { api, urls } from '../api.js';
import { formatBytes } from '../utils.js';
import { ChevronLeft, ChevronRight, Close, Download, File as FileIcon } from '../icons.jsx';

const PREVIEWABLE = new Set(['image', 'video', 'audio', 'text', 'code', 'pdf']);

export default function Preview({ entry, entries, onClose, onNavigate }) {
  const [textState, setTextState] = useState({ loading: false, text: '', error: '', binary: false });
  const touchStart = useRef(null);

  const list = (entries || []).filter((item) => PREVIEWABLE.has(item.kind));
  const index = list.findIndex((item) => item.path === entry?.path);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < list.length - 1;

  useEffect(() => {
    if (!entry || (entry.kind !== 'text' && entry.kind !== 'code')) return undefined;
    let cancelled = false;
    setTextState({ loading: true, text: '', error: '', binary: false });
    api
      .text(entry.path)
      .then((data) => {
        if (cancelled) return;
        if (data.binary) setTextState({ loading: false, text: '', error: '', binary: true });
        else
          setTextState({
            loading: false,
            text: data.text,
            error: '',
            binary: false,
            truncated: data.truncated,
          });
      })
      .catch((err) => {
        if (!cancelled) setTextState({ loading: false, text: '', error: err.message, binary: false });
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasPrev) onNavigate(list[index - 1]);
      if (event.key === 'ArrowRight' && hasNext) onNavigate(list[index + 1]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasPrev, hasNext, index, list, onClose, onNavigate]);

  if (!entry) return null;

  const onTouchStart = (event) => {
    touchStart.current = event.touches[0].clientX;
  };
  const onTouchEnd = (event) => {
    if (touchStart.current == null) return;
    const delta = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < 60) return;
    if (delta > 0 && hasPrev) onNavigate(list[index - 1]);
    if (delta < 0 && hasNext) onNavigate(list[index + 1]);
  };

  return (
    <div className="viewer" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="viewer-bar">
        <button type="button" className="icon-btn" onClick={onClose} style={{ color: '#fff' }}>
          <Close size={18} />
        </button>
        <div className="viewer-title">
          {entry.name}
          <span style={{ opacity: 0.5, marginLeft: 8, fontSize: 11.5 }}>
            {formatBytes(entry.size)}
            {list.length > 1 && index >= 0 ? ` · ${index + 1}/${list.length}` : ''}
          </span>
        </div>
        <a
          className="icon-btn"
          href={urls.download(entry.path)}
          style={{ color: '#fff' }}
          title="下载"
          download
        >
          <Download size={17} />
        </a>
      </div>

      <div className="viewer-body">
        {entry.kind === 'image' ? (
          <img src={urls.raw(entry.path)} alt={entry.name} />
        ) : entry.kind === 'video' ? (
          <video src={urls.raw(entry.path)} controls autoPlay playsInline preload="metadata" />
        ) : entry.kind === 'audio' ? (
          <div style={{ width: 'min(100%, 460px)', textAlign: 'center' }}>
            <div
              style={{
                width: 108,
                height: 108,
                borderRadius: 26,
                margin: '0 auto 22px',
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(150deg,#ff375f,#bf0a2c)',
              }}
            >
              <FileIcon size={40} />
            </div>
            <audio src={urls.raw(entry.path)} controls autoPlay style={{ width: '100%' }} />
          </div>
        ) : entry.kind === 'pdf' ? (
          <iframe
            src={urls.raw(entry.path)}
            title={entry.name}
            style={{ width: 'min(100%, 960px)', height: '100%', border: 0, borderRadius: 12, background: '#fff' }}
          />
        ) : entry.kind === 'text' || entry.kind === 'code' ? (
          textState.loading ? (
            <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
          ) : textState.binary ? (
            <div style={{ textAlign: 'center', opacity: 0.7, fontSize: 13.5 }}>
              该文件为二进制内容，无法预览
              <div style={{ marginTop: 14 }}>
                <a className="btn primary" href={urls.download(entry.path)} download>
                  下载文件
                </a>
              </div>
            </div>
          ) : textState.error ? (
            <div style={{ color: '#ff6b6b', fontSize: 13.5 }}>{textState.error}</div>
          ) : (
            <pre className="viewer-pre scroll-area">
              {textState.text}
              {textState.truncated ? '\n\n… 文件较大，仅显示前部分内容' : ''}
            </pre>
          )
        ) : (
          <div style={{ textAlign: 'center', opacity: 0.75, fontSize: 13.5 }}>
            暂不支持预览此类型文件
            <div style={{ marginTop: 14 }}>
              <a className="btn primary" href={urls.download(entry.path)} download>
                下载文件
              </a>
            </div>
          </div>
        )}
      </div>

      {hasPrev ? (
        <button
          type="button"
          className="viewer-nav prev"
          onClick={() => onNavigate(list[index - 1])}
          aria-label="上一个"
        >
          <ChevronLeft size={20} />
        </button>
      ) : null}
      {hasNext ? (
        <button
          type="button"
          className="viewer-nav next"
          onClick={() => onNavigate(list[index + 1])}
          aria-label="下一个"
        >
          <ChevronRight size={20} />
        </button>
      ) : null}
    </div>
  );
}
