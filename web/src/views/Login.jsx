import React, { useState } from 'react';
import { api, setToken, setCachedUser } from '../api.js';
import { Cloud, Eye, EyeOff, Lock, User, ArrowLeft, Shield } from '../icons.jsx';

export default function Login({ onAuth, site }) {
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState('credentials'); // credentials | totp
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') {
        const data = await api.register(username.trim(), password);
        setToken(data.token);
        setCachedUser(data.user);
        onAuth(data.user);
        return;
      }
      const data = await api.login(username.trim(), password, step === 'totp' ? code.trim() : undefined);
      if (data.need2fa) {
        setStep('totp');
        setCode('');
        return;
      }
      setToken(data.token);
      setCachedUser(data.user);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
      if (err.payload?.need2fa) setStep('totp');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setStep('credentials');
    setCode('');
    setError('');
  };

  return (
    <div className="auth-screen">
      <div className="auth-aurora" />
      <div className="auth-panel">
        <div className="auth-logo">
          <Cloud size={27} />
        </div>

        {step === 'totp' ? (
          <>
            <h1 className="auth-title">两步验证</h1>
            <p className="auth-sub">请输入身份验证器 App 中显示的 6 位动态验证码</p>
            <form onSubmit={submit}>
              <div className="field">
                <input
                  className="input code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoFocus
                  autoComplete="one-time-code"
                />
                <div className="hint">验证码每 30 秒刷新一次</div>
              </div>
              {error ? <div className="alert error">{error}</div> : null}
              <button type="submit" className="btn primary block" disabled={busy || code.length !== 6}>
                {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : null}
                验证并登录
              </button>
              <div className="auth-switch">
                <button type="button" onClick={back}>
                  返回重新输入账号
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 className="auth-title">{mode === 'login' ? '登录' : '创建账户'}</h1>
            <p className="auth-sub">
              {mode === 'login' ? `欢迎回到 ${site?.name || 'FileNest'}` : '设置你的用户名与密码'}
            </p>

            <form onSubmit={submit}>
              <div className="field">
                <div className="input-wrap">
                  <User size={17} className="input-icon" />
                  <input
                    className="input"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="用户名"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <div className="input-wrap has-action">
                  <Lock size={17} className="input-icon" />
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="密码"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error ? <div className="alert error">{error}</div> : null}

              <button
                type="submit"
                className="btn primary block"
                disabled={busy || !username || !password}
                style={{ marginTop: 6 }}
              >
                {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : null}
                {mode === 'login' ? '登录' : '创建并登录'}
              </button>
            </form>

            {mode === 'login' ? (
              site?.allowRegistration === false ? null : (
                <div className="auth-switch">
                  还没有账户？
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError('');
                      setUsername('');
                    }}
                  >
                    注册一个
                  </button>
                </div>
              )
            ) : (
              <div className="auth-switch">
                已有账户？
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setUsername('admin');
                  }}
                >
                  去登录
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {step === 'credentials' && mode === 'login' ? (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))',
            fontSize: 11.5,
            color: 'var(--text-3)',
            textAlign: 'center',
            lineHeight: 1.7,
          }}
        >
          <div>
            首次部署可用默认账户{' '}
            <button
              type="button"
              onClick={() => {
                setUsername('admin');
                setPassword('admin');
              }}
              style={{ color: 'var(--blue)', fontWeight: 600 }}
            >
              admin / admin
            </button>{' '}
            一键填入
          </div>
          <div style={{ opacity: 0.75 }}>登录后请在设置中修改默认用户名与密码，并开启两步验证</div>
          <div style={{ opacity: 0.55, fontSize: 11, marginTop: 6 }}>
            {site?.name || 'FileNest'}
            {site?.version ? ` · v${site.version}` : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
}
