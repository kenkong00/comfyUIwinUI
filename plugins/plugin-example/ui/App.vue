<template>
  <div class="ex-host">
    <div class="ex-head">
      <span class="ex-ico" v-html="icon('layer')" />
      <div class="ex-title">
        <div class="ex-name">示例插件</div>
        <div class="ex-sub">演示「前端 UI + 后端路由 + 私有数据表」三件套</div>
      </div>
      <span class="ex-spacer" />
      <button class="ex-btn primary" @click="ping">Ping 后端</button>
    </div>

    <div class="ex-body">
      <div class="ex-card">
        <div class="ex-card-t">后端连通性</div>
        <pre class="ex-pre">{{ pingText || '（未测试）' }}</pre>
      </div>

      <div class="ex-card">
        <div class="ex-card-t">插件私有数据表（pl_example_notes）</div>
        <div class="ex-row">
          <input v-model="draft" class="ex-inp" placeholder="写点什么…" @keydown.enter.prevent="add" />
          <button class="ex-btn primary" :disabled="!draft.trim()" @click="add">新增</button>
        </div>
        <ul class="ex-list">
          <li v-for="n in notes" :key="n.id">
            <span class="ex-txt">{{ n.text }}</span>
            <span class="ex-time">{{ n.created_at }}</span>
            <button class="ex-x" @click="del(n.id)">删除</button>
          </li>
          <li v-if="!notes.length" class="ex-empty">暂无数据</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { icon } from '@/shell/icons'
import { useToast } from '@/shell/toast'

// 插件自己的后端路由：plugin.json 里 server.route = /api/p/example
// 前端 apiClient 统一加 /server 前缀，所以这里写 /api/p/example/xxx
import { apiClient } from '@/services/api'

const toast = useToast()
const draft = ref('')
const notes = ref([])
const pingText = ref('')

const BASE = '/api/p/example'

// 直接用内核暴露的 requestRaw：自动带登录态，不用自己拼 fetch
async function ping() {
  try {
    const r = await apiClient.requestRaw(`${BASE}/ping`)
    pingText.value = JSON.stringify(r, null, 2)
  } catch (e) {
    pingText.value = '请求失败：' + (e.message || e)
  }
}

async function load() {
  try {
    const r = await apiClient.requestRaw(`${BASE}/notes`)
    notes.value = r.success ? r.data || [] : []
  } catch (e) {
    toast.show('加载失败：' + (e.message || e), 'error')
  }
}

async function add() {
  const text = draft.value.trim()
  if (!text) return
  try {
    const r = await apiClient.requestRaw(`${BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!r.success) throw new Error(r.error || '新增失败')
    draft.value = ''
    await load()
  } catch (e) {
    toast.show('新增失败：' + (e.message || e), 'error')
  }
}

async function del(id) {
  try {
    await apiClient.requestRaw(`${BASE}/notes/${id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    toast.show('删除失败：' + (e.message || e), 'error')
  }
}

onMounted(() => {
  ping()
  load()
})
</script>

<style scoped>
.ex-host { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-secondary, #f3f4f6); }
.ex-head {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  padding: 10px 12px; border-bottom: 1px solid var(--border-color, #e5e7eb); background: var(--bg-surface, #fff);
}
.ex-ico { width: 22px; height: 22px; }
.ex-ico :deep(svg) { width: 22px; height: 22px; }
.ex-name { font-size: 13.5px; font-weight: 600; color: var(--text-primary, #1f2937); }
.ex-sub { font-size: 11.5px; color: var(--text-muted, #888); margin-top: 2px; }
.ex-spacer { flex: 1; }
.ex-body { flex: 1; min-height: 0; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.ex-card { background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 12px; }
.ex-card-t { font-size: 12.5px; font-weight: 600; color: var(--text-primary, #1f2937); margin-bottom: 8px; }
.ex-pre {
  margin: 0; padding: 8px 10px; font-size: 11.5px; line-height: 1.6;
  background: var(--bg-secondary, #f9fafb); border-radius: 6px; color: var(--text-primary, #1f2937);
  white-space: pre-wrap; word-break: break-all;
}
.ex-row { display: flex; gap: 8px; margin-bottom: 8px; }
.ex-inp {
  flex: 1; min-width: 0; font-size: 12.5px; padding: 6px 9px; border-radius: 6px;
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937);
}
.ex-inp:focus { outline: none; border-color: var(--accent-color, #0067c0); }
.ex-btn {
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); border-radius: 6px;
  padding: 5px 11px; font-size: 12.5px; cursor: pointer; color: var(--text-primary, #1f2937); white-space: nowrap;
}
.ex-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }
.ex-btn:disabled { opacity: .5; cursor: default; }
.ex-list { list-style: none; margin: 0; padding: 0; }
.ex-list li {
  display: flex; align-items: center; gap: 8px; padding: 6px 4px;
  border-top: 1px solid var(--border-color, #f0f1f3); font-size: 12.5px; color: var(--text-primary, #1f2937);
}
.ex-txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-time { font-size: 11px; color: var(--text-muted, #888); }
.ex-x {
  border: none; background: transparent; color: #d0453b; cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px;
}
.ex-x:hover { background: rgba(208, 69, 59, .1); }
.ex-empty { color: var(--text-muted, #888); justify-content: center; }
</style>
