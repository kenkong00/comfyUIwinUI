# 角色生成器 - 技术修复总结

**日期：** 2026-04-19  
**项目路径：** `g:\AI code\trae\角色生成器`

---

## 一、环境状态

### 运行中的服务

| 服务 | 端口 | 状态 | 用途 |
|:---|:---:|:---:|:---|
| 前端开发服务器 (Vite) | 5173 | ✅ | Vue 3 界面 |
| API 服务器 (Express) | 3002 | ✅ | 用户认证、数据库操作 |
| 下载服务器 | 3001 | ✅ | 图片下载功能 |

### 数据库信息

- **文件：** `server/data.db`
- **类型：** SQLite (better-sqlite3)
- **当前用户：** kong (ID: d3315910-9ea1-4f03-b461-ec11cc7e99ad)
- **角色总数：** 14 个（全部属于 kong）
- **配置方案：** 默认方案(4人)、校园(2人)

---

## 二、问题清单与修复

### 问题 1：Admin 账号异常数据

**现象：** Admin 用户下存在不属于该账号的角色数据（柳如烟，最后更新 2026-04-19 00:20:19）

**原因：** 某时刻系统以 admin 身份执行了保存操作，可能是 JWT token 混乱或自动登录使用了错误的用户凭证。

**修复：**
- 删除了 Admin 用户下的所有角色数据
- 清理后确认 Kong 账号拥有全部 14 个角色
- 建议：只使用 kong 账号登录，避免切换其他账号

**涉及文件：** 数据库直接操作 (`fix-data.js`)

---

### 问题 2：【人名】标签闪烁/泄漏

**现象：** AI 对话输出时，`【杨幂】`、`【赵丽颖】` 等标签会短暂出现然后消失；流式输出时出现占位符泄漏 `(__Q0__...`

**根本原因：** 三层代码都在处理【人名】，且处理逻辑不一致：

1. **数据层** `parseMultiCharacterMessage()` — 按 `【人名】` 正则拆分成多条消息（旧架构遗留）
2. **流式层** `getParsedMessages(isStreaming=true)` — 直接返回原始 content，跳过解析
3. **显示层** `formatMessageContent()` — 尝试过滤 + 格式化（正则复杂导致流式时不稳定）

**最终修复方案（简化优先）：**

| 层级 | 之前 | 现在 |
|:---|:---|:---|
| **parseMultiCharacterMessage** | 按 `【人名】` 拆分消息 | 全局过滤 `【xxx】` 返回单条消息 |
| **getParsedMessages streaming** | 直接返回 msg.content | 所有 4 条 return 路径都先 `.replace(/【[^】]+】/g, '')` |
| **formatMessageContent** | 60 行复杂正则（平衡检查+占位符+HTML span） | 3 行纯文本：`return content.replace(/\n{2,}/g, '\n').trim()` |
| **ChatPanel.vue 显示** | 删除了 character-name-label | **恢复显示** `character-name-label` |

**涉及文件：**
- [chat.js](src/stores/chat.js) — `parseMultiCharacterMessage`、`getParsedMessages`
- [ChatPanel.vue](src/components/chat/ChatPanel.vue) — `formatMessageContent`、模板

---

### 问题 3：头像不一致（首字母 → SVG 图标）

**现象：** 流式输出时头像显示名字首字母，完成后变成 🖼️ 图标

**原因：** Streaming 和 Non-Streaming 路径返回的 `characterIndex` 不一致：
- Streaming：使用 `msg.characterIndex` 或 `activeCharacterIndexes[0]` → 有值 → 首字母 ✅
- 完成后：调用 `parseMultiCharacterMessage`，当 `activeCharacterIndexes.length !== 1` 时返回 `-1` → 图标 ❌

**修复：** 在 `getParsedMessages` 的非 streaming 分支中，**优先使用 `msg.characterIndex`**：

```javascript
if (msg.characterIndex >= 0) {
  result = [{ characterIndex: msg.characterIndex, ... }]
} else {
  result = parseMultiCharacterMessage(msg.content)
}
```

**涉及文件：** [chat.js](src/stores/chat.js) — `getarsedMessages` 第 153-175 行

---

### 问题 4：配置方案刷新后丢失

**现象：** 选择"校园"方案后刷新页面，下拉框变为空白或回到"默认方案"

**两层原因：**

#### 原因 A：switchProfile 未保存到数据库
**修复：** 在 `switchProfile` 中添加 `saveProfiles()`

```javascript
const switchProfile = (profileId) => {
  const profile = profiles.value.find(p => p.id === profileId)
  if (!profile) return
  currentProfileId.value = profileId
  applyProfile(profile)
  saveProfiles()  // ← 新增
}
```

#### 原因 B（核心）：currentChatProfileId 使用 ref 而非 computed
**这是最关键的 bug！**

```javascript
// ❌ ChatPanel.vue 第255行（修复前）
const currentChatProfileId = ref(characterStore.currentProfileId)
// ref 只在组件创建时读取一次值，之后 store 异步更新不会同步

// ✅ 修复后
const currentChatProfileId = computed({
  get: () => characterStore.currentProfileId,
  set: (val) => { characterStore.switchProfile(val) }
})
// computed 实时追踪 store 变化，异步加载完成后自动更新 select
```

**时序图：**
```
页面加载 → 组件创建 → ref 读取 store（此时可能还是空/默认值）
         ↓
    loadProfiles() 异步执行...
         ↓
    DB 数据加载完成 → store.currentProfileId 更新为 "校园"
         ↓
    ❌ ref 不变 → select 显示旧值/空白
    ✅ computed 自动响应 → select 显示 "校园"
```

**涉及文件：**
- [character.js](src/stores/character.js) — `switchProfile` 函数
- [ChatPanel.vue](src/components/chat/ChatPanel.vue) — `currentChatProfileId` 定义

---

### 问题 5：saveConfig is not a function

**现象：** 清空对话时报错 `TypeError: characterStore.saveConfig is not a function`

**原因：** `clearChat()` 中调用了不存在的 `saveConfig()` 方法

**修复：** 删除该调用（清空对话不需要保存配置）

**涉及文件：** [chat.js](src/stores/chat.js) — `clearChat` 函数第 33 行

---

### 问题 6：下载服务器未启动 (端口 3001)

**现象：** 控制台报错 `ERR_CONNECTION_REFUSED http://localhost:3001/api/health`

**修复：** 启动下载服务器 `npm run server`

---

## 三、已移除的功能（暂缓实现）

| 功能 | 原因 | 备注 |
|:---|:---|:---|
| 对话/动作灰度区分 (`""` / `()`) | 流式输出时正则不稳定导致闪烁和占位符泄漏 | 待找到稳定的流式格式化方案后再实现 |
| 多角色单条消息拆分 | 当前架构每个角色单独调用 API，拆分功能已无意义 | `parseMultiCharacterMessage` 已改为不过滤拆分 |

---

## 四、修改的文件汇总

| 文件 | 改动点 | 行号(约) |
|:---|:---|:---|
| **[chat.js](src/stores/chat.js)** | 1. `parseMultiCharacterMessage` — 全局过滤【人名】，不过滤拆分 | 38-71 |
| | 2. `getParsedMessages` streaming 分支 — 4 条路径过滤【人名】 | 110-148 |
| | 3. `getParsedMessages` 非 streaming — 优先用 msg.characterIndex | 153-175 |
| | 4. `clearChat` — 删除 `saveConfig()` 调用 | 25-36 |
| **[ChatPanel.vue](src/components/chat/ChatPanel.vue)** | 1. `formatMessageContent` — 简化为纯文本（3行） | 408-411 |
| | 2. 恢复 `character-name-label` HTML 元素 | 54-55 |
| | 3. `v-html` 改回 `{{ }}` 纯文本渲染 | 56 |
| | 4. `currentChatProfileId` — ref 改为 computed | 255-258 |
| **[character.js](src/stores/character.js)** | `switchProfile` — 添加 `saveProfiles()` | 58-64 |

---

## 五、数据库查询脚本（可删除）

以下脚本用于调试，不再需要时可删除：

- `query-users.js` — 查询用户和角色
- `check-xiaohuang.js` — 检查小黄角色
- `deep-check.js` — 深度分析配置方案
- `fix-data.js` — 修复数据问题
- `verify-save.js` — 验证保存结果
- `final-verify.js` — 最终验证
- `check-comfyui.js` — 检查 ComfyUI 配置
- `check-profile.js` — 检查配置方案持久化

---

## 六、关键经验教训

1. **Vue 响应式陷阱：** `ref(store.xxx)` 只读一次，异步更新的 store 值不会同步。必须用 `computed` 或 `watchEffect`。
2. **流式输出的特殊性：** 文本在逐步增长，引号/括号等符号可能暂时不成对。任何基于正则的格式化都必须做平衡检查。
3. **多层处理的危险：** 同一个功能（如【人名】处理）分散在数据层→解析层→显示层三层，极易出现不一致。应该在一个地方统一处理。
4. **简化优于完美：** 当复杂功能导致多个 bug 时，先回退到最简版本确保稳定，再逐步增强。
