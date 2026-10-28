// 识别「Json 分镜」文件（分镜工具 / 批量提示词 的文档格式）。
// 兼容多种历史格式：
//  1. [{ "id": 1, "content": "..." }]                       —— 当前批量提示词工具的标准格式
//  2. [{ "id": "1", "prompt": "..." }]                      —— 旧版任务分镜导出（prompt 字段）
//  3. { "storyboards": [ ... ] }                            —— 带包装对象的格式
//  4. [{ "id": "01", "视角": "...", "角色动作与构图": "..." }] —— 中文分镜字段格式
// 用于：双击打开时分发到分镜工具，以及后端导入归类。

// 从单个分镜对象提取提示词文本
function pickStoryboardText(it) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return null
  for (const k of ['content', 'prompt', 'text', '提示词']) {
    if (typeof it[k] === 'string' && it[k].trim()) return it[k]
  }
  // 其它字段格式（视角/角色动作与构图…）：把所有字符串值按行拼接
  const vals = Object.values(it).filter((v) => typeof v === 'string' && v.trim())
  return vals.length ? vals.join('\n') : null
}

export function parseBatchPromptList(text) {
  if (!text || typeof text !== 'string' || text.length > 20 * 1024 * 1024) return null
  const t = text.trim()
  if (!t.startsWith('[') && !t.startsWith('{')) return null
  let o
  try { o = JSON.parse(t) } catch { return null }
  // {storyboards:[...]} 包装格式 → 解包
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    if (Array.isArray(o.storyboards)) o = o.storyboards
    else return null
  }
  if (!Array.isArray(o)) return null
  if (o.length === 0) return [] // 空分镜文件（新建的空文档）
  const out = []
  for (let i = 0; i < o.length; i++) {
    const c = pickStoryboardText(o[i])
    if (c === null) return null // 有一个元素不是分镜形状就不当分镜文件
    out.push({ id: (o[i] && o[i].id) ?? i + 1, content: c })
  }
  return out
}

export function isStoryboardText(text) {
  return parseBatchPromptList(text) !== null
}
