<template>
  <div class="recycle-pad">
    <div class="rec-toolbar">
      <button class="rec-btn" :disabled="!sel.length" @click="restore"><span v-html="icon('restore')" /> 还原</button>
      <button class="rec-btn" :disabled="!sel.length" @click="purge"><span v-html="icon('trash')" /> 永久删除</button>
      <button class="rec-btn" :disabled="!items.length" @click="empty"><span v-html="icon('empty')" /> 清空回收站</button>
      <span class="rec-spacer" />
      <button class="rec-btn" :disabled="loading" @click="refresh"><span v-html="icon('refresh')" /> 刷新</button>
      <span class="rec-hint">{{ items.length }} 项 · 已选 {{ sel.length }}</span>
    </div>
    <div class="rec-body">
      <div v-if="loading" class="rec-empty"><p>正在加载回收站…</p></div>
      <div v-else-if="items.length === 0" class="rec-empty">
        <div class="rec-bin" v-html="binIcon" />
        <p class="rec-title">回收站是空的</p>
        <p class="rec-sub">被删除的文件、文件夹会先进入这里，可随时还原或永久删除。</p>
      </div>
      <table v-else class="rec-table">
        <thead>
          <tr>
            <th style="width:34px"><input type="checkbox" :checked="allSel" @change="toggleAll" /></th>
            <th>名称</th><th>原始类型</th><th>删除时间</th><th>大小</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in items" :key="it.id" :class="{ sel: sel.includes(it.id) }" @click="toggleRow(it.id)">
            <td><input type="checkbox" :checked="sel.includes(it.id)" @click.stop="toggleRow(it.id)" /></td>
            <td class="td-name"><span class="td-ico" v-html="it.kind === 'recycle-folder' ? icon('folder') : icon('file')" />{{ it.name }}</td>
            <td>{{ it.kind === 'recycle-folder' ? '文件夹' : (fileTypeLabel(it.fileType)) }}</td>
            <td>{{ fmtDate(it.deletedAt) }}</td>
            <td>{{ fmtSize(it.size) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 现代确认对话框（与系统统一风格，替代原生 confirm） -->
    <Teleport to="body">
      <div v-if="dlg.show" class="dlg-mask" @click.self="closeDlg" @contextmenu.prevent.stop>
        <div class="dlg">
          <div class="dlg-head">
            <span class="dlg-ico" :class="{ danger: dlg.danger }" v-html="icon(dlg.danger ? 'delete' : 'help')" />
            <div class="dlg-title">{{ dlg.title }}</div>
          </div>
          <div class="dlg-text">{{ dlg.text }}</div>
          <div class="dlg-btns">
            <button class="dlg-btn" @click="closeDlg">取消</button>
            <button class="dlg-btn primary" :class="{ danger: dlg.danger }" @click="dlgOk">{{ dlg.okText || '确定' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { icon } from '@/shell/icons'
import { useVfs } from '@/shell/vfs'
import { useToast } from '@/shell/toast'

const vfs = useVfs()
const toast = useToast()
const binIcon = icon('recycle')

const items = ref([])
const sel = ref([])
const loading = ref(false)
const allSel = computed(() => items.value.length > 0 && sel.value.length === items.value.length)

async function refresh() {
  loading.value = true
  try { items.value = await vfs.getRecycle() } catch (e) { toast.show('加载回收站失败：' + (e.message || e), 'error') }
  finally { loading.value = false; sel.value = [] }
}
function toggleRow(id) {
  const i = sel.value.indexOf(id)
  if (i >= 0) sel.value.splice(i, 1)
  else sel.value.push(id)
}
function toggleAll(e) { sel.value = e.target.checked ? items.value.map((x) => x.id) : [] }
async function restore() {
  const chosen = items.value.filter((x) => sel.value.includes(x.id))
  if (await vfs.restoreRecycle(chosen)) { toast.show('已还原', 'success'); await refresh() }
}
async function purge() {
  const n = sel.value.length
  const ok = await askConfirm({
    title: '永久删除',
    text: `确定永久删除选中的 ${n} 项吗？此操作不可恢复！`,
    okText: '永久删除',
    danger: true,
  })
  if (!ok) return
  const chosen = items.value.filter((x) => sel.value.includes(x.id))
  if (await vfs.purgeRecycle(chosen)) { toast.show('已永久删除', 'success'); await refresh() }
}
async function empty() {
  const ok = await askConfirm({
    title: '清空回收站',
    text: '确定清空回收站吗？所有项目将被永久删除且不可恢复！',
    okText: '全部删除',
    danger: true,
  })
  if (!ok) return
  if (await vfs.emptyRecycle()) { toast.show('回收站已清空', 'success'); await refresh() }
}

// ---- 统一风格确认对话框 ----
const dlg = ref({ show: false, title: '', text: '', okText: '确定', danger: false, resolve: null })
function askConfirm({ title, text, okText, danger }) {
  return new Promise((resolve) => {
    dlg.value = { show: true, title, text, okText: okText || '确定', danger: !!danger, resolve }
  })
}
function closeDlg() {
  if (dlg.value.resolve) dlg.value.resolve(false)
  dlg.value.show = false
}
function dlgOk() {
  if (dlg.value.resolve) dlg.value.resolve(true)
  dlg.value.show = false
}
function fileTypeLabel(t) {
  const m = { image: '图片', video: '视频', audio: '音频', prompt: '提示词', text: '文本', rule: '规则', json: 'JSON', workflow: '工作流' }
  return m[t] || '文件'
}
function fmtSize(n) { if (!n) return '—'; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(1) + ' MB' }
function fmtDate(s) { return s ? String(s).replace('T', ' ').slice(0, 19) : '—' }

onMounted(() => {
  refresh()
  // 别的窗口（资源管理器删除 / 还原 / 永久删除 / 清空）改动回收站后，本窗口实时刷新，不用手动关重开
  window.addEventListener('recycle-changed', refresh)
})
onUnmounted(() => { window.removeEventListener('recycle-changed', refresh) })
</script>

<style scoped>
.recycle-pad { display: flex; flex-direction: column; height: 100%; background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); }
.rec-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f3f4f6); flex-shrink: 0; }
.rec-btn { display: flex; align-items: center; gap: 5px; border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); border-radius: 5px; padding: 5px 10px; font-size: 12.5px; cursor: pointer; color: var(--text-primary, #1f2937); }
.rec-btn :deep(svg) { width: 15px; height: 15px; }
.rec-btn:hover:not(:disabled) { background: rgba(0,103,192,.08); }
.rec-btn:disabled { opacity: .45; cursor: default; }
.rec-spacer { flex: 1; }
.rec-hint { font-size: 12px; color: var(--text-muted, #999); }
.rec-body { flex: 1; min-height: 0; overflow: auto; }
.rec-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-muted, #999); text-align: center; }
.rec-bin { width: 74px; height: 74px; opacity: .8; }
.rec-title { font-size: 15px; color: var(--text-primary, #374151); margin-top: 6px; }
.rec-sub { font-size: 12px; line-height: 1.7; max-width: 360px; }
.rec-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rec-table th, .rec-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border-color, #eee); cursor: default; }
.rec-table th { color: var(--text-muted, #999); font-weight: 600; position: sticky; top: 0; background: var(--bg-surface, #fff); }
.rec-table tbody tr:hover { background: rgba(0,0,0,.04); }
.rec-table tbody tr.sel { background: rgba(0,103,192,.14); }
.td-name { display: flex; align-items: center; gap: 8px; }
.td-ico :deep(svg) { width: 18px; height: 18px; }

/* 统一风格对话框 */
.dlg-mask { position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; }
.dlg { width: 380px; max-width: 86vw; background: var(--bg-surface, #fff); border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,.35); padding: 16px 18px; color: var(--text-primary, #1f2937); }
.dlg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dlg-ico { width: 30px; height: 30px; border-radius: 8px; background: rgba(0,103,192,.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.dlg-ico :deep(svg) { width: 17px; height: 17px; }
.dlg-ico.danger { background: rgba(232,17,35,.12); }
.dlg-title { font-size: 14.5px; font-weight: 600; }
.dlg-text { font-size: 13px; line-height: 1.6; color: var(--text-secondary, #555); margin-bottom: 14px; }
.dlg-btns { display: flex; justify-content: flex-end; gap: 8px; }
.dlg-btn { border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); border-radius: 6px; padding: 6px 16px; font-size: 13px; cursor: pointer; }
.dlg-btn:hover { background: rgba(0,0,0,.05); }
.dlg-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }
.dlg-btn.primary:hover { filter: brightness(1.08); }
.dlg-btn.primary.danger { background: #e81123; border-color: #e81123; }
</style>
