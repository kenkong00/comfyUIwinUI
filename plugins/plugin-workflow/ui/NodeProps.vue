<template>
  <div class="np">
    <div v-if="!node" class="np-empty">
      <template v-if="hasNodes">在左边选一个节点，这里就能改它的参数</template>
      <template v-else>没解析到节点 —— 这个文件可能不是 ComfyUI 工作流</template>
    </div>

    <div v-else class="np-body">
      <div class="np-head">
        <div class="np-title">{{ node.title || node.type }}</div>
        <div class="np-sub">
          <span class="np-type">{{ node.type }}</span>
          <span class="np-idx">#{{ node.id }}</span>
          <span class="np-sp" />
          <button class="np-btn" :disabled="readonly || !changedCount" @click="emit('reset-node', node.id)">
            还原本节点{{ changedCount ? `（${changedCount}）` : '' }}
          </button>
        </div>
      </div>

      <!-- 连线引用：点一下跳到上游节点 -->
      <div v-if="node.linksIn && node.linksIn.length" class="np-sec">
        <div class="np-sec-t">连线输入</div>
        <div class="np-links">
          <button
            v-for="(li, i) in node.linksIn"
            :key="i"
            class="np-chip"
            @click="emit('goto', li.from)"
            :title="`来自节点 #${li.from} 的第 ${li.fromSlot} 个输出`"
          >
            <span class="chip-k">{{ li.name }}</span>
            <span class="chip-v">← #{{ li.from }} {{ fromName(li.from) }}</span>
          </button>
        </div>
      </div>

      <!-- 可编辑参数 -->
      <div class="np-sec">
        <div class="np-sec-t">参数</div>
        <div v-if="!node.params.length" class="np-none">这个节点没有可直接编辑的参数（纯连线节点）</div>

        <template v-for="p in node.params" :key="p.path">
          <!-- 嵌套对象（如 Power Lora Loader 的 lora_1） -->
          <div v-if="p.kind === 'group'" class="np-group">
            <div class="np-group-t">
              <span>{{ p.label }}</span>
              <span class="np-badge">对象</span>
            </div>
            <div v-for="c in p.children" :key="c.path" class="np-row">
              <label :title="c.label">{{ c.label }}</label>
              <div class="np-ctl"><Control :param="c" :readonly="readonly" :changed="isChanged(c)" @edit="onEdit(c, $event)" /></div>
            </div>
          </div>

          <!-- 控件标记：不是真参数 -->
          <div v-else-if="p.kind === 'marker'" class="np-row marker">
            <label :title="p.label">{{ p.label }}</label>
            <div class="np-ctl"><span class="np-marker">界面控件（不可编辑）</span></div>
          </div>

          <!-- 普通参数 -->
          <div v-else class="np-row" :class="{ changed: isChanged(p) }">
            <label :title="p.label">
              {{ p.label }}
              <i v-if="isChanged(p)" class="np-dot" title="已修改" />
            </label>
            <div class="np-ctl"><Control :param="p" :readonly="readonly" :changed="isChanged(p)" @edit="onEdit(p, $event)" /></div>
          </div>
        </template>
      </div>

      <div v-if="node.linksOut && node.linksOut.length" class="np-sec">
        <div class="np-sec-t">输出</div>
        <div class="np-links">
          <span v-for="(o, i) in node.linksOut" :key="i" class="np-chip out">
            <span class="chip-k">{{ o.name || '输出 ' + (i + 1) }}</span>
            <span class="chip-v">{{ o.type || '' }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 大文本编辑浮层 -->
    <div v-if="big.open" class="np-mask" @click.self="big.open = false">
      <div class="np-modal">
        <div class="np-modal-t">{{ big.label }}</div>
        <textarea
          v-model="big.value"
          class="np-modal-edit"
          spellcheck="false"
          placeholder="在这里写提示词…"
        />
        <div class="np-modal-b">
          <span class="np-modal-meta">{{ big.value.length }} 字符 · {{ lineCount(big.value) }} 行</span>
          <span class="np-sp" />
          <button class="np-btn" @click="big.open = false">取消</button>
          <button class="np-btn primary" @click="commitBig">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 参数面板：按参数类型给不同的控件。
//   长文本 → 多行框 + 可放大到全屏（ComfyUI 的提示词都是长文本，单行 input 根本没法改）
//   数字   → number + 常见范围（steps/cfg/denoise…）+ seed 的随机按钮
//   枚举   → 下拉候选（仍可手输，避免候选不全反而卡住用户）
import { ref, reactive, computed, watch, defineComponent, h } from 'vue'

const props = defineProps({
  node: { type: Object, default: null },
  nodes: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  changed: { type: Object, default: () => ({}) }, // { [nodeId|path]: true }
})
const emit = defineEmits(['edit', 'goto', 'reset-node'])

const big = reactive({ open: false, label: '', value: '', param: null })

const hasNodes = computed(() => props.nodes.length > 0)

const changedCount = computed(() => {
  if (!props.node) return 0
  const pre = props.node.id + '|'
  return Object.keys(props.changed).filter((k) => k.startsWith(pre)).length
})
function isChanged(p) {
  return !!(props.node && props.changed[props.node.id + '|' + p.path])
}
function fromName(id) {
  const n = props.nodes.find((x) => x.id === String(id))
  return n ? (n.title || n.type) : ''
}
function lineCount(s) {
  return String(s || '').split('\n').length
}

function onEdit(p, value) {
  p.value = value
  emit('edit', { node: props.node, param: p, value })
}

// ---- 控件（用函数式组件内联，免去再多一个文件）----
const Control = defineComponent({
  name: 'WfControl',
  props: { param: { type: Object, required: true }, readonly: Boolean, changed: Boolean },
  emits: ['edit', 'big'],
  setup(cprops, { emit: cemit }) {
    // 数字框用「本地文本」做受控值：
    // 若直接把 Number(e.target.value) 回写，输入 "1." / "-" 这类中间态会被立刻改写成 "1"，
    // 表现为小数点打不进去。所以输入期间只改本地文本，能解析成数字才提交。
    const localNum = ref(String(cprops.param.value ?? ''))
    watch(
      () => cprops.param.value,
      (v) => {
        if (Number(localNum.value) !== Number(v)) localNum.value = String(v ?? '')
      }
    )
    function onNumInput(e) {
      localNum.value = e.target.value
      const n = Number(e.target.value)
      if (e.target.value !== '' && Number.isFinite(n)) cemit('edit', n)
    }
    function commitNum() {
      const n = Number(localNum.value)
      if (localNum.value === '' ) {
        localNum.value = String(cprops.param.value ?? '')
        return
      }
      if (Number.isFinite(n)) cemit('edit', n)
    }
    function dice() {
      const v = Math.floor(Math.random() * 18446744073709551615)
      localNum.value = String(v)
      cemit('edit', v)
    }
    function openBig() {
      big.param = cprops.param
      big.label = cprops.param.label
      big.value = String(cprops.param.value ?? '')
      big.open = true
    }
    return () => {
      const p = cprops.param
      const dis = cprops.readonly
      if (p.kind === 'null') {
        return h('span', { class: 'np-null' }, '— 空值')
      }
      if (p.kind === 'marker') {
        return h('span', { class: 'np-marker' }, '界面控件')
      }
      if (p.kind === 'bool') {
        return h('label', { class: { 'np-sw': true, on: !!p.value } }, [
          h('input', {
            type: 'checkbox', checked: !!p.value, disabled: dis,
            onChange: (e) => cemit('edit', e.target.checked),
          }),
          h('span', {}, p.value ? '开' : '关'),
        ])
      }
      if (p.kind === 'number') {
        const m = p.meta || {}
        return h('span', { class: 'np-num' }, [
          h('input', {
            type: 'number', class: 'np-in', value: localNum.value, disabled: dis,
            min: m.min, max: m.max, step: m.step || 'any',
            onInput: onNumInput, onBlur: commitNum,
          }),
          m.dice ? h('button', { class: 'np-dice', title: '随机 seed', disabled: dis, onClick: dice }, '🎲') : null,
          m.min !== undefined ? h('span', { class: 'np-range' }, `${m.min}~${m.max}`) : null,
        ])
      }
      if (p.kind === 'textarea') {
        return h('span', { class: 'np-ta-wrap' }, [
          h('textarea', {
            class: 'np-ta', rows: 3, value: p.value ?? '', disabled: dis, spellcheck: false,
            placeholder: '留空则不传该参数',
            onInput: (e) => cemit('edit', e.target.value),
          }),
          h('button', { class: 'np-expand', title: '放大编辑', onClick: openBig }, '⤢'),
        ])
      }
      if (p.kind === 'select') {
        const listId = 'dl-' + p.path.replace(/[^a-zA-Z0-9]/g, '_')
        return h('span', { class: 'np-sel' }, [
          h('input', {
            class: 'np-in', list: listId, value: p.value ?? '', disabled: dis,
            onInput: (e) => cemit('edit', e.target.value),
          }),
          h('datalist', { id: listId }, (p.meta?.options || []).map((o) => h('option', { value: o }))),
        ])
      }
      return h('input', {
        class: 'np-in', value: p.value ?? '', disabled: dis,
        placeholder: '空',
        onInput: (e) => cemit('edit', e.target.value),
      })
    }
  },
})

function commitBig() {
  if (big.param) onEdit(big.param, big.value)
  big.open = false
}
</script>

<style scoped>
.np { height: 100%; overflow: auto; padding: 0 0 20px; }
.np-empty { padding: 18px 14px; color: var(--text-muted, #999); font-size: 12.5px; }
.np-head { padding: 8px 12px 6px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.np-title { font-size: 13.5px; font-weight: 600; color: var(--text-primary, #1f2937); }
.np-sub { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.np-type { font-size: 11.5px; color: var(--text-muted, #888); }
.np-idx { font-size: 11px; color: var(--text-muted, #aaa); }
.np-sp { flex: 1; }
.np-btn {
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff);
  border-radius: 5px; padding: 3px 8px; font-size: 11.5px; cursor: pointer; color: var(--text-primary, #1f2937);
}
.np-btn:hover:not(:disabled) { background: rgba(0,103,192,.1); }
.np-btn:disabled { opacity: .45; cursor: default; }
.np-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }

.np-sec { padding: 8px 12px 4px; }
.np-sec-t {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-muted, #999); margin-bottom: 6px;
}
.np-none { font-size: 12px; color: var(--text-muted, #999); }

.np-row { display: grid; grid-template-columns: 118px 1fr; align-items: start; gap: 8px; padding: 3px 0; }
.np-row label {
  font-size: 12px; color: var(--text-secondary, #555); padding-top: 5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.np-row.changed label { color: var(--accent-color, #0067c0); font-weight: 600; }
.np-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; margin-left: 4px; vertical-align: middle; }
.np-ctl { min-width: 0; }

.np-in, .np-ta {
  width: 100%; box-sizing: border-box; border: 1px solid var(--border-color, #d1d5db);
  border-radius: 5px; padding: 4px 7px; font-size: 12.5px; font-family: inherit;
  background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); outline: none;
}
.np-in:focus, .np-ta:focus { border-color: var(--accent-color, #0067c0); }
.np-in:disabled, .np-ta:disabled { background: rgba(0,0,0,.04); color: var(--text-muted, #777); }
.np-ta { resize: vertical; line-height: 1.55; min-height: 54px; }

.np-ta-wrap { display: flex; align-items: flex-start; gap: 4px; }
.np-expand {
  flex: 0 0 auto; border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff);
  border-radius: 5px; cursor: pointer; padding: 3px 6px; font-size: 12px; color: var(--text-primary, #1f2937);
}
.np-expand:hover { background: rgba(0,103,192,.1); }

.np-num { display: flex; align-items: center; gap: 5px; }
.np-range { font-size: 10.5px; color: var(--text-muted, #aaa); flex: 0 0 auto; }
.np-dice {
  flex: 0 0 auto; border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff);
  border-radius: 5px; cursor: pointer; padding: 2px 5px; font-size: 12px;
}
.np-sel { display: block; }

.np-sw { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-secondary, #555); cursor: pointer; }
.np-sw.on { color: #0a8f4f; font-weight: 600; }
.np-null { font-size: 12px; color: var(--text-muted, #aaa); }
.np-marker { font-size: 11.5px; color: var(--text-muted, #999); font-style: italic; }

.np-group { margin: 6px 0; border: 1px dashed var(--border-color, #d8dce2); border-radius: 6px; padding: 4px 8px 6px; background: rgba(127,127,127,.04); }
.np-group-t { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-primary, #1f2937); padding: 2px 0 4px; }
.np-badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(127,127,127,.16); color: var(--text-muted, #777); font-weight: 400; }

.np-links { display: flex; flex-wrap: wrap; gap: 5px; }
.np-chip {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%;
  border: 1px solid var(--border-color, #d8dce2); background: var(--bg-surface, #fff);
  border-radius: 999px; padding: 2px 9px; font-size: 11px; cursor: pointer; color: var(--text-primary, #1f2937);
}
.np-chip:hover { background: rgba(0,103,192,.1); border-color: var(--accent-color, #0067c0); }
.np-chip.out { cursor: default; opacity: .9; }
.np-chip.out:hover { background: var(--bg-surface, #fff); border-color: var(--border-color, #d8dce2); }
.chip-k { font-weight: 600; }
.chip-v { color: var(--text-muted, #888); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.np-mask {
  position: fixed; inset: 0; z-index: 20000; background: rgba(0,0,0,.42);
  display: flex; align-items: center; justify-content: center; padding: 40px;
}
.np-modal {
  width: min(760px, 92vw); background: var(--bg-surface, #fff); border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,.4); display: flex; flex-direction: column; overflow: hidden;
}
.np-modal-t { padding: 10px 14px; font-weight: 600; font-size: 13px; border-bottom: 1px solid var(--border-color, #e5e7eb); color: var(--text-primary, #1f2937); }
.np-modal-edit {
  min-height: 320px; resize: none; border: none; outline: none; padding: 12px 14px;
  font: 13px/1.7 ui-monospace, Consolas, "Microsoft YaHei", monospace;
  background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937);
}
.np-modal-b { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border-color, #e5e7eb); }
.np-modal-meta { font-size: 11.5px; color: var(--text-muted, #888); }
</style>
