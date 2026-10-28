# 插件系统（Plugins）

本目录等价于 ComfyUI 的 `custom_nodes/`：把插件文件夹放进这里，内核启动后自动发现、注册、可用。
内核只维护「桌面 Shell + 登录 + 文件库 + AI 调用」，具体功能交给插件。

```
plugins/
├─ plugin-notepad/        # 文本文档        desktop 图标 ✅
├─ plugin-storyboard/     # 分镜生成        desktop 图标 ✅
├─ plugin-novel/          # 小说阅读器      desktop 图标 ✅
├─ plugin-recycle/        # 回收站          desktop 图标 ✅
├─ plugin-photos/         # 照片
├─ plugin-media/          # 媒体播放器
├─ plugin-json/           # 工作流查看器
├─ plugin-workflow/       # 工作流节点编辑器（流程图 + 参数编辑，见第 8 节）
├─ plugin-membership/     # 会员中心        开始菜单固定 ✅
├─ plugin-example/        # 示例插件（前端 UI + 后端 API + 私有数据表，照抄即可）
└─ README.md              # 本文件
```

内核（`src/shell/apps.js` 的 `APPS`）只保留 10 个外壳本体应用：
`explorer`（文件资源管理器）、`studio`（功能库）、`tasks`、`chat`、`uidesigner`、`settings`、
`character`、`tag`、`profile`、`history`。
其余全部由本目录提供 —— 这就是「加功能不动内核」的落点。

---

## 1. 最小插件（3 个文件）

```
plugins/my-plugin/
├─ plugin.json        # 清单（必需）
└─ ui/
   ├─ index.js        # 前端入口：export { default } from './App.vue'
   └─ App.vue         # 你的界面
```

`plugin.json`：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "icon": "layer",
  "app": { "w": 900, "h": 640, "multi": true, "pin": 0 },
  "desktop": true
}
```

放好后重启前端 dev server（vite 要重新收集 `import.meta.glob`），桌面就出现图标，`wm.open('my-plugin')` 即可打开。

---

## 2. plugin.json 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 应用 id，全局唯一。`wm.open(id)` 用的就是它 |
| `name` | ✅ | 窗口标题 / 桌面标签 |
| `version` | | 语义化版本 |
| `icon` | | 图标名，见 `src/shell/icons.js`（未知名字会静默回退 `file`） |
| `coreVersion` | | 兼容的内核版本范围，如 `">=1.0.0"` |
| `desktop` | | `true` 时自动在桌面生成图标 |
| `app.multi` | | 能否开多个窗口，默认 `true` |
| `app.pin` | | `>0` 时出现在开始菜单「已固定」 |
| `app.w` / `app.h` | | 默认窗口尺寸，默认 900×640 |
| `app.entry` | | 前端入口，固定写 `ui/index.js` |
| `app.export` | | 导出名，默认 `default` |
| `app.dist` | | **预构建**产物路径（第 4 节），如 `dist/index.mjs` |
| `server.entry` | | 后端入口文件，如 `index.server.js` |
| `server.route` | | 后端挂载路径，缺省 `/api/p/<id>` |
| `permissions` | | 声明式权限（当前仅作声明与展示） |

---

## 3. 后端插件

在 `plugin.json` 加：

```json
"server": { "entry": "index.server.js", "route": "/api/p/my-plugin" }
```

`index.server.js`（项目是 `"type": "module"`，请用 ESM；要用 CommonJS 就把后缀改成 `.cjs`）：

```js
export function register(ctx) {
  const router = ctx.router()

  ctx.ensureTable('jobs', `CREATE TABLE IF NOT EXISTS {table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT
  )`)

  router.get('/hello', (req, res) => res.json({ success: true, from: ctx.id }))
  return router   // 返回 null 表示只有前端
}
export default register
```

### ctx 可用能力（`server/plugin-sdk.js`）

| 能力 | 说明 |
|---|---|
| `ctx.db` | 主 SQLite 实例（better-sqlite3，同步 API） |
| `ctx.table('jobs')` | 带前缀的表名 → `pl_my_plugin_jobs`，天然隔离 |
| `ctx.ensureTable(name, ddl)` | 幂等建表，ddl 中的 `{table}` 会替换成带前缀表名 |
| `ctx.config.get/set/remove/all` | 插件私有配置，存 `本插件/data/config.json` |
| `ctx.dataDir` | 插件私有数据目录（自动创建） |
| `ctx.auth` | 需要登录的中间件 |
| `ctx.router()` | 新建 Express Router |
| `ctx.log / ctx.warn` | 带 `[plugin:id]` 前缀的日志 |

前端调用自己的后端：

```js
import { apiClient } from '@/services/api'
const r = await apiClient.requestRaw('/api/p/my-plugin/hello')
```

---

## 3.5 把内核里已有的应用迁成插件（4 步）

这是内核瘦身的标准动作，已跑通 9 次（notepad / photos / media / json / workflow /
storyboard / novel / recycle / membership），按下面做不会踩坑：

1. **建目录 + 移动组件**（`appId` 必须保持不变，否则文件双击、任务栏固定会全部失效）：
   ```
   plugins/plugin-xxx/plugin.json
   plugins/plugin-xxx/ui/index.js      → export { default } from './App.vue'
   plugins/plugin-xxx/ui/App.vue       ← 由 src/components/apps/XxxApp.vue 移动过来
   ```
   组件用到的**私有子组件**（如 `JsonNode.vue`）一并移到 `ui/`，相对 import 不用改。
2. **写 `plugin.json`**：把 `src/shell/apps.js` 里原来的那一行原样搬过来 ——
   `name / icon / multi / pin / w / h` 一一对应，别顺手改。
3. **从 `apps.js` 摘掉** import 与 `APPS` 条目。
   ⚠ 摘 import 时千万别误删别的行：`vite build` **查不出变量未定义**，
   只会成功，运行时才 `ReferenceError` 白屏。
4. **桌面图标**：从 `Desktop.vue` 的 `BUILTIN_DESK_ICONS` 移除该项，改在清单里写 `"desktop": true`。
   这样图标是否出现由插件自己声明，内核不再认识这个应用。

收尾必做：`vite build` 通过后**实机开一次页面**，确认「文件资源管理器 / 设置」等内核窗口正常，
再逐个 `wm.open(id)` 打开迁移后的应用看渲染（控制台输 `__wm.open('xxx')`）。

---

## 4. 两条分发渠道

| 渠道 | 用法 | 适用 |
|---|---|---|
| **A 源码**（默认） | `ui/index.js` 由 vite 的 `import.meta.glob` 在**构建期**收集，代码分割按需加载 | 第一方插件、自己开发，改完热更新 |
| **B 预构建** | `app.dist` 指向已打包好的 `dist/index.mjs`，运行期 HTTP 动态 `import()` | 第三方插件，免重新构建内核 |

渠道 B 的构建方式（把 Vue 排除，避免和内核重复打包）：

```js
// plugins/my-plugin/vite.plugin.config.js
build: {
  lib: { entry: 'ui/index.js', formats: ['es'], fileName: 'index' },
  rollupOptions: { external: ['vue', 'pinia', /^@\//] }
}
```

产物放 `plugins/my-plugin/dist/index.mjs`，并在清单写 `"app.dist": "dist/index.mjs"`。
内核会把 `/plugins/<id>/...` 作为静态资源暴露。

---

## 5. 管理接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/plugins` | 全部插件清单（含 `enabled`） |
| POST | `/api/plugins/:id/enabled` | `{ enabled: false }` 禁用 / `true` 启用 |
| DELETE | `/api/plugins/:id` | 删除插件目录 |
| POST | `/api/plugins/install` | `{ fromDir }` 本地目录导入 或 `{ url }` 下载 zip 解压 |
| GET | `/api/health` | `plugins` 字段含 total / enabled / mounted / failed |

> 后端路由的挂载发生在 `api-server` **启动时**，所以改启用状态后需要重启 api-server 才生效（响应里会带 `needRestart: true`）。

状态文件：`server/plugins-state.json`（`{ "<id>": { enabled: true } }`）。

---

## 6. 内核暴露给插件的前端能力

```js
import { apiClient } from '@/services/api'      // 全部后端接口 + requestRaw
import { useToast } from '@/shell/toast'        // toast.show(msg, 'success'|'error')
import { icon } from '@/shell/icons'            // icon('notepad')
import { useWm } from '@/shell/wm'              // wm.open('explorer') 打开别的应用
import { useVfs } from '@/shell/vfs'            // 虚拟文件系统
import { registerApp } from '@/shell/apps'      // 一个插件注册多个应用
```

⚠ 只 import 上面这些稳定入口；直接 import 内核内部文件，内核升级时容易断。

---

## 7. 调试出口（浏览器控制台）

| 变量 | 内容 |
|---|---|
| `__plugins` | `{ list, errors, apps, status, registered, reload }` —— 已注册应用、失败明细、加载状态 |
| `__plugins.reload()` | 重新发现并注册一遍（改了 plugin.json 后不用刷页面） |
| `__wm` | 窗口管理器 store（仅 dev 构建）。`__wm.open('novel')` 直接开任意应用/插件 |

页面白屏时先看 `localStorage.__lastError` —— `main.js` 会把未捕获错误写进去，并在页面顶部弹红条。

---

## 8. plugin-workflow：工作流节点编辑器

双击 ComfyUI 工作流文件（`.json`，API / UI 两种格式都认）时打开。

```
ui/
├─ index.js         入口
├─ App.vue          布局与编辑写回
├─ comfy.js         解析 / 自动布局 / 控件推断 / 路径读写（纯函数）
├─ GraphCanvas.vue  节点图画布（SVG 连线 + 节点卡，拖拽/平移/缩放）
├─ NodeList.vue     左侧节点列表（按用途分组着色 + 搜索）
└─ NodeProps.vue    右侧参数面板（按类型给控件）
```

能力：
- **流程图**：API 格式没有坐标 → 按依赖层级自动从左到右布局；UI 格式直接用文件里的 `pos`。
  节点按用途着色（加载=蓝 / 编码=紫 / 采样=橙 / Latent=青 / 图像=绿 / 模型=粉 / 工具=琥珀）。
  节点可拖动（只改内存布局，**不写回 JSON**——提交给 ComfyUI 的数据不该带坐标）、画布平移/滚轮缩放/适应窗口。
- **中文标题**：优先显示 `_meta.title`（API 格式）或 `title`（UI 格式），类型做小字。
- **参数控件按类型**：长文本（提示词）→ 多行框 + ⤢ 全屏编辑；数字 → 带常见范围（steps/cfg/denoise…）+ seed 的 🎲 随机；枚举（sampler_name/scheduler…）→ datalist 候选（仍可手输）；布尔 → 开关；嵌套对象（如 Power Lora Loader 的 `lora_1`）→ 展开成子字段；`{type:'XxxWidget'}` 这类控件标记识别为不可编辑。
- **连线引用**：显示「← 来源节点」，点击跳转过去。
- **改动追踪**：改过的参数有黄点 + 保存按钮出现 ●；支持单节点「还原」（对照打开时的快照）；改回原值自动撤掉标记。
- **保存**：文件库文件写回 `content`，工作流库记录走 `PUT /api/workflow-apis/:id`。

---

## 9. 已知限制

1. **新增/删除插件目录要重启 vite dev server**（渠道 A 依赖构建期 glob）。生产构建同理，要重新 `vite build`。渠道 B 不需要。
2. 启用/禁用后要重启 api-server 才会真正挂载/卸载后端路由。
3. 插件代码等同本机 Node 权限，安装第三方插件前请看清源码。
4. `coreVersion` 目前只做记录，尚未强制校验。
5. 桌面图标的**顺序**由「内核列表在前、插件按注册顺序追加」决定，暂不支持自定义排序。
