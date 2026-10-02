import { createRouter, createWebHistory } from 'vue-router'

// 路由表与侧边导航都由 menu.config.json 同源生成，不再手工维护两份。
import { menuRoutes } from '@/menu.generated'

const router = createRouter({
  history: createWebHistory(),
  routes: menuRoutes,
})

export default router
