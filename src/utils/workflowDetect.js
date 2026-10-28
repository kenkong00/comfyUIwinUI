// 识别 ComfyUI 工作流 JSON。
// 两种官方格式：
//  1) API 格式：{ "3": { class_type, inputs }, "4": {...}, ... } —— 顶层键全是"节点ID -> {class_type}"
//  2) UI 格式：{ nodes: [ {id, type, ...} ], links: [...], ... } —— 导出自 ComfyUI 前端
// 用于：把从磁盘导入的 .json 工作流归类为 file_type='workflow'，以及双击打开时进入节点编辑器
// 而不是 JSON 查看器。

export function isComfyWorkflowText(text) {
  if (!text || typeof text !== 'string' || text.length > 50 * 1024 * 1024) return false
  // 快速预判，避免大文本反复 JSON.parse
  if (!text.includes('class_type') && !text.includes('"nodes"') && !text.includes('nodes')) return false
  let o
  try { o = JSON.parse(text) } catch { return false }
  return isComfyWorkflowObject(o)
}

export function isComfyWorkflowObject(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  // UI 格式
  if (Array.isArray(o.nodes) && o.nodes.some((n) => n && typeof n === 'object' && (n.type || n.class_type))) return true
  // API 格式：统计带 class_type 的顶层条目
  const keys = Object.keys(o)
  if (!keys.length) return false
  let nodeCount = 0
  for (const k of keys) {
    const v = o[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.class_type === 'string') nodeCount++
  }
  // 大多数顶层条目都是节点才认定是工作流（避免把普通业务 JSON 误判）
  return nodeCount > 0 && nodeCount >= Math.ceil(keys.length * 0.6)
}
