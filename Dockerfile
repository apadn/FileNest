# 多阶段构建：前端构建 → 生产依赖 → 精简运行镜像
# 不使用 # syntax=docker/dockerfile:1：避免构建时去拉 BuildKit 前端镜像（离线/内网环境更友好）

# ---------------- 1. 构建前端 ----------------
FROM node:22-alpine AS web-builder
WORKDIR /app
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------------- 2. 生产依赖 ----------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund 2>/dev/null || npm install --omit=dev --no-audit --no-fund

# ---------------- 3. 运行时 ----------------
FROM node:22-alpine

RUN apk add --no-cache tini su-exec tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime 2>/dev/null || true

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    SITE_NAME=FileNest

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=web-builder /app/dist ./web/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data/files

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
