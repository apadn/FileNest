<img src="web/public/icon-192.png" width="92" height="92" alt="FileNest" />

# FileNest · 苹果风私有文件管理器

[![License: MIT](https://img.shields.io/badge/License-MIT-0071e3.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-linux%2Famd64-2496ED?logo=docker&logoColor=white)](#镜像平台)
[![Node](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=node.js&logoColor=white)](package.json)

一个自托管的 Web 文件管理器：**服务端解压/压缩**（文件不经过浏览器，零带宽浪费）、**响应式苹果风界面**（桌面 + 移动端）、**账号登录 + TOTP 两步验证**，一条 `docker run` 即可运行。

---

## 特性

| 能力 | 说明 |
| --- | --- |
| 服务器端解压 / 压缩 | 点击"解压"后由主机 CPU/磁盘直接处理，前端只轮询进度。**不会**先把压缩包下载到手机再上传回服务器 |
| 服务器端复制 / 移动 | 同样只发指令，由主机 `rename` / 流式复制完成，大目录自动转为后台任务并显示进度 |
| 现代交互 | 桌面：右键菜单、双击打开、拖拽上传、单击高亮、Cmd/Ctrl 或「多选」开关进入多选、Shift 连选；移动端：长按弹出操作表、下拉刷新、底部 Tab、FAB |
| 选择模式 | 桌面端单击仅高亮（不会误入多选），按顶栏「多选」开关或按住 Cmd/Ctrl 点选才进入多选；移动端长按文件后选「多选…」进入。选中后桌面显示横幅、移动端升起底部操作条，可全选/全不选、批量移动、复制、压缩、删除 |
| 目标目录选择器 | 复制/移动不再手填路径：弹出目录树逐级浏览，底部显示当前路径，可就地新建文件夹；移动时源目录及子目录自动置灰，避免移入自身 |
| 空闲自动登出 | 登录后 10 分钟无任何操作（鼠标/键盘/滚轮/触摸）自动退出登录，适合挂在公网的实例 |
| 苹果风设计 | SF 字体栈、毛玻璃、弹簧缓动、跟随系统的深浅色，网格/列表双视图 |
| 账号体系 | 登录、bcrypt 密码哈希、JWT 会话、登录限速；默认 `admin / admin`。**单用户设计，自助注册默认关闭**；用户名可在设置里改成任意名字，不锁定为 admin，避免被人猜到登录名 |
| 两步验证 | 标准 TOTP（Google Authenticator、1Password、微软验证器等），绑定二维码 |
| 预览 | 图片、视频（支持 Range 拖动进度）、音频、文本/代码、PDF |
| 其他 | 递归搜索、重命名、移动、复制、新建目录、存储用量、断点续传下载 |

支持解压：`zip` / `tar` / `tar.gz` / `tgz`（zip 内含 GBK 文件名会自动识别，不乱码）

---

## 快速开始

### Docker Compose（推荐）

```bash
cd filenest
docker compose up -d --build
```

打开 http://localhost:8080，用 `admin / admin` 登录。

### 直接用 Docker

```bash
docker build -t filenest:latest .
docker run -d --name filenest \
  -p 8080:8080 \
  -v $(pwd)/data:/data \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  filenest:latest
```

### 镜像平台

本项目的发布镜像为 **`linux/amd64`（x86_64）**，适用于：

- Intel / AMD 的 PC、家用服务器、软路由
- 群晖 / 威联通等 **x86 机型**（DS918+、DS923+ 这类 Celeron/J4125/Ryzen 机型）
- 阿里云 / 腾讯云 / AWS 等 x86 云主机

验证镜像架构：

```bash
docker inspect <你的用户名>/filenest:1.3.0 --format '{{.Os}}/{{.Architecture}}'
# linux/amd64

docker run --rm --entrypoint sh <你的用户名>/filenest:1.3.0 -c 'uname -m'
# x86_64
```

> 如果你的 NAS 是 **ARM 机型**（DS223、树莓派、M 系列 Mac），amd64 镜像无法运行，会报 `exec format error` 或 `no matching manifest`。这种情况需要 arm64 镜像，见下方多架构构建。

---

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `DATA_DIR` | `/data` | 账号、JWT 密钥等应用数据 |
| `FILES_DIR` | `$DATA_DIR/files` | 文件根目录 |
| `SITE_NAME` | `FileNest` | 页面标题 |
| `ALLOW_REGISTRATION` | `false` | 是否开放自助注册。**本站为单用户设计**：注册出来的账户只有 `user` 角色，能登录但没有文件读写权限 |
| `MAX_UPLOAD_MB` | `2048` | 单文件上传上限，`0` 表示不限制 |
| `MAX_EXTRACT_MB` | `102400` | 单个压缩包解压后的总体积上限（100 GB），防 zip 炸弹 |
| `MAX_EXTRACT_ENTRIES` | `200000` | 单个压缩包解压后的条目数上限 |
| `MAX_CONCURRENT_TASKS` | `2` | 后台解压/压缩并发数 |
| `TRUST_PROXY` | `false` | 只有部署在 Nginx/Caddy 之后才设为 `true`，否则客户端可用 `X-Forwarded-For` 伪造来源绕过登录限速 |
| `TOKEN_TTL` | `7d` | 登录有效期（cookie 与 JWT 同步） |
| `PUID` / `PGID` | `1000` | 容器运行用户（避免挂载目录权限问题） |
| `TZ` | `Asia/Shanghai` | 时区 |

---

## 安全建议

1. **首次登录后立刻修改 `admin` 密码**（设置 → 修改密码）。
2. **开启两步验证**（设置 → 两步验证 → 启用，扫码即可）。
3. **把用户名也改掉**（设置 → 改用户名），避免别人直接猜 `admin`。
4. 自助注册默认已关闭；确需临时开放，用 `ALLOW_REGISTRATION=true` 启动，用完即关。
5. 通过公网访问请置于 **HTTPS 反向代理**之后（Nginx / Caddy / Traefik），并同时设置 `TRUST_PROXY=true`，让限速取到真实 IP。
6. 登录接口有频率限制（10 分钟内 8 次失败后暂时锁定），改密码/改用户名/关 2FA 也有独立限速。

### 已做的安全加固（v1.3.0）

| 项 | 处理方式 |
| --- | --- |
| 越权读写文件 | 文件与任务接口要求 `admin` 角色；注册默认关闭 |
| `/raw` 同源执行上传文件（存储型 XSS） | 只有图片/音视频/PDF 内联，SVG 内联但附加 `CSP: sandbox`，HTML/XML/JS 一律 `attachment` + `Content-Type: application/octet-stream` |
| 缺少安全响应头 | 全局 `nosniff` / `X-Frame-Options` / `Referrer-Policy` / 基础 CSP |
| 登录限速被 `X-Forwarded-For` 绕过 | `TRUST_PROXY` 默认 `false`，默认只认真实 socket 地址 |
| 用户名枚举（响应时间差 40 倍） | 用户不存在时也执行一次等价 bcrypt 比对 |
| 目录内软链接越界读宿主机文件 | `safeResolve` 在词法校验外增加 `realpath` 校验，越界返回 403 |
| zip 炸弹 / 上传打满磁盘 | 解压总体积与条目数上限、单文件上传上限（默认 2 GB） |
| 用户库写失败后彻底瘫痪 | 写链隔离单次失败，落盘失败回滚内存状态 |
| query 参数携带 token | 仅 `GET /raw`、`GET /download` 接受 `?token=`，其余路径必须走请求头或 httpOnly cookie |
| 5xx 回传内部错误信息 | 500 统一返回"服务器内部错误"，详情只写入服务端日志 |

---

## 应用图标

源文件在 `web/public/`（构建时自动进镜像），同时单独导出到 `release/icons/` 便于取用：

| 文件 | 用途 |
| --- | --- |
| `icon.svg` | 主图标（1024 矢量），favicon 与现代浏览器 |
| `icon-small.svg` | 小尺寸专用版（去掉纸张、图形放大、圆角略小） |
| `icon-1024.png` | 位图母版 |
| `icon-512.png` / `icon-192.png` | PWA manifest、Docker Hub 仓库 Logo |
| `icon-180.png` / `apple-touch-icon.png` | iOS「添加到主屏幕」 |
| `icon-64.png` / `icon-32.png` | 浏览器标签页 |
| `manifest.webmanifest` | PWA 清单（standalone、主题色、图标声明） |

设计：苹果风 squircle + 蓝→深蓝渐变 + 白色文件夹与探出的纸张，主色取自界面变量 `--blue: #0071e3`。

---

## 架构

```
浏览器（React + Vite）
   │  HTTP / JSON，仅传指令与进度
   ▼
Node.js (Express)  ──►  任务队列（并发上限可配）
   │                        ├─ yauzl    流式解压 zip
   │                        ├─ node-tar 流式解压 tar/tgz
   │                        ├─ archiver 流式打包 zip
   │                        └─ fs.rename / 流式复制  移动与复制
   ▼
宿主机文件系统（Docker volume / bind mount）
```

**所有重 IO 操作都在主机侧完成**：解压、压缩、复制、移动统一走任务队列。前端只调用 `POST /api/files/archive/extract`（或 `/copy`、`/move`），立即拿到 `202 + task`，随后轮询 `GET /api/tasks` 读进度——浏览器全程不接触文件内容，只传指令和几百字节的 JSON。

| 操作 | 服务端实现 | 前端行为 |
| --- | --- | --- |
| 解压 | 流式逐条目写出（yauzl / node-tar） | 立即返回，轮询进度 |
| 压缩 | archiver 流式打包 | 立即返回，轮询进度 |
| 移动 | `fs.rename`（同盘瞬间完成）；跨挂载点自动退化为流式复制 + 删除 | 立即返回，轮询进度 |
| 复制 | 先统计字节数，再逐文件流式复制，按字节上报百分比 | 立即返回，轮询进度 |
| 重命名 / 删除 | 直接 `fs.rename` / `fs.rm` | 同步等待（通常 < 100ms） |

任务可随时取消：运行中的任务通过 `AbortController` 中断流，复制中途取消不会留下写了一半的文件句柄。

上传走 `multipart` 流式落盘，下载支持 HTTP Range（视频可拖动、可断点续传）。

```
filenest/
├── Dockerfile              # 多阶段构建（前端构建 → 生产依赖 → 精简运行镜像）
├── docker-compose.yml
├── docker-entrypoint.sh    # PUID/PGID 降权与目录初始化
├── server/                 # Express 后端
│   ├── index.js            # 装配、静态托管、健康检查
│   ├── auth.js             # 登录、注册、JWT、TOTP 2FA、限速
│   ├── files.js            # 列表/上传/下载/搜索/移动/重命名/解压入口
│   ├── tasks.js            # 后台任务队列与压缩包处理
│   ├── fsutil.js           # 路径越界防护、文件类型识别
│   ├── store.js            # 用户存储（JSON + 原子写）
│   └── config.js
└── web/                    # React 前端
    └── src/
        ├── views/          # Login、Browser
        ├── components/     # 文件项、菜单、任务面板、预览、设置
        ├── api.js  icons.jsx  utils.js  styles.css
```

---

## 本地开发

```bash
npm install
npm --prefix web install

# 终端 1：后端（:8080）
DATA_DIR=./data npm start

# 终端 2：前端热更新（:5173，自动代理 /api）
npm --prefix web run dev
```

生产构建（前端产物由后端直接托管）：

```bash
npm --prefix web run build
npm start
```

---

## 已知限制

- 压缩仅支持 `zip`（解压支持 zip/tar/tar.gz）。`7z`、`rar` 需要外部二进制，未内置。
- 上传为单请求流式传输，超大文件建议在网络稳定时上传；不支持分片续传。
- 任务队列保存在内存中，容器重启后历史任务记录会清空（文件本身不受影响）。
- 加密压缩包（带密码的 zip）无法解压，会提示错误。

---

## 贡献

欢迎 issue 与 PR。本地开发流程见上方「本地开发」一节；提交前请确保 `npm --prefix web run build` 通过。

## 许可证

本项目以 [MIT 协议](LICENSE) 开源，可自由用于个人与商业用途。

> 仓库中的 `release/`（镜像 tar、图标导出）不纳入版本控制，发布镜像请使用 Docker Hub / GitHub Releases。
