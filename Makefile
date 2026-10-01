.PHONY: install check backend frontend

# 本地开发的固定动作都收口到 scripts/dev.mjs（零依赖 Node 脚本）。
#
#   make install    按锁文件装前后端依赖（已装好会跳过，可断点续装，不会重复装出第二份）
#   make check      起服务前体检：工具链/锁文件/依赖/端口占用/后端连通，缺哪一步直接报清楚
#   make backend    装依赖 + 预检端口 + 起后端（命令与以前一致）
#   make frontend   起前端（npm run dev 会先自动预检依赖、端口与后端连通）

install:
	node scripts/dev.mjs prepare

check:
	node scripts/dev.mjs doctor

backend:
	cd backend && ./run.sh

frontend:
	cd frontend && npm run dev
