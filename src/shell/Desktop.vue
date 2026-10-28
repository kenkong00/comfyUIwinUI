<template>
  <div class="desktop" :class="{ 'dt-dark': isDark }" @contextmenu="onDeskCtx">
    <!-- 壁纸 -->
    <div class="dt-wallpaper" />

    <!-- 桌面图标 -->
    <div class="dt-icons">
      <button
        v-for="d in deskIcons"
        :key="d.app"
        class="dt-icon"
        :class="{ 'dt-icon-sel': selected === d.app }"
        @click="selected = d.app"
        @dblclick="wm.open(d.app)"
        @contextmenu.prevent="onIconCtx(d, $event)"
      >
        <span class="dt-icon-img" v-html="icon(d.icon)" />
        <span class="dt-icon-label">{{ d.label }}</span>
      </button>
    </div>

    <!-- 窗口层：渲染所有窗口（含已最小化的）；最小化窗口用 v-show 隐藏但保持挂载，内部状态不丢 -->
    <template v-if="!wm.classicMode">
      <WindowFrame v-for="w in wm.windows" :key="w.id" :win="w" v-show="w.state !== 'min'" />
    </template>

    <!-- 经典管理界面兜底 -->
    <div v-else class="dt-classic">
      <Sidebar v-model="activeNav" :userInfo="userInfo" :syncStatus="syncStatus" :isLocalMode="true" @show-profile="activeNav='profile'" />
      <MainContent :active-nav="activeNav" :user="session.user" @logout="$emit('logout')" @avatar-updated="onAvatar" @navigate="activeNav=$event" />
      <RightFilterPanel v-model:collapsed="rightCollapsed" @navigate="activeNav=$event" />
    </div>

    <!-- 搜索面板 -->
    <div v-if="wm.searchOpen" class="search-backdrop" @click="wm.toggleSearch()">
      <div class="search-panel" @click.stop>
        <div class="sp-input">
          <span v-html="icon('search')" />
          <input ref="searchInput" v-model="q" placeholder="搜索应用…" @keydown.enter="openTop" />
        </div>
        <div class="sp-results">
          <button v-for="a in searchResults" :key="a.id" class="sp-row" @click="wm.open(a.id)">
            <span class="sp-ico" v-html="icon(a.ico)" /> <span>{{ a.name }}</span>
          </button>
          <div v-if="searchResults.length===0" class="sp-empty">无匹配结果</div>
        </div>
      </div>
    </div>

    <!-- 操作中心（通知） -->
    <div v-if="wm.actionCenterOpen" class="ac-backdrop" @click="wm.toggleActionCenter()">
      <div class="ac-panel" @click.stop>
        <div class="ac-toggles">
          <button class="ac-toggle" @click="toggleTheme">
            <span v-html="icon('start')" /> <span>{{ isDark ? '浅色模式' : '深色模式' }}</span>
          </button>
          <button class="ac-toggle" @click="toggleClassic">
            <span v-html="icon('desktop')" /> <span>{{ wm.classicMode ? '返回桌面' : '经典管理界面' }}</span>
          </button>
        </div>
        <div class="ac-title">
          通知
          <span v-if="notif.unread > 0" class="ac-badge">{{ notif.unread }}</span>
          <button v-if="notif.list.length" class="ac-clear" @click="notif.clear()">清空</button>
        </div>
        <div class="ac-notify">
          <div v-for="n in notif.list" :key="n.id" class="ac-n" :class="[n.level, { unread: !n.read }]" @click="n.read = true">
            <div class="ac-n-head">
              <span class="ac-n-ico" v-html="notifIcon(n.level)" />
              <b>{{ n.title }}</b>
              <small>{{ n.time }}</small>
            </div>
            <div v-if="n.body" class="ac-n-body">{{ n.body }}</div>
          </div>
          <div v-if="!notif.list.length" class="ac-n muted">暂无通知</div>
        </div>
      </div>
    </div>

    <!-- 固定层 -->
    <Taskbar />
    <StartMenu @power="$emit('logout')" />
    <ContextMenu />
    <ToastHost />
    <!-- 全局 AI 文字编辑：任意文本域右键 / 按住快捷键调用功能库里的「文字编辑」功能 -->
    <AiTextEditLayer />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useWm } from '@/shell/wm'
import { useSession } from '@/shell/session'
import { useConfigStore } from '@/stores/config'
import { useCharacterStore } from '@/stores/character'
import { useGenerationStore } from '@/stores/generation'
import { useNotifications } from '@/stores/notifications'
import WindowFrame from '@/shell/WindowFrame.vue'
import Taskbar from '@/shell/Taskbar.vue'
import StartMenu from '@/shell/StartMenu.vue'
import ContextMenu from '@/shell/ContextMenu.vue'
import ToastHost from '@/shell/ToastHost.vue'
import { getApp, allAppIds, PLUGIN_APPS, registryVersion } from '@/shell/apps'
import { useVfs } from '@/shell/vfs'
import { useToast } from '@/shell/toast'
import { icon } from '@/shell/icons'
import { openContextMenu } from '@/shell/ctxmenu'
import AiTextEditLayer from '@/components/common/AiTextEditLayer.vue'

import Sidebar from '@/components/layout/Sidebar.vue'
import MainContent from '@/components/layout/MainContent.vue'
import RightFilterPanel from '@/components/layout/RightFilterPanel.vue'

const props = defineProps({ user: { type: Object, default: null } })
const emit = defineEmits(['logout'])

const wm = useWm()
const vfs = useVfs()
const toast = useToast()
const session = useSession()
const configStore = useConfigStore()
const characterStore = useCharacterStore()
const generationStore = useGenerationStore()
const notif = useNotifications()

const selected = ref(null)
const searchInput = ref(null)
const q = ref('')
const activeNav = ref('chat')
const rightCollapsed = ref(false)

const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')

// 只列内核自带应用；插件想上桌面就在自己的 plugin.json 里写 "desktop": true
// （notepad / storyboard / novel / recycle 已迁移为插件，桌面图标由插件清单驱动）
const BUILTIN_DESK_ICONS = [
  { app: 'explorer', icon: 'explorer', label: '文件资源管理器' },
  { app: 'studio', icon: 'studio', label: '功能库' },
  { app: 'tasks', icon: 'tasks', label: '任务中心' },
  { app: 'chat', icon: 'chat', label: 'AI 对话' },
  { app: 'uidesigner', icon: 'uidesigner', label: 'UI 设计器' },
  { app: 'character', icon: 'character', label: '角色库' },
  { app: 'settings', icon: 'settings', label: '设置' },
]
// 插件在清单里声明 "desktop": true 就会自动出现在桌面上
const deskIcons = computed(() => {
  void registryVersion.value
  const extra = Object.entries(PLUGIN_APPS)
    .filter(([, def]) => def?._manifest?.desktop === true)
    .filter(([id]) => !BUILTIN_DESK_ICONS.some((d) => d.app === id))
    .map(([id, def]) => ({ app: id, icon: def.icon || 'file', label: def.name || id }))
  return [...BUILTIN_DESK_ICONS, ...extra]
})

const userInfo = computed(() => ({
  avatar: session.user?.avatar_url || (session.user?.username || '?').charAt(0).toUpperCase(),
  name: session.user?.username || '',
  email: session.user?.email || '',
  username: session.user?.username || '',
}))
const syncStatus = computed(() => ({ icon: '✅', text: '已保存', lastSync: '' }))

const searchResults = computed(() => {
  void registryVersion.value // 插件注册/注销后重算
  const t = q.value.trim().toLowerCase()
  return allAppIds()
    .map((id) => ({ id, name: getApp(id)?.name || id, ico: getApp(id)?.icon || 'file' }))
    .filter((a) => !t || a.name.toLowerCase().includes(t))
})
function openTop() { if (searchResults.value[0]) wm.open(searchResults.value[0].id) }

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  localStorage.setItem('app-theme', isDark.value ? 'dark' : 'light')
}
function toggleClassic() { wm.classicMode = !wm.classicMode }

// 桌面右键"新建 → 文件夹"：在总库(C:)根目录真正创建文件夹（不弹新窗口，与 Windows 行为一致）
async function createDeskFolder() {
  try {
    const f = await vfs.createFlFolder('root', '新建文件夹')
    if (f) toast.show('已在总库 (C:) 根目录创建文件夹', 'success')
    else toast.show('新建文件夹失败', 'error')
  } catch { toast.show('新建文件夹失败', 'error') }
}

function onDeskCtx(e) {
  // 只有右键"桌面空白处"才弹桌面菜单；窗口内的右键由各应用自己处理
  if (e.target && e.target.closest && e.target.closest('.win, .dt-classic, .dt-icon, .search-panel, .ac-panel')) return
  selected.value = null
  openContextMenu([
    { label: '查看', icon: 'grid', onClick: () => {} },
    { label: '刷新', icon: 'refresh', onClick: () => {} },
    { label: '新建', icon: 'plus', sub: [
      { label: '提示词文档', icon: 'notepad', onClick: () => wm.open('notepad') },
      { label: '文本文档', icon: 'file', onClick: () => wm.open('notepad') },
      { label: '文件夹', icon: 'folder', onClick: createDeskFolder },
    ] },
    { sep: true },
    { label: '个性化', icon: 'settings', onClick: () => wm.open('settings') },
    { label: '经典管理界面', icon: 'desktop', onClick: toggleClassic },
  ], e)
}
function onIconCtx(d, e) {
  selected.value = d.app
  openContextMenu([
    { label: '打开', icon: 'file', onClick: () => wm.open(d.app) },
    { sep: true },
    { label: '属性', icon: 'settings', onClick: () => {} },
  ], e, d)
}

function onAvatar(a) { if (session.user) session.user = { ...session.user, avatar_url: a } }

function onKey(e) {
  if (e.key === 'Meta' || e.key === 'OS' || (e.ctrlKey && e.key === 'Escape')) {
    e.preventDefault(); wm.toggleStart()
  } else if (e.altKey && e.key === 'F4') {
    if (wm.focusedId) { e.preventDefault(); wm.close(wm.focusedId) }
  }
}

watch(() => wm.searchOpen, (v) => { if (v) nextTick(() => searchInput.value?.focus()) })

// 生图报错自动进入通知中心（工作流未搭建、ComfyUI 未连通等都会在这里反馈）
let lastGenErr = ''
watch(() => generationStore.error, (v) => {
  if (v && v !== lastGenErr) {
    lastGenErr = v
    notif.error('生成失败', v)
  }
  if (!v) lastGenErr = ''
})
function notifIcon(level) {
  const m = { error: 'close', warn: 'warning', success: 'check', info: 'info' }
  return icon(m[level] || 'info')
}

onMounted(() => { window.addEventListener('keydown', onKey) })
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.desktop { position: fixed; inset: 0; overflow: hidden; }
.dt-wallpaper {
  position: absolute; inset: 0; z-index: 0;
  background:
    radial-gradient(1200px 700px at 18% 12%, #1b6fc4 0%, transparent 60%),
    radial-gradient(1000px 800px at 85% 90%, #7b2ff7 0%, transparent 55%),
    linear-gradient(135deg, #0a2a5e 0%, #123a7a 40%, #1a2150 100%);
}
.dt-dark .dt-wallpaper {
  background:
    radial-gradient(1200px 700px at 18% 12%, #123a7a 0%, transparent 60%),
    radial-gradient(1000px 800px at 85% 90%, #3a1b66 0%, transparent 55%),
    linear-gradient(135deg, #0a0a12 0%, #11131f 100%);
}
.dt-icons {
  position: absolute; top: 10px; left: 10px; z-index: 1;
  display: flex; flex-direction: column; flex-wrap: wrap; gap: 6px; max-height: calc(100vh - 70px);
}
.dt-icon {
  width: 92px; height: 92px; border: none; background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border-radius: 6px; padding: 6px 4px; color: #fff;
}
.dt-icon:hover { background: rgba(255,255,255,.12); }
.dt-icon-sel { background: rgba(255,255,255,.22); outline: 1px solid rgba(255,255,255,.4); }
.dt-icon-img { width: 40px; height: 40px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); }
.dt-icon-img :deep(svg) { width: 40px; height: 40px; }
.dt-icon-label { font-size: 12px; text-align: center; line-height: 1.25; text-shadow: 0 1px 3px rgba(0,0,0,.6); }

.dt-classic { position: absolute; inset: 0; top: 0; display: flex; flex-direction: column; z-index: 2; }
.dt-classic :deep(.main-content) { flex: 1; }

.search-backdrop, .ac-backdrop { position: fixed; inset: 0; z-index: 9600; }
.search-panel {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  width: 560px; max-width: 94vw; background: rgba(245,245,247,.96); backdrop-filter: blur(40px);
  border: 1px solid var(--border-color, #dadada); border-radius: 12px; box-shadow: 0 30px 70px rgba(0,0,0,.4);
  padding: 14px; display: flex; flex-direction: column;
}
[data-theme='dark'] .search-panel { background: rgba(34,34,38,.96); }
.sp-input { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border-color, #ccc); border-radius: 8px; padding: 10px 12px; background: var(--bg-surface, #fff); }
[data-theme='dark'] .sp-input { background: #2c2c30; }
.sp-input :deep(svg) { width: 18px; height: 18px; color: var(--text-muted, #888); }
.sp-input input { flex: 1; border: none; outline: none; font-size: 14px; background: transparent; color: var(--text-primary, #1f2937); }
.sp-results { margin-top: 10px; max-height: 50vh; overflow: auto; }
.sp-row { display: flex; align-items: center; gap: 10px; width: 100%; border: none; background: transparent; padding: 9px 10px; border-radius: 6px; cursor: pointer; color: var(--text-primary, #1f2937); font-size: 13.5px; text-align: left; }
.sp-row:hover { background: rgba(0,103,192,.12); }
.sp-ico { width: 22px; height: 22px; }
.sp-ico :deep(svg) { width: 22px; height: 22px; }
.sp-empty { color: var(--text-muted, #999); padding: 10px; font-size: 13px; }

.ac-panel {
  position: absolute; right: 12px; top: 56px; width: 360px; max-width: 92vw;
  background: rgba(245,245,247,.94); backdrop-filter: blur(40px); border: 1px solid var(--border-color, #dadada);
  border-radius: 12px; box-shadow: 0 30px 70px rgba(0,0,0,.4); padding: 16px;
}
[data-theme='dark'] .ac-panel { background: rgba(34,34,38,.94); }
.ac-toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.ac-toggle { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; background: var(--bg-surface, #fff); cursor: pointer; color: var(--text-primary, #1f2937); font-size: 12px; }
[data-theme='dark'] .ac-toggle { background: #2c2c30; }
.ac-toggle :deep(svg) { width: 22px; height: 22px; color: #0078d4; }
.ac-title { font-size: 13px; font-weight: 600; color: var(--text-secondary, #555); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
[data-theme='dark'] .ac-title { color: #cfcfcf; }
.ac-badge { background: #e81123; color: #fff; font-size: 10.5px; font-weight: 600; border-radius: 8px; padding: 1px 6px; }
.ac-clear { margin-left: auto; border: none; background: transparent; color: #0078d4; font-size: 12px; cursor: pointer; }
.ac-clear:hover { text-decoration: underline; }
.ac-notify { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }
.ac-n { background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #eee); border-left: 3px solid #0078d4; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--text-primary, #1f2937); cursor: pointer; }
[data-theme='dark'] .ac-n { background: #2c2c30; border-color: #3a3a3e; }
.ac-n.unread { background: rgba(0,120,212,.06); }
.ac-n.error { border-left-color: #e81123; }
.ac-n.warn { border-left-color: #e67e22; }
.ac-n.success { border-left-color: #2ecc71; }
.ac-n-head { display: flex; align-items: center; gap: 8px; }
.ac-n-head :deep(svg) { width: 15px; height: 15px; }
.ac-n.error .ac-n-head :deep(svg) { color: #e81123; }
.ac-n.warn .ac-n-head :deep(svg) { color: #e67e22; }
.ac-n.success .ac-n-head :deep(svg) { color: #2ecc71; }
.ac-n-head b { font-size: 13px; }
.ac-n-head small { margin-left: auto; color: var(--text-muted, #999); font-size: 11px; }
.ac-n-body { margin-top: 6px; color: var(--text-secondary, #555); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
[data-theme='dark'] .ac-n-body { color: #bbb; }
.ac-n.muted { color: var(--text-muted, #999); border-left-color: #ccc; }
</style>
