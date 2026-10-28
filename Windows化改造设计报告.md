# 《游戏UI界面管理系统 AI批量生图》Windows 11 化 UI 全面改造设计报告

> **文档版本**：v1.0 ｜ **日期**：2026-09-20
> **用途**：本报告是可直接交给执行 Agent 的改造说明书。Agent 应按 §9 路线图逐阶段实施，每个阶段末尾附有验收标准；涉及数据库的改动见 §7，涉及组件文件改动的索引见 §11。
> **参考原型**：`H:\trae work\window操作界面\`（index.html / style.css / app.js）已实现一个纯 JS 的 Windows 11 桌面模拟器（窗口管理器、任务栏、开始菜单、右键菜单、资源管理器、回收站、拖拽/复制剪切粘贴），本次改造将其交互范式移植到 Vue 3 项目中，样式与交互细节可直接参考该原型。

---

## 1. 项目现状盘点

### 1.1 技术栈
| 层 | 技术 |
|---|---|
| 前端 | Vue 3.5 + Pinia 3 + Vite 6（SPA，无 vue-router，用 `activeNav` 切换 `v-show`） |
| 后端 | Express 4（`server/api-server.js`，端口 3007；`download-server.js`；`ui-system.js` 提供 UI 设计器独立路由） |
| 数据库 | better-sqlite3（`server/data.db`，WAL 模式），JWT + bcryptjs 认证 |
| 文件存储 | `server/gallery/<userId>/<uuid>.png`（原图落盘，缩略图 base64 入库） |
| 其他依赖 | @supabase/supabase-js（预留云同步）、cropperjs、image-size、marked、multer |

### 1.2 功能模块清单（侧边栏 → 组件 → 数据表）
| 导航（navGroups） | 组件 | 主要数据表 |
|---|---|---|
| 设置 → API配置 | SettingsPanel(tab=ai) | `ai_configs`, `ai_config_categories` |
| 设置 → ComfyUI配置 | SettingsPanel(tab=comfyui) | `comfyui_configs`, `comfyui_config_categories` |
| 设置 → 分镜生成 | SettingsPanel(tab=parser) | storyboard 解析（批量/测试/规则三个子页） |
| 库 → 文件库 | FileLibrary | `file_library_categories/folders/files/tags/file_tags/tag_categories` |
| 库 → 角色库 | CharacterPanel | `characters`, `character_categories`, `teams`, `team_categories` |
| 库 → 功能库 | SingleGenerate（保存功能单元） | `functions`, `function_categories`（config_json 保存整套生成配置：工作流/提示词/图生视频参数等） |
| 库 → 标签库 | TagManager | `file_library_tags`, `file_library_tag_categories` |
| 任务 → 执行中/已完成/任务库 | TaskLibrary | `generation_tasks`, `task_categories`, `batch_generation_jobs`（execution_status: idle/executing/completed） |
| UI界面 | UIView + UIEditorCanvas/WidgetBar/LayerPanel/PropertyPanel/Renderer | `ui-system.js` 独立 sqlite（schemes/assets/categories/templates） |
| AI对话 | ChatPanel + ConversationHistory | `conversations`, `rules`, `rule_categories` |
| 用户 | UserProfile / AuthModal | `users`, `sessions`, `user_configs` |

**关键工作流**：提示词库/分镜JSON（`prompts`, `storyboard_jsons`）→ 组装生成任务（`generation_tasks`，打包 JSON 文件 + workflow）→ 调用 ComfyUI API 批量出图/出视频 → 结果入 `generated_images` / 文件库。

### 1.3 数据库模型摘要
- **一切数据均挂 `user_id`**（外键 CASCADE），天然支持多会员数据隔离。
- `file_library_folders` **已支持 parent_id 嵌套**；`file_library_files.file_type` 已区分 `image/video/audio/prompt/json/workflow/rule`，且带 `thumbnail_data / file_size / width / height / content / prompt_count / is_valid`。
- 各业务表均有 `*_categories` 分类表（扁平，仅 sort_order）。
- **缺失**：软删除/回收站机制（全部物理删除）、会员等级与配额表、统一的"最近使用"记录。

### 1.4 已有可复用资产
- `FloatingWindow.vue` + `stores/windowManager.js`（z-index 分配/焦点管理，BASE_Z=10000）——是窗口管理器的雏形，但目前仅是模态弹窗性质，不支持多实例/最小化/最大化。
- `ImageViewer.vue`（全屏图片查看器）、`MdEditor.vue`、`ImageCropper.vue`、`FileSelector.vue`、`useDragDrop.js`、`fileEditBus.js`、`GenerationProgress.vue`。
- 参考原型中的完整 WM/任务栏/右键菜单/资源管理器实现（纯 JS，逻辑可翻译成 Vue 组件）。

### 1.5 现存问题（改造需一并解决）
1. 单页 `v-show` 切换：任何时刻只能看一个功能，无法并排"一边看图一边写提示词"。
2. 文件库/角色库/提示词各自为政，分类表概念重复，用户需在多个导航间跳转。
3. 删除即物理删除，无恢复手段。
4. 设置、对话、设计器挤在同一个内容区，视觉上没有"程序"边界。
5. 会员只有登录态，无等级/配额体系。

---

## 2. 改造目标与设计原则

**目标**：把现有"左侧导航 + 单内容区"的 Web 管理系统，重构为 **Windows 11 桌面操作系统隐喻**的应用平台：

1. **桌面即工作台**：壁纸 + 桌面图标（此电脑/回收站/各库快捷方式）。
2. **功能即程序**：任务系统、UI设计器、AI对话、生成工作台 = 可多开、可最小化、可最大化的独立应用窗口，固定在任务栏和开始菜单。
3. **数据即文件**：数据库中的提示词/图片/视频/工作流/规则，全部以"文件/文件夹"形态在**文件资源管理器**中呈现，支持 Windows 式新建、重命名、复制/剪切/粘贴、拖拽移动、删除进回收站、还原。
4. **配置即设置**：API配置、ComfyUI配置、主题、账户、会员 = "设置"应用。
5. **多会员多目录**：登录后每会员只见到自己的"用户目录"（类比 `C:\Users\<用户名>`），数据隔离沿用现有 user_id 机制；不同会员等级拥有不同配额与界面标识。

**设计原则**：
- **外壳与内核分离**：Windows Shell（桌面/任务栏/WM/菜单）是纯表现层；所有业务逻辑、Pinia store、API 调用**原样保留**，只换"容器"。
- **渐进式改造**：任何阶段应用都可运行，绝不一次性重写。
- **键盘/右键/拖拽三通道**：每个文件操作都同时提供右键菜单、快捷键、拖拽三种方式。
- **保底降级**：旧导航保留为"开始菜单 → 所有应用"的兜底入口，直至新形态验收完毕。

---

## 3. 技术路线（Agent 必读）

**方案 A（采纳）：在现有 Vue 项目内实现 Vue 版 Windows Shell。**
- 新增 `src/shell/` 目录：`Desktop.vue`、`Taskbar.vue`、`StartMenu.vue`、`WindowFrame.vue`、`ContextMenu.vue`、`ActionCenter.vue`、`LockScreen.vue`、`stores/wm.js`（窗口管理器 store）、`apps.js`（应用注册表）。
- 现有业务组件（FileLibrary、ChatPanel、TaskLibrary…）**不重写内部逻辑**，改造为"窗口内容组件"：去掉各自的全屏布局假设（100vh、fixed 定位），接受窗口尺寸约束（`height:100%` 弹性布局）。
- App.vue 改为：`LockScreen（未登录） → Desktop（已登录）`。

**方案 B（否决）**：以纯 HTML 模拟器为底座 + iframe 嵌入旧页面。理由：丢失 Pinia 状态与后端会话，跨 iframe 通信成本高，样式难统一。

**与参考原型的关系**：原型的 WM/任务栏/菜单是"实现参考"，不是"代码拷贝对象"——所有 Shell 代码用 Vue 3 组合式 API 重写，状态进 Pinia（`stores/wm.js`），样式合并进 `src/style.css` 或新建 `src/shell/shell.css`。

---

## 4. Windows Shell 总体设计

### 4.1 桌面（Desktop.vue）
- 壁纸：Windows 11 风格渐变（深浅主题各一张，跟随主题切换）。
- 桌面图标（可右键/双击/框选）：
  - 此电脑（打开资源管理器根目录）
  - 回收站（空/满两种图标）
  - 我的文件库（资源管理器定位到 file_library 根）
  - 我的角色库、提示词库、任务库（虚拟目录快捷方式）
  - 用户拖到桌面的文件/文件夹快捷方式（P2，可后做）
- 桌面右键菜单：查看、排序、刷新、新建（文件夹/提示词文档/导入文件…）、粘贴、个性化（打开设置-个性化）、显示设置。

### 4.2 任务栏（Taskbar.vue）
高 48px，底部居中，Acrylic 毛玻璃（`backdrop-filter: blur(40px) saturate(1.6)`）：
- **左区**：开始按钮（Win 徽标）、搜索按钮（弹出搜索面板：搜文件/角色/任务/对话）、小组件按钮。
- **中区**：固定应用图标（见 §5 注册表 PINNED）+ 运行中窗口按钮（合并同应用多窗口，下划线指示运行态，活动窗口高亮底色；悬停显示窗口标题预览，缩略图预览 P3 可选）。
- **右区（系统托盘）**：
  - **生成进度指示**：任务执行中显示旋转进度环/百分比徽标，点击打开"任务中心"窗口 —— 这是本系统最重要的托盘增强。
  - ComfyUI 连接状态图标（绿=已连接/红=断开，点击打开设置-ComfyUI）。
  - 同步状态图标（✅已保存/⏳同步中，复用现有 syncStatus 逻辑）。
  - 通知铃铛 + 日期时间（点击开 ActionCenter）。
- 最右"显示桌面"细条。

### 4.3 开始菜单（StartMenu.vue）
- 顶部搜索框；**已固定**应用网格（6 列）；**推荐**（最近打开的 6 个文件，来自 §7 的 `recent_items`）；底部用户头像（点击 → 用户中心）+ 电源（注销/重启到登录界面）。
- "所有应用"列表 = 旧导航全部入口（兜底）。

### 4.4 通知中心 / ActionCenter（右下角）
- 通知列表：任务完成/失败、同步状态、会员配额预警（80%、100%）。
- 快捷开关：深浅主题切换、侧栏（旧）开合、ComfyUI 连接开关、免打扰。
- `GenerationProgress.vue` 的全局顶部进度条改为 **toast + 托盘进度** 双通道。

### 4.5 窗口管理器（stores/wm.js + WindowFrame.vue）★核心
```js
// stores/wm.js 状态设计
windows: []  // { id, appId, title, icon, props, x,y,w,h, state:'normal'|'max'|'min', zIndex, prevRect }
focusedId, nextZ  // 沿用现有 windowManager 的 Z 区间(10000~90000)，ImageViewer(99999) 仍最高
// API: open(appId, props?, {singleton}) / close / focus / minimize / toggleMax / restore / snap(side) / setTitle(id, title)
```
- **WindowFrame.vue**：标题栏（图标+标题+最小化/最大化/关闭，双击标题栏最大化）、内容插槽 `<component :is="app.component" v-bind="win.props" @set-title="...">`、8 向缩放手柄、拖动（`max` 状态下拖动=还原并跟随鼠标）。
- Win11 视觉：圆角 8px、1px 高光边框、`0 18px 50px rgba(0,0,0,.42)` 阴影、活动窗口标题栏微亮。
- **Snap 布局**（P2）：拖到屏幕边缘左/右半屏、最大化；悬停最大化按钮弹出 2×2 贴靠布局选择（可后做）。
- 现有 `FloatingWindow.vue` 保留为"对话框级"窗口（确认框、小表单），与 WM 窗口并存：对话框 z 区间 9000（低于窗口），或后续统一迁入 WM。
- 窗口关闭时若有未保存内容（提示词编辑器脏状态），弹 FloatingWindow 确认。

### 4.6 右键菜单系统（ContextMenu.vue）
全局单例组件，Teleport 到 body；数据驱动 `{label, icon, shortcut, disabled, sub[], onClick, sep}`；自动边缘翻转；submenu 悬停展开。
**必须覆盖的菜单位**：桌面空白/桌面图标/资源管理器空白/文件/文件夹/回收站内项目/任务栏按钮/托盘图标/开始菜单磁贴。完整菜单项矩阵见 §8.1。

### 4.7 锁屏与登录（LockScreen.vue + AuthModal 改造）
- 未登录：锁屏壁纸 + 时钟 → 点击/回车升起登录卡片（现有 AuthModal 表单迁入，视觉改 Win11 圆角卡片）。
- 登录成功 → 进入桌面，播放 0.3s 淡入；头像进入开始菜单右下角。
- 会员标识：头像角标（Free/Pro/企业），见 §6.9。

---

## 5. 应用注册表（apps.js）

Shell 的唯一事实来源。Agent 新增应用只需在此登记：

```js
// src/shell/apps.js
export const APPS = {
  explorer:  { name:'文件资源管理器', icon:icoExplorer, component: FileExplorerApp, multi:true,  pin:1 },
  photos:    { name:'照片',           icon:icoPhotos,   component: PhotoViewerApp,  multi:true,  pin:1 },
  media:     { name:'媒体播放器',     icon:icoMedia,    component: MediaPlayerApp,  multi:true },
  notepad:   { name:'提示词编辑器',   icon:icoNotepad,  component: PromptEditorApp, multi:true,  pin:1 },
  jsonview:  { name:'工作流查看器',   icon:icoJson,     component: JsonViewerApp,   multi:true },
  tasks:     { name:'任务中心',       icon:icoTasks,    component: TaskCenterApp,   multi:false, pin:1 },
  studio:    { name:'生成工作台',     icon:icoStudio,   component: StudioApp,       multi:true,  pin:1 },
  uidesigner:{ name:'UI 设计器',     icon:icoUID,      component: UIDesignerApp,   multi:true,  pin:1 },
  chat:      { name:'AI 对话',        icon:icoChat,     component: ChatApp,         multi:true,  pin:1 },
  settings:  { name:'设置',           icon:icoSettings, component: SettingsApp,     multi:false, pin:1 },
  recycle:   { name:'回收站',         icon:icoRecycle,  component: RecycleApp,      multi:false },
  character: { name:'角色管理',       icon:icoChar,     component: CharacterApp,    multi:true },
}
export const PINNED_TASKBAR = ['explorer','studio','tasks','chat','uidesigner','notepad','settings']
export const PINNED_START   = [...PINNED_TASKBAR, 'photos','character','recycle']
```

---

## 6. 各应用详细设计

### 6.1 文件资源管理器（FileExplorerApp）★改造核心
现有 `FileLibrary.vue` 的"分类 + 文件夹 + 文件"升级为完整 Windows 资源管理器体验。

**目录结构（用户视角）**：
```
此电脑
├─ 我的文件库                ← file_library（真实嵌套文件夹，主力区）
├─ 提示词库                  ← prompt_categories + prompts（虚拟挂载）
├─ 分镜脚本                  ← storyboard_categories + storyboard_jsons
├─ 工作流                    ← workflow_categories + workflow_apis（.json 文件形态）
├─ 规则库                    ← rule_categories + rules（.md 文件形态）
├─ 功能库                    ← function_categories + functions（.fx 配置文件形态）
├─ 角色库                    ← character_categories + characters（.char 卡片形态）
├─ 图片库                    ← gallery_categories + gallery_images
└─ 桌面                      ← 用户的桌面快捷方式区（P2）
```

**虚拟文件系统映射规则（VFS 适配层）**：
- 新建 `src/shell/vfs.js`：统一接口 `list(path) / create / rename / move / copy / trash / restore / search`，内部按"挂载点"分发到对应 API（fileLibrary*API、promptAPI、workflowAPIAPI…）。
- 每个挂载点把"分类/文件夹"映射为目录节点、"记录"映射为文件节点；节点携带 `{ mount, table, id }` 而非仅数据库 id，操作回传时按 mount 路由到正确的 API。
- `file_library_folders.parent_id` 是真实树；其余挂载点默认两层（分类→文件），分类支持右键新建/重命名/删除（映射到 category API）。

**文件类型 → 关联应用（双击打开）**：
| file_type / 来源 | 打开方式 |
|---|---|
| image | 照片应用（内嵌现有 ImageViewer，缩放/旋转/上一张下一张/设为封面） |
| video / audio | 媒体播放器（HTML5 `<video>/<audio>`，播放/倍速/截图帧） |
| prompt（.txt/.md） | 提示词编辑器（内嵌 MdEditor，保存回写 content，字数/提示词计数） |
| json（workflow/storyboard） | 工作流查看器（树形展示 JSON、校验状态展示 is_valid/validation_message、"发送到生成工作台"按钮） |
| rule（.md） | 规则编辑器（同提示词编辑器，多一个 type 选择） |
| functions（.fx） | 打开生成工作台并载入该功能配置 |
| characters（.char） | 打开角色管理并定位该角色 |

**Windows 式操作映射**：
| 操作 | 实现 |
|---|---|
| 新建文件夹 | fileLibraryFolderAPI.create(parent_id) → 行内重命名（F2/右键） |
| 新建提示词文档 | promptAPI/fileLibraryFileAPI.create(content='') → 打开编辑器 |
| 重命名 | API update name → 列表刷新（校验重名，Windows 式"包含同名项"提示） |
| 复制/剪切/粘贴 | 剪贴板状态存 Pinia（`{mode, items:[{mount,id}]}`）；粘贴：copy=新建副本（文件复制缩略图/内容），cut=move（更新 folder_id / category_id）；跨挂载点粘贴=类型转换导入（如把提示词复制进文件库→创建 file_type=prompt 的文件） |
| 拖拽移动 | HTML5 DnD：文件→文件夹 = move；文件→面包屑/导航节点 = move；跨窗口拖拽 P3（借助全局剪贴板 store 实现"拖起-落下"两段式） |
| 删除 | → 移入回收站（§7 recycle_bin），Windows 式确认对话框列出数量 |
| 恢复 | 回收站应用内"还原"（按 original_mount/original_parent 回迁） |
| 多选 | 单击/Ctrl 单击/Shift 范围/空白处框选（参考原型 selection-box 实现） |
| 视图 | 大图标（缩略图）/列表/详细信息（名称、类型、大小、修改时间、标签）三视图切换 |
| 排序/筛选 | 名称/修改时间/大小/类型；右侧筛选面板（RightFilterPanel 改造为资源管理器侧边"标签筛选"面板） |
| 地址栏 | 面包屑（每级可点、可下拉显示同级），前进/后退/向上按钮 + 历史栈 |
| 搜索 | 当前挂载点内按名称/标签搜索（后端新增 search 接口，见 §7） |

**多开**：每个资源管理器窗口独立历史与路径（win.props = { path }），满足"多开文件夹"需求。

### 6.2 设置（SettingsApp）
现有 SettingsPanel 三个 tab 迁移为 Win11 设置的左侧页导航：
- **API 与模型**（原 API配置）：分类 tab 保留为页内分组；每条 ai_config 呈现为"账户式"卡片行，激活态=Win11 单选高亮。
- **ComfyUI 连接**（原 ComfyUI配置）：同上；新增"连接测试"状态灯；托盘图标联动。
- **分镜生成**（原 parser）：作为独立工具页保留三子页（批量/测试/规则）。
- **账户**（原 UserProfile）：头像裁剪（ImageCropper）、改密码、注销。
- **会员**（新增，§6.9）。
- **个性化**：主题（深/浅，沿用 data-theme 机制）、壁纸选择、任务栏对齐（居中/左）。
- **关于**：版本、数据目录、数据库大小。

### 6.3 任务中心（TaskCenterApp）
现有 TaskLibrary（任务库/执行中/已完成）改为单窗口三视图（列表 + "执行中"置顶 + 进度条内联）：
- 任务卡片：名称、工作流、进度 x/y、成功/失败计数、开始/暂停/重试/删除、错误信息（error_message）展开。
- 与托盘进度图标、ActionCenter 通知联动（完成/失败各推一条通知）。
- "新建任务"引导到生成工作台；任务详情中每个 JSON 文件可点击 → 用工作流查看器打开。
- 已完成任务的产物按钮 → 资源管理器定位到输出目录。

### 6.4 生成工作台（StudioApp）
现有 SingleGenerate + BatchGenerate + FunctionEditor 整合为一个应用的三种模式页（文生图/图生图/图生视频 tab 保留）：
- 从资源管理器"发送到工作台"：提示词文件→填入提示词框；图片文件→填入图生图输入；工作流 JSON→选中工作流；.fx 功能→整套装载。
- 生成结果即时以 toast + 缩略图浮出，"在文件夹中显示"按钮 → 打开资源管理器并选中该文件。
- 功能库保存 = 现有 functions 逻辑不变。

### 6.5 UI 设计器（UIDesignerApp）
现有 UIView 全家桶（UIEditorCanvas/WidgetBar/LayerPanel/PropertyPanel/Renderer/TopToolbar）整体装入窗口：
- 画布缩放适配窗口尺寸；"保存为图片"→落盘到文件库图片目录并出现在资源管理器（打通"保存原型图 → ComfyUI 后期加工"链路）。
- 资产选择器（AssetSelector）支持从资源管理器拖图入画布（P3）。

### 6.6 AI 对话（ChatApp）
现有 ChatPanel + ConversationHistory 装入窗口，多开=多个会话并排：
- 保留角色选择（角色库联动）、规则注入、生图指令。
- 角色卡片可从资源管理器"角色库"拖入对话窗口快速切换角色（P3）。
- 生成的表情/动作图右键"在文件夹中显示"。

### 6.7 查看器套件
- **照片**：现有 ImageViewer 去全屏化（保持 z 最高策略：查看器窗口 zIndex 设为 99000，位于普通窗口之上），支持缩放/适应窗口/旋转/删除（进回收站）/文件信息。
- **媒体播放器**（新）：`<video controls>` 封装，支持常见 mp4/webm/mp3。
- **提示词编辑器**：MdEditor + 保存（Ctrl+S）/另存为/字数统计/标签编辑。
- **工作流查看器**：JSON 树 + 校验徽标 + 复制/发送到工作台。

### 6.8 回收站（RecycleApp）
- 列出 recycle_bin 中当前用户条目（原位置、删除时间、类型图标）。
- 操作：还原 / 永久删除（二次确认）/ 清空回收站。
- 桌面图标随内容空/满切换。

### 6.9 会员系统（新增功能）
- **users 表扩展**（§7）：`membership_tier('free'|'pro'|'max')`、`membership_expires_at`、`quota_json`。
- **配额项**：存储空间（汇总 file_library_files.file_size + gallery_images.file_size）、单日生成张数、并发任务数、AI 对话日次数。
- **执行点**：后端配额中间件（生成/上传前校验，超限返回 403+code）；前端在生成工作台/任务中心展示剩余额度条，ActionCenter 在 80%/100% 推送预警。
- **界面差异**：开始菜单头像角标、设置-会员页（权益对比表+升级入口占位）、Pro 以上可开更多并发窗口提示。
- **多会员目录隔离**：沿用 user_id；登录后资源管理器根即"当前用户空间"，切换账号 = 锁屏 → 另一会员登录，看到完全不同的目录内容。

---

## 7. 数据库改造方案（Agent 直接执行）

```sql
-- 1) 回收站（统一软删除，跨表通用）
CREATE TABLE IF NOT EXISTS recycle_bin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,          -- 'file'|'folder'|'prompt'|'rule'|'workflow'|'json'|'function'|'character'|'image'...
  item_id INTEGER NOT NULL,         -- 原表主键
  payload TEXT NOT NULL DEFAULT '{}', -- 删除时的完整行快照（JSON），还原时优先用快照重建
  original_mount TEXT NOT NULL DEFAULT '',   -- 挂载点，如 'filelib'|'prompts'|'rules'
  original_parent_id INTEGER,       -- 原 folder_id / category_id
  original_parent_table TEXT NOT NULL DEFAULT '', -- 'file_library_folders'|'prompt_categories'...
  deleted_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recycle_user ON recycle_bin(user_id, deleted_at);

-- 2) 会员
ALTER TABLE users ADD COLUMN membership_tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN membership_expires_at TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN quota_json   TEXT DEFAULT '{}';
-- quota_json 建议结构：{"storageMB":2048,"dailyImages":100,"concurrentTasks":1,"dailyChat":200}

-- 3) 最近使用（开始菜单"推荐"）
CREATE TABLE IF NOT EXISTS recent_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mount TEXT NOT NULL, item_id INTEGER NOT NULL, name TEXT DEFAULT '',
  opened_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, mount, item_id)
);

-- 4) 文件库支持跨文件夹移动的排序稳定（已有 sort_order，无需改）
```

**API 增补（api-server.js 新路由，全部挂 authMiddleware）**：
- `POST /api/recycle/move-in`、`GET /api/recycle/list`、`POST /api/recycle/restore`、`POST /api/recycle/purge`、`POST /api/recycle/empty`
- `GET /api/vfs/list?mount=&parentId=`、`POST /api/vfs/create`、`POST /api/vfs/rename`、`POST /api/vfs/move`、`POST /api/vfs/copy`、`GET /api/vfs/search?q=&mount=`
- `GET /api/recent/list`、`POST /api/recent/touch`
- `GET /api/membership/quota`、`PUT /api/membership/quota`（管理员占位）
- 生成/上传路由前挂 `quotaMiddleware`。

**规则**：所有现有物理删除接口改为"先写 recycle_bin 再删除（或打软删标记）"；还原 = 按 payload 重建/回插并校验重名（追加 " (2)"）。

---

## 8. 交互与视觉规范

### 8.1 右键菜单项矩阵（必须实现）
| 位置 | 菜单项 |
|---|---|
| 文件 | 打开 / 打开方式▸ / 发送到▸(生成工作台/对话) / 剪切 Ctrl+X / 复制 Ctrl+C / 重命名 F2 / 删除 Del / 标签▸ / 属性 |
| 文件夹 | 打开 / 在新窗口中打开 / 剪切 / 复制 / 粘贴 / 新建▸(文件夹/提示词/导入文件) / 重命名 / 删除 / 属性 |
| 资源管理器空白 | 查看▸(大图标/列表/详细信息) / 排序▸ / 刷新 F5 / 粘贴 / 新建▸ / 属性 |
| 桌面空白 | 查看 / 刷新 / 粘贴 / 新建▸ / 个性化 / 显示设置 |
| 回收站项 | 还原 / 永久删除 / 属性 |
| 任务栏按钮 | 打开新窗口 / 关闭窗口（多实例时列出全部） |
| 生成结果图片 | 打开 / 在文件夹中显示 / 设为角色头像 / 发送到图生图 |

### 8.2 快捷键表
| 键 | 行为 |
|---|---|
| Ctrl+C/X/V | 复制/剪切/粘贴（作用于焦点窗口的选中项） |
| Del / F2 / F5 | 删除/重命名/刷新 |
| Ctrl+A / Esc | 全选 / 取消选择·关菜单 |
| Alt+F4 | 关闭活动窗口 |
| Win / Ctrl+Esc | 开关开始菜单 |
| Ctrl+S | 编辑器保存 |
| 双击标题栏 | 最大化/还原 |

### 8.3 视觉规范
- 色板（浅色）：背景 `#f3f3f3`、面板 `rgba(249,249,249,.82)`、强调 `#0067c0`、文字 `#1b1b1b`；深色主题沿用项目现有 `data-theme` 变量体系并按 Win11 深色（`#202020` 面板、强调 `#4cc2ff`）重映射。
- 圆角：窗口 8px、菜单/卡片 8px、按钮 5px；阴影：`0 18px 50px rgba(0,0,0,.42)`（窗口）、`0 10px 30px rgba(0,0,0,.32)`（菜单）。
- 毛玻璃：任务栏 blur(40px)、菜单 blur(30px)、开始菜单 blur(50px)，均加 `saturate(1.4~1.8)`。
- 字体：Segoe UI / Microsoft YaHei，正文 13px，标题 12.5~14px。
- 图标：任务栏/开始菜单用扁平双色 SVG（参考原型 ICON 库扩展）；文件类型图标 = 底色角标（图片绿、提示词蓝、视频紫、JSON 橙、规则红）+ 缩略图优先。
- **重要教训（本次已踩坑）**：SVG 图标进入面包屑/导航/标题栏等小容器时必须用 CSS 约束 `svg{width:16px;height:16px}`，否则 46px 内联图标会撑爆 flex 导致文字重叠。

---

## 9. 实施路线图（按阶段交付，每阶段可运行）

### P0 Shell 框架（预计改动：新增 shell/* 8 个文件，改 App.vue、main.js）
1. 实现 stores/wm.js、WindowFrame.vue、ContextMenu.vue、Taskbar.vue、StartMenu.vue、Desktop.vue（先用假图标）。
2. App.vue：登录后渲染 Desktop；AuthModal 迁入 LockScreen。
3. 验收：登录后见桌面；能从开始菜单打开"设置"占位窗口；窗口可拖/缩/最大/最小/多开/焦点切换；右键菜单在桌面与窗口内可用；任务栏显示运行窗口并可在托盘看到时钟。

### P1 文件资源管理器 + 查看器（最重的一阶段）
1. 实现 vfs.js 适配层 + §7 的 vfs/recycle API；FileLibrary 改造为 FileExplorerApp（导航窗格/面包屑/三视图/多选/框选/拖拽/剪贴板/行内重命名）。
2. 新建回收站应用；照片/媒体/提示词编辑器/工作流查看器四类关联打开。
3. 验收：在资源管理器中完成 新建→重命名→复制→跨文件夹拖拽→删除→回收站还原 全链路；双击图片/视频/提示词能以对应应用打开并保存回数据库；重启浏览器数据不丢。

### P2 设置 + 会员 + 开始菜单完善
1. SettingsApp 六页迁移；个性化（主题/壁纸）生效。
2. users 扩展 + 配额中间件 + 会员页 + 头像角标。
3. recent_items 打通开始菜单"推荐"。
4. 验收：API/ComfyUI 配置在设置内增删改查且生成链路可用；不同会员登录看到各自目录与配额。

### P3 任务中心 + 生成工作台
1. TaskCenterApp（含托盘进度、通知）；StudioApp 整合 SingleGenerate/BatchGenerate/FunctionEditor；"发送到/在文件夹中显示"打通。
2. 验收：从提示词文件一键建任务→托盘看进度→完成通知→资源管理器定位产物。

### P4 UI 设计器 + AI 对话 + 增强
1. 两应用窗口化与资源管理器互通（拖图入画布/拖角色入对话）。
2. Snap 贴靠、窗口预览缩略图、任务栏跳转列表（右键固定应用→最近文件）。
3. 验收：老导航功能全部有新入口；旧 Sidebar 只保留在"所有应用"兜底或移除。

---

## 10. 风险与注意事项
1. **样式污染**：业务组件多为全屏假设（100vh/fixed），装入窗口前必须排查改写；建议给 WindowFrame 内容根加 `.win-content-root { position:relative; height:100%; overflow:hidden; }`。
2. **z-index 战争**：统一区间——对话框 9000 / 普通窗口 10000~90000 / 全屏 ImageViewer 99000 / Shell 菜单 98000 / 任务栏 9000（改） / 开始菜单 9500 / 锁屏 99999+。收口到 wm.js 常量。
3. **性能**：文件库大目录需分页/懒加载缩略图（thumbnail_data base64 直接渲染会卡，超 200 项启用虚拟滚动）。
4. **删除安全**：物理删除一律先入 recycle_bin；purge 才真删；folder 删除需递归快照子文件。
5. **兼容旧数据**：数据库全部用 IF NOT EXISTS/ALTER 迁移（沿用项目现有迁移模式），升级后老数据自动出现在对应挂载点。
6. **旧入口保留到 P4 结束**：RightFilterPanel、旧 Sidebar 先映射成新入口，避免功能空窗。

---

## 11. 附录：文件改动索引
| 动作 | 路径 |
|---|---|
| 新增 | `src/shell/{Desktop,Taskbar,StartMenu,WindowFrame,ContextMenu,ActionCenter,LockScreen}.vue` |
| 新增 | `src/shell/{wm.js（store）,apps.js,vfs.js,icons.js,shell.css}` |
| 新增 | `src/components/apps/{FileExplorerApp,TaskCenterApp,StudioApp,UIDesignerApp,ChatApp,SettingsApp,RecycleApp,PhotoViewerApp,MediaPlayerApp,PromptEditorApp,JsonViewerApp,CharacterApp}.vue`（多数为现有组件的窗口化包装） |
| 改造 | `src/App.vue`（入口切换）、`src/components/layout/GenerationProgress.vue`（toast+托盘）、`src/components/common/FloatingWindow.vue`（降级为对话框层） |
| 窗口化包装 | `FileLibrary→FileExplorerApp`、`TaskLibrary→TaskCenterApp`、`SingleGenerate/BatchGenerate→StudioApp`、`UIView→UIDesignerApp`、`ChatPanel→ChatApp`、`SettingsPanel→SettingsApp` |
| 后端 | `server/api-server.js`（新增 vfs/recycle/recent/membership 路由 + quotaMiddleware）、`server/database.js`（§7 迁移 + 各 delete API 改软删） |
| 参考实现 | `H:\trae work\window操作界面\{app.js,style.css}`（WM/任务栏/菜单/资源管理器交互范式） |
