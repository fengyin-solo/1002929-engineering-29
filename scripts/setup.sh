#!/usr/bin/env bash
# 固定动作①：按锁文件安装两端依赖。
#
# 设计目标：
#   - 依赖严格按锁文件装（前端 npm ci / 后端 requirements.lock），任何机器装出同一份；
#   - 每个步骤有完成标记（.dev-setup/<step>.done）并带输入指纹，失败后重跑只补缺失步骤；
#   - 输入（锁文件）没变就不重装，反复执行不会多出一份依赖；
#   - 缺工具或缺锁文件立刻停下并说清补救命令。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

ROOT="$(dev_root)"
cd "$ROOT"

dev_load_conf

# ---- 步骤 0：工具链 ----
log_step "检查工具链"
command -v node >/dev/null 2>&1 || fail_hint "未找到 node" "请安装 Node.js 20+：https://nodejs.org/ （或用 nvm install 20）"
command -v npm >/dev/null 2>&1 || fail_hint "未找到 npm" "请随 Node.js 20+ 一起安装 npm。"
command -v python3 >/dev/null 2>&1 || fail_hint "未找到 python3" "请安装 Python 3.11+。"
log_ok "node $(node --version)、npm $(npm --version)、python3 $(python3 --version 2>&1)"

[ -f "$ROOT/frontend/package-lock.json" ] \
  || fail_hint "缺少 frontend/package-lock.json，无法按锁文件安装" "请提交该文件；没有时先在 frontend/ 执行 npm install --package-lock-only 生成。"
[ -f "$ROOT/backend/requirements.lock" ] \
  || fail_hint "缺少 backend/requirements.lock，无法按锁文件安装" "锁文件随仓库提交：requirements.txt 变更后用 pip freeze 重新冻结。"

# ---- 步骤 1：后端虚拟环境 + 锁文件依赖 ----
VENV="$ROOT/backend/.venv"
VENV_PY="$VENV/bin/python"
BACKEND_LOCK="$ROOT/backend/requirements.lock"
BACKEND_REQ="$ROOT/backend/requirements.txt"

if step_need_run backend-venv "$BACKEND_LOCK" "$BACKEND_REQ"; then
  log_step "准备后端虚拟环境 backend/.venv"
  if [ ! -x "$VENV_PY" ]; then
    # 优先标准 venv；系统裁掉 ensurepip 时退回无 pip 引导
    if python3 -m venv "$VENV" 2>/dev/null; then
      :
    else
      python3 -m venv --without-pip "$VENV"
      GETPIP="$(mktemp)"
      curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$GETPIP" \
        || fail_hint "创建 venv 失败且无法下载 get-pip.py" \
           "Debian/Ubuntu 可先安装：sudo apt-get install python3-venv"
      "$VENV_PY" "$GETPIP" || fail_hint "在 venv 中引导 pip 失败"
      rm -f "$GETPIP"
    fi
    log_ok "虚拟环境已创建"
  else
    log_ok "虚拟环境已存在，跳过创建"
  fi

  log_step "按锁文件安装后端依赖（requirements.lock）"
  "$VENV_PY" -m pip install --upgrade pip >/dev/null
  # 锁文件是完整冻结结果，--no-deps 避免解析器重新挑版本，装出的就是锁里那份
  if ! "$VENV_PY" -m pip install --no-deps -r "$BACKEND_LOCK"; then
    rm -f "$(dev_state_dir)/backend-venv.done"
    fail_hint "后端依赖安装失败" "解决网络/源问题后重跑 make setup，会自动从这一步继续。"
  fi
  # 冒烟校验：关键包能导入，避免装一半被当成成功
  "$VENV_PY" -c "import fastapi, uvicorn, pydantic" 2>/dev/null \
    || fail_hint "后端依赖装完但导入校验失败（fastapi/uvicorn/pydantic）"
  step_done backend-venv "$BACKEND_LOCK" "$BACKEND_REQ"
  log_ok "后端依赖就绪"
else
  log_ok "后端依赖未变化，跳过（删除 backend/.venv 或更新锁文件后会重装）"
fi

# ---- 步骤 2：前端锁文件依赖 ----
FRONTEND_LOCK="$ROOT/frontend/package-lock.json"
FRONTEND_PKG="$ROOT/frontend/package.json"

if step_need_run frontend-deps "$FRONTEND_LOCK" "$FRONTEND_PKG"; then
  log_step "按锁文件安装前端依赖（npm ci）"
  if ! (cd "$ROOT/frontend" && npm ci --no-audit --no-fund); then
    rm -f "$(dev_state_dir)/frontend-deps.done"
    fail_hint "前端依赖安装失败" "解决网络/源问题后重跑 make setup，会自动从这一步继续。"
  fi
  [ -x "$ROOT/frontend/node_modules/.bin/vite" ] \
    || fail_hint "前端依赖装完但未找到 vite，安装结果不完整"
  step_done frontend-deps "$FRONTEND_LOCK" "$FRONTEND_PKG"
  log_ok "前端依赖就绪"
else
  log_ok "前端依赖未变化，跳过（删除 frontend/node_modules 或更新锁文件后会重装）"
fi

# ---- 步骤 3：导航/路由生成物 ----
log_step "校验导航与路由生成物"
if node "$ROOT/frontend/scripts/gen-menu.mjs" --check; then
  :
else
  log_warn "生成物过期，按 menu.config.json 重新生成"
  node "$ROOT/frontend/scripts/gen-menu.mjs"
fi

log_ok "准备完成：依赖已按锁文件就绪，可执行 make dev 一键起服务。"
