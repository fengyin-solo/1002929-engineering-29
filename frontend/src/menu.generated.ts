// 本文件由 scripts/gen-menu.mjs 依据 menu.config.json 自动生成，请勿手工修改。
// 修改导航/路由请编辑 menu.config.json，然后执行 `make menu` 重新生成。
import type { RouteRecordRaw } from 'vue-router'

import accident from '@/views/accident/index.vue'
import archive from '@/views/archive/index.vue'
import boiler from '@/views/boiler/index.vue'
import contract from '@/views/contract/index.vue'
import crane from '@/views/crane/index.vue'
import dashboard from '@/views/Dashboard.vue'
import elevator from '@/views/elevator/index.vue'
import emergency from '@/views/emergency/index.vue'
import energyeff from '@/views/energyeff/index.vue'
import forklift from '@/views/forklift/index.vue'
import gauge from '@/views/gauge/index.vue'
import hazard from '@/views/hazard/index.vue'
import inspection from '@/views/inspection/index.vue'
import maintenance from '@/views/maintenance/index.vue'
import operator from '@/views/operator/index.vue'
import pipeline from '@/views/pipeline/index.vue'
import pressurevessel from '@/views/pressurevessel/index.vue'
import register from '@/views/register/index.vue'
import safetyvalve from '@/views/safetyvalve/index.vue'
import sparepart from '@/views/sparepart/index.vue'
import training from '@/views/training/index.vue'

/** 路由记录：顺序与 menu.config.json 一致。 */
export const menuRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: dashboard },
  { path: '/register', name: 'register', component: register },
  { path: '/boiler', name: 'boiler', component: boiler },
  { path: '/pressurevessel', name: 'pressurevessel', component: pressurevessel },
  { path: '/pipeline', name: 'pipeline', component: pipeline },
  { path: '/elevator', name: 'elevator', component: elevator },
  { path: '/crane', name: 'crane', component: crane },
  { path: '/forklift', name: 'forklift', component: forklift },
  { path: '/inspection', name: 'inspection', component: inspection },
  { path: '/maintenance', name: 'maintenance', component: maintenance },
  { path: '/hazard', name: 'hazard', component: hazard },
  { path: '/accident', name: 'accident', component: accident },
  { path: '/operator', name: 'operator', component: operator },
  { path: '/training', name: 'training', component: training },
  { path: '/safetyvalve', name: 'safetyvalve', component: safetyvalve },
  { path: '/gauge', name: 'gauge', component: gauge },
  { path: '/sparepart', name: 'sparepart', component: sparepart },
  { path: '/emergency', name: 'emergency', component: emergency },
  { path: '/energyeff', name: 'energyeff', component: energyeff },
  { path: '/archive', name: 'archive', component: archive },
  { path: '/contract', name: 'contract', component: contract },
]

/** 侧边导航：顺序与路由一致，同源生成，不会再出现两处对不上的情况。 */
export interface MenuItem {
  path: string
  name: string
  label: string
}

export const navItems: MenuItem[] = [
  { path: '/', name: 'dashboard', label: '运营概览' },
  { path: '/register', name: 'register', label: '使用登记' },
  { path: '/boiler', name: 'boiler', label: '锅炉管理' },
  { path: '/pressurevessel', name: 'pressurevessel', label: '压力容器' },
  { path: '/pipeline', name: 'pipeline', label: '压力管道' },
  { path: '/elevator', name: 'elevator', label: '电梯管理' },
  { path: '/crane', name: 'crane', label: '起重机械' },
  { path: '/forklift', name: 'forklift', label: '场车管理' },
  { path: '/inspection', name: 'inspection', label: '定期检验' },
  { path: '/maintenance', name: 'maintenance', label: '维保记录' },
  { path: '/hazard', name: 'hazard', label: '隐患排查' },
  { path: '/accident', name: 'accident', label: '事故管理' },
  { path: '/operator', name: 'operator', label: '作业人员' },
  { path: '/training', name: 'training', label: '培训考核' },
  { path: '/safetyvalve', name: 'safetyvalve', label: '安全阀校验' },
  { path: '/gauge', name: 'gauge', label: '压力表检定' },
  { path: '/sparepart', name: 'sparepart', label: '备件管理' },
  { path: '/emergency', name: 'emergency', label: '应急演练' },
  { path: '/energyeff', name: 'energyeff', label: '能效监测' },
  { path: '/archive', name: 'archive', label: '档案管理' },
  { path: '/contract', name: 'contract', label: '维保合同' },
]
