import React, { useEffect, useRef, useState } from 'react';
import { api, setToken, setCachedUser, cachedUser, setUnauthorizedHandler } from './api.js';
import { useTheme } from './utils.js';
import Login from './views/Login.jsx';
import Browser from './views/Browser.jsx';
import { Toaster, toast } from './components/Common.jsx';

/* 空闲自动登出：无任何交互 N 分钟后退出登录 */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export default function App() {
  const [user, setUser] = useState(cachedUser());
  const [site, setSite] = useState({ name: 'FileNest' });
  const [booting, setBooting] = useState(true);
  const [theme, setTheme] = useTheme();
  const idleTimerRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;

  const doLogout = () => {
    if (!userRef.current) return;
    setToken(null);
    setCachedUser(null);
    setUser(null);
    toast('长时间无操作，已自动退出登录');
  };

  const resetIdleTimer = () => {
    if (!userRef.current) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
  };

  /* 监听用户活动，重置空闲计时（仅登录后生效） */
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll', 'click'];
    const onActivity = () => resetIdleTimer();
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setCachedUser(null);
      setUser(null);
    });

    let alive = true;
    (async () => {
      try {
        const cfg = await api.config();
        if (alive && cfg?.site) setSite(cfg.site);
      } catch {
        /* 使用默认站点信息 */
      }
      try {
        const data = await api.me();
        if (!alive) return;
        setUser(data.user);
        setSite(data.site);
        setCachedUser(data.user);
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleAuth = async (nextUser) => {
    setUser(nextUser);
    setCachedUser(nextUser);
    try {
      const data = await api.me();
      setSite(data.site);
      setUser(data.user);
    } catch {
      /* 忽略 */
    }
  };

  const handleLogout = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setToken(null);
    setCachedUser(null);
    setUser(null);
    toast('已退出登录');
  };

  const handleUserUpdate = (nextUser) => {
    setUser(nextUser);
    setCachedUser(nextUser);
  };

  if (booting) {
    return (
      <div className="auth-screen">
        <div className="auth-aurora" />
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', gap: 14 }}>
          <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>正在连接…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {user ? (
        <Browser
          user={user}
          site={site}
          onLogout={handleLogout}
          theme={theme}
          setTheme={setTheme}
          onUserUpdate={handleUserUpdate}
        />
      ) : (
        <Login onAuth={handleAuth} site={site} />
      )}
      <Toaster />
    </>
  );
}
