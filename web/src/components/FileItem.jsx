import React, { memo } from 'react';
import { Check, KindGlyph } from '../icons.jsx';
import { formatBytes, formatTime, useLongPress } from '../utils.js';
import { urls } from '../api.js';

const THUMB_LIMIT = 24 * 1024 * 1024;

function hasThumb(entry) {
  return entry.kind === 'image' && entry.size > 0 && entry.size < THUMB_LIMIT;
}

function metaText(entry) {
  if (entry.isDir) return '文件夹';
  return formatBytes(entry.size);
}

function useItemHandlers(entry, { onOpen, onSelect, onMenu, isMobile, selectMode }) {
  const long = useLongPress((event) => {
    onMenu?.(entry, event?.touches?.[0] || event);
  }, 450);

  const handleClick = (event) => {
    if (long.consumeLongPress()) return;
    // 选择模式下：单击只切换勾选，不打开 / 不进入目录
    if (selectMode) {
      onSelect?.(entry, event);
      return;
    }
    if (isMobile) onOpen?.(entry);
    else onSelect?.(entry, event);
  };

  const handleContextMenu = (event) => {
    if (isMobile) return;
    event.preventDefault();
    onSelect?.(entry, event, true);
    onMenu?.(entry, event);
  };

  return {
    onTouchStart: long.onTouchStart,
    onTouchEnd: long.onTouchEnd,
    onTouchMove: long.onTouchMove,
    onTouchCancel: long.onTouchCancel,
    onClick: handleClick,
    onDoubleClick: isMobile || selectMode ? undefined : () => onOpen?.(entry),
    onContextMenu: handleContextMenu,
  };
}

function Tick({ selected }) {
  return (
    <span className={`tick${selected ? ' on' : ''}`} aria-hidden="true">
      {selected ? <Check size={11} strokeWidth={3.4} /> : null}
    </span>
  );
}

export const FileCard = memo(function FileCard({ entry, selected, focused, selectMode, isMobile, ...handlers }) {
  const bind = useItemHandlers(entry, { ...handlers, isMobile, selectMode });

  return (
    <div
      className={`card${selected ? ' selected' : ''}${focused ? ' focused' : ''}${selectMode ? ' selecting' : ''}`}
      {...bind}
      role="button"
      tabIndex={0}
      aria-label={entry.name}
      aria-selected={selected}
    >
      {selectMode || selected ? <Tick selected={selected} /> : null}
      <div className="card-thumb">
        {hasThumb(entry) ? (
          <img src={urls.raw(entry.path)} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <div className={`kind-icon kind-${entry.kind}`} style={{ width: 44, height: 44, borderRadius: 12 }}>
            <KindGlyph kind={entry.kind} size={22} />
          </div>
        )}
      </div>
      <div className="card-name" title={entry.name}>
        {entry.name}
      </div>
      <div className="card-meta">{metaText(entry)}</div>
    </div>
  );
});

export const FileRow = memo(function FileRow({ entry, selected, focused, selectMode, isMobile, ...handlers }) {
  const bind = useItemHandlers(entry, { ...handlers, isMobile, selectMode });

  return (
    <div
      className={`row${selected ? ' selected' : ''}${focused ? ' focused' : ''}${selectMode ? ' selecting' : ''}`}
      {...bind}
      role="button"
      tabIndex={0}
      aria-selected={selected}
    >
      {selectMode || selected ? <Tick selected={selected} /> : null}
      <div className={`row-icon kind-${entry.kind}`}>
        {hasThumb(entry) ? (
          <img src={urls.raw(entry.path)} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <KindGlyph kind={entry.kind} size={17} />
        )}
      </div>
      <div className="row-main">
        <div className="row-name" title={entry.name}>
          {entry.name}
        </div>
        <div className="row-sub">
          {metaText(entry)} · {formatTime(entry.mtime)}
        </div>
      </div>
    </div>
  );
});
