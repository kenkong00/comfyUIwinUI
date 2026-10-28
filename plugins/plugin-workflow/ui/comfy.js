// plugins/plugin-workflow/ui/comfy.js
// ComfyUI 工作流的「解析 / 布局 / 写回」纯逻辑层。UI 组件只认这里的中间模型，
// 这样 UI 格式（ComfyUI 前端导出）和 API 格式（后端 prompt）能共用同一套界面。
//
// 中间模型：
//   { format, raw, nodes, links }
//   node = { id, type, title, pos:{x,y}, size:{w,h}, params:[], linksIn:[], linksOut:[], outCount }
//   param = { path, key, label, kind, value, meta }        kind: number|bool|text|textarea|select|null|marker
//          | { kind:'group', path, key, label, children:[param...] }
//   path 是「相对节点对象」的取值路径，写回时直接 setByPath(nodeRaw, path, value)。

// ---------------------------------------------------------------------------
// 控件推断
// ---------------------------------------------------------------------------

// 常见枚举值（只作候选，用户仍可自由输入；不认识的一律当文本框）
export const ENUMS = {
  sampler_name: ['euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpm_fast',
    'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde', 'dpmpp_sde_gpu', 'dpmpp_2m', 'dpmpp_2m_sde',
    'dpmpp_3m_sde', 'ddpm', 'lcm', 'ipndm', 'ipndm_v', 'deis', 'er_sde', 'res_multistep', 'uni_pc', 'uni_pc_bh2'],
  scheduler: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta', 'linear', 'align_your_steps'],
  weight_dtype: ['default', 'fp8_e4m3fn', 'fp8_e5m2', 'fp16', 'bf16', 'fp32'],
  device: ['default', 'cpu', 'cuda'],
  crop: ['disabled', 'center'],
  method: ['default', 'lanczos', 'bicubic', 'nearest-exact', 'bilinear', 'area'],
  upscale_method: ['nearest-exact', 'bilinear', 'area', 'bicubic', 'lanczos'],
  type: ['auto', 'stable_diffusion', 'sdxl', 'sd3', 'flux', 'qwen_image', 'krea2', 'hunyuan_video', 'mochi', 'ltxv'],
  mode: ['default', 'always', 'simple'],
  interpolation: ['linear', 'ease_in', 'ease_out', 'ease_in_out'],
  color_space: ['sRGB', 'Linear', 'LAB'],
  channel: ['RGB', 'R', 'G', 'B', 'A'],
}

// 数字范围（step 供步进按钮使用；min/max 只做软约束，不强制截断）
const RANGES = {
  seed: { min: 0, max: 18446744073709551615, step: 1, dice: true },
  noise_seed: { min: 0, max: 18446744073709551615, step: 1, dice: true },
  steps: { min: 1, max: 200, step: 1 },
  cfg: { min: 0, max: 50, step: 0.1 },
  denoise: { min: 0, max: 1, step: 0.01 },
  strength: { min: -10, max: 10, step: 0.05 },
  strength_model: { min: -10, max: 10, step: 0.05 },
  width: { min: 8, max: 16384, step: 8 },
  height: { min: 8, max: 16384, step: 8 },
  batch_size: { min: 1, max: 4096, step: 1 },
  start_percent: { min: 0, max: 1, step: 0.01 },
  end_percent: { min: 0, max: 1, step: 0.01 },
  fps: { min: 1, max: 120, step: 1 },
}

// 这些 key 几乎总是长文本 → 用多行输入框
const MULTILINE_KEYS = new Set(['text', 'string', 'prompt', 'positive_prompt', 'negative_prompt',
  'wildcard', 'caption', 'instruction', 'system', 'tags', 'value', 'prefix', 'suffix', 'append_text'])

export function isMultilineKey(key) {
  return MULTILINE_KEYS.has(String(key).toLowerCase()) || /multiline|textarea/i.test(String(key))
}

export function kindOf(key, value) {
  const k = String(key).toLowerCase()
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'object') {
    // rgthree 之类的"控件标记"：{ type: 'XxxHeaderWidget' }，不是真参数
    if (Object.keys(value).length === 1 && value.type) return 'marker'
    return 'group'
  }
  if (typeof value === 'string') {
    if (ENUMS[k]) return 'select'
    if (isMultilineKey(k)) return 'textarea'
    if (value.length > 60 || value.includes('\n')) return 'textarea'
    return 'text'
  }
  return 'text'
}

// ---------------------------------------------------------------------------
// 节点分类配色：让图一眼能看出"这块是加载 / 采样 / 出图"
// ---------------------------------------------------------------------------
const TYPE_RULES = [
  { c: 'load', re: /loader|load_|loadimage|loadlatent|checkpoint/i },
  { c: 'encode', re: /encode|conditioning|cliptext|tokeniz|text/i },
  { c: 'sample', re: /sampler|ksampler|sample|scheduler|guider/i },
  { c: 'latent', re: /latent|empty|upscale|scale|mask|noise/i },
  { c: 'image', re: /image|preview|save|video|output|vae/i },
  { c: 'model', re: /lora|model|patch|controlnet|ipadapter|apply/i },
  { c: 'util', re: /string|math|join|switch|reroute|note|primitive|anything|show|concat/i },
]
export function categoryOf(type, title) {
  const s = `${type || ''} ${title || ''}`
  for (const r of TYPE_RULES) if (r.re.test(s)) return r.c
  return 'other'
}

export const CATEGORY_LABEL = {
  load: '加载', encode: '编码/条件', sample: '采样', latent: 'Latent',
  image: '图像/输出', model: '模型/控制', util: '工具', other: '其它',
}

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------
export function parseWorkflow(rawInput) {
  let raw = rawInput
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return { format: 'unknown', raw: null, nodes: [], links: [] } }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { format: 'unknown', raw, nodes: [], links: [] }

  if (Array.isArray(raw.nodes)) return { ...parseUi(raw), raw }
  return { ...parseApi(raw), raw }
}

function parseApi(raw) {
  const nodes = []
  const links = []
  for (const id of Object.keys(raw)) {
    const n = raw[id]
    if (!n || typeof n !== 'object' || typeof n.class_type !== 'string') continue
    const params = []
    const linksIn = []
    const outSlots = new Set()

    for (const [key, val] of Object.entries(n.inputs || {})) {
      // 连线引用一律是 [源节点id, 输出槽号]
      if (Array.isArray(val) && val.length >= 2 && (typeof val[0] === 'string' || typeof val[0] === 'number')) {
        linksIn.push({ name: key, type: '', from: String(val[0]), fromSlot: Number(val[1]) || 0 })
        links.push({ id: `${val[0]}:${val[1]}->${id}:${key}`, from: String(val[0]), fromSlot: Number(val[1]) || 0, to: id, toSlot: -1, toName: key, type: '' })
        continue
      }
      params.push(makeParam(key, val, `inputs.${key}`))
    }
    nodes.push({
      id: String(id),
      type: n.class_type,
      title: n._meta?.title || '',
      pos: null, // API 格式没有坐标，交给 autoLayout
      params,
      linksIn,
      linksOut: [],
    })
  }
  // 反向推断每个节点的输出槽数量（被引用到的最大槽号 + 1）
  for (const n of nodes) {
    const used = links.filter((l) => l.from === n.id).map((l) => l.fromSlot)
    n.outCount = used.length ? Math.max(...used) + 1 : (n.linksIn.length ? 1 : 0)
  }
  return { format: 'api', nodes, links }
}

function parseUi(raw) {
  const nodes = []
  const links = []
  const linkArr = Array.isArray(raw.links) ? raw.links : []

  // UI 格式的 links 是 [linkId, 源节点, 源槽, 目标节点, 目标槽, 类型]
  for (const l of linkArr) {
    if (Array.isArray(l) && l.length >= 5) {
      links.push({
        id: String(l[0]), from: String(l[1]), fromSlot: Number(l[2]) || 0,
        to: String(l[3]), toSlot: Number(l[4]) || 0, type: l[5] || '',
      })
    } else if (l && typeof l === 'object' && l.id != null) {
      links.push({
        id: String(l.id), from: String(l.origin_id ?? l.from ?? ''), fromSlot: Number(l.origin_slot ?? 0),
        to: String(l.target_id ?? l.to ?? ''), toSlot: Number(l.target_slot ?? 0), type: l.type || '',
      })
    }
  }
  const linkById = new Map(links.map((l) => [String(l.id), l]))

  for (const n of raw.nodes || []) {
    if (!n || typeof n !== 'object') continue
    const id = String(n.id)
    const wv = Array.isArray(n.widgets_values) ? n.widgets_values : []
    // 新版导出里 inputs 带 widget 字段，顺序与 widgets_values 一致 → 可以还原参数名
    const widgetNames = (n.inputs || []).filter((i) => i && i.widget).map((i) => i.name || '')

    const params = wv.map((v, i) => makeParam(widgetNames[i] || `参数 ${i + 1}`, v, `widgets_values.${i}`))

    const linksIn = (n.inputs || [])
      .filter((i) => i && i.link != null)
      .map((i) => {
        const l = linkById.get(String(i.link))
        return { name: i.name || '', type: i.type || '', from: l ? l.from : '', fromSlot: l ? l.fromSlot : 0 }
      })
      .filter((i) => i.from)

    const linksOut = (n.outputs || []).map((o, i) => ({
      name: o?.name || '', type: o?.type || '', slot: i, count: (o?.links || []).length,
    }))

    nodes.push({
      id,
      type: n.type || n.class_type || 'node',
      title: n.title || '',
      pos: { x: Number(n.pos?.[0]) || 0, y: Number(n.pos?.[1]) || 0 },
      size: { w: Number(n.size?.[0]) || 220, h: Number(n.size?.[1]) || 80 },
      params, linksIn, linksOut,
      outCount: linksOut.length || (linksIn.length ? 1 : 0),
    })
  }
  return { format: 'ui', nodes, links }
}

function makeParam(key, value, path) {
  const kind = kindOf(key, value)
  const base = { path, key: String(key), label: String(key), kind, value, meta: {} }
  if (kind === 'number') base.meta = { ...(RANGES[String(key).toLowerCase()] || {}) }
  if (kind === 'select') base.meta = { options: ENUMS[String(key).toLowerCase()] || [] }
  if (kind === 'group') {
    // 嵌套对象（如 Power Lora Loader 的 lora_1）展开一层，逐字段编辑
    base.children = Object.entries(value).map(([k, v]) => makeParam(k, v, `${path}.${k}`))
  }
  return base
}

// ---------------------------------------------------------------------------
// 自动布局：API 格式没有坐标，按依赖层级从左到右分层
// ---------------------------------------------------------------------------
export function autoLayout(nodes, links) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const level = new Map()
  const visiting = new Set()

  // level(n) = max(level(所有上游)) + 1；无上游为 0。有环时用 0 兜底。
  function depth(id) {
    if (level.has(id)) return level.get(id)
    if (visiting.has(id)) return 0 // 环保护
    visiting.add(id)
    const n = byId.get(id)
    let d = 0
    if (n && n.linksIn && n.linksIn.length) {
      for (const li of n.linksIn) {
        if (!byId.has(li.from)) continue
        d = Math.max(d, depth(li.from) + 1)
      }
    }
    visiting.delete(id)
    level.set(id, d)
    return d
  }
  nodes.forEach((n) => depth(n.id))

  const NODE_W = 210
  const GAP_X = 90
  const GAP_Y = 26
  const HEADER = 34
  const ROW = 18
  const PAD = 10

  const cols = new Map()
  for (const n of nodes) {
    const lv = level.get(n.id) || 0
    if (!cols.has(lv)) cols.set(lv, [])
    cols.get(lv).push(n)
  }

  // 每层内：输出多的排前面，尽量让连线少交叉
  for (const [, arr] of cols) {
    arr.sort((a, b) => (b.linksIn.length - a.linksIn.length) || a.id.localeCompare(b.id, 'en', { numeric: true }))
  }

  const levels = [...cols.keys()].sort((a, b) => a - b)
  for (const lv of levels) {
    const arr = cols.get(lv)
    let y = 0
    for (const n of arr) {
      const rows = Math.max(1, (n.linksIn?.length || 0) + (n.outCount || 0))
      n.size = { w: NODE_W, h: HEADER + rows * ROW + PAD }
      n.pos = { x: lv * (NODE_W + GAP_X), y }
      y += n.size.h + GAP_Y
    }
  }
  return nodes
}

// ---------------------------------------------------------------------------
// 端口坐标：节点图连线用
// ---------------------------------------------------------------------------
export function portPos(node, side, index) {
  const HEADER = 34
  const ROW = 18
  const x = side === 'out' ? (node.pos?.x || 0) + (node.size?.w || 210) : node.pos?.x || 0
  const y = (node.pos?.y || 0) + HEADER + index * ROW + ROW / 2
  return { x, y }
}

export function bezier(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

// ---------------------------------------------------------------------------
// 路径读写：把控件改动写回原始 JSON
// ---------------------------------------------------------------------------
export function getByPath(obj, path) {
  if (!obj || !path) return undefined
  const segs = String(path).split('.')
  let cur = obj
  for (const s of segs) {
    if (cur == null) return undefined
    cur = cur[s]
  }
  return cur
}

export function setByPath(obj, path, value) {
  if (!obj || !path) return false
  const segs = String(path).split('.')
  let cur = obj
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]
    if (cur[s] == null || typeof cur[s] !== 'object') cur[s] = {}
    cur = cur[s]
  }
  cur[segs[segs.length - 1]] = value
  return true
}

/** 取节点在原始 JSON 里的对象（用于写回） */
export function rawNodeOf(model, id) {
  if (!model || !model.raw) return null
  if (model.format === 'ui') {
    return (model.raw.nodes || []).find((n) => String(n.id) === String(id)) || null
  }
  return model.raw[id] || null
}
