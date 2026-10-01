<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">特种设备安全管理平台</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向锅炉、压力容器、电梯、起重机械与场内专用机动车辆等特种设备的注册登记、定期检验、维保监管与隐患排查的一体化安全管理后台。</span>
        <span class="head-user">当前值班：{{ store.operator }} · {{ store.shiftLabel }}</span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
import { NAV_ENTRIES } from '@/nav/manifest'

const store = useSessionStore()

// 导航菜单与路由共用 src/nav/manifest.ts 这一份清单，不再在模板里手抄一遍
const navItems = NAV_ENTRIES
</script>
