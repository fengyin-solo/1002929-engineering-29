# 特种设备安全管理平台

面向锅炉、压力容器、电梯、起重机械与场内专用机动车辆等特种设备的注册登记、定期检验、维保监管与隐患排查的一体化安全管理后台。

这是一个前后端分离的管理平台：前端 Vue 3 + Vite + TypeScript，后端 FastAPI（Python）。
两边各自独立启动，前端 dev server 已关掉自动打开页面，启动后按终端打印的地址手工打开。

## 本地开发：一套固定动作

所有机器上都按同样的顺序来，不用再手记：

```bash
make install    # 1. 按锁文件装前后端依赖（已装好会跳过，可反复跑，不会多出一份）
make check      # 2. 体检：工具链/锁文件/依赖/端口占用/后端连通，缺哪一步直接停下并说清
make backend    # 3. 起后端（内部会再自检依赖与端口）
make frontend   # 4. 起前端（npm run dev 会先预检端口与后端连通，再启动 Vite）
```

要点：

- **依赖按锁文件装**：后端 `backend/requirements.lock`、前端 `frontend/package-lock.json`
  都随仓库提交。锁文件缺失时 `make install` 会自动生成一份，请把生成结果提交，之后所有机器按它装，
  装出来的依赖版本完全一致。
- **失败可断点续装**：哪一步失败就在哪一步停下并给出续跑命令；修好后重跑 `make install` 即可，
  已装的部分不会重复安装。
- **起服务前先查端口和后端连通**：后端端口被占、或前端起来时后端连不通，都会被直接拦下，
  不会带着错误端口起服务。
- 不想用 make 时也可以直接调脚本：`node scripts/dev.mjs prepare|doctor|preflight|print`。

健康检查：`curl <后端地址>/api/health`（后端地址默认 `http://127.0.0.1:8000`）。

## 端口与配置：只改一处

本地端口/地址的唯一事实源是 `config/local-dev.json`：后端 `app/config.py`（监听端口与 CORS）、
前端 `vite.config.ts`（dev server 端口与 `/api` 代理目标）、`scripts/dev.mjs`、
`docker-compose.yml` 都读这一份。改一处，前后端与各种入口自动同步，不需要两处手抄。

需要临时覆盖时用环境变量 `BACKEND_HOST/BACKEND_PORT/FRONTEND_HOST/FRONTEND_PORT`
（docker compose 也认），或用 `DEV_CONFIG=/path/to.json` 指向另一份配置；
容器内置 `SKIP_DEV_CONFIG=1` 走默认值，不依赖该文件。

## 菜单与路由：同一份清单

左侧导航菜单和前端路由都由 `frontend/src/nav/manifest.ts` 这一份清单生成：
`src/router/index.ts` 从它生成路由，`src/App.vue` 从它渲染菜单。新增业务模块时只改这一个文件、
再补对应的 `views/<模块>/index.vue` 即可，两处不会再各写一套导致漏项或顺序不一致。

## 目录结构

```text
.
├── config/local-dev.json     本地开发唯一事实源：端口、健康检查路径
├── scripts/dev.mjs           固定动作：prepare/doctor/preflight/print（零依赖 Node 脚本）
├── frontend/                 Vue 3 + Vite + TypeScript 前端
│   ├── src/nav/manifest.ts   导航菜单与路由的唯一清单
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/              统一请求封装
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（读 config/local-dev.json，open: false）
├── backend/                  FastAPI（Python） 后端
│   ├── app/routers/          每个业务模块一组接口
│   ├── app/services/         业务规则与状态流转
│   ├── app/store.py          内存数据仓库与示例数据
│   ├── requirements.lock     后端依赖锁（pip 精确版本）
│   └── run.sh                后端固定启动动作（装依赖→预检→起服务）
├── .gitignore
└── docker-compose.yml
```

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
