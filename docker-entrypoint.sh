#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
DATA_DIR=${DATA_DIR:-/data}
FILES_DIR=${FILES_DIR:-$DATA_DIR/files}

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" "$FILES_DIR"

  # 按需创建运行用户（PUID/PGID 可映射宿主机用户，避免挂载目录权限问题）
  if ! awk -F: -v gid="$PGID" '$3==gid {found=1} END {exit !found}' /etc/group; then
    addgroup -g "$PGID" -S app 2>/dev/null || true
  fi
  GROUP_NAME=$(awk -F: -v gid="$PGID" '$3==gid {print $1}' /etc/group | head -n1)
  [ -z "$GROUP_NAME" ] && GROUP_NAME=app

  if ! awk -F: -v uid="$PUID" '$3==uid {found=1} END {exit !found}' /etc/passwd; then
    adduser -u "$PUID" -G "$GROUP_NAME" -S -D -H app 2>/dev/null || true
  fi

  # 默认只修正数据目录本身与账户文件，避免遍历 TB 级文件树导致启动卡几分钟。
  # 需要给整棵文件树重设属主（例如首次导入已有媒体库）时，加 -e CHOWN_RECURSIVE=1
  if [ "${CHOWN_RECURSIVE:-0}" = "1" ]; then
    chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || true
  else
    chown "$PUID:$PGID" "$DATA_DIR" "$FILES_DIR" 2>/dev/null || true
    for f in "$DATA_DIR/users.json" "$DATA_DIR/.jwt-secret"; do
      [ -e "$f" ] && chown "$PUID:$PGID" "$f" 2>/dev/null || true
    done
  fi

  echo "[entrypoint] 以 uid=$PUID gid=$PGID 运行，数据目录 $DATA_DIR"
  exec su-exec "$PUID:$PGID" "$@"
fi

echo "[entrypoint] 以当前用户 $(id -u):$(id -g) 运行"
exec "$@"
