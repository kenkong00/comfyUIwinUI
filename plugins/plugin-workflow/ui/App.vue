<template>
  <div class="wf-app">
    <div class="wf-top">
      <span class="wf-title">{{ title || '工作流' }}</span>
      <span class="wf-tag" :class="model.format">{{ fmtLabel }}</span>
      <span class="wf-meta">{{ model.nodes.length }} 节点 · {{ model.links.length }} 连线</span>
      <span class="wf-sp" />

      <div class="wf-tabs">
        <button :class="{ on: view === 'graph' }" @click="view = 'graph'">流程图</button>
        <button :class="{ on: view === 'json' }" @click="view = 'json'">JSON</button>
      </div>

      <button class="wf-btn" :class="{ on: !readonly }" @click="readonly = !readonly">
        {{ readonly ? '只读' : '可编辑' }}
      </button>
      <button class="wf-btn primary" :disabled="!dirty || !canSave" @click="save">
        保存{{ dirty ? ' ●' : '' }}
      </button>
      <span v-if="msg" class="wf-msg" :class="{ err: msgErr }">{{ msg }}</span>
    </div>

    <div class="wf-body">
      <div class="wf-left">
        <NodeList :nodes="model.nodes" :selected-id="sel" @select="select" />
      </div>

      <div class="wf-mid">
        <GraphCanvas
          v-if="view === 'graph'"
          ref="canvasRef"
          :nodes="model.nodes"
          :links="model.links"
          :selected-id="sel"
          @select="select"
          @move="onMove"
        />
        <div v-else class="wf-json">
          <pre class="wf-raw">{{ pretty }}</pre>
        </div>
      </div>

      <div class="wf-right">
        <NodeProps
          :node="cur"
          :nodes="model.nodes"
          :readonly="readonly"
          :changed="changed"
          @edit="onEdit"
          @goto="select"
          @reset-node="resetNode"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// 工作流节点编辑器：
//   左：节点列表（按用途分组）  中：流程图（可拖/缩放）  右：参数编辑（按类型给控件）
// 支持 ComfyUI 的两种官方格式（API 格式 / UI 格式），用 comfy.js 统一成同一套中间模型。
import { ref, computed, watch, nextTick } from 'vue'
import { apiClient } from '@/services/api'
import NodeList from './NodeList.vue'
import GraphCanvas from './GraphCanvas.vue'
import NodeProps from './NodeProps.vue'
import { parseWorkflow, autoLayout, setByPath, getByPath, rawNodeOf } from './comfy.js'

const props = defineProps({
  title: { type: String, default: '工作流' },
  json: { type: [String, Object], default: '' },
  fileId: { type: [Number, String], default: 0 },
  workflowId: { type: [Number, String], default: 0 },
})

const view = ref('graph')
const readonly = ref(false)
const sel = ref('')
const msg = ref('')
const msgErr = ref(false)
const changed = ref({})
const canvasRef = ref(null)

// 解析结果 + 原始快照（用于"还原本节点"和判断改动）
const model = ref({ format: 'unknown', raw: null, nodes: [], links: [] })
let snapshot = null // 深拷贝的原始 raw

function build(src) {
  const m = parseWorkflow(src)
  if (m.format === 'api' && m.nodes.length) autoLayout(m.nodes, m.links)
  model.value = m
  snapshot = m.raw ? JSON.parse(JSON.stringify(m.raw)) : null
  sel.value = ''
  changed.value = {}
}
build(props.json)

watch(() => props.json, (v) => { build(v) })

const canSave = computed(() => !!(props.fileId || props.workflowId))
const dirty = computed(() => Object.keys(changed.value).length > 0)
const fmtLabel = computed(() => (model.value.format === 'ui' ? 'UI 格式' : model.value.format === 'api' ? 'API 格式' : '未知格式'))
const cur = computed(() => model.value.nodes.find((n) => n.id === sel.value) || null)
const pretty = computed(() => (model.value.raw ? JSON.stringify(model.value.raw, null, 2) : ''))

function select(id) {
  sel.value = String(id)
}
function onMove({ id, x, y }) {
  const n = model.value.nodes.find((v) => v.id === id)
  if (n) n.pos = { x, y } // 只改内存布局，不写回 JSON（提交给 ComfyUI 的数据不该带坐标）
}

function onEdit({ node, param, value }) {
  const raw = rawNodeOf(model.value, node.id)
  if (!raw) return
  setByPath(raw, param.path, value)
  const key = node.id + '|' + param.path
  // 与快照比对：改回原值就撤掉"已改动"标记
  const snapNode = snapshot ? (model.value.format === 'ui'
    ? (snapshot.nodes || []).find((n) => String(n.id) === String(node.id))
    : snapshot[node.id]) : null
  const old = snapNode ? getByPath(snapNode, param.path) : undefined
  if (JSON.stringify(old) === JSON.stringify(value)) delete changed.value[key]
  else changed.value[key] = true
}

function resetNode(id) {
  const node = model.value.nodes.find((n) => n.id === id)
  const raw = rawNodeOf(model.value, id)
  const snapNode = snapshot ? (model.value.format === 'ui'
    ? (snapshot.nodes || []).find((n) => String(n.id) === String(id))
    : snapshot[id]) : null
  if (!node || !raw || !snapNode) return
  const walk = (ps) => {
    for (const p of ps) {
      if (p.kind === 'group') { walk(p.children || []); continue }
      const v = getByPath(snapNode, p.path)
      setByPath(raw, p.path, v)
      p.value = v
      delete changed.value[id + '|' + p.path]
    }
  }
  walk(node.params)
}

async function save() {
  if (!canSave.value) return
  const text = JSON.stringify(model.value.raw, null, 2)
  try {
    if (props.fileId) {
      await apiClient.updateFileLibraryFile(props.fileId, { content: text })
    } else {
      await apiClient.request('PUT', `/api/workflow-apis/${props.workflowId}`, { workflow_data: text })
    }
    snapshot = JSON.parse(JSON.stringify(model.value.raw))
    changed.value = {}
    msgErr.value = false
    msg.value = '已保存'
    setTimeout(() => (msg.value = ''), 1800)
  } catch (e) {
    msgErr.value = true
    msg.value = '保存失败：' + (e?.message || e)
    setTimeout(() => (msg.value = ''), 3000)
  }
}

// 切到流程图时自动适应窗口一次
watch(view, async (v) => {
  if (v !== 'graph') return
  await nextTick()
  canvasRef.value?.fit?.()
})
</script>

<style scoped>
.wf-app {
  display: flex; flex-direction: column; height: 100%;
  background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); font-size: 13px;
}
.wf-top {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #e5e7eb); flex-shrink: 0;
}
.wf-title { font-weight: 600; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-tag {
  font-size: 10.5px; padding: 1px 6px; border-radius: 4px;
  background: rgba(127,127,127,.16); color: var(--text-secondary, #555);
}
.wf-tag.api { background: rgba(37,99,235,.14); color: #1d4ed8; }
.wf-tag.ui { background: rgba(22,163,74,.14); color: #15803d; }
.wf-meta { font-size: 11.5px; color: var(--text-muted, #888); }
.wf-sp { flex: 1; }

.wf-tabs { display: flex; border: 1px solid var(--border-color, #d1d5db); border-radius: 6px; overflow: hidden; }
.wf-tabs button {
  border: none; background: var(--bg-surface, #fff); padding: 4px 10px; font-size: 12px;
  cursor: pointer; color: var(--text-secondary, #555);
}
.wf-tabs button.on { background: var(--accent-color, #0067c0); color: #fff; }

.wf-btn {
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff);
  border-radius: 5px; padding: 4px 10px; font-size: 12.5px; cursor: pointer; color: var(--text-primary, #1f2937);
}
.wf-btn:hover:not(:disabled) { background: rgba(0,103,192,.08); }
.wf-btn:disabled { opacity: .45; cursor: default; }
.wf-btn.on { background: rgba(0,103,192,.14); border-color: rgba(0,103,192,.5); }
.wf-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }
.wf-msg { font-size: 12px; color: #0a8f4f; }
.wf-msg.err { color: #c0392b; }

.wf-body { flex: 1; min-height: 0; display: flex; }
.wf-left { width: 210px; flex: 0 0 210px; border-right: 1px solid var(--border-color, #e5e7eb); overflow: hidden; }
.wf-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wf-right { width: 340px; flex: 0 0 340px; border-left: 1px solid var(--border-color, #e5e7eb); overflow: hidden; }

.wf-json { flex: 1; overflow: auto; padding: 10px 12px; }
.wf-raw {
  margin: 0; font: 11.5px/1.6 ui-monospace, Consolas, monospace;
  color: var(--text-secondary, #555); white-space: pre-wrap; word-break: break-all;
}
</style>
