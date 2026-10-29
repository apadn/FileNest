import { useCallback, useEffect, useRef, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 860px)');
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

const pad = (n) => String(n).padStart(2, '0');

export function formatTime(ms) {
  if (!ms) return '—';
  const date = new Date(ms);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (sameDay) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (isYesterday) return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function kindLabel(kind) {
  return (
    {
      folder: '文件夹',
      image: '图片',
      video: '视频',
      audio: '音频',
      archive: '压缩包',
      pdf: 'PDF',
      doc: '文档',
      code: '代码',
      text: '文本',
      file: '文件',
    }[kind] || '文件'
  );
}

/** 长按手势（移动端弹出操作表） */
export function useLongPress(callback, delay = 460) {
  const timer = useRef(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (event) => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        callback(event);
      }, delay);
    },
    [callback, clear, delay]
  );

  return {
    onTouchStart,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onTouchMove: clear,
    consumeLongPress: () => fired.current,
  };
}

/** 点击外部关闭 */
export function useClickOutside(onOutside, active = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside(event);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [active, onOutside]);
  return ref;
}

export function useTheme() {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('filenest.theme') || 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
      document.documentElement.setAttribute('data-theme', resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#000000' : '#f5f5f7');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  const update = useCallback((next) => {
    setMode(next);
    try {
      localStorage.setItem('filenest.theme', next);
    } catch {
      /* ignore */
    }
  }, []);

  return [mode, update];
}

export function throttle(fn, wait) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}
