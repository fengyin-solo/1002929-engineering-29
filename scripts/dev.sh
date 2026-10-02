#!/usr/bin/env bash
# 固定动作③：一键起前后端。
#
# 流程：preflight 端口/依赖检查 -> 起后端并轮询健康 -> 前台跑 npm dev。
# Ctrl+C（或脚本收到 INT/TERM）时由统一的 cleanup 把后端与前端整棵进程树回收，
# 不会留下孤儿 uvicorn/vite 占用端口。
# 想分开起：make backend / make frontend（各自也会先跑对应 preflight）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

ROOT="$(dev_root)"
cd "$ROOT"
dev_load_conf

"$SCRIPT_DIR/preflight.sh" dev

mkdir -p "$ROOT/.dev-setup"
BACKEND_LOG="$ROOT/.dev-setup/backend.log"

BACKEND_PID=""
FRONTEND_PID=""

# 杀掉一棵子进程树：先 TERM 整组，兜底再 KILL 残留
_kill_tree() {
  local pid="$1"
  [ -z "$pid" ] && return 0
  kill -0 "$pid" 2>/dev/null || return 0
  local pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [ -n "$pgid" ]; then
    kill -TERM "-$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
  sleep 1
  if [ -n "$pgid" ] && kill -0 -- "-$pgid" 2>/dev/null; then
    kill -KILL "-$pgid" 2>/dev/null || true
  fi
}

cleanup() {
  trap '' EXIT INT TERM
  log_warn "正在停止前后端服务…"
  _kill_tree "$FRONTEND_PID"
  _kill_tree "$BACKEND_PID"
  log_ok "服务已全部停止"
}
trap cleanup EXIT INT TERM

log_step "启动后端（日志：.dev-setup/backend.log）"
setsid bash -c 'cd "$1" && exec ./run.sh' _ "$ROOT/backend" >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

HEALTH_URL="http://${DEV_HOST}:${DEV_BACKEND_PORT}${DEV_HEALTH_PATH}"
if wait_for_http "$HEALTH_URL" 30; then
  log_ok "后端已就绪：$HEALTH_URL"
else
  log_fail "后端 30s 内未通过健康检查，日志末尾："
  tail -n 20 "$BACKEND_LOG" >&2 || true
  exit 1
fi

log_step "启动前端（Ctrl+C 会同时停掉后端）"
cd "$ROOT/frontend"
# setsid 让前端自成进程组（npm 还会派生 vite/node），cleanup 才不会误杀脚本自己
setsid npm run dev &
FRONTEND_PID=$!

# 等待前端；前端退出（含 Ctrl+C）即触发 cleanup 回收后端
wait "$FRONTEND_PID"
