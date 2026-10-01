/**
 * 导航菜单与路由的唯一清单（单一事实源）。
 *
 * - src/router/index.ts 从这里生成全部路由（首页直接打包，其余按 view 懒加载）；
 * - src/App.vue 从这里渲染左侧导航菜单。
 *
 * 新增一个业务模块时，只改这一个文件、再加对应的 views 页面，
 * 菜单与路由会同时出现，不会再两处各写一套导致漏项或顺序不一致。
 */

/** 首页（运营概览）是直接打包的同步组件，view 固定指向 views/Dashboard.vue。 */
export interface NavEntry {
  /** 菜单显示名 */
  label: string
  /** 路由地址，全站唯一；首页为 '/' */
  path: string
  /** views 下的定位：'Dashboard' -> views/Dashboard.vue；其它 -> views/<view>/index.vue */
  view: string
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { label: '运营概览', path: '/', view: 'Dashboard' },
  { label: '使用登记', path: '/register', view: 'register' },
  { label: '锅炉管理', path: '/boiler', view: 'boiler' },
  { label: '压力容器', path: '/pressurevessel', view: 'pressurevessel' },
  { label: '压力管道', path: '/pipeline', view: 'pipeline' },
  { label: '电梯管理', path: '/elevator', view: 'elevator' },
  { label: '起重机械', path: '/crane', view: 'crane' },
  { label: '场车管理', path: '/forklift', view: 'forklift' },
  { label: '定期检验', path: '/inspection', view: 'inspection' },
  { label: '维保记录', path: '/maintenance', view: 'maintenance' },
  { label: '隐患排查', path: '/hazard', view: 'hazard' },
  { label: '事故管理', path: '/accident', view: 'accident' },
  { label: '作业人员', path: '/operator', view: 'operator' },
  { label: '培训考核', path: '/training', view: 'training' },
  { label: '安全阀校验', path: '/safetyvalve', view: 'safetyvalve' },
  { label: '压力表检定', path: '/gauge', view: 'gauge' },
  { label: '备件管理', path: '/sparepart', view: 'sparepart' },
  { label: '应急演练', path: '/emergency', view: 'emergency' },
  { label: '能效监测', path: '/energyeff', view: 'energyeff' },
  { label: '档案管理', path: '/archive', view: 'archive' },
  { label: '维保合同', path: '/contract', view: 'contract' },
] as const
