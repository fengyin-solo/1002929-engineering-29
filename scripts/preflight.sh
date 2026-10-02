#!/usr/bin/env bash
# 固定动作②：起服务之前先查一遍 —— 缺哪一步直接停下并说清。
#
# 检查项：
#   doctor  : 依赖是否按锁文件装好（venv、node_modules）、生成物是否过期（不碰端口）
#   backend : doctor + 后端端口是否空闲
#   frontend: doctor + 前端端口是否空闲 + 后端健康检查是否连通（后端需已单独起好）
#   dev/all : doctor + 两个端口是否空闲（后端马上由 dev.sh 自己拉起，不要求此刻连通）
#
# 退出码非零即代表不能起服务，输出末尾给出具体补救动作。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

ROOT="$(dev_root)"
cd "$ROOT"
dev_load_conf

TARGET="${1:-all}"
failures=0

note_fail() { failures=$((failures + 1)); }

check_doctor() {
  log_step "检查依赖安装状态（按锁文件）"

  if [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
    log_fail "后端虚拟环境不存在：backend/.venv"
    note_fail
  elif step_need_run backend-venv "$ROOT/backend/requirements.lock" "$ROOT/backend/requirements.txt"; then
    log_fail "后端依赖缺失或锁文件已更新，需要重新安装"
    note_fail
  elif ! "$ROOT/backend/.venv/bin/python" -c "import fastapi, uvicorn, pydantic" 2>/dev/null; then
    log_fail "后端虚拟环境损坏（fastapi/uvicorn/pydantic 无法导入）"
    note_fail
  else
    log_ok "后端依赖已按 requirements.lock 安装"
  fi

  if step_need_run frontend-deps "$ROOT/frontend/package-lock.json" "$ROOT/frontend/package.json"; then
    log_fail "前端依赖缺失或锁文件已更新，需要重新安装"
    note_fail
  elif [ ! -x "$ROOT/frontend/node_modules/.bin/vite" ]; then
    log_fail "前端依赖不完整：未找到 node_modules/.bin/vite"
    note_fail
  else
    log_ok "前端依赖已按 package-lock.json 安装"
  fi

  log_step "检查导航/路由生成物"
  if node "$ROOT/frontend/scripts/gen-menu.mjs" --check; then
    log_ok "导航菜单与路由同源且最新"
  else
    note_fail
  fi
}

check_backend() {
  log_step "检查后端端口 ${DEV_HOST}:${DEV_BACKEND_PORT}"
  if port_is_free "$DEV_HOST" "$DEV_BACKEND_PORT"; then
    log_ok "后端端口空闲：${DEV_HOST}:${DEV_BACKEND_PORT}"
    return 0
  fi

  local pid=""
  command -v lsof >/dev/null 2>&1 && pid="$(lsof -nP -iTCP:"${DEV_BACKEND_PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  local health="http://${DEV_HOST}:${DEV_BACKEND_PORT}${DEV_HEALTH_PATH}"
  if http_ok "$health"; then
    log_fail "后端端口已有健康服务在跑：$health"
    echo    "    如要再起一个，请先停掉现有后端，或在 dev.conf 改端口。" >&2
  else
    log_fail "后端端口被占用${pid:+（PID: $pid）}但 ${DEV_HEALTH_PATH} 无响应（可能是别的程序）"
    echo    "    请释放 ${DEV_BACKEND_PORT} 端口，或在 dev.conf 改端口。" >&2
  fi
  note_fail
}

check_frontend() {
  log_step "检查前端端口 ${DEV_HOST}:${DEV_FRONTEND_PORT}"
  if port_is_free "$DEV_HOST" "$DEV_FRONTEND_PORT"; then
    log_ok "前端端口空闲：${DEV_HOST}:${DEV_FRONTEND_PORT}"
  else
    local pid=""
    command -v lsof >/dev/null 2>&1 && pid="$(lsof -nP -iTCP:"${DEV_FRONTEND_PORT}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
    log_fail "前端端口 ${DEV_HOST}:${DEV_FRONTEND_PORT} 已被占用${pid:+（PID: $pid）}"
    echo    "    请停掉占用进程，或在 dev.conf 改端口。" >&2
    note_fail
  fi
}

# 仅“单独起前端”时需要：后端必须已经在跑且健康
check_backend_reachable() {
  log_step "检查后端连通性（前端代理目标）"
  local health="http://${DEV_HOST}:${DEV_BACKEND_PORT}${DEV_HEALTH_PATH}"
  if http_ok "$health"; then
    log_ok "后端连通：$health"
  else
    log_fail "后端连不通：$health"
    echo    "    请先在另一个终端执行 make backend（或直接 make dev，会自动拉起后端）。" >&2
    note_fail
  fi
}

case "$TARGET" in
  doctor)   check_doctor ;;
  backend)  check_doctor; check_backend ;;
  frontend) check_doctor; check_frontend; check_backend_reachable ;;
  dev|all)  check_doctor; check_backend; check_frontend ;;
  *) fail_hint "未知检查目标：$TARGET（可选：doctor | backend | frontend | dev | all）" ;;
esac

if [ "$failures" -gt 0 ]; then
  echo >&2
  fail_hint "启动前检查未通过（${failures} 项）" \
    "首次准备或修复依赖：make setup" \
    "全部就绪后：    make dev（前后端一起）或 make backend / make frontend 分开起"
fi
log_ok "启动前检查全部通过"
