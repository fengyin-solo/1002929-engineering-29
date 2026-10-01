import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 前端监听地址、端口与 /api 代理目标都读唯一事实源 config/local-dev.json，
// 与后端 app/config.py、scripts/dev.mjs 取同一份；改一处两处自动同步。
// 环境变量优先：FRONTEND_HOST/FRONTEND_PORT/BACKEND_HOST/BACKEND_PORT；
// 容器内设置 SKIP_DEV_CONFIG=1 时回退到下面的内置默认值。
const rootDir = fileURLToPath(new URL('.', import.meta.url))
const cfgFile = process.env.DEV_CONFIG || fileURLToPath(new URL('../config/local-dev.json', import.meta.url))

interface DevConfig {
  backend: { host: string; port: number }
  frontend: { host: string; port: number }
}
const defaults: DevConfig = {
  backend: { host: '127.0.0.1', port: 8000 },
  frontend: { host: '127.0.0.1', port: 5173 },
}
function loadConfig(): DevConfig {
  if (process.env.SKIP_DEV_CONFIG === '1' || !existsSync(cfgFile)) return defaults
  try {
    const parsed = JSON.parse(readFileSync(cfgFile, 'utf8'))
    return {
      backend: {
        host: process.env.BACKEND_HOST || parsed.backend?.host || defaults.backend.host,
        port: Number(process.env.BACKEND_PORT || parsed.backend?.port) || defaults.backend.port,
      },
      frontend: {
        host: process.env.FRONTEND_HOST || parsed.frontend?.host || defaults.frontend.host,
        port: Number(process.env.FRONTEND_PORT || parsed.frontend?.port) || defaults.frontend.port,
      },
    }
  } catch {
    // 配置损坏时不要静默用错端口，直接把问题暴露出来
    throw new Error(`无法解析本地开发配置：${cfgFile}`)
  }
}

const dev = loadConfig()
const clientHost = (h: string) => (h === '0.0.0.0' || h === '::' ? '127.0.0.1' : h)
// 显式 VITE_PROXY_TARGET 仍然优先，兼容既有的调试覆盖方式
const proxyTarget =
  process.env.VITE_PROXY_TARGET ?? `http://${clientHost(dev.backend.host)}:${dev.backend.port}`

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: dev.frontend.host,
    port: dev.frontend.port,
    // 关掉自动打开页面：起服务时只打印地址，不拉起浏览器
    open: false,
    strictPort: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
