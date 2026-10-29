import React, { useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from './Common.jsx';
import { Close, Shield, Lock, Check, User } from '../icons.jsx';

function Section({ title, children }) {
  return (
    <div style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--line)' }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default function Settings({ open, onClose, user, site, onUserUpdate, onLogout, theme, setTheme }) {
  const [step, setStep] = useState('idle'); // idle | setup | disable | username
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('idle');
    setSetupData(null);
    setCode('');
    setPassword('');
    setNewUsername('');
    setUsernamePassword('');
    setError('');
  };

  const close = () => {
    reset();
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  const startSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api.setup2fa();
      setSetupData(data);
      setStep('setup');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api.enable2fa(code.trim());
      onUserUpdate(data.user);
      toast('两步验证已启用', 'success');
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api.disable2fa({ password: password || undefined, code: code.trim() || undefined });
      onUserUpdate(data.user);
      toast('已关闭两步验证', 'success');
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.changePassword(password, newPassword);
      toast('密码已更新', 'success');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changeUsername = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api.changeUsername(newUsername.trim(), usernamePassword);
      onUserUpdate(data.user);
      toast('用户名已更新', 'success');
      setNewUsername('');
      setUsernamePassword('');
      setStep('idle');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} width={460}>
      <div className="modal-head">
        <div className="modal-title">设置</div>
        <button type="button" className="icon-btn" onClick={close} style={{ marginLeft: 'auto' }}>
          <Close size={17} />
        </button>
      </div>

      {error ? <div className="alert error" style={{ marginTop: 12 }}>{error}</div> : null}

      {step === 'setup' && setupData ? (
        <div style={{ marginTop: 12 }}>
          <div className="modal-desc">
            用身份验证器 App（如 1Password、Google Authenticator、微软验证器）扫描下方二维码，然后输入 6 位动态验证码完成绑定。
          </div>
          <div style={{ display: 'grid', placeItems: 'center', marginBottom: 14 }}>
            <img
              src={setupData.qr}
              alt="两步验证二维码"
              style={{ width: 190, height: 190, borderRadius: 12, background: '#fff', padding: 8 }}
            />
          </div>
          <div className="field">
            <label>手动输入密钥</label>
            <input
              className="input"
              value={setupData.secret}
              readOnly
              onFocus={(event) => event.target.select()}
              style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.06em' }}
            />
          </div>
          <div className="field">
            <label>6 位验证码</label>
            <input
              className="input code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000000"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={reset} disabled={busy}>
              返回
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={confirmSetup}
              disabled={busy || code.length !== 6}
            >
              {busy ? <span className="spinner" /> : <Check size={15} />}
              完成绑定
            </button>
          </div>
        </div>
      ) : step === 'disable' ? (
        <div style={{ marginTop: 12 }}>
          <div className="modal-desc">关闭两步验证后，登录将只需密码。请输入当前密码或任意一个有效动态验证码确认。</div>
          <div className="field">
            <label>当前密码</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="field">
            <label>或动态验证码</label>
            <input
              className="input code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={reset} disabled={busy}>
              返回
            </button>
            <button
              type="button"
              className="btn danger solid"
              onClick={confirmDisable}
              disabled={busy || (!password && code.length !== 6)}
            >
              关闭两步验证
            </button>
          </div>
        </div>
      ) : step === 'username' ? (
        <div style={{ marginTop: 12 }}>
          <div className="modal-desc">
            「admin」只是首次启动的初始用户名，改掉后别人就没法靠猜用户名来试探登录。修改后请用新用户名登录。
          </div>
          <div className="field">
            <label>新用户名</label>
            <input
              className="input"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              placeholder="3-32 位字母、数字、下划线、点或短横线"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>当前密码</label>
            <input
              className="input"
              type="password"
              value={usernamePassword}
              onChange={(event) => setUsernamePassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={reset} disabled={busy}>
              返回
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={changeUsername}
              disabled={busy || !newUsername.trim() || !usernamePassword}
            >
              {busy ? <span className="spinner" /> : <Check size={15} />}
              保存用户名
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <Section title="账户">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--blue-soft)',
                  color: 'var(--blue)',
                }}
              >
                <User size={22} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{user?.username}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {user?.role === 'admin' ? '管理员' : '普通用户'} · {site?.name || 'FileNest'}
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  reset();
                  setStep('username');
                }}
              >
                改用户名
              </button>
            </div>
          </Section>

          <Section title="两步验证">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Shield size={20} style={{ color: user?.totpEnabled ? 'var(--green)' : 'var(--text-3)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 550 }}>
                  {user?.totpEnabled ? '已启用' : '未启用'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {user?.totpEnabled
                    ? '登录时需要输入身份验证器中的动态验证码'
                    : '为账户增加一道动态验证码保护'}
                </div>
              </div>
              {user?.totpEnabled ? (
                <button type="button" className="btn" onClick={() => setStep('disable')}>
                  关闭
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={startSetup} disabled={busy}>
                  {busy ? <span className="spinner" /> : null}
                  启用
                </button>
              )}
            </div>
          </Section>

          <Section title="修改密码">
            <div className="field">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="当前密码"
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="新密码（至少 4 位）"
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="确认新密码"
                autoComplete="new-password"
              />
            </div>
            <button
              type="button"
              className="btn"
              onClick={changePassword}
              disabled={busy || !password || newPassword.length < 4}
            >
              <Lock size={14} />
              更新密码
            </button>
          </Section>

          <Section title="外观">
            <div className="segmented" style={{ width: '100%' }}>
              {[
                ['auto', '跟随系统'],
                ['light', '浅色'],
                ['dark', '深色'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={theme === value ? 'on' : ''}
                  style={{ flex: 1, width: 'auto', fontSize: 12.5, fontWeight: 550 }}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          <button type="button" className="btn danger block" onClick={onLogout}>
            退出登录
          </button>

          <div
            style={{
              marginTop: 18,
              textAlign: 'center',
              fontSize: 11.5,
              color: 'var(--text-3)',
              letterSpacing: '0.02em',
            }}
          >
            {site?.name || 'FileNest'}
            {site?.version ? ` · v${site.version}` : ''}
          </div>
        </div>
      )}
    </Modal>
  );
}
