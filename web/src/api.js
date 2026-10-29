const TOKEN_KEY = 'filenest.token';
const USER_KEY = 'filenest.user';

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = 'GET', body, signal, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('无法连接服务器，请检查网络', 0, null);
  }

  if (response.status === 401) {
    const payload = await response.json().catch(() => ({}));
    if (onUnauthorized && token && !payload.need2fa) onUnauthorized();
    throw new ApiError(payload.error || '登录已失效', 401, payload);
  }

  if (raw) return response;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error || `请求失败 (${response.status})`, response.status, payload);
  return payload;
}

const q = (path) => `?path=${encodeURIComponent(path)}`;

export const api = {
  /* 认证 */
  config: () => request('/api/auth/config'),
  login: (username, password, code) =>
    request('/api/auth/login', { method: 'POST', body: { username, password, code } }),
  register: (username, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
  changeUsername: async (username, password) => {
    const data = await request('/api/auth/username', { method: 'POST', body: { username, password } });
    if (data?.token) setToken(data.token);
    return data;
  },
  setup2fa: () => request('/api/auth/2fa/setup', { method: 'POST' }),
  enable2fa: (code) => request('/api/auth/2fa/enable', { method: 'POST', body: { code } }),
  disable2fa: (payload) => request('/api/auth/2fa/disable', { method: 'POST', body: payload }),

  /* 文件 */
  list: (path) => request(`/api/files/list${q(path)}`),
  entry: (path) => request(`/api/files/entry${q(path)}`),
  mkdir: (path, name) => request('/api/files/mkdir', { method: 'POST', body: { path, name } }),
  rename: (path, name) => request('/api/files/rename', { method: 'POST', body: { path, name } }),
  remove: (paths) => request('/api/files/delete', { method: 'POST', body: { paths } }),
  move: (from, to) => request('/api/files/move', { method: 'POST', body: { from, to } }),
  copy: (from, to) => request('/api/files/copy', { method: 'POST', body: { from, to } }),
  search: (path, keyword) => request(`/api/files/search${q(path)}&q=${encodeURIComponent(keyword)}`),
  storage: () => request('/api/files/storage'),
  text: (path) => request(`/api/files/text${q(path)}`),

  /* 压缩（服务端执行） */
  extract: (path, sameFolder = false) =>
    request('/api/files/archive/extract', { method: 'POST', body: { path, sameFolder } }),
  compress: (paths, { path, name } = {}) =>
    request('/api/files/archive/compress', { method: 'POST', body: { paths, path, name } }),

  /* 任务 */
  tasks: () => request('/api/tasks'),
  cancelTask: (id) => request(`/api/tasks/${id}/cancel`, { method: 'POST' }),
};

function withToken(url) {
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export const urls = {
  download: (path) => withToken(`/api/files/download${q(path)}`),
  raw: (path) => withToken(`/api/files/raw${q(path)}`),
};

/** 带进度回调的上传（XHR 才能拿到上传进度） */
export function uploadFiles(dirPath, files, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const file of files) {
      const relative = file.webkitRelativePath || file.name;
      form.append('files', file, file.name);
      form.append('names', relative);
    }

    xhr.open('POST', `/api/files/upload${q(dirPath)}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total, event.loaded, event.total);
      };
    }
    xhr.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new ApiError(payload.error || `上传失败 (${xhr.status})`, xhr.status, payload));
    };
    xhr.onerror = () => reject(new ApiError('上传中断，请检查网络', 0, null));
    xhr.onabort = () => reject(new ApiError('上传已取消', 0, null));

    if (signal) signal.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
