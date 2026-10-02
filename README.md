# 特种设备安全管理平台

面向锅炉、压力容器、电梯、起重机械与场内专用机动车辆等特种设备的注册登记、定期检验、维保监管与隐患排查的一体化安全管理后台。

这是一个前后端分离的管理平台：前端 Vue 3 + Vite + TypeScript，后端 FastAPI（Python）。
两边各自独立启动，前端 dev server 已关掉自动打开页面，启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/              统一请求封装
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false）
├── backend/                  FastAPI（Python） 后端
│   ├── app/routers/          每个业务模块一组接口
│   ├── app/services/         业务规则与状态流转
│   └── app/store.py          内存数据仓库与示例数据
├── scripts/                  setup / preflight / dev 等固定动作脚本
├── dev.conf                  本地开发唯一配置源（端口等）
├── Makefile                  固定动作入口
├── .gitignore
└── docker-compose.yml
```

## 本地开发：固定动作

所有入口都收敛到仓库根目录的 Makefile，新同事照这三步走即可：

```bash
make setup     # 1. 按锁文件装一遍依赖（后端 venv + 前端 npm ci）
make dev       # 2. 先做启动前检查，通过后一键起前后端（Ctrl+C 一起停）
# 3. 浏览器打开终端打印的前端地址（dev server 不会自动开页面）
```

| 命令 | 作用 |
| --- | --- |
| `make setup` | 依赖**严格按锁文件**安装：后端 `backend/requirements.lock`、前端 `frontend/package-lock.json`。每一步有完成标记和输入指纹：没装完失败会停下并说清，重跑只补缺失的那一步；锁没变时反复执行不会重装。 |
| `make doctor` | 只检查依赖与生成物状态，不碰端口。 |
| `make dev` | 启动前检查（依赖、两个端口是否空闲）→ 起后端并轮询 `/api/health` → 起前端。前端经 `/api` 代理到后端。 |
| `make backend` / `make frontend` | 分开起。单独起前端时会要求后端已连通。 |
| `make menu` | 按 `frontend/menu.config.json` 重新生成路由与导航。 |
| `make up` / `make down` | 容器方式起停（docker compose），宿主端口同样取 `dev.conf`。 |

### 唯一配置源：dev.conf

`dev.conf` 是本地开发的唯一配置源（随仓库提交），后端端口、前端端口、健康检查路径都在这里：

- `backend/app/config.py`（监听端口、CORS 来源）、`frontend/vite.config.ts`（监听端口、代理目标）、
  `scripts/*`（启动前检查、健康轮询）、`docker-compose.yml`（宿主端口映射）全部读这一份，改端口只改一处。
- 仍可用环境变量临时覆盖：`DEV_BACKEND_PORT`、`DEV_FRONTEND_PORT`、`DEV_HOST`、`VITE_PROXY_TARGET`。

### 导航菜单与路由同源

侧边导航与前端路由不再各写一套，都由 `frontend/menu.config.json` 这一份清单生成
（生成物 `frontend/src/menu.generated.ts` 随仓库提交，输出是确定性的，任何机器生成结果一致）：

1. 新增/调整菜单只改 `menu.config.json`（path、路由 name、菜单 label、视图文件 view）；
2. 执行 `make menu`（或在 frontend 下 `npm run gen:menu`）重新生成；
3. `make doctor` / `make setup` 会校验生成物是否过期，清单改了没生成会直接失败并提示。

### 兼容的既有命令

旧习惯仍然可用，底层都会经过同一套检查：

```bash
cd backend && ./run.sh          # 等价 make backend；端口取 dev.conf
cd frontend && npm install      # 不推荐；请用根目录 make setup（npm ci 按锁文件）
cd frontend && npm run dev      # 等价 make frontend
make install                    # 旧命令，等价 make setup
```

后端健康检查：`curl http://127.0.0.1:8000/api/health`（端口随 `dev.conf`）。

### 锁文件维护

- 前端：改 `package.json` 后在 `frontend/` 执行 `npm install` 更新 `package-lock.json` 并提交。
- 后端：改 `requirements.txt` 后在**全新 venv** 中 `pip install -r requirements.txt`，
  用 `pip freeze` 更新 `backend/requirements.lock` 并提交。

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 使用登记 | `register` | 设备登记 | 设备编号、设备名称、设备种类 |
| 锅炉管理 | `boiler` | 锅炉 | 锅炉编号、锅炉型号、额定蒸发量 |
| 压力容器 | `pressurevessel` | 压力容器 | 容器编号、容器类别、设计压力 |
| 压力管道 | `pipeline` | 压力管道 | 管道编号、管道级别、设计压力 |
| 电梯管理 | `elevator` | 电梯 | 电梯编号、电梯类型、额定载重 |
| 起重机械 | `crane` | 起重机 | 起重机编号、起重机类型、额定起重量 |
| 场车管理 | `forklift` | 场内车辆 | 车辆编号、车辆类型、动力类型 |
| 定期检验 | `inspection` | 检验任务 | 检验编号、被检设备、检验类别 |
| 维保记录 | `maintenance` | 维保记录 | 维保编号、维保设备、维保单位 |
| 隐患排查 | `hazard` | 隐患记录 | 隐患编号、所在设备、隐患类别 |
| 事故管理 | `accident` | 事故记录 | 事故编号、事故设备、事故类型 |
| 作业人员 | `operator` | 作业人员 | 人员编号、姓名、证书类别 |
| 培训考核 | `training` | 培训记录 | 培训编号、培训内容、培训对象 |
| 安全阀校验 | `safetyvalve` | 安全阀 | 安全阀编号、所属设备、公称通径 |
| 压力表检定 | `gauge` | 压力表 | 压力表编号、所属设备、量程范围 |
| 备件管理 | `sparepart` | 备件 | 备件编号、备件名称、规格型号 |
| 应急演练 | `emergency` | 演练记录 | 演练编号、演练主题、演练类型 |
| 能效监测 | `energyeff` | 能效记录 | 记录编号、设备类型、耗能量 |
| 档案管理 | `archive` | 设备档案 | 档案编号、所属设备、档案类别 |
| 维保合同 | `contract` | 维保合同 | 合同编号、签约单位、维保范围 |

## 约定

- 每个模块的前端页面在 `frontend/src/views/<模块>/index.vue`，后端接口在
  `backend/app/routers/<模块>.py`，业务规则在 `backend/app/services/<模块>.py`。
- 列表接口统一返回 `{ items, total, page, size }`，动作接口统一返回 `{ ok, message }`。
- 状态流转只允许在 `app/services` 里改，路由层不做业务判断。
