<template>
  <div class="ex" @click.self="onPaneClick" @contextmenu.prevent.stop="onPaneContext($event)">
    <!-- 框选矩形（跟随鼠标） -->
    <div v-if="marquee" class="marquee" :style="marqueeStyle" />
    <!-- 左侧导航树（可折叠：工具栏最左边的按钮切换） -->
    <div class="ex-nav" v-show="navOpen">
      <div
        class="nav-node nav-root"
        :class="{ active: scope.scope === 'computer' }"
        @click="navigate({ scope: 'computer' })"
      >
        <span class="nav-ico" v-html="icon('pc')" />
        <span class="nav-label">此电脑</span>
      </div>

      <!-- 盘符列表：总库(C:) 与其它盘符完全同级、同样式；点击盘符名直接进入 -->
      <div
        v-for="d in navDrives"
        :key="d.id"
        class="nav-node"
        :class="{ active: isDriveActive(d) }"
        @click="navigate({ scope: 'fl', folderId: (d.catId === 'C' || d.catId === mainDriveCatId) ? 'root' : 'cat:' + d.catId })"
      >
        <span class="nav-ico" v-html="icon('drive')" />
        <span class="nav-label">{{ d.name }} ({{ d.letter }}:)</span>
      </div>
    </div>

    <!-- 右侧主区 -->
    <div class="ex-main">
      <!-- 工具栏 -->
      <div class="ex-toolbar">
        <button class="tb-ico-btn" :class="{ on: navOpen }" title="展开/收起导航窗格" @click="navOpen = !navOpen"><span v-html="icon('sidebar')" /></button>
        <button class="tb-ico-btn" title="后退" :disabled="!canBack" @click="back"><span v-html="icon('back')" /></button>
        <button class="tb-ico-btn" title="前进" :disabled="!canFwd" @click="forward"><span v-html="icon('forward')" /></button>
        <button class="tb-ico-btn" title="向上" :disabled="!isFl" @click="navigateUp"><span v-html="icon('up')" /></button>
        <button class="tb-ico-btn" title="刷新" @click="refresh"><span v-html="icon('refresh')" /></button>
        <span class="tb-sep" />
        <input ref="fileInput" type="file" multiple hidden @change="onImport" />
        <input ref="imgInput" type="file" accept="image/*,video/*,audio/*" multiple hidden @change="onImport" />
        <input ref="txtInput" type="file" accept=".txt,.md,.json,.csv,.yml,.yaml,.xml,.srt,.ass" multiple hidden @change="onImport" />
        <button class="tb-ico-btn" title="新建文件夹" :disabled="!canWrite" @click="newFolder"><span v-html="icon('folderPlus')" /></button>
        <button class="tb-ico-btn" title="新建文本文档" :disabled="!canWrite" @click="newTextFile"><span v-html="icon('filePlus')" /></button>
        <button class="tb-ico-btn" title="导入图片 / 视频 / 音频" :disabled="!canWrite" @click="triggerImport('image')"><span v-html="icon('imgImport')" /></button>
        <button class="tb-ico-btn" title="导入文本 / JSON" :disabled="!canWrite" @click="triggerImport('text')"><span v-html="icon('txtImport')" /></button>
        <span class="tb-sep" />
        <button class="tb-ico-btn" title="复制" :disabled="!hasSel" @click="copy('copy')"><span v-html="icon('copy')" /></button>
        <button class="tb-ico-btn" title="剪切" :disabled="!hasSel" @click="copy('cut')"><span v-html="icon('cut')" /></button>
        <button class="tb-ico-btn" title="粘贴" :disabled="!canWrite || !vfs.clipboard" @click="paste"><span v-html="icon('paste')" /></button>
        <button class="tb-ico-btn danger" title="删除" :disabled="!hasSel" @click="del"><span v-html="icon('trash')" /></button>
        <span class="tb-spacer" />
        <button class="tb-ico-btn" :class="{ on: view === 'grid' }" title="图标" @click="view = 'grid'"><span v-html="icon('grid')" /></button>
        <button class="tb-ico-btn" :class="{ on: view === 'list' }" title="列表" @click="view = 'list'"><span v-html="icon('list')" /></button>
      </div>

      <!-- 地址栏 / 面包屑 -->
      <div class="ex-addr">
        <span class="addr-label">地址</span>
        <div class="crumbs">
          <template v-for="(c, i) in breadcrumb" :key="i">
            <span class="crumb" @click="navigate(c.go)">{{ c.name }}</span>
            <span v-if="i < breadcrumb.length - 1" class="crumb-sep" v-html="icon('chevron')" />
          </template>
        </div>
      </div>

      <!-- 内容区 -->
      <div
        class="ex-body"
        :class="['view-' + view, { 'drop-hint': bodyDropHint }]"
        @click.self="clearSelection"
        @contextmenu.prevent.stop="onPaneContext($event)"
        @mousedown="onBodyMouseDown"
        @dragover="onBodyDragOver"
        @dragleave="onBodyDragLeave"
        @drop="onBodyDrop"
        tabindex="-1"
        ref="bodyEl"
      >
        <div v-if="loading" class="ex-loading">正在加载…</div>
        <div v-else-if="items.length === 0" class="ex-empty">
          <span class="ex-empty-ico" v-html="icon(scope.scope === 'lib' ? 'folder' : 'empty')" />
          <p>此文件夹为空</p>
          <p v-if="canWrite" class="ex-empty-sub">右键空白处可新建文件夹 / 文本文档，或导入文件</p>
        </div>

        <!-- 图标视图 -->
        <template v-else-if="view === 'grid'">
          <!-- 目录内"生成中"虚拟瓦片 = 任务记录（置顶显示，不被生成的图片挤到下面） -->
          <div v-for="p in visibleQueueTiles" :key="p.taskId" class="item pending-item" :class="'st-' + p.status"
               @contextmenu.prevent.stop="onTileContext($event, p)">
            <div class="item-ico">
              <div class="pending-tile">
                <div class="pending-fill" :style="{ height: tilePct(p) + '%' }" />
                <div class="pending-sweep" />
                <span v-if="p.status === 'running'" class="pending-spin" v-html="icon('refresh')" />
                <span v-else class="pending-state" v-html="icon(p.status === 'paused' ? 'pause' : 'history')" />
              </div>
            </div>
            <button class="pending-ctl" :class="{ go: p.status === 'paused' }"
                    :title="p.status === 'paused' ? '继续生成' : '暂停生成'"
                    @click.stop="toggleTile(p)">
              <span v-html="icon(p.status === 'paused' ? 'play' : 'pause')" />
            </button>
            <div class="item-name">{{ p.fileName || p.name }}<br /><small class="pending-tag">{{ pendingTag(p) }}</small></div>
          </div>

          <div
            v-for="(it, idx) in items"
            :key="it.id"
            class="item"
            :class="{ sel: selectedIds.includes(it.id), drop: dragOverId === it.id, cut: cutIdSet.has(it.id) }"
            :data-item-id="it.id"
            :draggable="it.kind !== 'lib' && it.kind !== 'fl-root' && it.kind !== 'cat'"
            :data-thumb-id="(it.kind === 'file' && it.fileType === 'image' && !it.thumb) ? it.id : null"
            @click="onItemClick($event, it, idx)"
            @dblclick="openItem(it)"
            @contextmenu.prevent.stop="onItemContext($event, it)"
            @dragstart="onDragStart($event, it)"
            @dragover="onItemDragOver($event, it)"
            @dragleave="onItemDragLeave($event, it)"
            @drop="onItemDrop($event, it)"
            @dragend="onDragEnd"
          >
            <div class="item-ico">
              <img v-if="it.thumb" :src="it.thumb" class="item-thumb" draggable="false" />
              <span v-else class="item-svg" v-html="itemIcon(it)" />
              <span
                v-if="it.kind === 'folder' && it.raw && it.raw.is_callable"
                class="callable-badge"
                title="可调用文件夹：其中的文件会出现在各类选择器中"
              >⚡</span>
            </div>
            <input
              v-if="renamingId === it.id"
              class="item-rename"
              v-model="renameText"
              @click.stop
              @keydown.enter.prevent="commitRename(it)"
              @keydown.esc.prevent="cancelRename"
              @blur="commitRename(it)"
              v-focus
            />
            <div v-else class="item-name" :title="displayName(it)">{{ displayName(it) }}</div>
          </div>
        </template>

        <!-- 列表视图 -->
        <table v-else class="ex-table">
          <thead>
            <tr><th>名称</th><th>类型</th><th v-if="isFl">大小</th><th v-if="isFl">修改日期</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="(it, idx) in items"
              :key="it.id"
              :class="{ sel: selectedIds.includes(it.id), drop: dragOverId === it.id, cut: cutIdSet.has(it.id) }"
              :data-item-id="it.id"
              :draggable="it.kind !== 'lib' && it.kind !== 'fl-root'"
              @click="onItemClick($event, it, idx)"
              @dblclick="openItem(it)"
              @contextmenu.prevent.stop="onItemContext($event, it)"
              @dragstart="onDragStart($event, it)"
              @dragover="onItemDragOver($event, it)"
              @dragleave="onItemDragLeave($event, it)"
              @drop="onItemDrop($event, it)"
              @dragend="onDragEnd"
            >
              <td class="td-name">
                <span class="td-ico" v-html="itemIcon(it)" />
                <input
                  v-if="renamingId === it.id"
                  class="row-rename"
                  v-model="renameText"
                  @click.stop
                  @keydown.enter.prevent="commitRename(it)"
                  @keydown.esc.prevent="cancelRename"
                  @blur="commitRename(it)"
                  v-focus
                />
                <template v-else>{{ displayName(it) }}</template>
              </td>
              <td>{{ typeLabel(it) }}</td>
              <td v-if="isFl">{{ fmtSize(it.size) }}</td>
              <td v-if="isFl">{{ fmtDate(it.modified) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 状态栏 -->
      <div class="ex-status">
        <span>{{ items.length }} 个项目</span>
        <span v-if="selectedIds.length">· 已选择 {{ selectedIds.length }}</span>
        <span class="st-spacer" />
        <span v-if="scope.scope === 'lib'" class="st-readonly">只读（编辑请在对应应用中操作）</span>
      </div>
    </div>

    <!-- 确认 / 输入对话框 -->
    <div v-if="dlg.show" class="dlg-mask" @click.self="closeDlg" @contextmenu.prevent.stop>
      <div class="dlg">
        <div class="dlg-title">{{ dlg.title }}</div>
        <div v-if="dlg.text" class="dlg-text">{{ dlg.text }}</div>
        <input v-if="dlg.input" v-model="dlg.value" class="dlg-input" @keydown.enter.prevent="dlgOk" v-focus />
        <div class="dlg-btns">
          <button class="dlg-btn" @click="closeDlg">取消</button>
          <button class="dlg-btn primary" @click="dlgOk">确定</button>
        </div>
      </div>
    </div>

    <!-- 粘贴 / 拖放冲突：替换 或 保留两者（Windows 风格） -->
    <div v-if="cdlg.show" class="dlg-mask" @click.self="cdlgCancel" @contextmenu.prevent.stop>
      <div class="dlg cfl-dlg">
        <div class="dlg-title">{{ cdlg.op === 'cut' ? '移动项目' : '复制项目' }} — 目标位置已存在同名项</div>
        <div class="dlg-text">有 {{ cdlg.items.length }} 个项目与目标位置中的现有项目重名，请选择处理方式：</div>
        <div class="cfl-list">
          <div v-for="(c, i) in cdlg.items" :key="i" class="cfl-item">
            <div class="cfl-head">
              <span class="cfl-name">{{ c.name }}</span>
              <span class="cfl-kind">{{ c.kind === 'folder' ? '文件夹' : (fileTypeLabel(c.file_type) || '文件') }}</span>
            </div>
            <div class="cfl-rows">
              <div class="cfl-row">
                <span class="cfl-tag src">{{ cdlg.op === 'cut' ? '移动' : '复制' }}</span>
                <span class="cfl-f">{{ c.name }}</span>
                <span class="cfl-s">{{ fmtSize(c.file_size) }}</span>
                <span class="cfl-d">{{ fmtDate(c.updated_at) }}</span>
              </div>
              <div class="cfl-row">
                <span class="cfl-tag dst">目标</span>
                <span class="cfl-f">{{ c.target.name }}</span>
                <span class="cfl-s">{{ fmtSize(c.target.file_size) }}</span>
                <span class="cfl-d">{{ fmtDate(c.target.updated_at) }}</span>
              </div>
            </div>
            <div v-if="!cdlg.applyAll || i === 0" class="cfl-choose">
              <label class="cfl-radio">
                <input type="radio" :name="'cfc' + i" value="overwrite" v-model="c.choice" />
                <span>替换目标中的项目<em>（旧的移入回收站）</em></span>
              </label>
              <label class="cfl-radio">
                <input type="radio" :name="'cfc' + i" value="rename" v-model="c.choice" />
                <span>保留两者<em>（自动编号，如「{{ c.name }} (2)」）</em></span>
              </label>
              <label class="cfl-radio">
                <input type="radio" :name="'cfc' + i" value="skip" v-model="c.choice" />
                <span>跳过此项<em>（不粘贴它）</em></span>
              </label>
            </div>
            <div v-else class="cfl-follow">与第一项相同：{{ choiceLabel(cdlg.items[0].choice) }}</div>
          </div>
        </div>
        <label v-if="cdlg.items.length > 1" class="cfl-all">
          <input type="checkbox" v-model="cdlg.applyAll" />
          <span>对全部 {{ cdlg.items.length }} 个冲突执行相同操作</span>
        </label>
        <div class="dlg-btns">
          <button class="dlg-btn" @click="cdlgCancel">取消</button>
          <button class="dlg-btn primary" @click="cdlgOk">继续</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="ctx.show"
      class="ctx-menu"
      :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <template v-for="(m, i) in ctx.items" :key="i">
        <div v-if="m.sep" class="ctx-sep" />
        <div
          v-else
          class="ctx-item"
          :class="{ disabled: m.disabled }"
          @click="runCtx(m)"
          @mouseenter="m.sub && openSub(m)"
        >
          <span class="ctx-ico" v-html="m.icon ? icon(m.icon) : ''" />
          <span class="ctx-label">{{ m.label }}</span>
          <span v-if="m.short" class="ctx-short">{{ m.short }}</span>
          <span v-if="m.sub" class="ctx-arrow" v-html="icon('chevron')" />
          <!-- 子菜单 -->
          <div v-if="m.sub && subMenu.show && subMenu.owner === m" class="ctx-sub" :style="subMenu.style">
            <div v-for="(s, j) in m.sub" :key="j" class="ctx-item" @click="runCtx(s)">
              <span class="ctx-label">{{ s.label }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { icon } from '@/shell/icons'
import { useVfs, LIBRARIES } from '@/shell/vfs'
import { useWm } from '@/shell/wm'
import { useToast } from '@/shell/toast'
import { useConnectionStore } from '@/stores/connection'
import { useGenerationStore } from '@/stores/generation'
import { useTaskQueueStore } from '@/stores/taskQueue'
import { apiClient } from '@/services/api'
import { isStoryboardText } from '@/utils/storyboardDetect'

const props = defineProps({
  initialScope: { type: Object, default: () => ({ scope: 'computer' }) },
})

const emit = defineEmits(['set-title'])

const vfs = useVfs()
const wm = useWm()
const toast = useToast()
const conn = useConnectionStore()
const generationStore = useGenerationStore()

// 功能库（右键一键生图用）
const functions = ref([])
// 目录内"生成中"虚拟瓦片 = 任务队列记录（taskQueue store）：
// 每条记录就是一个任务文件——可在瓦片上暂停/继续、右键看属性、刷新页面后自动恢复
const queueStore = useTaskQueueStore()

const scope = ref({ ...(props.initialScope || { scope: 'computer' }) })
const items = ref([])
const breadcrumb = ref([])
// 动态标题：把面包屑路径同步到窗口标题栏（如"此电脑 / 总库 (C:) / 人物穿着01"），
// 比固定英文"explorer"更直观，也方便任务栏最小化按钮识别窗口内容
watch(breadcrumb, (b) => {
  if (!b || !b.length) return
  emit('set-title', b.map((c) => c.name).join(' / '))
}, { immediate: true })
const selectedIds = ref([])
const lastIdx = ref(-1)
const loading = ref(false)
const view = ref('grid')
const renamingId = ref(null)
const renameText = ref('')
const fileInput = ref(null)
const imgInput = ref(null)
const txtInput = ref(null)
const bodyEl = ref(null)
// 左侧导航窗格折叠开关（工具栏最左按钮切换，默认收起）
const navOpen = ref(false)

const history = ref([])
const histPos = ref(-1)
const canBack = computed(() => histPos.value > 0)
const canFwd = computed(() => histPos.value < history.value.length - 1)

const isFl = computed(() => scope.value.scope === 'fl')
const isLib = computed(() => scope.value.scope === 'lib')
const canWrite = computed(() => isFl.value)
const hasSel = computed(() => selectedIds.value.length > 0)
// 被"剪切"的条目：像 Windows 一样半透明（虚化）表示"待移动"。
// 剪贴板是跨窗口共享的 Pinia state，所以另一个窗口里同样会虚化；
// 粘贴成功 / 又剪切或复制了别的东西 → 剪贴板变化 → 虚化自动消失。
const cutIdSet = computed(() => {
  const c = vfs.clipboard
  if (!c || c.op !== 'cut' || !Array.isArray(c.items)) return new Set()
  return new Set(c.items.map((it) => (it.kind === 'folder' ? 'fld:' : 'fil:') + it.id))
})

// ---------- 导航树（盘符彼此平级：总库 C: 与其它盘符同样式、点击直接进入） ----------
const navDrives = ref([])
const mainDriveCatId = ref(null) // 总库对应的分类 id（点击 C: 时进入 'root'）
async function refreshDrives() {
  try {
    const list = await vfs.listComputer()
    const drives = list.filter((x) => x.kind === 'cat')
    const mainId = await vfs.mainCategoryId()
    mainDriveCatId.value = mainId ? String(mainId) : null
    // 把总库(C:)插到最前面，与其它盘符完全同级
    navDrives.value = [{ id: 'drive-C', name: '总库', kind: 'cat', catId: 'C', letter: 'C' }, ...drives]
  } catch { /* ignore */ }
  return navDrives.value
}
function isDriveActive(d) {
  if (!isFl.value) return false
  if (d.catId === 'C') return String(scope.value.folderId ?? 'root') === 'root'
  return String(scope.value.folderId) === 'cat:' + d.catId
}
async function refreshNav() { await refreshDrives() }
async function loadFunctions() {
  try { functions.value = await apiClient.getFunctions() } catch { functions.value = [] }
}
onMounted(() => {
  refreshNav(); loadFunctions()
  // 预热分类缓存：第一次在该目录新建文件时不必等 listCategories/mainCategoryId 的冷启动往返
  vfs.listCategories().then(() => vfs.mainCategoryId()).catch(() => {})
})
const dragIds = ref([])

// ---------- 加载内容 ----------
// 置顶排序：Json分镜/文本/提示词类文件永远排最前（生成大量图片时它们不会被挤到最下面），
// 文件夹第二，其余文件（图片/视频等）在后；各组内部保持原有顺序（稳定排序）
function sortPinnedFirst(list) {
  const rank = (it) => {
    if (it.kind === 'file' && ['storyboard', 'text', 'prompt', 'rule', 'novel'].includes(it.fileType)) return 0
    if (it.kind !== 'file') return 1 // 文件夹/盘符/根
    return 2
  }
  return list.slice().sort((a, b) => rank(a) - rank(b))
}
let loadSeq = 0
async function load(pushHistory = true) {
  const seq = ++loadSeq
  loading.value = true
  selectedIds.value = []
  lastIdx.value = -1
  resetThumbs()
  try {
    let list
    if (scope.value.scope === 'computer') {
      list = await vfs.listComputer()
      breadcrumb.value = [{ name: '此电脑', go: { scope: 'computer' } }]
    } else if (isFl.value) {
      list = await vfs.listFl(scope.value.folderId)
      const fid = String(scope.value.folderId == null ? 'root' : scope.value.folderId)
      // 面包屑：盘符（分类）与总库 C: 是平级磁盘 —— 路径永远是 此电脑 > 盘符 > 文件夹…，
      // 不再把其它盘符挂在"总库 (C:)"下面（那是旧版的错误层级，用户看到的路径是错的）。
      const crumbs = [{ name: '此电脑', go: { scope: 'computer' } }]
      const drives = navDrives.value.length ? navDrives.value : await refreshDrives()
      const driveOf = (catId) => drives.find((d) => String(d.catId) === String(catId))
      const mainCatId = String(await vfs.mainCategoryId())
      const driveCrumb = (catId, catName) => {
        if (String(catId) === mainCatId) return { name: '总库 (C:)', go: { scope: 'fl', folderId: 'root' } }
        const d = driveOf(catId)
        return { name: d ? `${d.name} (${d.letter}:)` : `${catName || '磁盘'}`, go: { scope: 'fl', folderId: 'cat:' + catId } }
      }
      if (fid === 'root') {
        crumbs.push({ name: '总库 (C:)', go: { scope: 'fl', folderId: 'root' } })
      } else if (fid.startsWith('cat:')) {
        const cat = (await vfs.listCategories()).find((c) => String(c.id) === fid.slice(4))
        crumbs.push(driveCrumb(fid.slice(4), cat ? cat.name : '磁盘'))
      } else {
        // 普通文件夹：后端返回的第一段就是所属分类（type:'category'），后面逐级父文件夹
        const path = (await vfs.getFlPath(scope.value.folderId)) || []
        let rest = path
        if (path.length && path[0].type === 'category') {
          crumbs.push(driveCrumb(path[0].id, path[0].name))
          rest = path.slice(1)
        } else if (path.length) {
          // 兜底：拿不到分类时按旧样式挂在总库下
          crumbs.push({ name: '总库 (C:)', go: { scope: 'fl', folderId: 'root' } })
        }
        for (const p of rest) crumbs.push({ name: p.name, go: { scope: 'fl', folderId: p.id } })
      }
      breadcrumb.value = crumbs
      // 置顶排序：分镜/文本类文件放最前（不被批量生成的图片挤到最下面），文件夹其次，其余文件在后；
      // 组内保持原有顺序（sort 在现代 JS 里是稳定排序）
      list = sortPinnedFirst(list)
    } else if (isLib.value) {
      list = await vfs.listLib(scope.value.lib)
      const def = LIBRARIES.find((l) => l.lib === scope.value.lib)
      breadcrumb.value = [
        { name: '此电脑', go: { scope: 'computer' } },
        { name: def ? def.name : scope.value.lib, go: { scope: 'lib', lib: scope.value.lib } },
      ]
    }
    // 若期间又发起了更新的加载（seq 已变化），丢弃这次（较慢/过期的）结果，避免覆盖新数据。
    // 这正是"新建文件有时要手动刷新才出现"的根因：一次慢的 load 在快 load 之后才回包，把新文件覆盖没了。
    if (seq !== loadSeq) return
    items.value = list || []
  } catch (e) {
    if (seq === loadSeq) toast.show('加载失败：' + (e.message || e), 'error')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
  if (seq !== loadSeq) return
  // 缩略图懒加载：进入视野才加载（轻量列表模式下 thumbnail 为空）
  observeThumbs()
  if (pushHistory) {
    history.value = history.value.slice(0, histPos.value + 1)
    history.value.push({ ...scope.value })
    histPos.value = history.value.length - 1
  }
}

// 缩略图懒加载：只加载滚进视野的图片（原来一次性拉 150 张，打开大文件夹会卡很久）
let thumbObserver = null
function ensureObserver() {
  if (thumbObserver || typeof IntersectionObserver === 'undefined') return thumbObserver
  thumbObserver = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue
      const id = en.target.getAttribute('data-thumb-id')
      thumbObserver.unobserve(en.target)
      const it = items.value.find((x) => x.id === id)
      if (it) vfs.ensureThumb(it)
    }
  }, { rootMargin: '300px' })
  return thumbObserver
}
function observeThumbs() {
  nextTick(() => {
    const obs = ensureObserver()
    if (!obs || !bodyEl.value) return
    bodyEl.value.querySelectorAll('[data-thumb-id]').forEach((el) => obs.observe(el))
  })
}
// 上一个目录的观察目标作废，避免给已卸载的元素加载缩略图
function resetThumbs() {
  if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null }
}

function navigate(s) {
  scope.value = { ...s }
  load(true)
}
function navigateUp() {
  if (isFl.value) {
    // 回到上一级：用面包屑倒数第二项
    const b = breadcrumb.value
    if (b.length >= 2) navigate(b[b.length - 2].go)
  }
}
function back() { if (canBack.value) { histPos.value--; scope.value = { ...history.value[histPos.value] }; load(false) } }
function forward() { if (canFwd.value) { histPos.value++; scope.value = { ...history.value[histPos.value] }; load(false) } }

// ---------- 打开 ----------
function openItem(it) {
  if (it.kind === 'fl-root') return navigate({ scope: 'fl', folderId: 'root' })
  if (it.kind === 'cat') return navigate({ scope: 'fl', folderId: 'cat:' + it.catId })
  if (it.kind === 'folder') return navigate({ scope: 'fl', folderId: it.folderId })
  if (it.kind === 'lib') return navigate({ scope: 'lib', lib: it.lib })
  if (it.kind === 'file') return vfs.openFile(it, { siblings: items.value.filter((x) => x.kind === 'file') })
  if (it.kind === 'libitem') return vfs.openLibItem(it)
}

// ---------- 选择 ----------
function onItemClick(e, it, idx) {
  if (e.ctrlKey || e.metaKey) {
    const i = selectedIds.value.indexOf(it.id)
    if (i >= 0) selectedIds.value.splice(i, 1)
    else selectedIds.value.push(it.id)
  } else if (e.shiftKey && lastIdx.value >= 0) {
    const [a, b] = [Math.min(lastIdx.value, idx), Math.max(lastIdx.value, idx)]
    selectedIds.value = items.value.slice(a, b + 1).map((x) => x.id)
  } else {
    selectedIds.value = [it.id]
  }
  lastIdx.value = idx
}
function clearSelection() {
  // 框选刚结束时浏览器会在 ex-body 上补发一次 click，而 ex-body 绑了
  // @click.self="clearSelection" —— 如果不拦，刚框中的文件会被立刻清空
  // （表现：框选矩形有，鼠标一松一个都没选中）。
  if (marqueeSuppressClick) { marqueeSuppressClick = false; return }
  selectedIds.value = []; lastIdx.value = -1
}
function selectAll() {
  selectedIds.value = items.value.filter((x) => x.kind === 'file' || x.kind === 'folder').map((x) => x.id)
  lastIdx.value = selectedIds.value.length ? items.value.findIndex((x) => x.id === selectedIds.value[0]) : -1
}

// ---------- 新建 / 导入 ----------
// 把刚创建成功的记录即时塞进当前列表（乐观更新），不必等 load 回源 ——
// 解决"新建后文件不立刻出现、要手动刷新"的问题（慢一点点的 load 在快 load 之后回包会覆盖新数据）。
function mapCreatedFile(f) {
  return { id: 'fil:' + f.id, name: f.name, kind: 'file', fileType: f.file_type, fileId: f.id, size: f.file_size || 0, thumb: '', modified: f.updated_at || f.created_at || '', raw: f }
}
function mapCreatedFolder(f) {
  return { id: 'fld:' + f.id, name: f.name, kind: 'folder', folderId: f.id, fileCount: 0, subCount: 0, raw: f }
}
function optimisticInsert(item) {
  items.value = sortPinnedFirst([...items.value.filter((x) => x.id !== item.id), item])
}
let refreshTimer = null
function refreshSoon() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => { refreshTimer = null; load(false).catch(() => {}) }, 220)
}
function newFolder() {
  ;(async () => {
    const f = await vfs.createFlFolder(scope.value.folderId, '新建文件夹')
    if (!f) { toast.show('新建文件夹失败', 'error'); return }
    optimisticInsert(mapCreatedFolder(f))
    startRename('fld:' + f.id, '新建文件夹')
    refreshSoon()
  })()
}
function newTextFile() {
  ;(async () => {
    const f = await vfs.createFlTextFile(scope.value.folderId, '新建文本文档.txt', '')
    if (!f) { toast.show('新建文本失败', 'error'); return }
    optimisticInsert(mapCreatedFile(f))
    startRename('fil:' + f.id, '新建文本文档.txt')
    refreshSoon()
  })()
}
// 新建 Json 分镜文件（双击会用分镜工具打开，可编辑/删除/新增/保存）
function newStoryboardFile() {
  ;(async () => {
    const f = await vfs.createFlStoryboardFile(scope.value.folderId, '新建Json分镜.json')
    if (!f) { toast.show('新建分镜文件失败', 'error'); return }
    optimisticInsert(mapCreatedFile(f))
    startRename('fil:' + f.id, '新建Json分镜.json')
    refreshSoon()
  })()
}
// 新建小说文件（双击用小说阅读器打开）
function newNovelFile() {
  ;(async () => {
    const f = await vfs.createFlNovelFile(scope.value.folderId, '新建小说.novel')
    if (!f) { toast.show('新建小说失败', 'error'); return }
    optimisticInsert(mapCreatedFile(f))
    startRename('fil:' + f.id, '新建小说.novel')
    refreshSoon()
  })()
}
function triggerImport(kind = 'all') {
  const el = kind === 'image' ? imgInput.value : kind === 'text' ? txtInput.value : fileInput.value
  el && el.click()
}
async function onImport(e) {
  const files = e.target.files
  if (!files || !files.length) return
  for (const file of files) {
    try { await vfs.importFlFile(scope.value.folderId, file) }
    catch (err) { toast.show('导入失败：' + (err.message || err), 'error') }
  }
  e.target.value = ''
  await load(false)
  toast.show('导入完成', 'success')
}

// ---------- 重命名 ----------
function startRename(id, name) {
  renamingId.value = id
  renameText.value = name
  // 注意：这里千万不能把焦点移回内容区（bodyEl.focus()）——否则输入框刚聚焦就被失焦，
  // blur 会立刻触发 commitRename，名字没变就直接取消，表现为"重命名完全没反应"。
}
function commitRename(it) {
  if (renamingId.value !== it.id) return
  const name = (renameText.value || '').trim()
  renamingId.value = null
  if (!name || name === it.name) return
  const kind = it.kind === 'folder' ? 'folder' : it.kind === 'cat' ? 'cat' : 'file'
  const id = it.kind === 'folder' ? it.folderId : it.kind === 'cat' ? it.catId : it.fileId
  vfs.renameFl(kind, id, name).then(async () => {
    if (kind === 'cat') refreshNav()
    await load(false)
    toast.show('已重命名为「' + name + '」', 'success')
  }).catch((e) => {
    toast.show('重命名失败：' + (e.message || e), 'error', 4000)
  })
}
function cancelRename() { renamingId.value = null }

// ---------- 复制 / 剪切 / 粘贴 / 删除 ----------
function selectedItems() { return items.value.filter((it) => selectedIds.value.includes(it.id)) }
function copy(op) {
  const sel = selectedItems().filter((it) => it.kind === 'file' || it.kind === 'folder')
  if (!sel.length) return
  vfs.clipboard = { op, items: sel.map((it) => ({ kind: it.kind, id: it.kind === 'folder' ? it.folderId : it.fileId, name: it.name })) }
  toast.show(op === 'cut' ? '已剪切' : '已复制', 'info')
}
// ---------- 粘贴冲突（Windows 风格：替换 / 保留两者 / 跳过）----------
const cdlg = reactive({ show: false, op: 'copy', items: [], applyAll: false, resolve: null })
function fileTypeLabel(t) {
  const m = { image: '图片', video: '视频', audio: '音频', prompt: '提示词', text: '文本', rule: '规则', json: 'JSON', workflow: '工作流', novel: '小说', storyboard: '分镜' }
  return m[t] || ''
}
function choiceLabel(v) {
  return v === 'overwrite' ? '替换目标中的项目' : (v === 'skip' ? '跳过此项' : '保留两者（自动编号）')
}
function askPasteConflict(op, conflicts) {
  return new Promise((resolve) => {
    cdlg.op = op
    cdlg.items = conflicts.map((c) => ({ ...c, choice: 'rename' }))
    cdlg.applyAll = false
    cdlg.resolve = resolve
    cdlg.show = true
  })
}
function cdlgCancel() { if (cdlg.resolve) cdlg.resolve(null); cdlg.show = false; cdlg.resolve = null }
function cdlgOk() {
  const first = cdlg.items[0] && cdlg.items[0].choice
  const decisions = cdlg.items.map((it) => ({ id: it.id, kind: it.kind, action: cdlg.applyAll ? first : it.choice }))
  if (cdlg.resolve) cdlg.resolve(decisions)
  cdlg.show = false; cdlg.resolve = null
}
// 有冲突就先问，没冲突直接干；返回 null 表示用户取消
async function resolveConflicts(op, mapped, targetFolderId) {
  const conflicts = await vfs.previewPasteConflicts(mapped, targetFolderId)
  if (!conflicts.length) return []
  const decisions = await askPasteConflict(op, conflicts)
  return decisions // null = 取消
}

async function paste() {
  if (!vfs.clipboard || !isFl.value) return
  const { op, items: clip } = vfs.clipboard
  // 直接用剪贴板里的条目（跨目录复制/剪切也能粘贴）
  const mapped = clip.map((c) => (
    c.kind === 'folder'
      ? { kind: 'folder', folderId: c.id, name: c.name }
      : { kind: 'file', fileId: c.id, name: c.name }
  ))
  try {
    const decisions = await resolveConflicts(op, mapped, scope.value.folderId)
    if (!decisions) { toast.show('已取消粘贴', 'info'); return }
    if (op === 'copy') await vfs.copyFl(mapped, scope.value.folderId, null, decisions)
    else {
      await vfs.moveFl(mapped, scope.value.folderId, null, decisions)
      vfs.clipboard = null // 剪切完成 → 剪贴板清空 → 所有窗口的"虚化"效果同时消失
    }
    await load(false)
    broadcastFlChanged() // 让来源窗口（可能是另一个资源管理器窗口）立刻把文件抹掉
    const skipped = decisions.filter((d) => d.action === 'skip').length
    const replaced = decisions.filter((d) => d.action === 'overwrite').length
    const kept = decisions.filter((d) => d.action === 'rename').length
    let msg = op === 'copy' ? `已粘贴 ${mapped.length - skipped} 项副本` : `已移动 ${mapped.length - skipped} 项`
    if (replaced || kept) msg += `（替换 ${replaced} 项，保留两者 ${kept} 项）`
    if (skipped) msg += `，跳过 ${skipped} 项`
    toast.show(msg, 'success', 4000)
  } catch (e) {
    await load(false)
    toast.show((op === 'copy' ? '复制失败：' : '移动失败：') + (e.message || e), 'error', 5000)
  }
}
async function del() {
  const sel = selectedItems().filter((it) => it.kind === 'file' || it.kind === 'folder')
  if (!sel.length) return
  askConfirm(`确定将选中的 ${sel.length} 项移入回收站吗？`, async () => {
    try {
      await vfs.removeFl(sel)
      dropLocal(new Set(sel.map((x) => x.id)))
      broadcastFlChanged()
      toast.show(`已移入回收站（${sel.length} 项）`, 'success')
    } catch (e) {
      await load(false)
      toast.show('删除失败：' + (e.message || e), 'error', 5000)
    }
  })
}

// ---------- 盘符（分类）管理 ----------
function newCategory() {
  askName('新建盘符（分类）', '新盘符', async (name) => {
    if (!name) return
    try {
      await vfs.createCategory(name)
      toast.show(`盘符「${name}」已创建`, 'success'); load(false); refreshNav()
    } catch (e) { toast.show(e.message || '创建盘符失败', 'error', 3600) }
  })
}
async function delCategory(it) {
  askConfirm(`确定删除盘符「${it.name}」吗？\n（盘符内有文件或文件夹时系统会拒绝删除）`, async () => {
    const r = await vfs.deleteCategory(it.catId)
    if (r && r.success) { toast.show('盘符已删除', 'success'); load(false); refreshNav() }
    else toast.show((r && r.error) || '删除失败：盘符内可能有内容', 'error', 3600)
  })
}

// ---------- 对话框（替代被拦截的原生 confirm/prompt）----------
const dlg = reactive({ show: false, title: '', text: '', input: false, value: '', onOk: null })
function askConfirm(text, onOk) {
  dlg.title = '确认操作'; dlg.text = text; dlg.input = false; dlg.value = ''; dlg.onOk = onOk; dlg.show = true
}
function askName(title, def, onOk) {
  dlg.title = title; dlg.text = ''; dlg.input = true; dlg.value = def; dlg.onOk = onOk; dlg.show = true
}
function closeDlg() { dlg.show = false; dlg.onOk = null }
function dlgOk() {
  const f = dlg.onOk
  const v = dlg.input ? (dlg.value || '').trim() : undefined
  dlg.show = false; dlg.onOk = null
  if (f) f(v)
}

// ---------- 拖拽移动 ----------
// 拖拽载荷：跨窗口拖拽时，接收方窗口的 items 里没有这些条目（它们在来源窗口），
// 只传 id 是取不到对象的 —— 必须把 {kind, folderId/fileId} 一起带过去。
function descriptorOf(it) {
  return { id: it.id, kind: it.kind, folderId: it.folderId, fileId: it.fileId, name: it.name, fileType: it.fileType }
}
function onDragStart(e, it) {
  if (!selectedIds.value.includes(it.id)) { selectedIds.value = [it.id]; lastIdx.value = items.value.indexOf(it) }
  dragIds.value = selectedIds.value.slice()
  e.dataTransfer.effectAllowed = 'copyMove'
  const sel = selectedItems().filter((x) => x.kind === 'file' || x.kind === 'folder')
  const desc = sel.length ? sel.map(descriptorOf) : ((it.kind === 'file' || it.kind === 'folder') ? [descriptorOf(it)] : [])
  // 跨窗口拖拽注册表：dataTransfer 在 dragover 阶段读不到数据，
  // 同文档的另一个资源管理器窗口通过这个全局变量识别"正在拖什么、从哪来"
  window.__expDrag = {
    ids: dragIds.value.slice(),
    fromScopeKey: JSON.stringify(scope.value || {}),
    items: desc,
  }
  // 关键：除了 text/plain，还要带上 x-rfp 系列载荷 ——
  // FileSelector（使用工作流/插入提示词等）与功能编辑器的"输入图片 图1~图4"
  // 都按 application/x-rfp-file + application/x-rfp-type-<类型> 识别拖入项。
  // 之前只设了 text/plain，导致从资源管理器往这些位置拖文件完全无效。
  const first = items.value.find((x) => dragIds.value.includes(x.id) && (x.kind === 'file' || x.kind === 'folder'))
  if (first) {
    const payload = first.kind === 'file'
      ? { _kind: 'file', id: first.fileId, name: first.name, file_type: first.fileType }
      : { _kind: 'folder', id: first.folderId, name: first.name }
    const json = JSON.stringify(payload)
    e.dataTransfer.setData('application/x-rfp-file', json)
    e.dataTransfer.setData('application/json', json)
    if (first.kind === 'file') e.dataTransfer.setData('application/x-rfp-type-' + (first.fileType || 'file'), '1')
    else e.dataTransfer.setData('application/x-rfp-folder', '1')
  }
  e.dataTransfer.setData('text/plain', it.id)
}
// 拖放悬停高亮：拖到可承接的文件夹/盘符上时描边提示，松手即移入
const dragOverId = ref(null)
// 整页拖放提示：从另一个资源管理器窗口拖进来时，内容区整体高亮 = "松手移动到当前目录"
const bodyDropHint = ref(false)
function onItemDragOver(e, it) {
  // 只有文件夹 / 盘符可以承接拖放。此前对"文件"也无条件 preventDefault，
  // 松手后 onItemDrop 拿到 folderId=undefined → resolveTarget 兜底成总库根目录 ——
  // 表现为"在其它盘符随便一拖，文件就消失并跑到 C: 根目录"。
  if (it && (it.kind === 'folder' || it.kind === 'fl-root' || it.kind === 'cat')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverId.value !== it.id) dragOverId.value = it.id
  } else {
    e.dataTransfer.dropEffect = 'none'
    if (dragOverId.value === (it && it.id)) dragOverId.value = null
  }
}
function onItemDragLeave(e, it) {
  if (dragOverId.value !== it.id) return
  // 在条目内部子元素之间移动不算是"离开"（否则高亮会闪烁）
  const rel = e.relatedTarget
  if (rel && e.currentTarget && e.currentTarget.contains(rel)) return
  dragOverId.value = null
}
// 本次拖拽到底要移动哪些条目：
// 优先取跨窗口注册表里的载荷（从另一个资源管理器窗口拖来的，本窗口 items 里没有），
// 否则用本窗口的选中项（同窗口内拖拽）。
function currentDragItems() {
  const d = window.__expDrag
  if (d && Array.isArray(d.items) && d.items.length) return d.items
  return items.value.filter((x) => dragIds.value.includes(x.id)).map(descriptorOf)
}
async function onItemDrop(e, it) {
  dragOverId.value = null
  bodyDropHint.value = false
  const target = it && it.kind === 'fl-root' ? 'root' : (it && it.kind === 'cat' ? 'cat:' + it.catId : (it && it.kind === 'folder' ? it.folderId : null))
  if (!target) return
  e.preventDefault()
  e.stopPropagation() // 阻止冒泡到 ex-body 的跨窗口 drop 处理（同窗口内已由这里处理）
  const payload = currentDragItems()
  window.__expDrag = null
  await doMove(payload, target)
}
// 拖拽结束（含 Esc 取消 / 拖到无效位置）都要清掉注册表，避免残留影响下一次拖放
function onDragEnd() { window.__expDrag = null; dragOverId.value = null; bodyDropHint.value = false }
// ---------- 跨窗口拖拽移动（从 A 窗口拖到 B 窗口的空白处 = 移动到 B 当前目录） ----------
function currentTargetKey() {
  const fid = scope.value.folderId == null ? 'root' : String(scope.value.folderId)
  return fid
}
function onBodyDragOver(e) {
  const d = window.__expDrag
  if (!d || !isFl.value) return
  // 只认本应用发起的内部拖拽（外部 OS 文件拖入不接管）
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('application/x-rfp-file')) return
  // 落在具体条目上由 onItemDragOver 处理；这里只负责空白区域
  if (e.target.closest && e.target.closest('.item')) return
  if (d.fromScopeKey === JSON.stringify(scope.value || {})) return // 自己窗口的空白处不接
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  if (!bodyDropHint.value) bodyDropHint.value = true
}
function onBodyDragLeave(e) {
  if (e.target === bodyEl.value && bodyDropHint.value) bodyDropHint.value = false
}
async function onBodyDrop(e) {
  const d = window.__expDrag
  bodyDropHint.value = false
  if (!d || !isFl.value) return
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('application/x-rfp-file')) return
  if (e.target.closest && e.target.closest('.item')) return // 条目由 onItemDrop 处理
  if (d.fromScopeKey === JSON.stringify(scope.value || {})) return
  e.preventDefault()
  const payload = (d.items && d.items.length) ? d.items.slice() : null
  window.__expDrag = null
  if (!payload) { await load(false); return }
  await doMove(payload, currentTargetKey())
}

// ---------- 鼠标框选（在空白处按下左键拖出一个选框，扫过的项目全部选中，单手可多选） ----------
const marquee = ref(null) // {x1,y1,x2,y2} 视口坐标
const marqueeStyle = computed(() => {
  const m = marquee.value
  if (!m) return {}
  return {
    left: Math.min(m.x1, m.x2) + 'px',
    top: Math.min(m.y1, m.y2) + 'px',
    width: Math.abs(m.x2 - m.x1) + 'px',
    height: Math.abs(m.y2 - m.y1) + 'px',
  }
})
// 框选结束后要吞掉紧接着的那一次 click（见 clearSelection 里的说明）
let marqueeSuppressClick = false
function onBodyMouseDown(e) {
  if (e.button !== 0) return
  // 只在空白处起框；项目上正常走点击/拖拽逻辑
  if (e.target.closest && (e.target.closest('.item') || e.target.closest('input') || e.target.closest('button'))) return
  marqueeSuppressClick = false
  // Ctrl / Shift 起框 = 追加选中（与 Windows 一致）
  const additive = e.ctrlKey || e.metaKey || e.shiftKey
  if (!additive) { selectedIds.value = []; lastIdx.value = -1 }
  const base = additive ? selectedIds.value.slice() : []
  const box = bodyEl.value.getBoundingClientRect()
  const sx = e.clientX, sy = e.clientY
  marquee.value = { x1: sx, y1: sy, x2: sx, y2: sy }
  const itemEls = [...bodyEl.value.querySelectorAll('.item[data-item-id], tr[data-item-id]')]
  let moved = false
  const move = (ev) => {
    if (Math.abs(ev.clientX - sx) > 4 || Math.abs(ev.clientY - sy) > 4) moved = true
    marquee.value = { x1: sx, y1: sy, x2: ev.clientX, y2: ev.clientY }
    const mx1 = Math.min(sx, ev.clientX), mx2 = Math.max(sx, ev.clientX)
    const my1 = Math.min(sy, ev.clientY), my2 = Math.max(sy, ev.clientY)
    const hit = []
    for (const el of itemEls) {
      const r = el.getBoundingClientRect()
      if (r.right > mx1 && r.left < mx2 && r.bottom > my1 && r.top < my2) hit.push(el.dataset.itemId)
    }
    // 追加模式下 = 原有选中 ∪ 框中的
    selectedIds.value = base.length ? [...new Set([...base, ...hit])] : hit
    if (ev.clientY < box.top + 28) bodyEl.value.scrollTop -= 12      // 拖到边缘自动滚动
    else if (ev.clientY > box.bottom - 28) bodyEl.value.scrollTop += 12
  }
  const up = () => {
    marquee.value = null
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (moved) {
      // 记录最后一个被选中的下标，之后 Shift 连续选择能接着框选结果走
      const s = selectedIds.value
      if (s.length) lastIdx.value = items.value.findIndex((x) => x.id === s[s.length - 1])
      marqueeSuppressClick = true
      setTimeout(() => { marqueeSuppressClick = false }, 0)
    }
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  e.preventDefault()
}
// 所有会改动文件库内容的操作（移动 / 复制 / 粘贴 / 删除 / 重命名 / 导入）做完都要广播：
// 同一页面里可能开着好几个资源管理器窗口，来源窗口必须跟着刷新，
// 否则会出现"剪切成功了，原来目录里的文件还在，要手动刷新才消失"。
const MY_WIN_ID = Math.random().toString(36).slice(2)
function broadcastFlChanged() {
  window.dispatchEvent(new CustomEvent('fl-files-changed', { detail: { sender: MY_WIN_ID } }))
}
async function doMove(descList, targetFolderId) {
  if (!descList || !descList.length || !isFl.value) return
  if (targetFolderId == null || targetFolderId === '') return
  const mapped = descList.filter((x) => x.kind === 'file' || x.kind === 'folder')
  if (!mapped.length) return
  // 防止把文件夹拖进自身
  if (mapped.some((x) => x.kind === 'folder' && String(x.folderId) === String(targetFolderId))) {
    toast.show('不能移动到自身', 'error'); return
  }
  try {
    const decisions = await resolveConflicts('cut', mapped, targetFolderId)
    if (!decisions) { toast.show('已取消移动', 'info'); return }
    await vfs.moveFl(mapped, targetFolderId, null, decisions)
    // 本地立刻抹掉（不等重新请求），其它窗口靠广播刷新 —— 跟 Windows 一样"松手就没了"
    const skipIds = new Set(decisions.filter((d) => d.action === 'skip').map((d) => String(d.id)))
    const ids = new Set(mapped.filter((x) => !skipIds.has(String(x.fileId != null ? x.fileId : x.folderId))).map((x) => x.id))
    dropLocal(ids)
    broadcastFlChanged() // 来源窗口立刻把文件抹掉（剪切/拖拽都靠这条）
    await load(false)    // 目标窗口（本窗口）也要立刻显示移进来的文件
    const skipped = decisions.filter((d) => d.action === 'skip').length
    toast.show(skipped ? `已移动 ${mapped.length - skipped} 项，跳过 ${skipped} 项` : `已移动 ${mapped.length} 项`, 'success')
  } catch (e) {
    await load(false)
    toast.show('移动失败：' + (e.message || e), 'error', 5000)
  }
}
// 从当前列表里移除（乐观更新，避免肉眼可见的刷新延迟）
function dropLocal(idSet) {
  if (!idSet || !idSet.size) return
  items.value = items.value.filter((x) => !idSet.has(x.id))
  selectedIds.value = selectedIds.value.filter((id) => !idSet.has(id))
}

// ---------- 右键菜单 ----------
const ctx = reactive({ show: false, x: 0, y: 0, target: null, items: [] })
const subMenu = reactive({ show: false, owner: null, style: {} })
function closeCtx() { ctx.show = false; subMenu.show = false }

function buildMenu(target) {
  // 右键时顺带刷新功能库列表，保证"激活"状态及时反映到「用功能库生成」子菜单
  loadFunctions()
  if (!target) {
    // 空白：新建（仅可写）
    const items = [
      { label: '刷新', icon: 'refresh', onClick: refresh },
      { label: '全选', icon: 'grid', short: 'Ctrl+A', onClick: selectAll },
    ]
    if (scope.value.scope === 'computer') {
      items.unshift(
        { label: '新建盘符（分类）', icon: 'drive', onClick: newCategory },
        { sep: true },
      )
    }
    if (canWrite.value) {
      items.unshift(
        { label: '粘贴', icon: 'paste', disabled: !vfs.clipboard, onClick: paste },
        { sep: true },
        { label: '新建', icon: 'plus', sub: [
          { label: '文件夹', onClick: newFolder },
          { label: '文本文档', onClick: newTextFile },
          { label: 'Json分镜文件', onClick: newStoryboardFile },
          { label: '小说', onClick: newNovelFile },
        ] },
        { sep: true },
        { label: '导入', icon: 'import', sub: [
          { label: '图片 / 视频…', icon: 'imgImport', onClick: () => triggerImport('image') },
          { label: '文本 / JSON…', icon: 'txtImport', onClick: () => triggerImport('text') },
          { label: '任意文件…', icon: 'filePlus', onClick: () => triggerImport('all') },
        ] },
        { sep: true },
      )
    }
    return items
  }
  const it = target
  // 盘符（分类）：可打开 / 重命名 / 删除（有内容时后端会拒绝）
  if (it.kind === 'cat') {
    return [
      { label: '打开', icon: 'open', onClick: () => openItem(it) },
      { label: '在新窗口中打开', icon: 'window', onClick: () => wm.open('explorer', { initialScope: { scope: 'fl', folderId: 'cat:' + it.catId } }, { w: 1000, h: 660 }) },
      { sep: true },
      { label: '重命名', icon: 'rename', short: 'F2', onClick: () => startRename(it.id, it.name) },
      { label: '删除盘符', icon: 'delete', onClick: () => delCategory(it) },
      { sep: true },
      { label: '属性', icon: 'info', onClick: () => showProps(it) },
    ]
  }
  if (it.kind === 'file' || it.kind === 'folder') {
    // 关键：操作作用于"整个选区"，而不是右键点中的那一项。
    // 多选后右键，复制/剪切/删除应作用于所有选中项（此前每个菜单项都先 selectOnly(it)，
    // 把多选缩成 1 项，所以多选删除/剪切只生效在右键那一个文件上）。
    const sel = selectedItems().filter((x) => x.kind === 'file' || x.kind === 'folder')
    const n = sel.length
    const multi = n > 1
    const suffix = multi ? ` ${n} 项` : ''
    // 顺序说明（按用户习惯）：剪切/复制放最上面 —— 打开双击就行，不用占第一位。
    // "在新窗口中打开"只对文件夹有意义，文件不需要。
    const menu = [
      { label: '剪切' + suffix, icon: 'cut', short: 'Ctrl+X', onClick: () => copy('cut') },
      { label: '复制' + suffix, icon: 'copy', short: 'Ctrl+C', onClick: () => copy('copy') },
      { sep: true },
      { label: '打开', icon: 'open', disabled: multi, onClick: () => openItem(it) },
    ]
    if (it.kind === 'folder') {
      menu.push({ label: '在新窗口中打开', icon: 'window', disabled: multi, onClick: () => wm.open('explorer', { initialScope: isFl.value ? { scope: 'fl', folderId: it.folderId } : { scope: 'computer' } }, { w: 1000, h: 660 }) })
    }
    menu.push({ sep: true })
    // 右键一键生图：仅文本 / 提示词 / JSON / Json分镜 文件出现（具体能调哪个功能看子菜单，按文件类型自动匹配）
    if (it.kind === 'file' && ['text', 'prompt', 'storyboard', 'json'].includes(it.fileType)) {
      menu.push({ label: '用功能库生成', icon: 'studio', sub: buildGenerateSub(it) })
    }
    menu.push({ sep: true })
    menu.push({ label: '重命名', icon: 'rename', short: 'F2', disabled: multi, onClick: () => startRename(it.id, it.name) })
    menu.push({ label: '删除' + suffix, icon: 'delete', short: 'Delete', onClick: del })
    // 可调用（激活）文件夹：其中的文件会出现在各处"选择工作流/提示词/规则…"选择器里
    if (it.kind === 'folder') {
      const callable = !!(it.raw && it.raw.is_callable)
      menu.push({ sep: true })
      menu.push({
        label: callable ? '取消可调用' : '设为可调用',
        icon: callable ? 'close' : 'star',
        disabled: multi,
        onClick: () => toggleCallable(it),
      })
    }
    menu.push({ sep: true })
    menu.push({ label: '属性', icon: 'info', disabled: multi, onClick: () => showProps(it) })
    return menu
  }
  // 业务库项（只读）
  return [
    { label: '打开', icon: 'open', onClick: () => openItem(it) },
    { sep: true },
    { label: '属性', icon: 'info', onClick: () => showProps(it) },
  ]
}
function selectOnly(it) { selectedIds.value = [it.id]; lastIdx.value = items.value.indexOf(it) }
// 在资源管理器新窗口中打开该文件/文件夹的"所在位置"（与生成结果等互通）
async function openInNewWindow(it) {
  let target = 'root'
  if (it.kind === 'folder') {
    const path = await vfs.getFlPath(it.folderId)
    target = path.length ? path[path.length - 1].id : 'root'
  } else {
    target = scope.value.scope === 'fl' ? scope.value.folderId : 'root'
  }
  wm.open('explorer', { initialScope: { scope: 'fl', folderId: target } }, { w: 1000, h: 660 })
}
function onPaneContext(e) { ctx.target = null; openCtxAt(e, buildMenu(null)) }
async function onItemContext(e, it) {
  if (!selectedIds.value.includes(it.id)) selectOnly(it)
  // json 文件需要按内容识别是否为分镜格式（识别结果有缓存，仅首次右键多一次读取）
  if (it.kind === 'file' && it.fileType === 'json') await detectStoryboardFile(it)
  openCtxAt(e, buildMenu(it))
}
function openCtxAt(e, items) {
  const mw = window.innerWidth, mh = window.innerHeight
  ctx.x = Math.min(e.clientX, mw - 220)
  ctx.y = Math.min(e.clientY, mh - 320)
  ctx.items = items
  ctx.show = true
  subMenu.show = false
}
function runCtx(m) { if (m.disabled) return; closeCtx(); if (m.onClick) m.onClick() }
function openSub(m) {
  subMenu.owner = m
  subMenu.style = { left: '100%', top: '0' }
  subMenu.show = true
}
function showProps(it) {
  const lines = [`名称：${it.name}`, `类型：${typeLabel(it)}`]
  if (it.kind === 'file') { lines.push(`文件类型：${it.fileType || '-'}`); lines.push(`大小：${fmtSize(it.size)}`) }
  if (it.kind === 'folder' || it.kind === 'cat') { lines.push(`包含：${it.fileCount || 0} 文件 / ${it.subCount || 0} 子文件夹`) }
  if (it.kind === 'folder') lines.push(`可调用：${it.raw && it.raw.is_callable ? '是（其中的文件会出现在各类选择器中）' : '否'}`)
  if (it.modified) lines.push(`修改：${fmtDate(it.modified)}`)
  toast.show(lines.join('\n'), 'info', 4000)
}

// ---------- 右键一键生图（文本 / 提示词 / JSON / Json分镜 文件） ----------
// 文件类型 → 可调用的功能页签。右键按此自动匹配；以后加图片/视频/小说等功能时在此扩展
// （如 image: ['img2img']、video: ['img2video']、novel: ['novel2story']）
const GEN_TYPE_TABS = { text: ['text2img'], prompt: ['text2img'], storyboard: ['storyboard'] }
// json 文件按内容识别是否分镜格式（缓存：fileId → true/false），右键时才取内容
const sbDetectCache = new Map()
async function detectStoryboardFile(it) {
  const fid = Number(it.fileId ?? it.id)
  if (sbDetectCache.has(fid)) return sbDetectCache.get(fid)
  try {
    const full = await apiClient.getFileLibraryFileById(fid)
    const raw = full && full.content
    const content = typeof raw === 'string' ? raw : JSON.stringify(raw || '')
    const ok = isStoryboardText(content)
    sbDetectCache.set(fid, ok)
    return ok
  } catch { sbDetectCache.set(fid, false); return false }
}
// 该文件能调用哪些功能页签（空数组 = 无可调用功能）
function genTabsFor(it) {
  if (!it || it.kind !== 'file') return []
  const ft = it.fileType
  if (GEN_TYPE_TABS[ft]) return GEN_TYPE_TABS[ft]
  if (ft === 'json') return sbDetectCache.get(Number(it.fileId ?? it.id)) === true ? ['storyboard'] : []
  return []
}
function buildGenerateSub(it) {
  if (!conn.comfyConnected) return [{ label: 'ComfyUI 未连通，无法生成', disabled: true }]
  const tabs = genTabsFor(it)
  if (!tabs.length) return [{ label: '该文件类型暂无可调用的功能', disabled: true }]
  // 只有「已激活」的功能才会出现在右键里
  const active = functions.value.filter((f) => f.is_active)
  if (!active.length) return [{ label: '功能库暂无已激活功能（在功能库点"激活"）', disabled: true }]
  const matched = active.filter((f) => tabs.includes(f.tab_id || 'text2img'))
  if (!matched.length) {
    const wanted = tabs.map((t) => ({ text2img: '文生图', storyboard: '分镜生成' }[t] || t)).join('/')
    return [{ label: `没有已激活的"${wanted}"功能（在功能库激活）`, disabled: true }]
  }
  return matched.map((fn) => ({
    label: fn.name,
    icon: 'studio',
    onClick: () => runFunctionOnFile(it, fn.id),
  }))
}
async function runFunctionOnFile(file, fnId) {
  if (!conn.comfyConnected) { toast.show('ComfyUI 未连通，无法生成', 'error'); return }
  let fn = functions.value.find((f) => f.id === fnId) || (await apiClient.getFunctionById(fnId))
  if (!fn) { toast.show('功能不存在', 'error'); return }
  const cfg = (typeof fn.config_json === 'object' && fn.config_json)
    ? fn.config_json
    : (typeof fn.config_json === 'string' ? (() => { try { return JSON.parse(fn.config_json || '{}') } catch { return {} } })() : {})
  // 与右键菜单同一套识别规则（分镜 = storyboard 类型，或 json 内容识别为分镜格式）
  const isStory = genTabsFor(file).includes('storyboard')

  // 提示词来源：
  // - 文本/提示词文件 → 直接读文件正文（content），插入提示词作为前缀（只拼一次）
  // - Json分镜文件 → storyboard_json_ids 携带文件，执行时逐段读取；插入提示词走任务级前缀
  let promptText = ''
  if (!isStory) {
    try {
      const full = await apiClient.getFileLibraryFileById(Number(file.fileId ?? file.id))
      promptText = String((full && (full.content || full.description)) || '').trim()
    } catch { promptText = '' }
    if (!promptText) { toast.show('无法读取文本文件的提示词内容', 'error'); return }
  }

  // 目标目录 = 右键时所在的目录（图就生成在这里）
  let targetCategoryId = 0
  let targetFolderId = null
  try {
    if (scope.value.scope === 'fl') {
      const fid = scope.value.folderId
      const tgt = await vfs.resolveTarget(fid)
      const s = String(fid == null ? 'root' : fid)
      if (s === 'root' || s.startsWith('cat:')) targetCategoryId = tgt.categoryId || 0
      else targetFolderId = tgt.parentId || null
    }
  } catch { /* 解析失败则走后端兜底（总库/任务名） */ }

  // 去重：同一个文件用同一个功能在同一个目录里，队列里还有没跑完的 → 不允许重复发起
  const dup = queueStore.findPending(
    Number(file.fileId ?? file.id), cfg.functionName || fn.name, targetCategoryId, targetFolderId
  )
  if (dup) {
    toast.show(`「${file.name}」已用「${dup.funcName || '该功能'}」在这个目录里运行过，请勿重复运行（可在任务列表里继续/删除）`, 'warn', 4500)
    return
  }

  const taskData = {
    name: `${file.name} · ${cfg.functionName || fn.name}`,
    description: '右键一键生成',
    workflow_api_id: cfg.selectedWorkflowId || 0,
    comfyui_config_id: cfg.comfyuiConfigId || 0,
    storyboard_json_ids: isStory ? [Number(file.fileId ?? file.id)] : [],
    // 文本文件：插入提示词由 function_configs 内部拼前缀，任务级传空避免重复两段；
    // 分镜文件：任务级 inserted_prompt_ids 作为每段分镜的前缀
    inserted_prompt_ids: isStory ? (cfg.insertedPromptIds || []) : [],
    function_configs: isStory ? [] : [{ ...cfg, promptText }],
    target_category_id: targetCategoryId,
    target_folder_id: targetFolderId,
    category_id: 0,
  }
  try {
    const t = await apiClient.createGenerationTask(taskData)
    const tid = t && t.id
    if (!tid) { toast.show('创建生成任务失败', 'error'); return }
    // 注册到任务队列（目录内瓦片 + 托盘队列面板都从这里来），再统一入队：
    // 已有任务在跑就排到队尾串行等待，绝不打断正在跑的任务
    queueStore.register(t, {
      name: file.name, fileName: file.name,
      funcName: cfg.functionName || fn.name,
      sourceFileId: Number(file.fileId ?? file.id) || null,
      targetCategoryId, targetFolderId,
    })
    generationStore.enqueueTasks([tid]).catch((e) => {
      toast.show('执行失败: ' + (e.message || e), 'error')
    })
    toast.show(`已用"${cfg.functionName || fn.name}"开始生成`, 'success')
  } catch (e) {
    toast.show('生成失败: ' + (e.message || e), 'error')
  }
}

// ---------- 生成中虚拟瓦片（任务记录）----------
// 当前目录的目标位置（categoryId + folderId），用于匹配只显示本目录的任务瓦片
const curTarget = ref(null)
watch(scope, async (s) => {
  curTarget.value = null
  try {
    if (s && s.scope === 'fl') {
      const tgt = await vfs.resolveTarget(s.folderId)
      const str = String(s.folderId == null ? 'root' : s.folderId)
      if (str === 'root' || str.startsWith('cat:')) curTarget.value = { categoryId: tgt.categoryId || 0, folderId: null }
      else curTarget.value = { categoryId: 0, folderId: tgt.parentId || null }
    }
  } catch { curTarget.value = null }
}, { immediate: true })

const visibleQueueTiles = computed(() => {
  const t = curTarget.value
  if (!t) return []
  return queueStore.views.filter((r) =>
    r.status !== 'completed' && r.status !== 'error' && r.status !== 'cancelled' &&
    (r.targetCategoryId || 0) === (t.categoryId || 0) &&
    (r.targetFolderId ?? null) === (t.folderId ?? null)
  )
})

function tilePct(p) {
  if (p.status === 'running') return Math.max(4, Math.min(96, p.livePct || 0))
  if (p.total) return Math.round((Math.min(p.done, p.total) / p.total) * 100)
  return 6
}
function pendingTag(p) {
  if (p.status === 'running') return `${p.done || 0}/${p.total || '?'} 生成中…`
  if (p.status === 'queued') return `排队中 · ${p.done || 0}/${p.total || '?'}`
  if (p.status === 'paused') return p.total ? `${p.done || 0}/${p.total} 已暂停` : `已生成 ${p.done || 0} 张 · 已暂停`
  return '生成中…'
}
async function toggleTile(p) {
  try {
    if (p.status === 'paused') { await queueStore.resumeTask(p.taskId); toast.show(`「${p.name}」已继续，从断点接着生成`, 'success') }
    else { await queueStore.pauseTask(p.taskId); toast.show(`「${p.name}」已暂停，队列后面的任务会自动顶上`, 'warn') }
  } catch (e) { toast.show('操作失败: ' + (e.message || e), 'error') }
}
function tileStatusText(st) {
  return { running: '执行中', queued: '排队中', paused: '已暂停', completed: '已完成', error: '出错', cancelled: '已取消' }[st] || st
}
function showTileProps(p) {
  const remain = p.total ? Math.max(0, p.total - (p.done || 0)) : null
  dlg.title = '生成任务属性'
  dlg.text = [
    `任务名称：${p.name}`,
    `来源文件：${p.fileName || '（未记录）'}`,
    `调用功能：${p.funcName || '（未记录）'}`,
    `执行进度：已生成 ${p.done || 0} 张` + (p.total ? `，剩余 ${remain} 张（共 ${p.total} 张）` : '（继续执行后显示总数）'),
    `任务状态：${tileStatusText(p.status)}${p.errorMessage ? `（${p.errorMessage}）` : ''}`,
    `队列位置：第 ${queueStore.sortedViews.findIndex((r) => r.taskId === p.taskId) + 1} 个 / 共 ${queueStore.sortedViews.length} 个`,
    `任务编号：#${p.taskId}`,
  ].join('\n')
  dlg.input = false; dlg.value = ''; dlg.onOk = null; dlg.show = true
}
function onTileContext(e, p) {
  openCtxAt(e, [
    { label: p.status === 'paused' ? '继续生成' : '暂停生成', icon: p.status === 'paused' ? 'play' : 'pause', onClick: () => toggleTile(p) },
    { label: '任务属性', icon: 'list', onClick: () => showTileProps(p) },
    { label: '打开任务队列', icon: 'tasks', onClick: () => wm.open('tasks') },
    { label: '从队列删除', icon: 'trash', onClick: () => askConfirm(`确定把任务「${p.name}」从队列中删除吗？\n（已生成的图片保留在目录里）`, () => queueStore.removeTask(p.taskId)) },
  ])
}

// 瓦片生命周期：新图落库 → 刷新目录；完成/出错 → toast 提示（瓦片随状态自动消失）
const tileSeen = new Map()
watch(() => queueStore.views, (views) => {
  for (const r of views) {
    const prev = tileSeen.get(r.taskId) || { done: r.done, status: r.status }
    if (r.done > prev.done) load(false)
    if (prev.status !== 'completed' && r.status === 'completed') {
      load(false)
      toast.show(`「${r.name}」生成完成（${r.done || 0}/${r.total || r.done || 0}）`, 'success')
    }
    if (prev.status !== 'error' && r.status === 'error') {
      load(false)
      toast.show(`「${r.name}」生成出错${r.errorMessage ? '：' + r.errorMessage : ''}`, 'error', 5000)
    }
    if (prev.status !== 'cancelled' && r.status === 'cancelled') {
      toast.show(`「${r.name}」已从队列删除`, 'warn')
    }
    tileSeen.set(r.taskId, { done: r.done, status: r.status })
  }
}, { deep: true })

// ---------- 可调用（激活）文件夹 ----------
// 设为可调用后：该文件夹（含子文件夹）里的文件会出现在
// "使用工作流（单选）"、"插入提示词"、"选择分镜JSON" 等选择器里。
// 后端按 file_library_folders.is_callable 过滤（/api/file-library-files/callable）。
async function toggleCallable(it) {
  if (it.kind !== 'folder') return
  const next = !(it.raw && it.raw.is_callable) ? 1 : 0
  try {
    const r = await apiClient.updateFileLibraryFolder(it.folderId, { is_callable: next })
    if (!r) throw new Error('设置失败')
    it.raw = { ...(it.raw || {}), is_callable: next }
    toast.show(
      next
        ? `已将「${it.name}」设为可调用：其中的文件会出现在各类选择器中`
        : `已取消「${it.name}」的可调用`,
      'success', 3600,
    )
  } catch (e) {
    toast.show('设置失败：' + (e.message || e), 'error', 5000)
  }
}

// ---------- 工具 ----------
function displayName(it) {
  return it.isDrive && it.letter ? `${it.name} (${it.letter}:)` : it.name
}
function itemIcon(it) {
  // 盘符（总库 C: 与各分类 D:/E:/F:…）统一用硬盘图标
  if (it.kind === 'fl-root' || it.kind === 'cat') return icon('drive')
  if (it.kind === 'folder') return icon('folder')
  if (it.kind === 'lib') return icon(it.icon || 'file')
  if (it.kind === 'libitem') {
    const def = LIBRARIES.find((l) => l.lib === it.lib)
    return icon(def ? def.icon : 'file')
  }
  // 文件按类型
  switch (it.fileType) {
    case 'image': return icon('image')
    case 'video': return icon('media')
    case 'audio': return icon('audio')
    case 'storyboard': return icon('storyboard')
    case 'novel': return icon('novel')
    // json 里按内容识别出是分镜格式的，也用分镜图标
    case 'json': return sbDetectCache.get(Number(it.fileId ?? it.id)) === true ? icon('storyboard') : icon('layer')
    case 'workflow': return icon('layer')
    case 'prompt': case 'text': case 'rule': return icon('notepad')
    default: return icon('file')
  }
}
function typeLabel(it) {
  // 总库(C:) 与其他盘符一样是磁盘（此前误标为"文件夹"）
  if (it.kind === 'fl-root') return '本地磁盘'
  if (it.kind === 'folder') return it.raw && it.raw.is_callable ? '可调用文件夹' : '文件夹'
  if (it.kind === 'cat') return it.isDrive ? '本地磁盘' : '分类'
  if (it.kind === 'lib') return '库'
  if (it.kind === 'libitem') { const d = LIBRARIES.find((l) => l.lib === it.lib); return d ? d.name + '项' : '项' }
  if (it.kind === 'file') {
    const map = { image: '图片', video: '视频', audio: '音频', prompt: '提示词', text: '文本文档', rule: '规则', json: 'JSON', workflow: '工作流', storyboard: 'Json分镜文件' }
    return map[it.fileType] || '文件'
  }
  return '文件'
}
function fmtSize(n) {
  if (!n) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
function fmtDate(s) {
  if (!s) return '—'
  return String(s).replace('T', ' ').slice(0, 19)
}
function onPaneClick() { closeCtx() }
function refresh() { load(false) }

// ---------- 键盘 ----------
function onKey(e) {
  if (dlg.show) return
  if (cdlg.show) {
    if (e.key === 'Escape') { e.preventDefault(); cdlgCancel() }
    else if (e.key === 'Enter') { e.preventDefault(); cdlgOk() }
    return
  }
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { copy('copy') }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) { copy('cut') }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) { paste() }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); selectAll() }
  else if (e.key === 'F2') {
    const s = selectedItems().filter((x) => x.kind === 'file' || x.kind === 'folder' || x.kind === 'cat')
    if (s.length === 1) startRename(s[0].id, s[0].name)
  }
  else if (e.key === 'Delete') { del() }
  else if (e.key === 'F5') { refresh() }
  else if (e.key === 'Escape') {
    // Esc 取消剪贴板（Windows 同款：取消后虚化效果立即消失）
    if (vfs.clipboard) { vfs.clipboard = null; closeCtx(); toast.show('已取消剪贴板', 'info') }
    else closeCtx()
  }
}
onMounted(() => {
  load(true)
  window.addEventListener('keydown', onKey)
  document.addEventListener('click', closeCtx)
  // 分镜编辑器等窗口保存/改名文件后，刷新当前文件夹列表
  window.addEventListener('fl-files-changed', onFlFilesChanged)
  // 恢复刷新前未完成的生成任务（显示为已暂停的虚拟瓦片，可点播放从断点继续）
  queueStore.hydrate()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('click', closeCtx)
  window.removeEventListener('fl-files-changed', onFlFilesChanged)
  resetThumbs()
})

// 其它窗口（或分镜编辑器等）改动了文件库 → 本窗口跟着刷新。
// 自己发出的广播跳过：本地已经做过乐观更新 / 已 reload，避免重复请求与闪烁。
function onFlFilesChanged(e) {
  if (e && e.detail && e.detail.sender === MY_WIN_ID) return
  load(false)
}

// 自动聚焦输入框指令
const vFocus = { mounted: (el) => { el.focus(); el.select() } }
</script>

<style scoped>
.ex { display: flex; height: 100%; background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); font-size: 13px; }
/* 导航树 */
.ex-nav { width: 220px; flex: 0 0 220px; border-right: 1px solid var(--border-color, #e5e7eb); padding: 8px 6px; overflow: auto; background: rgba(0,0,0,.02); }
.ex-nav-h { font-size: 11px; color: var(--text-muted, #888); padding: 6px 8px; text-transform: uppercase; letter-spacing: .4px; }
.nav-node { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 5px; cursor: pointer; user-select: none; }
.nav-node:hover { background: rgba(0,0,0,.06); }
.nav-node.active { background: rgba(0,103,192,.12); }
.nav-ico, .nav-tw { width: 16px; height: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.nav-tw :deep(svg) { width: 12px; height: 12px; }
.nav-ico :deep(svg) { width: 16px; height: 16px; }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-children { margin-left: 14px; }
.nav-folder .nav-label { font-size: 12.5px; }
.nav-folder.drag-over { background: rgba(0,103,192,.18); outline: 1px dashed rgba(0,103,192,.5); }

/* 主区 */
.ex-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ex-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); flex-shrink: 0; }
.tb-ico-btn { width: 30px; height: 30px; border: none; background: transparent; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary, #555); }
.tb-ico-btn :deep(svg) { width: 16px; height: 16px; }
.tb-ico-btn:hover:not(:disabled) { background: rgba(0,0,0,.07); }
.tb-ico-btn:disabled { opacity: .4; cursor: default; }
.tb-ico-btn.on { background: rgba(0,103,192,.14); color: var(--accent-color, #0067c0); }
.tb-ico-btn.danger { color: #b91c1c; }
.tb-ico-btn.danger:hover:not(:disabled) { background: rgba(185,28,28,.1); }
.tb-btn { display: flex; align-items: center; gap: 5px; border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); border-radius: 5px; padding: 5px 10px; font-size: 12.5px; cursor: pointer; color: var(--text-primary, #1f2937); }
.tb-btn :deep(svg) { width: 15px; height: 15px; }
.tb-btn:hover:not(:disabled) { background: rgba(0,103,192,.08); }
.tb-btn:disabled { opacity: .45; cursor: default; }
.tb-btn.danger { color: #b91c1c; }
.tb-btn.danger:hover:not(:disabled) { background: rgba(185,28,28,.09); }
.tb-sep { width: 1px; height: 20px; background: var(--border-color, #e5e7eb); margin: 0 4px; }
.tb-spacer { flex: 1; }

.ex-addr { height: 34px; flex: 0 0 34px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.addr-label { font-size: 11px; color: var(--text-muted, #999); flex-shrink: 0; }
.crumbs { display: flex; align-items: center; gap: 2px; overflow: hidden; }
.crumb { padding: 3px 8px; border-radius: 5px; cursor: pointer; font-size: 12.5px; white-space: nowrap; }
.crumb:hover { background: rgba(0,0,0,.07); }
.crumb-sep :deep(svg) { width: 11px; height: 11px; opacity: .5; }

.ex-body { flex: 1; min-height: 0; overflow: auto; padding: 10px; position: relative; outline: none; }
.ex-body.view-grid { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px; }
.ex-loading, .ex-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted, #999); text-align: center; }
.ex-empty-ico :deep(svg) { width: 56px; height: 56px; opacity: .5; }
.ex-empty-sub { font-size: 12px; max-width: 340px; }

.item { width: 96px; padding: 8px 6px; border-radius: 6px; cursor: default; display: flex; flex-direction: column; align-items: center; gap: 5px; border: 1px solid transparent; }
.item:hover { background: rgba(0,0,0,.05); }
.item.sel { background: rgba(0,103,192,.16); border-color: rgba(0,103,192,.4); }
/* 已被"剪切"：像 Windows 一样半透明（虚化），粘贴完成或剪贴板被替换后自动恢复 */
.item.cut { opacity: .42; }
.item.cut .item-thumb { filter: grayscale(.55); }
.ex-table tr.cut td { opacity: .42; }
/* 拖放悬停高亮：文件夹/盘符可承接时描边+淡蓝底 */
.item.drop { border-color: #0078d4; background: rgba(0,120,212,.14); box-shadow: 0 0 0 1px #0078d4 inset; }
/* 跨窗口拖入：整个内容区高亮 = "松手移动到当前目录" */
.ex-body.drop-hint { outline: 2px dashed #0078d4; outline-offset: -3px; background: rgba(0,120,212,.06); }
/* 鼠标框选矩形 */
.marquee {
  position: fixed; z-index: 500; pointer-events: none;
  border: 1px solid rgba(0,120,212,.9); background: rgba(0,120,212,.14); border-radius: 2px;
}
.item-ico { position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; }
.item-svg :deep(svg) { width: 44px; height: 44px; }
/* 可调用文件夹角标 */
.callable-badge {
  position: absolute; right: -4px; top: -4px;
  width: 16px; height: 16px; line-height: 15px;
  font-size: 10px; text-align: center;
  background: #0a8f4f; color: #fff;
  border-radius: 50%; border: 1.5px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.25);
  pointer-events: none;
}
.item-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }
.item-name { font-size: 12px; text-align: center; line-height: 1.3; word-break: break-word; max-height: 32px; overflow: hidden; }
.item-rename { width: 92px; font-size: 12px; text-align: center; border: 1px solid var(--accent-color, #0067c0); border-radius: 3px; padding: 2px 3px; outline: none; }

/* 目录内"生成中"模拟瓦片 */
.pending-item { position: relative; }
.pending-item .item-ico { position: relative; }
.pending-tile {
  position: relative; width: 56px; height: 56px; border-radius: 6px; overflow: hidden;
  background: #4b4b52; box-shadow: 0 2px 8px rgba(0,0,0,.3);
}
.pending-fill {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0;
  background: linear-gradient(180deg, #6ca8ff, #2f6fd6);
  transition: height .5s ease;
}
/* 运行时的流光：暂停时静止，继续后从原处接着走 */
.pending-sweep {
  position: absolute; left: -60%; top: 0; bottom: 0; width: 60%;
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.28), rgba(255,255,255,0));
  animation: pending-sweep 1.6s linear infinite;
  animation-play-state: paused;
  opacity: 0;
}
.pending-item.st-running .pending-sweep { animation-play-state: running; opacity: 1; }
@keyframes pending-sweep { from { left: -60%; } to { left: 100%; } }
.pending-spin {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,.9);
}
.pending-spin :deep(svg) { width: 22px; height: 22px; animation: pending-spin 1.1s linear infinite; }
@keyframes pending-spin { to { transform: rotate(360deg) } }
/* 暂停/排队：整体去饱和，一眼区分 */
.pending-item.st-paused .pending-tile, .pending-item.st-queued .pending-tile { filter: saturate(.45); }
.pending-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.92); }
.pending-state :deep(svg) { width: 20px; height: 20px; }
/* 瓦片上的暂停/继续按钮（任务记录可操作） */
.pending-ctl {
  position: absolute; top: 4px; right: 6px; width: 22px; height: 22px;
  border: none; border-radius: 5px; cursor: pointer; z-index: 2;
  background: rgba(0,0,0,.45); color: #fff;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .12s ease;
}
.pending-item:hover .pending-ctl { opacity: 1; }
.pending-ctl:hover { background: rgba(0,120,212,.85); }
.pending-ctl.go { background: rgba(46,204,113,.85); }
.pending-ctl :deep(svg) { width: 13px; height: 13px; }
.pending-tag { color: #0078d4; font-weight: 600; }

/* 确认 / 输入对话框 */
.dlg-mask { position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; }
.dlg { width: 380px; max-width: 86vw; background: var(--bg-surface, #fff); border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,.35); padding: 16px 18px; color: var(--text-primary, #1f2937); }
.dlg-title { font-size: 14.5px; font-weight: 600; margin-bottom: 8px; }
.dlg-text { font-size: 13px; line-height: 1.6; color: var(--text-secondary, #555); white-space: pre-wrap; margin-bottom: 10px; }
.dlg-input { width: 100%; box-sizing: border-box; border: 1px solid var(--border-color, #d1d5db); border-radius: 6px; padding: 7px 10px; font-size: 13px; outline: none; margin-bottom: 12px; }
.dlg-input:focus { border-color: var(--accent-color, #0067c0); }
.dlg-btns { display: flex; justify-content: flex-end; gap: 8px; }
.dlg-btn { border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); border-radius: 6px; padding: 6px 16px; font-size: 13px; cursor: pointer; }
.dlg-btn:hover { background: rgba(0,0,0,.05); }
.dlg-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }
.dlg-btn.primary:hover { filter: brightness(1.08); }

/* 粘贴冲突对话框（Windows「替换或跳过文件」风格） */
.cfl-dlg { width: 520px; max-width: 92vw; max-height: 82vh; display: flex; flex-direction: column; }
.cfl-list { flex: 1; overflow-y: auto; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; background: var(--bg-secondary, #fafafa); }
.cfl-item { padding: 10px 12px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.cfl-item:last-child { border-bottom: none; }
.cfl-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.cfl-name { font-size: 13px; font-weight: 600; word-break: break-all; }
.cfl-kind { font-size: 11.5px; color: var(--text-secondary, #6b7280); }
.cfl-rows { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.cfl-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary, #555); }
.cfl-tag { flex: none; width: 34px; text-align: center; font-size: 11px; border-radius: 4px; padding: 1px 0; color: #fff; }
.cfl-tag.src { background: var(--accent-color, #0067c0); }
.cfl-tag.dst { background: #8a8a8a; }
.cfl-f { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfl-s { flex: none; width: 62px; text-align: right; }
.cfl-d { flex: none; width: 108px; text-align: right; font-size: 11.5px; }
.cfl-choose { display: flex; flex-direction: column; gap: 4px; padding-left: 2px; }
.cfl-radio { display: flex; align-items: center; gap: 6px; font-size: 12.5px; cursor: pointer; }
.cfl-radio em { font-style: normal; color: var(--text-secondary, #6b7280); font-size: 11.5px; }
.cfl-follow { font-size: 12px; color: var(--text-secondary, #6b7280); padding-left: 2px; }
.cfl-all { display: flex; align-items: center; gap: 6px; margin: 10px 0 2px; font-size: 12.5px; cursor: pointer; }

.ex-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ex-table th { text-align: left; padding: 6px 10px; color: var(--text-muted, #999); font-weight: 600; border-bottom: 1px solid var(--border-color, #e5e7eb); position: sticky; top: 0; background: var(--bg-surface, #fff); }
.ex-table td { padding: 6px 10px; border-bottom: 1px solid #f0f0f0; cursor: default; }
.ex-table tr.sel td { background: rgba(0,103,192,.14); }
.ex-table tr.drop td { background: rgba(0,120,212,.18); border-top: 2px solid #0078d4; border-bottom: 2px solid #0078d4; }
.td-name { display: flex; align-items: center; gap: 8px; }
.row-rename { flex: 1; min-width: 0; font-size: 12.5px; border: 1px solid var(--accent-color, #0067c0); border-radius: 3px; padding: 2px 5px; outline: none; }
.td-ico :deep(svg) { width: 18px; height: 18px; }

.ex-status { height: 28px; flex: 0 0 28px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-top: 1px solid var(--border-color, #e5e7eb); font-size: 11.5px; color: var(--text-muted, #888); background: rgba(0,0,0,.02); }
.st-spacer { flex: 1; }
.st-readonly { color: #b45309; }

/* 右键菜单 */
.ctx-menu { position: fixed; z-index: 99999; min-width: 200px; background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #d1d5db); border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,.28); padding: 5px; color: var(--text-primary, #1f2937); }
.ctx-item { position: relative; display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 5px; cursor: pointer; font-size: 13px; }
.ctx-item:hover:not(.disabled) { background: rgba(0,103,192,.12); }
.ctx-item.disabled { opacity: .4; cursor: default; }
.ctx-ico :deep(svg) { width: 16px; height: 16px; }
.ctx-label { flex: 1; }
.ctx-short { font-size: 11px; color: var(--text-muted, #999); }
.ctx-arrow :deep(svg) { width: 11px; height: 11px; opacity: .5; }
.ctx-sep { height: 1px; background: var(--border-color, #eee); margin: 4px 6px; }
.ctx-sub { position: absolute; min-width: 160px; background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #d1d5db); border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,.28); padding: 5px; }
</style>
