import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 端口与后端地址统一取仓库根目录 dev.conf（脚本、后端、docker-compose 同读一份）。
// 环境变量仍可覆盖：VITE_PROXY_TARGET / DEV_FRONTEND_PORT，兼容原有调试方式。
function loadDevConf(): Record<string, string> {
  try {
    const text = readFileSync(fileURLToPath(new URL('../dev.conf', import.meta.url)), 'utf8')
    const conf: Record<string, string> = {}
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const [key, ...rest] = line.split('=')
      conf[key.trim()] = rest.join('=').trim()
    }
    return conf
  } catch {
    return {}
  }
}

const devConf = loadDevConf()
const backendPort = process.env.DEV_BACKEND_PORT ?? devConf.DEV_BACKEND_PORT ?? '8000'
const host = process.env.DEV_HOST ?? devConf.DEV_HOST ?? '127.0.0.1'
const proxyTarget = process.env.VITE_PROXY_TARGET ?? `http://${host}:${backendPort}`
const frontendPort = Number(process.env.DEV_FRONTEND_PORT ?? devConf.DEV_FRONTEND_PORT ?? '5173')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host,
    port: frontendPort,
    // 关掉自动打开页面：起服务时只打印地址，不拉起浏览器
    open: false,
    // 端口必须与 dev.conf 一致，被占时直接失败而不是静默换端口
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
