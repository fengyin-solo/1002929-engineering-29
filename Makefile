# 本地开发固定动作（详见 README「本地开发」一节）
#
#	make setup     按锁文件装一遍依赖（可反复执行：没变不重装，失败可断点续装）
#	make doctor    只检查依赖/生成物，不碰端口
#	make dev       检查通过后一键起前后端（Ctrl+C 一起退出）
#	make backend   单独起后端（先跑后端侧检查）
#	make frontend  单独起前端（先跑前端侧检查，要求后端已连通）
#	make menu      按 menu.config.json 重新生成路由与导航
#	make up/down   容器方式起停（端口同样取 dev.conf）
.PHONY: setup doctor dev backend frontend menu install up down

# 兼容旧命令：make install == make setup
install: setup

setup:
	bash scripts/setup.sh

doctor:
	bash scripts/preflight.sh doctor

dev:
	bash scripts/dev.sh

backend:
	bash scripts/preflight.sh backend
	cd backend && ./run.sh

frontend:
	bash scripts/preflight.sh frontend
	cd frontend && npm run dev

menu:
	node frontend/scripts/gen-menu.mjs

# 容器入口也读 dev.conf：宿主侧端口与本地脚本始终同一份
up:
	set -a; . ./dev.conf; set +a; docker compose up --build

down:
	set -a; . ./dev.conf; set +a; docker compose down
