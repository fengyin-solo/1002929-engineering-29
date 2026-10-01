#!/usr/bin/env bash
# 后端启动固定动作：
#   1. 依赖没装好 -> 先按锁文件装（装好不会重复装）；
#   2. 起服务前预检端口；
#   3. 用 config/local-dev.json 里的同一份 host/port 启动 uvicorn。
# 有 node 时直接复用 scripts/dev.mjs；没有 node 时用下面的 Python 兜底，
# 保证「make backend」/「./run.sh」这两个既有入口的行为不变。
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(cd .. && pwd)"
CONFIG_JSON="${DEV_CONFIG:-$ROOT/config/local-dev.json}"

# 用标准库读唯一事实源；SKIP_DEV_CONFIG=1 或文件缺失时回退默认值。
read_cfg() {
  python3 - "$CONFIG_JSON" "$1" <<'PY'
import json, os, sys
path, key = sys.argv[1], sys.argv[2]
defaults = {
    "backend.host": "127.0.0.1", "backend.port": 8000,
    "frontend.host": "127.0.0.1", "frontend.port": 5173,
    "health.path": "/api/health",
}
env_map = {
    "backend.host": "BACKEND_HOST", "backend.port": "BACKEND_PORT",
    "frontend.host": "FRONTEND_HOST", "frontend.port": "FRONTEND_PORT",
}
value = os.environ.get(env_map.get(key, ""))
if value is None and os.environ.get("SKIP_DEV_CONFIG") != "1" and os.path.exists(path):
    try:
        data = json.load(open(path, encoding="utf-8"))
        section, field = key.split(".", 1)
        value = (data.get(section) or {}).get(field)
    except Exception:
        value = None
print(value if value is not None else defaults[key])
PY
}

# ---------- 第 1 步：依赖（按锁文件装，幂等） ----------
if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/dev.mjs" prepare backend
else
  echo "→ 未找到 node，使用内置兜底流程装后端依赖"
  if [ ! -x .venv/bin/python ]; then
    python3 -m venv .venv
  elif ! .venv/bin/python -c "import sys" >/dev/null 2>&1; then
    echo "→ .venv 已失效（解释器不可用），删除重建"
    rm -rf .venv
    python3 -m venv .venv
  fi
  if [ -f requirements.lock ]; then
    .venv/bin/python -m pip install -q -r requirements.lock
  else
    .venv/bin/python -m pip install -q -r requirements.txt
    .venv/bin/python -m pip freeze > requirements.lock
    echo "✓ 已生成 backend/requirements.lock（提交后其它机器按它安装）"
  fi
fi

# ---------- 第 2 步：端口预检（后端只看自己的端口） ----------
HOST="$(read_cfg backend.host)"
PORT="$(read_cfg backend.port)"

if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/dev.mjs" preflight backend
else
  .venv/bin/python - "$HOST" "$PORT" <<'PY'
import socket, sys, urllib.request
host, port = sys.argv[1], int(sys.argv[2])
s = socket.socket()
s.settimeout(1.0)
busy = s.connect_ex((host if host not in ("0.0.0.0", "::") else "127.0.0.1", port)) == 0
s.close()
if busy:
    probe_host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    try:
        with urllib.request.urlopen(f"http://{probe_host}:{port}/api/health", timeout=1.5) as r:
            import json
            if r.status == 200 and json.load(r).get("ok"):
                print(f"✗ 后端已在 {probe_host}:{port} 运行，不要重复启动；先停掉再执行 ./run.sh", file=sys.stderr)
                sys.exit(1)
    except Exception:
        pass
    print(f"✗ 端口 {port} 已被其它程序占用：释放端口，或在 config/local-dev.json 改 backend.port", file=sys.stderr)
    sys.exit(1)
print("✓ 预检通过，可以起服务")
PY
fi

# ---------- 第 3 步：起服务 ----------
echo "→ 启动后端 http://${HOST}:${PORT}（健康检查 /api/health）"
exec .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT"
