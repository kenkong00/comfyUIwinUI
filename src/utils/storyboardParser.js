/**
 * TXT 分镜解析工具（基于配置的灵活解析器）
 *
 * 支持的格式：
 * 1. 多行格式（如 "-- 分镜 1" + 换行后的字段行）
 * 2. 紧凑单行格式（如 "1. 视角：xxx;动作：xxx;场景：xxx"）
 *
 * 配置项：
 * - startMarkers: 字符串数组，每项是一个正则表达式（字符串形式）
 * - fieldMappings: 字符串数组，每项格式 "原字段名=>目标字段名"
 * - fieldSeparators: 字符串数组，紧凑格式中字段之间的分隔字符
 * - promptTemplate: 字符串，使用 {目标字段名} 作为占位符
 */

const TARGET_FIELDS = ['视角', '角色动作与构图', '灯光气氛', '场景环境']

/**
 * 把字符串数组转换为正则表达式数组（带错误兜底）
 */
function compilePatterns(patternStrings) {
  if (!Array.isArray(patternStrings)) return []
  return patternStrings
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(s => s.length > 0)
    .map(s => {
      try {
        return new RegExp(s)
      } catch (e) {
        console.warn('[storyboardParser] 正则编译失败:', s, e.message)
        return null
      }
    })
    .filter(Boolean)
}

/**
 * 解析字段映射配置
 * 返回 Map<原字段名(小写), 目标字段名>
 */
function parseFieldMappings(mappings) {
  const map = new Map()
  if (!Array.isArray(mappings)) return map
  for (const item of mappings) {
    if (typeof item !== 'string') continue
    const idx = item.indexOf('=>')
    if (idx <= 0) continue
    const raw = item.slice(0, idx).trim()
    const target = item.slice(idx + 2).trim()
    if (!raw || !target) continue
    // 用小写做 key 以便不区分大小写匹配
    map.set(raw.toLowerCase(), target)
    // 同时保留原始大小写
    map.set(raw, target)
  }
  return map
}

/**
 * 从一行中提取字段名和值
 * 形如 "视角：xxx" / "**视角**：xxx" / "视角: xxx"
 * 返回 { name, value } 或 null
 */
function extractFieldFromSegment(segment, fieldMap) {
  const trimmed = segment.trim()
  if (!trimmed) return null

  // 去掉 markdown 加粗 **xxx**
  const cleaned = trimmed.replace(/^\*+/, '').replace(/\*+/, '')
  // 形如 "name：value" 或 "name: value"
  const m = cleaned.match(/^([^:：]+)[：:]\s*([\s\S]*)$/)
  if (!m) return null

  const rawName = m[1].trim()
  const value = m[2].trim().replace(/;$/, '').replace(/；$/, '')

  // 查找映射
  const target = fieldMap.get(rawName.toLowerCase()) || fieldMap.get(rawName)
  if (!target) return null

  return { name: target, value }
}

/**
 * 按分隔符拆分单行内容
 * 同时把已知字段标签（字段名+冒号）也作为切分点，避免未映射字段粘连到上一段
 */
function splitBySeparators(line, separators, fieldMap) {
  // 收集所有切分位置：分隔符位置 + 字段标签位置
  const cuts = []

  // 1) 分隔符位置（如 ; ；）
  if (separators && separators.length > 0) {
    const escaped = separators
      .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('')
    const sepRe = new RegExp(`[${escaped}]`, 'g')
    let match
    while ((match = sepRe.exec(line)) !== null) {
      cuts.push(match.index)         // 分隔符前
      cuts.push(match.index + 1)     // 分隔符后
    }
  }

  // 2) 字段标签位置（字段名 + 冒号开头）
  if (fieldMap) {
    const seen = new Set()
    for (const raw of fieldMap.keys()) {
      if (!raw) continue
      // 同一字段名跳过重复（map 同时存了原始和小写两份）
      const key = raw.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`${escaped}(?=[：:])`, 'g')
      let match
      while ((match = re.exec(line)) !== null) {
        // 在字段标签前切分（如果当前位置不是开头）
        if (match.index > 0) {
          cuts.push(match.index)
        }
      }
    }
  }

  if (cuts.length === 0) return [line]

  // 排序去重
  cuts.sort((a, b) => a - b)
  const unique = [...new Set(cuts)]

  // 按位置切分
  const segments = []
  let last = 0
  for (const cut of unique) {
    if (cut > last) {
      const seg = line.slice(last, cut).trim().replace(/[;；]+$/, '').trim()
      if (seg) segments.push(seg)
    }
    last = cut
  }
  if (last < line.length) {
    const seg = line.slice(last).trim().replace(/[;；]+$/, '').trim()
    if (seg) segments.push(seg)
  }

  return segments
}

/**
 * 主解析函数
 * @param {string} content - TXT 文件内容
 * @param {object} cfg - 解析配置 { startMarkers, fieldMappings, fieldSeparators, promptTemplate }
 * @returns {Array<{id, 视角, 角色动作与构图, 灯光气氛, 场景环境, content}>}
 */
export function parseStoryboardWithConfig(content, cfg) {
  if (!content || typeof content !== 'string') return []

  const patterns = compilePatterns(cfg?.startMarkers || [])
  const fieldMap = parseFieldMappings(cfg?.fieldMappings || [])
  const separators = (cfg?.fieldSeparators || [';', '；']).filter(s => typeof s === 'string' && s.length > 0)

  if (patterns.length === 0) {
    console.warn('[storyboardParser] 没有有效的起始标记')
    return []
  }

  const lines = content.split(/\r?\n/)
  const storyboards = []
  let current = null
  let currentField = null

  // 检测一行是否为分镜起始
  const matchStart = (line) => {
    const trimmed = line.trim()
    for (const re of patterns) {
      if (re.test(trimmed)) {
        // 提取 ID（第一个连续数字）
        const idMatch = trimmed.match(/(\d+)/)
        const id = idMatch ? idMatch[1] : String(storyboards.length + 1)
        return { id, line: trimmed }
      }
    }
    return null
  }

  // 终止当前分镜（遇到非字段、非分镜的内容时）
  const finalizeCurrent = () => {
    if (current) {
      storyboards.push(current)
      current = null
      currentField = null
    }
  }

  // 给当前分镜补充字段
  const pushField = (name, value) => {
    if (!current) return
    if (current[name]) {
      current[name] += '\n' + value
    } else {
      current[name] = value
    }
    currentField = name
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    // 1) 检测是否为新分镜起始
    const startMatch = matchStart(trimmed)
    if (startMatch) {
      finalizeCurrent()
      current = {
        id: startMatch.id,
        视角: '',
        角色动作与构图: '',
        灯光气氛: '',
        场景环境: '',
        content: ''
      }
      currentField = null

      // 紧凑单行格式：起始行可能包含所有字段（如 "1. 视角：xxx;动作：xxx;场景：xxx"）
      // 找到第一个字段标签后的内容
      const firstFieldIdx = findFirstFieldIndex(trimmed, fieldMap)
      if (firstFieldIdx >= 0) {
        const remainder = trimmed.slice(firstFieldIdx)
        const segments = splitBySeparators(remainder, separators, fieldMap)
        for (const seg of segments) {
          const f = extractFieldFromSegment(seg, fieldMap)
          if (f) pushField(f.name, f.value)
        }
      }
      continue
    }

    // 2) 检测是否为分镜块的结束（如 "### 故事脉络" / "### 人设提示词" / "### 场景设计" / "---" 等）
    if (current && isSectionBreak(trimmed)) {
      finalizeCurrent()
      continue
    }

    // 3) 当前在分镜内
    if (current) {
      // 单行多字段：尝试按分隔符拆分
      const segments = splitBySeparators(trimmed, separators, fieldMap)
      let matchedAny = false

      if (segments.length > 1) {
        // 单行多字段
        for (const seg of segments) {
          const f = extractFieldFromSegment(seg, fieldMap)
          if (f) {
            pushField(f.name, f.value)
            matchedAny = true
          }
        }
      } else {
        // 单行单字段：直接尝试提取
        const f = extractFieldFromSegment(trimmed, fieldMap)
        if (f) {
          pushField(f.name, f.value)
          matchedAny = true
        }
      }

      // 既不是新分镜也不是字段，作为上一字段的延续内容
      if (!matchedAny && currentField) {
        current[currentField] += '\n' + trimmed
      } else if (!matchedAny && current.content !== undefined) {
        // 没有上一字段时，作为分镜内容的一部分
        current.content = (current.content || '') + (current.content ? '\n' : '') + trimmed
        if (!current.角色动作与构图) {
          current.角色动作与构图 = current.content
        } else {
          current.角色动作与构图 += '\n' + trimmed
        }
      }
    }
  }

  finalizeCurrent()

  // 填充 content 字段
  for (const sb of storyboards) {
    if (!sb.content) {
      sb.content = buildPromptFromTemplate(sb, cfg?.promptTemplate)
    }
  }

  return storyboards
}

/**
 * 找到第一个字段标签出现的位置（紧凑单行格式中跳过 "1." 或 "分镜 1" 这类前缀）
 */
function findFirstFieldIndex(line, fieldMap) {
  // 形如 "1. 视角：xxx" / "1.视角：xxx" / "分镜 1. 视角：xxx"
  // 找到第一个 "字段名：" 的位置
  for (const [raw] of fieldMap.entries()) {
    if (!raw) continue
    // 跳过小写 key（避免重复）
    if (raw === raw.toLowerCase() && raw !== raw.toUpperCase()) {
      // 这是小写 key，跳过（map 同时存了原始和小写两种）
      // 但仍可用其长度判断
    }
    const idx = line.indexOf(raw)
    if (idx > 0) {
      // 确认后面是冒号
      const after = line.slice(idx + raw.length)
      if (/^[：:]/.test(after)) return idx
    }
  }
  return -1
}

/**
 * 检测一行是否为分镜块的结束标记
 */
function isSectionBreak(line) {
  if (/^#{1,6}\s*(故事大纲|故事脉络|人设提示词|人物人设|场景设计|对戏提示词|分镜列表)/.test(line)) return true
  if (/^---+$/.test(line)) return true
  if (/^\*\*(故事大纲|故事脉络|人设提示词|人物人设|场景设计|对戏提示词|分镜列表)\*\*/.test(line)) return true
  return false
}

/**
 * 根据模板构建提示词
 */
export function buildPromptFromTemplate(storyboard, template) {
  if (!template) {
    return [
      storyboard.视角 ? `视角：${storyboard.视角}` : '',
      storyboard.角色动作与构图 ? `角色动作与构图：${storyboard.角色动作与构图}` : '',
      storyboard.灯光气氛 ? `灯光气氛：${storyboard.灯光气氛}` : '',
      storyboard.场景环境 ? `场景环境：${storyboard.场景环境}` : ''
    ].filter(Boolean).join('\n')
  }
  let result = template
  for (const field of TARGET_FIELDS) {
    result = result.replaceAll(`{${field}}`, storyboard[field] || '')
  }
  return result.trim()
}

export { TARGET_FIELDS }
