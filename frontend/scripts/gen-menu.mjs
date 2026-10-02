#!/usr/bin/env node
/**
 * 从 menu.config.json 生成 src/menu.generated.ts。
 *
 * 导航菜单（App.vue）与路由表（router/index.ts）都只认这一份生成物，
 * 不再各自维护。生成结果是确定性的：同一清单在任何机器上输出逐字节一致。
 *
 * 用法：
 *   node scripts/gen-menu.mjs          重新生成
 *   node scripts/gen-menu.mjs --check  仅校验（已提交的生成文件过期则非零退出）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const manifestPath = resolve(root, 'menu.config.json')
const outPath = resolve(root, 'src/menu.generated.ts')

const checkOnly = process.argv.includes('--check')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
  console.error(`✘ ${manifestPath} 中 items 必须是非空数组`)
  process.exit(1)
}

const seenPath = new Set()
const seenName = new Set()

const entries = manifest.items.map((item, i) => {
  for (const key of ['path', 'name', 'label', 'view']) {
    if (typeof item[key] !== 'string' || item[key] === '') {
      console.error(`✘ items[${i}] 缺少字符串字段 ${key}`)
      process.exit(1)
    }
  }
  if (seenPath.has(item.path)) {
    console.error(`✘ path 重复：${item.path}`)
    process.exit(1)
  }
  if (seenName.has(item.name)) {
    console.error(`✘ name 重复：${item.name}`)
    process.exit(1)
  }
  seenPath.add(item.path)
  seenName.add(item.name)

  const viewAbs = resolve(root, 'src', item.view)
  if (!existsSync(viewAbs)) {
    console.error(`✘ ${item.name}（${item.label}）指向的视图文件不存在：src/${item.view}`)
    process.exit(1)
  }
  return item
})

// 名字按字母序输出导入，保证顺序不依赖清单排列之外的因素
const importLines = [...entries]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((item) => `import ${item.name} from '@/${item.view}'`)
  .join('\n')

// 路由与菜单严格按清单顺序生成
const routeLines = entries
  .map((item) => `  { path: '${item.path}', name: '${item.name}', component: ${item.name} },`)
  .join('\n')

const menuLines = entries
  .map((item) => `  { path: '${item.path}', name: '${item.name}', label: '${item.label}' },`)
  .join('\n')

const output = `// 本文件由 scripts/gen-menu.mjs 依据 menu.config.json 自动生成，请勿手工修改。
// 修改导航/路由请编辑 menu.config.json，然后执行 \`make menu\` 重新生成。
import type { RouteRecordRaw } from 'vue-router'

${importLines}

/** 路由记录：顺序与 menu.config.json 一致。 */
export const menuRoutes: RouteRecordRaw[] = [
${routeLines}
]

/** 侧边导航：顺序与路由一致，同源生成，不会再出现两处对不上的情况。 */
export interface MenuItem {
  path: string
  name: string
  label: string
}

export const navItems: MenuItem[] = [
${menuLines}
]
`

if (checkOnly) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : ''
  if (current !== output) {
    console.error('✘ 导航生成文件已过期：menu.config.json 与 src/menu.generated.ts 不一致')
    console.error('  请在仓库根目录执行 `make menu`（或 frontend 下执行 npm run gen:menu）后重试。')
    process.exit(1)
  }
  console.log('✔ 导航生成文件与清单一致')
  process.exit(0)
}

writeFileSync(outPath, output, 'utf8')
console.log(`✔ 已生成 src/menu.generated.ts（${entries.length} 个菜单/路由条目）`)
