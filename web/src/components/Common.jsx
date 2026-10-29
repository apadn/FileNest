import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Close, Check } from '../icons.jsx';

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

let seq = 0;
let items = [];
const subscribers = new Set();

function publish() {
  const snapshot = [...items];
  subscribers.forEach((fn) => fn(snapshot));
}

export function toast(message, type = 'info', duration = 2800) {
  const id = ++seq;
  items.push({ id, message, type });
  publish();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    publish();
  }, duration);
}

export function Toaster() {
  const [list, setList] = useState([]);
  useEffect(() => {
    subscribers.add(setList);
    return () => subscribers.delete(setList);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((item) => (
        <div key={item.id} className={`toast${item.type === 'error' ? ' error' : ''}`}>
          {item.type === 'success' ? <Check size={15} /> : null}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, children, width = 420, dismissable = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && dismissable) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <>
      <div className="overlay" onClick={dismissable ? onClose : undefined} />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 115,
          display: 'grid',
          placeItems: 'center',
          padding: 16,
          pointerEvents: 'none',
        }}
      >
        <div className="modal-card" style={{ maxWidth: width, pointerEvents: 'auto' }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 右键菜单                                                            */
/* ------------------------------------------------------------------ */

export function ContextMenu({ x, y, items: menuItems, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;
    if (left + rect.width + margin > window.innerWidth) left = window.innerWidth - rect.width - margin;
    if (top + rect.height + margin > window.innerHeight) top = window.innerHeight - rect.height - margin;
    setPos({ left: Math.max(margin, left), top: Math.max(margin, top), ready: true });
  }, [x, y]);

  useEffect(() => {
    // 注意：必须用捕获阶段监听窗口，才能点到菜单外就立即收起。
    // 但捕获阶段先于目标元素触发，所以必须自己判断「点在菜单里」——
    // 靠子元素的 stopPropagation 是拦不住的，否则菜单会在 click 之前就被卸载。
    const onPointerDown = (event) => {
      const el = ref.current;
      if (el && event.target instanceof Node && el.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="menu"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      role="menu"
    >
      {menuItems.map((item, index) => {
        if (!item || item.sep) return <div key={`sep-${index}`} className="menu-sep" />;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`menu-item${item.destructive ? ' destructive' : ''}`}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 移动端操作表                                                        */
/* ------------------------------------------------------------------ */

export function ActionSheet({ open, title, items: sheetItems, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-wrap">
      <div className="overlay" onClick={onClose} style={{ zIndex: 129 }} />
      <div className="sheet" style={{ zIndex: 130, position: 'relative' }}>
        <div className="sheet-grip" />
        {title ? <div className="sheet-title">{title}</div> : null}
        {sheetItems.map((item, index) => {
          if (!item || item.sep) return <div key={`sep-${index}`} className="menu-sep" />;
          return (
            <button
              key={item.label}
              type="button"
              className={`sheet-item${item.destructive ? ' destructive' : ''}`}
              onClick={() => {
                onClose();
                item.onClick?.();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" className="sheet-item sheet-cancel" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 确认框                                                              */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={onCancel} width={400} dismissable={!busy}>
      <div className="modal-head">
        <div className="modal-title">{title}</div>
        <button type="button" className="icon-btn" onClick={onCancel} style={{ marginLeft: 'auto' }}>
          <Close size={16} />
        </button>
      </div>
      {description ? <div className="modal-desc">{description}</div> : null}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {cancelText}
        </button>
        <button
          type="button"
          className={`btn${danger ? ' danger solid' : ' primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : null}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
