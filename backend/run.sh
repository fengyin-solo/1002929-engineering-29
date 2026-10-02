#!/usr/bin/env bash
# 后端启动入口（保持既有命令不变：cd backend && ./run.sh）
# 端口/主机统一取仓库根目录 dev.conf，环境变量可覆盖。
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd .. && pwd))"
if [ -f "$ROOT/dev.conf" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/dev.conf"
  set +a
fi
HOST="${DEV_HOST:-127.0.0.1}"
PORT="${DEV_BACKEND_PORT:-8000}"

if [ ! -x .venv/bin/python ]; then
  echo "后端虚拟环境不存在，请先在仓库根目录执行 make setup" >&2
  exit 1
fi
# 依赖若没装全（首次跳过 setup），直接说清，而不是让 uvicorn 报一串导入错误
.venv/bin/python -c "import fastapi, uvicorn" 2>/dev/null || {
  echo "后端依赖未安装，请先在仓库根目录执行 make setup" >&2
  exit 1
}

exec .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT"
