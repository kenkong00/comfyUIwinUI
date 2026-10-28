<template>
  <div class="taskbar">
    <!-- 左区 -->
    <div class="tb-left">
      <button class="tb-icon tb-start" :class="{ active: wm.startMenuOpen }" @click="wm.toggleStart()" title="开始">
        <span class="tb-start-logo" v-html="icon('start')" />
      </button>
      <button class="tb-icon" @click="wm.toggleSearch()" title="搜索">
        <span v-html="icon('search')" />
      </button>
      <button class="tb-icon" title="小组件">
        <span v-html="icon('grid')" />
      </button>
    </div>

    <!-- 中区：每个已打开的窗口一个按钮（含最小化），点击还原/聚焦/最小化 -->
    <div class="tb-center">
      <button
        v-for="w in taskWindows"
        :key="w.id"
        class="tb-task"
        :class="{ active: w.id === wm.focusedId && w.state !== 'min', minimized: w.state === 'min' }"
        :title="winTitle(w)"
        @click="onTaskBtn(w)"
      >
        <span class="tb-task-ico" v-html="winAppIcon(w)" />
        <span class="tb-task-label">{{ winTitle(w) }}</span>
      </button>
    </div>

    <!-- 右区：系统托盘 -->
    <div class="tb-tray">
      <!-- 任务队列：点开托盘队列面板（串行队列 / 暂停 / 删除 / 进度） -->
      <button
        class="tb-tray-ico"
        :class="{ 'q-active': queueOpen }"
        :title="queueStore.activeCount > 0 ? `任务队列：${queueStore.activeCount} 个进行中` : '任务队列'"
        @click.stop="queueOpen = !queueOpen"
      >
        <span v-html="icon('tasks')" />
        <span v-if="queueStore.activeCount > 0" class="tb-badge">{{ queueStore.activeCount > 99 ? '99+' : queueStore.activeCount }}</span>
      </button>

      <!-- 项目后端总服务：3007 API + 3006 下载（任一异常即红点告警） -->
      <button
        class="tb-tray-ico svc-ico"
        :class="backendTray"
        :title="backendTitle"
        @click.stop="toggleSvc('backend')"
      >
        <span v-html="icon('backend')" />
        <span v-if="backendBadge" class="tb-dot">!</span>
      </button>

      <!-- 大模型 API（当前激活配置；离线即红点告警） -->
      <button
        class="tb-tray-ico svc-ico"
        :class="aiTray"
        :title="aiTitle"
        @click.stop="toggleSvc('ai')"
      >
        <span v-html="icon('wifi')" />
        <span v-if="aiBadge" class="tb-dot">!</span>
      </button>

      <!-- ComfyUI（当前激活配置；离线即红点告警） -->
      <button
        class="tb-tray-ico svc-ico"
        :class="comfyTray"
        :title="comfyTitle"
        @click.stop="toggleSvc('comfy')"
      >
        <span v-html="icon('comfy')" />
        <span v-if="comfyBadge" class="tb-dot">!</span>
      </button>

      <button class="tb-tray-ico" title="电池"><span v-html="icon('battery')" /></button>

      <!-- 通知：带未读角标 -->
      <button class="tb-tray-ico" :class="{ 'has-unread': notif.unread > 0 }" title="通知" @click.stop="wm.toggleActionCenter()">
        <span v-html="icon('bell')" />
        <span v-if="notif.unread > 0" class="tb-badge">{{ notif.unread > 99 ? '99+' : notif.unread }}</span>
      </button>

      <div class="tb-clock">
        <div class="tb-time">{{ time }}</div>
        <div class="tb-date">{{ date }}</div>
      </div>
    </div>

    <!-- 显示桌面 -->
    <div class="tb-showdesk" @click="showDesktop" title="显示桌面" />

    <!-- WiFi 连通状态浮层（右上角） -->
    <Teleport to="body">
      <div v-if="svcPopOpen" class="conn-backdrop" @click="svcPopOpen = false" />
      <div v-if="svcPopOpen" class="conn-pop">
        <div class="conn-head">
          <span>{{ svcTitle }}</span>
          <button class="conn-refresh" :class="{ spinning: conn.checking }" @click.stop="conn.checkNow()" title="重新检测">⟳</button>
        </div>
        <div class="conn-services">
          <div v-for="s in svcRows" :key="s.key" class="conn-row" :class="s.level">
            <span class="conn-svc-ico" v-html="icon(s.ico)" />
            <div class="conn-main">
              <b>{{ s.name }}</b>
              <span class="conn-state">{{ s.stateText }}</span>
            </div>
            <small class="conn-sub" :title="s.detail">{{ s.detail }}</small>
          </div>
        </div>
        <div class="conn-foot">
          <span v-if="svcKey === 'comfy' && conn.comfyNotConfigured" class="conn-tip">未激活 ComfyUI 配置 · </span>
          <span v-if="svcKey === 'ai' && conn.aiConfigCount > 1" class="conn-tip">可到「设置」切换到其他已连接配置 · </span>
          上次检测 {{ conn.lastCheck || '—' }}
        </div>
      </div>

      <!-- 任务队列面板（Windows 风格托盘浮层） -->
      <div v-if="queueOpen" class="queue-pop">
        <div class="queue-head">
          <div class="queue-head-t">
            <b>任务队列</b>
            <span class="queue-sub">{{ queueStore.activeCount }} 个进行中 · {{ queueStore.finishedCount }} 个已结束</span>
          </div>
          <div class="queue-head-btns">
            <button class="queue-mini" @click.stop="queueStore.clearFinished()" :disabled="!queueStore.finishedCount">清除已完成</button>
            <button class="queue-mini" @click.stop="openApp('tasks'); queueOpen = false">任务中心</button>
          </div>
        </div>
        <div class="queue-list">
          <div v-for="r in queueStore.sortedViews" :key="r.taskId" class="queue-row"
               :class="[{ sel: selTaskId === r.taskId }, 'st-' + r.status]"
               @click="selTaskId = r.taskId"
               @contextmenu.prevent.stop="onRowCtx($event, r)">
            <div class="q-ico"><span v-html="icon('tasks')" /></div>
            <div class="q-main">
              <div class="q-name" :title="r.name">{{ r.name }}</div>
              <div class="q-bar"><div class="q-bar-fill" :class="{ run: r.status === 'running' }" :style="{ width: rowPct(r) + '%' }" /></div>
              <div class="q-meta">
                <span class="q-chip" :class="'c-' + r.status">{{ statusChip(r) }}</span>
                <span v-if="r.total">{{ r.done || 0 }}/{{ r.total }} 张</span>
                <span v-else-if="r.done">已生成 {{ r.done }} 张</span>
                <span v-if="r.status === 'running'">本张 {{ Math.round(r.livePct || 0) }}%</span>
                <span v-else-if="r.status === 'queued'">等待前面任务完成</span>
                <span v-if="r.status === 'error' && r.errorMessage" class="q-err" :title="r.errorMessage">⚠</span>
              </div>
            </div>
            <div class="q-acts">
              <button v-if="r.status === 'running' || r.status === 'queued'" class="q-btn" title="暂停" @click.stop="queueStore.pauseTask(r.taskId)"><span v-html="icon('pause')" /></button>
              <button v-else-if="r.status === 'paused'" class="q-btn go" title="继续" @click.stop="queueStore.resumeTask(r.taskId)"><span v-html="icon('play')" /></button>
              <button class="q-btn" title="打开所在目录" @click.stop="openTaskFolder(r)"><span v-html="icon('explorer')" /></button>
            </div>
          </div>
          <div v-if="!queueStore.sortedViews.length" class="queue-empty">暂无队列任务 —— 在资源管理器里右键文件即可发起生成</div>
        </div>
        <div class="queue-foot">任务按顺序串行执行 · 暂停当前任务时后面的自动顶上 · 刷新页面后未完成任务自动恢复 · 右键任务可删除</div>
      </div>

      <!-- 队列任务右键菜单 -->
      <div v-if="qMenu.show" class="q-ctx-backdrop" @click="qMenu.show = false" @contextmenu.prevent="qMenu.show = false" />
      <div v-if="qMenu.show" class="q-ctx" :style="{ left: qMenu.x + 'px', top: qMenu.y + 'px' }">
        <div class="q-ctx-item" @click.stop="ctxOpenFolder"><span v-html="icon('explorer')" />打开所在目录</div>
        <div v-if="qMenu.task && (qMenu.task.status === 'running' || qMenu.task.status === 'queued')" class="q-ctx-item" @click.stop="ctxToggle">
          <span v-html="icon('pause')" />暂停
        </div>
        <div v-else-if="qMenu.task && qMenu.task.status === 'paused'" class="q-ctx-item" @click.stop="ctxToggle">
          <span v-html="icon('play')" />继续
        </div>
        <div class="q-ctx-sep" />
        <div class="q-ctx-item danger" @click.stop="ctxDelete"><span v-html="icon('trash')" />删除</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useWm } from '@/shell/wm'
import { useConnectionStore } from '@/stores/connection'
import { useNotifications } from '@/stores/notifications'
import { useTaskQueueStore } from '@/stores/taskQueue'
import { getApp } from '@/shell/apps'
import { icon } from '@/shell/icons'

const wm = useWm()
const conn = useConnectionStore()
const notif = useNotifications()
const queueStore = useTaskQueueStore()
const queueOpen = ref(false)
// 面板关闭时收起右键菜单
watch(queueOpen, (v) => { if (!v) qMenu.value.show = false })
function rowPct(r) {
  if (r.status === 'running') return Math.max(4, Math.min(100, Number(r.livePct) || 0))
  if (r.total) return Math.round((Math.min(r.done || 0, r.total) / r.total) * 100)
  return r.status === 'completed' ? 100 : 4
}
function statusChip(r) {
  return { running: '执行中', queued: '排队中', paused: '已暂停', completed: '已完成', error: '出错', cancelled: '已取消' }[r.status] || r.status
}

// 队列行：选中态 + 右键菜单 + 打开所在目录
const selTaskId = ref(null)
const qMenu = ref({ show: false, x: 0, y: 0, task: null })
function onRowCtx(e, r) {
  selTaskId.value = r.taskId
  const x = Math.min(e.clientX, window.innerWidth - 176)
  const y = Math.min(e.clientY, window.innerHeight - 138)
  qMenu.value = { show: true, x, y, task: r }
}
function folderScopeOf(r) {
  if (r.targetFolderId != null && r.targetFolderId !== '') return { scope: 'fl', folderId: String(r.targetFolderId) }
  if (r.targetCategoryId) return { scope: 'fl', folderId: 'cat:' + r.targetCategoryId }
  return { scope: 'fl', folderId: 'root' }
}
function openTaskFolder(r) {
  wm.open('explorer', { initialScope: folderScopeOf(r) }, { w: 1000, h: 660 })
  queueOpen.value = false
  qMenu.value.show = false
}
function ctxOpenFolder() { const r = qMenu.value.task; if (r) openTaskFolder(r) }
function ctxToggle() {
  const r = qMenu.value.task
  if (!r) return
  if (r.status === 'running' || r.status === 'queued') queueStore.pauseTask(r.taskId)
  else if (r.status === 'paused') queueStore.resumeTask(r.taskId)
  qMenu.value.show = false
}
function ctxDelete() {
  const r = qMenu.value.task
  if (!r) return
  queueStore.removeTask(r.taskId) // 直接删除，不询问
  qMenu.value.show = false
}
const time = ref('')
const date = ref('')
const svcPopOpen = ref(false)
const svcKey = ref('backend')
let timer = null
function tick() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  time.value = `${p(d.getHours())}:${p(d.getMinutes())}`
  date.value = `${d.getMonth() + 1}/${d.getDate()}`
}

// 任务栏中区：每个已打开的窗口（含最小化）一个按钮，点击还原/聚焦/最小化
const taskWindows = computed(() => wm.windows)
function winAppName(w) { return getApp(w.appId)?.name || w.appId }
function winAppIcon(w) { return icon(getApp(w.appId)?.icon || 'file') }
function winTitle(w) { return w.title || winAppName(w) }
function onTaskBtn(w) {
  if (w.state === 'min') { wm.focus(w.id); return }       // 最小化 → 还原
  if (w.id === wm.focusedId) { wm.minimize(w.id); return } // 已聚焦 → 最小化
  wm.focus(w.id)                                          // 否则 → 聚焦
}

// WiFi 浮层：按三级状态展示（ok / drop / off），由 conn.levels 决定
const PROVIDER_LABEL = {
  lmstudio: 'LM Studio', openai: 'OpenAI', siliconflow: 'SiliconFlow', openrouter: 'OpenRouter',
  aliyun: '阿里云', google: 'Google', modelscope: 'ModelScope', custom: '自定义', kilo: 'Kilo',
}
const connRows = computed(() => {
  const lv = conn.levels
  const rows = []
  // ComfyUI
  const comfyOff = conn.comfyNotConfigured
  rows.push({
    key: 'comfy', ico: 'comfy',
    name: conn.comfyName ? `ComfyUI · ${conn.comfyName}` : 'ComfyUI',
    level: comfyOff ? 'off' : lv.comfy,
    stateText: comfyOff ? '未激活配置' : (lv.comfy === 'ok' ? '已连通' : (lv.comfy === 'drop' ? '连接已断开' : '未启动')),
    detail: comfyOff
      ? '到「设置」激活一个 ComfyUI 配置'
      : (lv.comfy === 'drop' ? (conn.comfyUrl ? `此前可达 ${conn.comfyUrl}` : '此前可连通，现已失败') : (conn.comfyUrl || '服务未运行')),
    sub: comfyOff ? '未激活' : (lv.comfy === 'ok' ? '已连通' : ''),
  })
  // 后端 3007
  rows.push({
    key: 'api', ico: 'server', name: '后端 API', level: lv.api,
    stateText: lv.api === 'ok' ? '已连通' : (lv.api === 'drop' ? '连接已断开' : '未启动'),
    detail: lv.api === 'ok' ? '本机 3007 端口' : (lv.api === 'drop' ? '后端 API (3007) 此前可连通，现已失败' : '后端 API (3007) 未运行'),
    sub: lv.api === 'ok' ? '已连通' : '',
  })
  // 下载 3006
  rows.push({
    key: 'dl', ico: 'download', name: '下载服务', level: lv.dl,
    stateText: lv.dl === 'ok' ? '已连通' : (lv.dl === 'drop' ? '连接已断开' : '未启动'),
    detail: lv.dl === 'ok' ? '本机 3006 端口' : (lv.dl === 'drop' ? '下载服务 (3006) 此前可连通，现已失败' : '下载服务 (3006) 未运行'),
    sub: lv.dl === 'ok' ? '已连通' : '',
  })
  // 大模型 API（active 配置；不止 LM Studio 一种，按 provider 呈现）
  const aiLabel = conn.aiName ? `大模型 API · ${conn.aiName}` : '大模型 API'
  let aiState, aiDetail
  if (lv.ai === 'ok') { aiState = '已连通'; aiDetail = '已连通' }
  else if (lv.ai === 'drop') { aiState = '连接已断开'; aiDetail = conn.aiError || '此前可连通，现已失败' }
  else {
    const p = PROVIDER_LABEL[conn.aiProvider] || conn.aiProvider || '模型服务'
    aiState = '未连接'
    aiDetail = `${p} 未运行` + (conn.aiConfigCount > 1 ? '（可到「设置」切换到其他已连接配置）' : '（可在「设置」中连接）')
  }
  rows.push({ key: 'ai', ico: 'ai', name: aiLabel, level: lv.ai, stateText: aiState, detail: aiDetail, sub: lv.ai === 'ok' ? '已连通' : '' })
  return rows
})
const okRows = computed(() => connRows.value.filter((r) => r.level === 'ok'))
const dropRows = computed(() => connRows.value.filter((r) => r.level === 'drop'))
const offRows = computed(() => connRows.value.filter((r) => r.level === 'off'))

// 把 4 类服务拆到托盘上三枚独立图标：backend(3007+3006) / ai(大模型) / comfy(ComfyUI)
const svcRows = computed(() => {
  const map = { backend: ['api', 'dl'], ai: ['ai'], comfy: ['comfy'] }
  const keys = map[svcKey.value] || []
  return connRows.value.filter((r) => keys.includes(r.key))
})
// 托盘三态着色：红=曾连后断(告警) / 绿=已连通 / 灰=未启动(中性，不打扰)
function trayLevel(...ls) {
  if (ls.includes('drop')) return 'svc-bad'
  if (ls.includes('ok')) return 'svc-ok'
  return 'svc-idle'
}
const backendTray = computed(() => trayLevel(conn.levels.api, conn.levels.dl))
const aiTray = computed(() => trayLevel(conn.levels.ai))
const comfyTray = computed(() => trayLevel(conn.levels.comfy))
// 红点告警：仅在该类"本应工作却没通"时出现（避免 LM Studio 没开也一直闪红）
const backendBadge = computed(() => !conn.apiConnected || !conn.downloadConnected)
const aiBadge = computed(() => !conn.aiConnected && conn.aiConfigCount > 0)
const comfyBadge = computed(() => !conn.comfyConnected && !conn.comfyNotConfigured)
const svcTitle = computed(() => ({
  backend: '项目后端服务（API 3007 · 下载 3006）',
  ai: '大模型 API（当前激活配置）',
  comfy: 'ComfyUI 服务',
}[svcKey.value] || '连接'))
const backendTitle = computed(() => backendBadge.value ? '项目后端：部分服务未连接' : '项目后端：已连接')
const aiTitle = computed(() =>
  aiBadge.value ? '大模型 API：未连接' : (conn.aiConnected ? `大模型 API：${conn.aiName || '已连接'}` : '大模型 API：未配置'))
const comfyTitle = computed(() =>
  comfyBadge.value ? 'ComfyUI：未连接' : (conn.comfyConnected ? `ComfyUI：${conn.comfyName || '已连接'}` : 'ComfyUI：未激活'))
function toggleSvc(key) {
  if (svcKey.value === key && svcPopOpen.value) { svcPopOpen.value = false; return }
  svcKey.value = key
  svcPopOpen.value = true
  // 打开面板立刻补检（结果过期才真正探测）：避免"服务刚启动，面板还挂着旧状态"
  conn.checkIfStale(8000)
}

// 托盘 WiFi 图标三态：有"曾连后断"→橙；有任意连通→绿；全未连（冷启动）→灰（不打扰）
const connTrayClass = computed(() => {
  const lv = conn.levels
  if (lv.comfy === 'drop' || lv.api === 'drop' || lv.dl === 'drop' || lv.ai === 'drop') return 'conn-bad'
  return conn.connected ? 'conn-ok' : 'conn-idle'
})
function openApp(a) { wm.open(a) }
function showDesktop() {
  const anyVisible = wm.windows.some((w) => w.state !== 'min')
  if (anyVisible) wm.windows.forEach((w) => { if (w.state !== 'min') wm.minimize(w.id) })
}
function toggleConn() { svcPopOpen.value = !svcPopOpen.value }

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
  conn.start()
  // 刷新/重开后恢复未跑完的任务（数据库 execution_status=executing/paused）
  queueStore.hydrate()
  // 标签页切回前台时补检连接状态：后台标签被浏览器节流时探测会停滞，
  // 期间用户可能在 DOS 里启动/停止了服务，回前台要立刻看到最新状态
  const onVis = () => { if (document.visibilityState === 'visible') conn.checkIfStale(15000) }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', onVis)
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onVis)
  })
})
onUnmounted(() => { clearInterval(timer); conn.stop() })
</script>

<style scoped>
.taskbar {
  position: fixed; left: 0; bottom: 0; width: 100%; height: 48px;
  display: flex; align-items: center; padding: 0 8px; gap: 4px; z-index: 9000;
  background: var(--tb-bg, rgba(243,243,243,.82));
  backdrop-filter: blur(40px) saturate(1.6); -webkit-backdrop-filter: blur(40px) saturate(1.6);
  border-top: 1px solid rgba(255,255,255,.4);
}
[data-theme='dark'] .taskbar { --tb-bg: rgba(28,28,30,.82); border-top-color: rgba(255,255,255,.08); }
.tb-left, .tb-center, .tb-tray { display: flex; align-items: center; gap: 4px; }
.tb-center { flex: 1; justify-content: flex-start; gap: 4px; overflow: hidden; padding-left: 6px; }
.tb-icon, .tb-pin, .tb-tray-ico {
  height: 40px; min-width: 40px; padding: 0 8px; border: none; background: transparent;
  border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--text-primary, #1f2937); position: relative;
}
.tb-icon:hover, .tb-pin:hover, .tb-tray-ico:hover { background: rgba(128,128,128,.18); }
.tb-icon :deep(svg), .tb-pin :deep(svg), .tb-tray-ico :deep(svg) { width: 22px; height: 22px; }
.tb-start-logo :deep(svg) { width: 22px; height: 22px; color: #0078d4; }
.tb-start.active { background: rgba(0,120,212,.18); }
.tb-task {
  height: 40px; min-width: 40px; max-width: 210px; padding: 0 10px;
  border: none; background: transparent; border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; gap: 7px; color: var(--text-primary, #1f2937);
  position: relative;
}
.tb-task:hover { background: rgba(128,128,128,.18); }
.tb-task.active { background: rgba(0,120,212,.16); }
.tb-task.active::before {
  content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
  border-radius: 2px; background: #0078d4;
}
.tb-task.minimized { opacity: .8; }
.tb-task-ico { width: 20px; height: 20px; flex-shrink: 0; display: flex; }
.tb-task-ico :deep(svg) { width: 20px; height: 20px; }
.tb-task-label {
  font-size: 12px; line-height: 1.1; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 150px;
}
.tb-tray { padding-right: 2px; }
.tb-tray-ico { width: 38px; min-width: 34px; padding: 0 4px; }
.tb-tray-ico.conn-ok :deep(svg) { color: #2ecc71; }
.tb-tray-ico.conn-bad :deep(svg) { color: #e67e22; }
.tb-tray-ico.conn-idle :deep(svg) { color: #9aa0a6; }
.tb-tray-ico.has-unread::after {
  content: ''; position: absolute; top: 7px; right: 7px; width: 7px; height: 7px;
  border-radius: 50%; background: #e81123; border: 1.5px solid var(--tb-bg, #f3f3f3);
}
.tb-badge {
  position: absolute; top: 1px; right: 1px; min-width: 15px; height: 15px; padding: 0 3px;
  border-radius: 8px; background: #e81123; color: #fff; font-size: 10px; line-height: 15px;
  text-align: center; font-weight: 600;
}
/* 服务状态图标：异常时右上角红点带"!"标记（类比通知未读红点 / 下载数字角标） */
.tb-tray-ico.svc-ico { position: relative; }
.tb-dot {
  position: absolute; top: 2px; right: 2px; min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 50%; background: #e81123; color: #fff; font-size: 9px; font-weight: 700;
  line-height: 14px; text-align: center; box-shadow: 0 0 0 1.5px var(--tb-bg, #f3f3f3);
}
.tb-tray-ico.has-err :deep(svg) { color: #e81123; }
/* 托盘服务图标三态：绿=已连通 / 灰=未启动(中性) / 红=曾连后断(告警) */
.tb-tray-ico.svc-ok :deep(svg) { color: #2ecc71; }
.tb-tray-ico.svc-idle :deep(svg) { color: #9aa0a6; }
.tb-tray-ico.svc-bad :deep(svg) { color: #e81123; }
.tb-clock { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; padding: 0 8px 0 4px; font-size: 11.5px; line-height: 1.25; color: var(--text-primary, #1f2937); cursor: default; }
.tb-time { font-weight: 600; }
.tb-date { color: var(--text-muted, #888); }
.tb-showdesk { width: 10px; height: 48px; margin-left: 4px; border-left: 1px solid rgba(128,128,128,.3); cursor: pointer; }
.tb-showdesk:hover { background: rgba(128,128,128,.18); }
.spinning { animation: tbspin 1.1s linear infinite; }
@keyframes tbspin { to { transform: rotate(360deg); } }

/* WiFi 浮层 */
.conn-backdrop { position: fixed; inset: 0; z-index: 9800; }
.conn-pop {
  position: fixed; right: 12px; bottom: 56px; width: 320px; max-width: 92vw; z-index: 9801;
  background: rgba(245,245,247,.96); backdrop-filter: blur(40px);
  border: 1px solid var(--border-color, #dadada); border-radius: 12px;
  box-shadow: 0 30px 70px rgba(0,0,0,.4); padding: 14px;
}
[data-theme='dark'] .conn-pop { background: rgba(34,34,38,.96); border-color: #3a3a3e; }
.conn-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--text-secondary, #555); margin-bottom: 10px; }
[data-theme='dark'] .conn-head { color: #cfcfcf; }
.conn-refresh { border: none; background: transparent; color: #0078d4; font-size: 16px; cursor: pointer; width: 26px; height: 26px; border-radius: 6px; }
.conn-refresh:hover { background: rgba(0,120,212,.16); }
.conn-row { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; margin-bottom: 8px; background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #eee); }
[data-theme='dark'] .conn-row { background: #2c2c30; border-color: #3a3a3e; }
.conn-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.conn-row.ok .conn-dot { background: #2ecc71; box-shadow: 0 0 0 3px rgba(46,204,113,.2); }
.conn-row.bad .conn-dot { background: #e67e22; box-shadow: 0 0 0 3px rgba(230,126,34,.2); }
.conn-services { display: flex; flex-direction: column; gap: 8px; }
.conn-svc-ico {
  width: 28px; height: 28px; flex-shrink: 0; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: #2ecc71; background: rgba(46,204,113,.12);
}
.conn-svc-ico :deep(svg) { width: 18px; height: 18px; }
/* 三级状态着色：绿=已连通 / 灰=未启动(中性) / 琥珀=曾连后断(告警) */
.conn-row.ok .conn-svc-ico { color: #2ecc71; background: rgba(46,204,113,.12); }
.conn-row.off .conn-svc-ico { color: #9aa0a6; background: rgba(154,160,166,.14); }
.conn-row.drop .conn-svc-ico { color: #e67e22; background: rgba(230,126,34,.14); }
.conn-row.off { opacity: .92; }
.conn-row.off .conn-state { color: #9aa0a6; }
.conn-row.drop { border-color: rgba(230,126,34,.4); background: rgba(230,126,34,.06); }
.conn-row.drop .conn-state { color: #e67e22; }
.conn-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 8px; text-align: center; }
.conn-empty-ico :deep(svg) { width: 34px; height: 34px; color: #e67e22; }
.conn-empty p { font-size: 13px; font-weight: 600; margin: 0; color: var(--text-primary, #1f2937); }
.conn-empty small { font-size: 11px; color: var(--text-muted, #999); }
.conn-tip { color: #e67e22; }
.conn-main { display: flex; flex-direction: column; flex: 1; }
.conn-main b { font-size: 13px; color: var(--text-primary, #1f2937); }
[data-theme='dark'] .conn-main b { color: #eee; }
.conn-state { font-size: 11.5px; color: var(--text-muted, #888); }
.conn-sub { font-size: 10.5px; color: var(--text-muted, #999); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conn-err { font-size: 12px; color: #e81123; background: rgba(232,17,35,.08); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
.conn-foot { font-size: 11px; color: var(--text-muted, #999); text-align: right; }

/* 任务队列托盘面板 */
.queue-pop {
  position: fixed; right: 12px; bottom: 56px; width: 420px; max-width: 94vw; z-index: 9801;
  background: rgba(245,245,247,.97); backdrop-filter: blur(40px);
  border: 1px solid var(--border-color, #dadada); border-radius: 12px;
  box-shadow: 0 30px 70px rgba(0,0,0,.4); padding: 12px;
}
[data-theme='dark'] .queue-pop { background: rgba(34,34,38,.97); border-color: #3a3a3e; }
.queue-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.queue-head-t { display: flex; align-items: baseline; gap: 8px; }
.queue-head-t b { font-size: 13.5px; color: var(--text-primary, #1f2937); }
[data-theme='dark'] .queue-head-t b { color: #eee; }
.queue-sub { font-size: 11px; color: var(--text-muted, #888); }
.queue-head-btns { display: flex; gap: 6px; }
.queue-mini {
  border: 1px solid var(--border-color, #d5d5d5); background: var(--bg-surface, #fff);
  color: var(--text-primary, #333); font-size: 11px; border-radius: 6px; padding: 4px 8px; cursor: pointer;
}
.queue-mini:hover:not(:disabled) { background: rgba(0,120,212,.12); border-color: #0078d4; color: #0078d4; }
.queue-mini:disabled { opacity: .45; cursor: default; }
[data-theme='dark'] .queue-mini { background: #2c2c30; border-color: #3a3a3e; color: #ddd; }
.queue-list { max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.queue-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px;
  background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e5e5e5);
}
[data-theme='dark'] .queue-row { background: #2c2c30; border-color: #3a3a3e; }
.queue-row.st-completed { opacity: .55; filter: grayscale(.6); }
.queue-row.st-error { border-color: rgba(232,17,35,.4); }
.queue-row { cursor: default; }
.queue-row.sel { border-color: #0078d4; box-shadow: 0 0 0 1px #0078d4 inset; background: rgba(0,120,212,.06); }
[data-theme='dark'] .queue-row.sel { background: rgba(0,120,212,.18); }
/* 队列右键菜单 */
.q-ctx-backdrop { position: fixed; inset: 0; z-index: 9998; }
.q-ctx {
  position: fixed; z-index: 9999; min-width: 168px;
  background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,.18); padding: 5px;
}
[data-theme='dark'] .q-ctx { background: #2c2c30; border-color: #3a3a3e; }
.q-ctx-item {
  display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 6px;
  font-size: 12.5px; color: var(--text-primary, #1f2937); cursor: pointer; user-select: none;
}
[data-theme='dark'] .q-ctx-item { color: #ddd; }
.q-ctx-item :deep(svg) { width: 14px; height: 14px; flex-shrink: 0; opacity: .75; }
.q-ctx-item:hover { background: rgba(0,120,212,.12); color: #0078d4; }
.q-ctx-item.danger:hover { background: rgba(232,17,35,.1); color: #e81123; }
.q-ctx-sep { height: 1px; background: var(--border-color, #e5e5e5); margin: 4px 6px; }
[data-theme='dark'] .q-ctx-sep { background: #3a3a3e; }
.q-ico :deep(svg) { width: 26px; height: 26px; border-radius: 6px; }
.q-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.q-name { font-size: 12.5px; font-weight: 600; color: var(--text-primary, #1f2937); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-theme='dark'] .q-name { color: #eee; }
.q-bar { height: 4px; border-radius: 2px; background: rgba(128,128,128,.22); overflow: hidden; }
.q-bar-fill { height: 100%; border-radius: 2px; background: #8bc34a; transition: width .5s ease; }
.q-bar-fill.run { background: linear-gradient(90deg, #2f6fd6, #6ca8ff); }
.q-meta { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: var(--text-muted, #888); }
.q-err { color: #e81123; }
.q-chip { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 8px; }
.q-chip.c-running { background: rgba(0,120,212,.16); color: #0078d4; }
.q-chip.c-queued { background: rgba(128,128,128,.18); color: var(--text-secondary, #666); }
.q-chip.c-paused { background: rgba(230,126,34,.16); color: #d3831f; }
.q-chip.c-completed { background: rgba(46,204,113,.16); color: #1e8e4e; }
.q-chip.c-error { background: rgba(232,17,35,.14); color: #e81123; }
.q-chip.c-cancelled { background: rgba(128,128,128,.18); color: var(--text-secondary, #666); }
.q-acts { display: flex; gap: 4px; }
.q-btn {
  width: 26px; height: 26px; border: none; border-radius: 6px; cursor: pointer;
  background: rgba(128,128,128,.14); color: var(--text-primary, #333);
  display: flex; align-items: center; justify-content: center;
}
.q-btn :deep(svg) { width: 12px; height: 12px; }
.q-btn:hover { background: rgba(0,120,212,.2); color: #0078d4; }
.q-btn.go:hover { background: rgba(46,204,113,.25); color: #1e8e4e; }
.q-btn.bad:hover { background: rgba(232,17,35,.18); color: #e81123; }
.queue-empty { text-align: center; font-size: 12px; color: var(--text-muted, #999); padding: 26px 0; }
.queue-foot { margin-top: 10px; font-size: 10.5px; color: var(--text-muted, #999); text-align: center; }
</style>
