import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import Dashboard from '@/views/Dashboard.vue'
import { NAV_ENTRIES } from '@/nav/manifest'

// views 下所有业务页面：view 'boiler' -> views/boiler/index.vue
const pageModules = import.meta.glob('@/views/*/index.vue')

// glob 的 key 是 '@/views/...' 还是 '/src/views/...' 取决于别名展开，按后缀归一化匹配
function resolveComponent(view: string) {
  if (view === 'Dashboard') return Dashboard
  const suffix = `views/${view}/index.vue`
  const loader =
    pageModules[`@/${suffix}`] ??
    pageModules[`/src/${suffix}`] ??
    Object.entries(pageModules).find(([key]) => key.endsWith(`/${suffix}`))?.[1]
  if (!loader) {
    // 清单写错 view 时，构建/启动期就能看到明确报错，而不是点菜单才白屏
    throw new Error(`nav/manifest.ts 中的 view '${view}' 找不到对应页面 src/${suffix}`)
  }
  return loader
}

const routes: RouteRecordRaw[] = NAV_ENTRIES.map((entry) => ({
  path: entry.path,
  name: entry.path === '/' ? 'dashboard' : entry.view,
  component: resolveComponent(entry.view),
}))

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
