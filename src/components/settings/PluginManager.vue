<template>
  <div class="tab-content pg-host">
    <h3>插件</h3>
    <p class="pg-tip">
      插件目录：<code>plugins/</code>。把插件文件夹放进该目录后重启前端即被发现；
      后端路由的挂载发生在 api-server 启动时，改完开关需要重启 api-server 才生效。
    </p>

    <div class="pg-toolbar">
      <button class="btn" :disabled="loading" @click="refresh">刷新</button>
      <button class="btn" @click="installOpen = !installOpen">安装插件…</button>
      <span class="pg-spacer" />
      <span v-if="msg" class="pg-msg" :class="{ 'pg-err': errFlag }">{{ msg }}</span>
    </div>

    <!-- 安装面板 -->
    <div v-if="installOpen" class="pg-install">
      <div class="form-group">
        <label>从本地目录导入</label>
        <div class="pg-row">
          <input v-model="fromDir" class="pg-input" placeholder="例如 D:\Downloads\my-plugin" />
          <button class="btn btn-primary" :disabled="!fromDir.trim() || busy" @click="installFromDir">导入</button>
        </div>
      </div>
      <div class="form-group">
        <label>从 URL 安装（zip）</label>
        <div class="pg-row">
          <input v-model="fromUrl" class="pg-input" placeholder="https://.../plugin.zip" />
          <button class="btn btn-primary" :disabled="!fromUrl.trim() || busy" @click="installFromUrl">下载并安装</button>
        </div>
      </div>
      <div class="pg-hint">安装来源必须是可信作者：插件等同本机 Node 权限，可读写数据库与磁盘。</div>
    </div>

    <!-- 加载失败明细 -->
    <div v-if="errors.length" class="pg-errors">
      <div class="pg-errors-t">加载失败</div>
      <div v-for="e in errors" :key="e.id" class="pg-error-row">
        <b>{{ e.id }}</b>：{{ e.error }}
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="loading && !list.length" class="pg-empty">载入中…</div>
    <div v-else-if="!list.length" class="pg-empty">尚未发现插件</div>
    <div v-else class="pg-list">
      <div v-for="p in list" :key="p.id" class="pg-item">
        <div class="pg-ico" v-html="icon(p.icon || 'file')" />
        <div class="pg-main">
          <div class="pg-name">
            {{ p.name }}
            <span class="pg-ver">v{{ p.version || '0.0.0' }}</span>
            <span v-if="p.author" class="pg-author">by {{ p.author }}</span>
          </div>
          <div class="pg-desc">{{ p.description || '（无描述）' }}</div>
          <div class="pg-meta">
            <span class="pg-tag">id: {{ p.id }}</span>
            <span v-if="p.server && p.server.route" class="pg-tag">后端: {{ p.server.route }}</span>
            <span v-if="p.desktop" class="pg-tag">桌面图标</span>
            <span v-if="Number(p.app && p.app.pin || 0) > 0" class="pg-tag">开始菜单固定</span>
          </div>
        </div>
        <div class="pg-ops">
          <button
            class="btn"
            :class="{ 'btn-primary': !p.enabled }"
            :disabled="busy"
            @click="toggle(p)"
          >{{ p.enabled ? '禁用' : '启用' }}</button>
          <button class="btn pg-danger" :disabled="busy" @click="askRemove(p)">卸载</button>
        </div>
      </div>
    </div>

    <!-- 卸载确认（原生 confirm 在本环境不可用，用内嵌对话框） -->
    <div v-if="confirmId" class="pg-mask" @click.self="confirmId = null">
      <div class="pg-dlg">
        <div class="pg-dlg-t">确认卸载插件？</div>
        <div class="pg-dlg-b">
          将删除目录 <code>plugins/{{ confirmDir }}</code>，插件的私有数据与配置一并删除，不可恢复。
        </div>
        <div class="pg-dlg-ops">
          <button class="btn" @click="confirmId = null">取消</button>
          <button class="btn pg-danger" :disabled="busy" @click="doRemove">确认卸载</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { apiClient } from '@/services/api'
import { useToast } from '@/shell/toast'
import { icon } from '@/shell/icons'
import { PLUGIN_ERRORS } from '@/shell/pluginRegistry'
import { loadPlugins } from '@/shell/pluginRegistry'

const toast = useToast()
const list = ref([])
const loading = ref(false)
const busy = ref(false)
const msg = ref('')
const errFlag = ref(false)
const installOpen = ref(false)
const fromDir = ref('')
const fromUrl = ref('')
const confirmId = ref(null)
const errors = computed(() => PLUGIN_ERRORS.value || [])

function say(text, isErr = false) {
  msg.value = text
  errFlag.value = isErr
  setTimeout(() => { if (msg.value === text) msg.value = '' }, 4000)
}

async function refresh() {
  loading.value = true
  try {
    const r = await apiClient.requestRaw('/api/plugins')
    list.value = r.success ? r.data || [] : []
    if (!r.success) throw new Error(r.error || '读取失败')
  } catch (e) {
    say('读取插件列表失败：' + (e.message || e), true)
    list.value = []
  } finally {
    loading.value = false
  }
}

async function toggle(p) {
  busy.value = true
  try {
    const r = await apiClient.requestRaw(`/api/plugins/${encodeURIComponent(p.id)}/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    })
    if (!r.success) throw new Error(r.error || '操作失败')
    p.enabled = !p.enabled
    say(`「${p.name}」已${p.enabled ? '启用' : '禁用'}，重启 api-server 后生效`)
  } catch (e) {
    say('操作失败：' + (e.message || e), true)
  } finally {
    busy.value = false
  }
}

function askRemove(p) { confirmId.value = p.id }
const confirmDir = computed(() => (list.value.find((x) => x.id === confirmId.value) || {})._dir || confirmId.value)

async function doRemove() {
  const id = confirmId.value
  if (!id) return
  busy.value = true
  try {
    const r = await apiClient.requestRaw(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.success) throw new Error(r.error || '卸载失败')
    confirmId.value = null
    toast.show(`已卸载 ${id}`, 'success')
    await refresh()
    await loadPlugins()
    say('已卸载，重启后不再出现')
  } catch (e) {
    say('卸载失败：' + (e.message || e), true)
  } finally {
    busy.value = false
  }
}

async function install(payload) {
  busy.value = true
  try {
    const r = await apiClient.requestRaw('/api/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.success) throw new Error(r.error || '安装失败')
    toast.show(`已安装「${r.data?.name || r.data?.id}」`, 'success')
    fromDir.value = ''
    fromUrl.value = ''
    installOpen.value = false
    await refresh()
    await loadPlugins()
    say('安装成功，重启后生效')
  } catch (e) {
    say('安装失败：' + (e.message || e), true)
  } finally {
    busy.value = false
  }
}
function installFromDir() { install({ fromDir: fromDir.value.trim() }) }
function installFromUrl() { install({ url: fromUrl.value.trim() }) }

onMounted(refresh)
</script>

<style scoped>
.pg-host { padding-bottom: 12px; }
.pg-tip { font-size: 12px; color: var(--text-muted, #888); margin: 0 0 10px; line-height: 1.7; }
.pg-tip code { background: var(--bg-secondary, #f3f4f6); padding: 1px 5px; border-radius: 4px; }
.pg-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.pg-spacer { flex: 1; }
.pg-msg { font-size: 12px; color: #0f7b0f; }
.pg-msg.pg-err { color: #d0453b; }
.pg-install {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px;
  padding: 12px; margin-bottom: 12px; background: var(--bg-secondary, #f9fafb);
}
.pg-row { display: flex; gap: 8px; }
.pg-input {
  flex: 1; min-width: 0; font-size: 12.5px; padding: 6px 9px; border-radius: 6px;
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937);
}
.pg-input:focus { outline: none; border-color: var(--accent-color, #0067c0); }
.pg-hint { font-size: 11.5px; color: #b45309; margin-top: 8px; line-height: 1.6; }
.pg-errors {
  border: 1px solid #f0c2bd; background: rgba(208, 69, 59, .06);
  border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;
}
.pg-errors-t { font-size: 12.5px; font-weight: 600; color: #d0453b; margin-bottom: 6px; }
.pg-error-row { font-size: 12px; color: #8a2f27; line-height: 1.6; }
.pg-empty { font-size: 12.5px; color: var(--text-muted, #888); padding: 16px 0; }
.pg-list { display: flex; flex-direction: column; gap: 8px; }
.pg-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; background: var(--bg-surface, #fff);
}
.pg-item:has(.pg-danger:focus) { border-color: #d0453b; }
.pg-ico { width: 22px; height: 22px; flex-shrink: 0; margin-top: 2px; }
.pg-ico :deep(svg) { width: 22px; height: 22px; }
.pg-main { flex: 1; min-width: 0; }
.pg-name { font-size: 13px; font-weight: 600; color: var(--text-primary, #1f2937); }
.pg-ver { font-size: 11px; font-weight: 400; color: var(--text-muted, #888); margin-left: 6px; }
.pg-author { font-size: 11px; font-weight: 400; color: var(--text-muted, #888); margin-left: 6px; }
.pg-desc { font-size: 12px; color: var(--text-secondary, #555); margin-top: 3px; line-height: 1.6; }
.pg-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.pg-tag {
  font-size: 11px; padding: 1px 7px; border-radius: 10px;
  background: var(--bg-secondary, #f3f4f6); color: var(--text-muted, #666);
}
.pg-ops { display: flex; gap: 6px; flex-shrink: 0; }
.pg-danger { color: #d0453b; border-color: #e8b7b2; }
.pg-danger:hover { background: rgba(208, 69, 59, .08); }
.pg-mask {
  position: absolute; inset: 0; background: rgba(0, 0, 0, .35);
  display: flex; align-items: center; justify-content: center; z-index: 30;
}
.pg-dlg {
  width: 400px; max-width: 92%; background: var(--bg-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .25); padding: 14px 16px;
}
.pg-dlg-t { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary, #1f2937); }
.pg-dlg-b { font-size: 12.5px; line-height: 1.7; color: var(--text-secondary, #444); }
.pg-dlg-b code { background: var(--bg-secondary, #f3f4f6); padding: 1px 5px; border-radius: 4px; }
.pg-dlg-ops { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
