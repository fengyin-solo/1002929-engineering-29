#!/usr/bin/env bash
# 所有开发脚本共用的工具函数：定位仓库根目录、读取 dev.conf、日志、端口与连通性探测。
# 本文件只定义函数，被 source 时不产生副作用。

# 仓库根目录（脚本统一从根目录运行，兼容从任意子目录调用）
dev_root() {
  git rev-parse --show-toplevel 2>/dev/null || {
    local dir
    dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    printf '%s\n' "$dir"
  }
}

# 加载 dev.conf 到环境变量（幂等，重复 source 不会有副作用）
dev_load_conf() {
  local root
  root="$(dev_root)"
  if [ ! -f "$root/dev.conf" ]; then
    echo "错误：缺少配置文件 $root/dev.conf" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1091
  . "$root/dev.conf"
  set +a
  : "${DEV_HOST:?dev.conf 缺少 DEV_HOST}"
  : "${DEV_BACKEND_PORT:?dev.conf 缺少 DEV_BACKEND_PORT}"
  : "${DEV_FRONTEND_PORT:?dev.conf 缺少 DEV_FRONTEND_PORT}"
  : "${DEV_HEALTH_PATH:?dev.conf 缺少 DEV_HEALTH_PATH}"
}

# ---- 带步骤标签的彩色日志（非 TTY 时自动退化为纯文本） ----
if [ -t 2 ]; then
  _C_OK=$'\033[32m'; _C_WARN=$'\033[33m'; _C_ERR=$'\033[31m'; _C_INFO=$'\033[36m'; _C_RST=$'\033[0m'
else
  _C_OK=""; _C_WARN=""; _C_ERR=""; _C_INFO=""; _C_RST=""
fi

log_step() { echo "${_C_INFO}==>${_C_RST} $*"; }
log_ok()   { echo "${_C_OK}✔${_C_RST} $*"; }
log_warn() { echo "${_C_WARN}!!${_C_RST} $*"; }
log_fail() { echo "${_C_ERR}✘ $*${_C_RST}" >&2; }

# 打印“下一步怎么做”后以非零状态退出
fail_hint() {
  local msg="$1"; shift || true
  log_fail "$msg"
  if [ "$#" -gt 0 ]; then
    printf '    %s\n' "$@" >&2
  fi
  exit 1
}

# ---- 端口探测 ----
# 端口是否可绑定（0=空闲可起服务，1=已被监听占用）
# 用 bind+listen 而非 connect：直接回答“这里能不能起服务”，
# 也不会被透明代理之类的假 SYN-ACK 误导。SO_REUSEADDR 只放过 TIME_WAIT，
# 端口上有真正 LISTEN 的进程时仍会 EADDRINUSE。
port_is_free() {
  local host="$1" port="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$host" "$port" <<'PY'
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.settimeout(0.5)
try:
    s.bind((sys.argv[1], int(sys.argv[2])))
    s.listen(1)
except OSError:
    sys.exit(1)   # 绑不上：已有进程监听 -> 非零
else:
    sys.exit(0)   # 能正常绑定监听：端口空闲 -> 0
finally:
    s.close()
PY
  else
    # 无 python 时退回连接探测（连上=占用；语义反转以保持“0=空闲”）
    if timeout 1 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then
      return 1
    fi
  fi
}

# 若端口被占则直接失败并说清是谁占的
require_port_free() {
  local host="$1" port="$2" who="$3"
  if ! port_is_free "$host" "$port"; then
    local pid=""
    if command -v lsof >/dev/null 2>&1; then
      pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
    fi
    local extra=""
    [ -n "$pid" ] && extra="（监听进程 PID: $pid）"
    fail_hint "$who 端口 $host:$port 已被占用$extra，请先停掉占用进程，或修改 dev.conf 后重跑。"
  fi
}

# ---- HTTP 连通性探测 ----
# http_ok <url>：返回 0 表示拿到 2xx
http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 2 -o /dev/null "$url" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 2 -O /dev/null "$url"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$url" <<'PY'
import sys, urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=2) as r:
        sys.exit(0 if 200 <= r.status < 300 else 1)
except Exception:
    sys.exit(1)
PY
  else
    return 2
  fi
}

# 轮询等待后端健康，参数：url、最大秒数
wait_for_http() {
  local url="$1" timeout_s="${2:-30}" waited=0
  while [ "$waited" -lt "$timeout_s" ]; do
    http_ok "$url" && return 0
    sleep 1
    waited=$((waited + 1))
  done
  return 1
}

# 依赖步骤状态目录（记录已完成步骤，失败后可断点续装；目录被 gitignore）
dev_state_dir() {
  local d; d="$(dev_root)/.dev-setup"
  mkdir -p "$d"
  printf '%s\n' "$d"
}

# 文件内容指纹：锁文件/配置变了则对应步骤标记自动失效。
# 多个文件先各自哈希，再把结果整体哈希成一行，保证标记文件里是单行值。
fingerprint_files() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@" | sha256sum | awk '{print $1}'
  else
    shasum -a 256 "$@" | shasum -a 256 | awk '{print $1}'
  fi
}

# step_done <名称> [参与指纹的文件...]：标记步骤完成
step_done() {
  local name="$1"; shift
  local d; d="$(dev_state_dir)"
  {
    echo "done_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    [ "$#" -gt 0 ] && echo "fingerprint=$(fingerprint_files "$@")"
  } > "$d/$name.done"
}

# step_need_run <名称> [参与指纹的文件...]：
# 未完成 / 锁文件指纹变了 -> 返回 0（需要执行）
step_need_run() {
  local name="$1"; shift
  local d; d="$(dev_state_dir)"
  local mark="$d/$name.done"
  [ -f "$mark" ] || return 0
  if [ "$#" -gt 0 ]; then
    local saved current
    saved="$(sed -n 's/^fingerprint=//p' "$mark" | head -1)"
    current="$(fingerprint_files "$@")"
    [ "$saved" = "$current" ] || return 0
  fi
  return 1
}
