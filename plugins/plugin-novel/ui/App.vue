<template>
  <div class="nov">
    <!-- 顶部：文件名 + 书名/作者 + 模式切换 + 保存 -->
    <div class="nov-top">
      <button
        class="nv-tb-btn"
        :class="{ on: tocOpen }"
        :title="tocOpen ? '收起目录' : '展开目录'"
        @click="tocOpen = !tocOpen"
      ><span v-html="icon('sidebar')" /></button>
      <span class="nov-file-ico" v-html="icon('novel')" />
      <input
        v-model="fileName"
        class="nov-file-name"
        placeholder="未命名小说.novel"
        spellcheck="false"
        @input="onAnyInput"
        @keydown.enter.prevent="save"
      />
      <span class="nov-divider" />
      <input v-model="novel.title" class="nov-title" placeholder="书名" @input="onAnyInput" />
      <input v-model="novel.author" class="nov-author" placeholder="作者" @input="onAnyInput" />
      <div class="nov-modes">
        <button :class="!reading ? 'nv-mode active' : 'nv-mode'" @click="exitReading" title="编辑模式">编辑</button>
        <button :class="reading ? 'nv-mode active' : 'nv-mode'" @click="enterReading" title="阅读模式">阅读</button>
      </div>
      <button class="nov-save" :class="dirty ? 'dirty' : ''" :disabled="saving" @click="save" title="保存 (Ctrl+S)">
        {{ fileId ? '保存' : '保存到…' }}
      </button>
      <button v-if="fileId" class="nov-save-as" :disabled="saving" @click="saveAsNew" title="另存为">另存为…</button>
      <span v-if="dirty" class="nov-dirty" title="未保存">●</span>
    </div>

    <div class="nov-body">
      <!-- 左侧：目录（可折叠） -->
      <aside v-show="tocOpen" class="nov-toc">
        <div class="nov-toc-h">
          <span class="nov-toc-h-label">目录</span>
          <button class="nov-toc-add" title="新增章节" @click="addChapter"><span v-html="icon('plus')" /></button>
        </div>
        <div class="nov-toc-list">
          <div
            v-for="(ch, i) in novel.chapters" :key="ch.id"
            :class="ch.id === currentId ? 'nov-toc-item current' : 'nov-toc-item'"
            @click="selectChapter(ch.id)"
          >
            <span class="nov-toc-idx">{{ i + 1 }}</span>
            <input
              v-if="editingTocId === ch.id"
              :value="ch.title"
              :ref="(el) => { if (editingTocId === ch.id && el) el.focus(); el && el.select && el.select() }"
              class="nov-toc-edit"
              @click.stop
              @keyup.enter="commitToc(ch, $event)"
              @blur="commitToc(ch, $event)"
            />
            <span v-else class="nov-toc-name" @dblclick.stop="startToc(ch)">{{ ch.title || '未命名章节' }}</span>
            <span class="nov-toc-ops" @click.stop>
              <button title="上移" :disabled="i === 0" @click="moveChapter(i, -1)">▲</button>
              <button title="下移" :disabled="i === novel.chapters.length - 1" @click="moveChapter(i, 1)">▼</button>
              <button title="重命名" @click="startToc(ch)">✎</button>
              <button title="删除" class="danger" @click="removeChapter(ch)">✕</button>
            </span>
          </div>
          <p v-if="!novel.chapters.length" class="nov-toc-empty">还没有章节，点上方 ＋ 新增</p>
        </div>
      </aside>

      <!-- 右侧：编辑 / 阅读 -->
      <section class="nov-main">
        <template v-if="current">
          <!-- 编辑模式 -->
          <div v-if="!reading" class="nov-edit">
            <div class="nov-edit-bar">
              <button title="加粗" @click="fmt('bold')"><b>B</b></button>
              <button title="斜体" @click="fmt('italic')"><i>I</i></button>
              <button title="下划线" @click="fmt('underline')"><u>U</u></button>
              <button title="标题" @click="fmt('formatBlock', 'h2')">H</button>
              <button title="正文" @click="fmt('formatBlock', 'p')">¶</button>
              <button title="无序列表" @click="fmt('insertUnorderedList')">• 列表</button>
              <button title="引用" @click="fmt('formatBlock', 'blockquote')">❝</button>
              <span class="nov-sep" />
              <button title="插入图片（从文件库选择）" @click="openInsert">🖼 图片</button>
              <button title="插入视频（即将开放）" class="nov-vid-btn" disabled>🎬 视频</button>
              <span class="nov-sep" />
              <button title="选中图片后缩小" @click="resizeImage(-10)">－</button>
              <button title="选中图片后放大" @click="resizeImage(10)">＋</button>
              <button title="把选中图片恢复为默认宽度" :disabled="!selPct" @click="resetImgWidth">↺</button>
              <button :title="selectedImgFloat ? '当前并排，点击改为独占一行' : '当前独占一行，点击改为左右并排'" :disabled="!selPct" @click="toggleImgFloat">{{ selectedImgFloat ? '⇕ 竖排' : '⇔ 并排' }}</button>
              <!-- 选中反馈：点了没反应最容易被当成"选不中"，这里把选中状态显式写出来 -->
              <span class="nov-sel-tip" :class="{ on: !!selPct }">
                {{ selPct ? `已选中图片 · 宽 ${selPct}%` : '未选中图片' }}
              </span>
              <span class="nov-ch-name">{{ current.title }}</span>
            </div>
            <div
              ref="editorEl"
              class="nov-editor"
              contenteditable="true"
              @input="onEditorInput"
              @mousedown="onEditorMouseDown"
              @click="onEditorClick"
              @keyup.ctrl.s.prevent="save"
            />
          </div>

          <!-- 阅读模式 -->
          <div v-else class="nov-read">
            <h1 class="nov-read-title">{{ current.title || '未命名章节' }}</h1>
            <div ref="readEl" class="nov-read-body" v-html="current.html" @click="onReadBodyClick" />
            <div class="nov-read-nav">
              <button :disabled="!prevCh" @click="selectChapter(prevCh.id)">← 上一章</button>
              <span class="nov-read-pos">{{ chapterIndex + 1 }} / {{ novel.chapters.length }}</span>
              <button :disabled="!nextCh" @click="selectChapter(nextCh.id)">下一章 →</button>
            </div>
          </div>
        </template>
        <p v-else class="nov-empty">请选择或新增一个章节</p>
      </section>
    </div>

    <!-- 阅读模式点击小图查看大图（调取图片查看器） -->
    <ImageViewer
      :visible="viewerVisible"
      :src="viewerSrc"
      :images="viewerImages"
      :current-index="viewerIndex"
      @update:visible="(v) => (viewerVisible = v)"
    />

    <!-- 保存 / 另存为弹窗 -->
    <div v-if="saveOpen" class="nov-mask" @click.self="saveOpen = false">
      <div class="nov-dlg">
        <div class="nov-dlg-title">{{ fileId && !asNew ? '保存' : '另存为' }}</div>
        <label class="nov-field">
          <span>文件名</span>
          <input v-model="fileName" class="nov-inp" spellcheck="false" placeholder="未命名小说.novel" />
        </label>
        <label class="nov-field">
          <span>保存到</span>
          <select v-model="saveCatId" class="nov-inp" @change="saveFolderId = null">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="nov-field">
          <span>文件夹</span>
          <select v-model="saveFolderId" class="nov-inp">
            <option :value="null">（盘符根目录）</option>
            <option v-for="f in foldersInCat" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <div class="nov-dlg-foot">
          <button class="nov-btn" @click="saveOpen = false">取消</button>
          <button class="nov-btn primary" :disabled="saving" @click="doSaveTo">保存</button>
        </div>
      </div>
    </div>

    <!-- 插入图片：文件库目录选择器 -->
    <div v-if="insertOpen" class="nov-mask" @click.self="insertOpen = false">
      <div class="nov-picker">
        <div class="nov-picker-h">
          <span>插入图片 — 从文件库选择</span>
          <button class="nov-modal-x" @click="insertOpen = false">✕</button>
        </div>
        <div class="nov-picker-body">
          <!-- 左：目录树 -->
          <div class="nov-picker-tree">
            <div
              v-for="node in treeNodes" :key="node.key"
              :class="pickerFolder === node.key ? 'nv-tree-item active' : 'nv-tree-item'"
              :style="{ paddingLeft: 8 + node.depth * 14 + 'px' }"
              @click="onTreeNodeClick(node)"
            >
              <span v-if="node.expandable" class="nv-arrow" @click.stop="toggleExpand(node.key)">
                {{ expanded[node.key] ? '▾' : '▸' }}
              </span>
              <span v-else class="nv-arrow nv-arrow-blank" />
              <span class="nv-tree-label">{{ node.label }}</span>
            </div>
          </div>
          <!-- 右：图片网格 -->
          <div class="nov-picker-files">
            <div v-if="pickerLoading" class="nov-picker-tip">加载中…</div>
            <div v-else-if="!pickerFiles.length" class="nov-picker-tip">当前目录下没有图片文件</div>
            <div v-else class="nv-grid">
              <div
                v-for="img in pickerFiles" :key="img.id"
                :class="selectedPickerId === img.id ? 'nv-cell active' : 'nv-cell'"
                @click="selectedPickerId = img.id"
                @dblclick="confirmInsert"
              >
                <img v-if="img.show" :src="img.show" />
                <div v-else class="nv-cell-loading"><span class="nv-spin" /></div>
                <span class="nv-cell-name" :title="img.name">{{ img.name }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="nov-picker-foot">
          <span class="nv-pick-count">{{ selectedPickerFile ? '已选：' + selectedPickerFile.name : '未选择（单击选中，双击直接插入）' }}</span>
          <button class="nov-btn" @click="insertOpen = false">取消</button>
          <button class="nov-btn primary" :disabled="!selectedPickerId" @click="confirmInsert">插入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { apiClient } from '@/services/api'
import { useVfs } from '@/shell/vfs'
import { useToast } from '@/shell/toast'
import { icon } from '@/shell/icons'
import ImageViewer from '@/components/ui/ImageViewer.vue'

const props = defineProps({
  fileId: { type: [String, Number], default: null },
  content: { type: String, default: '' },
  title: { type: String, default: '小说' },
})
const emit = defineEmits(['set-title'])

const vfs = useVfs()
const toast = useToast()

const novel = reactive({ v: 1, title: '未命名小说', author: '', chapters: [] })
const fileId = ref(props.fileId ?? null)
const fileName = ref(props.title && props.title !== '小说' ? props.title : '新建小说.novel')
const currentId = ref(null)
const reading = ref(false)
const dirty = ref(false)
const saving = ref(false)
const editingTocId = ref(null)
const tocOpen = ref(true)
const editorEl = ref(null)
const readEl = ref(null)
// 阅读模式点击小图查看大图
const viewerVisible = ref(false)
const viewerSrc = ref('')
const viewerImages = ref([])
const viewerIndex = ref(-1)
async function openViewer(fid) {
  if (!fid) return
  let url = ''
  try { url = await apiClient.getFileLibraryFileBlobUrl(fid) } catch (e) {}
  // 大图取不到（本机缺失/其它电脑生成的）就退回缩略图放大显示，至少能看清
  if (!url) { try { url = await apiClient.getFileLibraryThumbnail(fid) || '' } catch (e) {} }
  if (!url) { toast.show('该图片在本机没有可查看的原图', 'info'); return }
  viewerImages.value = [url]
  viewerIndex.value = 0
  viewerSrc.value = url
  viewerVisible.value = true
}
function onReadBodyClick(e) {
  const img = pickImg(e.target)
  if (img && img.getAttribute('data-fid')) openViewer(img.getAttribute('data-fid'))
}
let folderId = null
let saveTimer = null
const resolvedFids = new Set()

// 资源管理器里的 item.id 带 fil:/fld: 前缀，而写接口只认纯数字 ID。
// 若直接把 'fil:123' 丢进去，Number() 得到 NaN，后端 WHERE id=? 匹配不到行返回失败，
// 前端却收不到异常 → 出现「点了保存、提示已保存、内容却没变」的假成功。
function numericId(v) {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  const core = s.replace(/^(?:fil|fld):/i, '')
  const n = Number(core)
  return Number.isInteger(n) && n > 0 ? n : null
}

// 把编辑器当前内容同步进章节对象：
// 同时剥掉只为 UI 服务的标记（选中框 / 绑定标记）和必然失效的 blob 图片地址
// （留下 data-fid，下次打开时重新按文件库取图），避免脏数据和死链写进数据库。
function snapEditorHtml() {
  if (!current.value || !editorEl.value || reading.value) return false
  const box = document.createElement('div')
  box.innerHTML = editorEl.value.innerHTML
  // 编辑器还没灌进内容时是空的，此时保存会把整章正文清空 —— 宁可不存，也不能存成空白
  if (!box.innerHTML.trim() && String(current.value.html || '').trim()) return false
  box.querySelectorAll('[data-nv-bound]').forEach((n) => n.removeAttribute('data-nv-bound'))
  box.querySelectorAll('.nv-img-sel').forEach((n) => n.classList.remove('nv-img-sel'))
  // AI 文字编辑的灰色预览只是"待确认"内容，采纳/取消前不能被保存进章节正文
  box.querySelectorAll('[data-ai-ghost]').forEach((n) => n.remove())
  box.querySelectorAll('img[data-fid]').forEach((n) => { n.removeAttribute('src'); n.removeAttribute('srcset') })
  current.value.html = box.innerHTML
  return true
}

// ---------- 保存 / 另存为 ----------
const saveOpen = ref(false)
const asNew = ref(false)
const categories = ref([])
const allFolders = ref([])
const saveCatId = ref(null)
const saveFolderId = ref(null)
const foldersInCat = computed(() =>
  allFolders.value.filter((f) => Number(f.category_id || 0) === Number(saveCatId.value || 0))
)

// ---------- 图片选择器状态 ----------
const insertOpen = ref(false)
const pickerFolder = ref('root')            // 'root' | 'cat:<id>' | '<folderId>'
const pickerFiles = ref([])                 // [{id, name, show}]
const pickerLoading = ref(false)
const selectedPickerId = ref(null)
const expanded = reactive({})               // 树节点展开状态
let pickToken = 0                           // 防止快速切换目录时旧结果覆盖新结果
const mainCatId = ref(null)
// 记住上次插入图片时选择的目录（盘符/文件夹），下次打开选择器直接定位，省得每次从 C 盘找
const PICK_DIR_KEY = 'nv_last_pick_dir'
function savePickDir() { try { if (pickerFolder.value) localStorage.setItem(PICK_DIR_KEY, pickerFolder.value) } catch {} }
function loadPickDir() { try { return localStorage.getItem(PICK_DIR_KEY) || null } catch { return null } }

const selectedPickerFile = computed(() => pickerFiles.value.find((x) => x.id === selectedPickerId.value) || null)

const current = computed(() => novel.chapters.find((c) => c.id === currentId.value) || null)
const chapterIndex = computed(() => novel.chapters.findIndex((c) => c.id === currentId.value))
const prevCh = computed(() => (chapterIndex.value > 0 ? novel.chapters[chapterIndex.value - 1] : null))
const nextCh = computed(() => (chapterIndex.value < novel.chapters.length - 1 ? novel.chapters[chapterIndex.value + 1] : null))

// ---------- 目录树：总库 + 各盘符，下面挂各自的多级文件夹 ----------
const treeNodes = computed(() => {
  const out = []
  const folders = allFolders.value
  const byParent = new Map()
  for (const f of folders) {
    const p = f.parent_id == null ? '@root:' + f.category_id : 'f' + f.parent_id
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(f)
  }
  const pushFolderLevel = (parentId, catId, depth) => {
    const kids = byParent.get(parentId == null ? '@root:' + catId : 'f' + parentId) || []
    for (const f of kids) {
      const key = 'f' + f.id
      const hasKids = byParent.has('f' + f.id)
      out.push({ key, label: f.name, depth, expandable: hasKids, folderId: f.id })
      if (hasKids && expanded[key]) pushFolderLevel(f.id, catId, depth + 1)
    }
  }
  // 总库（用真正的分类名 + 盘符字母，而不是写死的 C:）
  const mainCat = categories.value.find((c) => String(c.id) === String(mainCatId.value)) || null
  out.push({ key: 'root', label: (mainCat ? mainCat.name : '总库') + ' (' + (mainCat ? mainCat.drive_letter : 'C') + ':)', depth: 0, expandable: true, scope: 'root', catId: mainCatId.value })
  if (expanded['root'] && mainCatId.value != null) pushFolderLevel(null, mainCatId.value, 1)
  // 其它盘符：显示「盘符字母: 名称」（如 D: 图片库），不再显示成「名称 (盘符)」二字
  for (const c of categories.value) {
    if (mainCatId.value != null && String(c.id) === String(mainCatId.value)) continue
    const key = 'cat:' + c.id
    out.push({ key, label: (c.drive_letter || '?') + ': ' + c.name, depth: 0, expandable: true, scope: key, catId: c.id })
    if (expanded[key]) pushFolderLevel(null, c.id, 1)
  }
  return out
})

function toggleExpand(key) { expanded[key] = !expanded[key] }
function onTreeNodeClick(node) {
  expanded[node.key] = true
  pickerFolder.value = node.scope ? node.scope : String(node.folderId)
  savePickDir()
  loadPickerFiles()
}

// ---------- 选择器数据加载 ----------
async function openInsert() {
  insertOpen.value = true
  selectedPickerId.value = null
  pickerFiles.value = []
  try {
    if (!categories.value.length) categories.value = await apiClient.getFileLibraryCategories() || []
    if (!allFolders.value.length) allFolders.value = await apiClient.getFileLibraryFolders({ parent_id: 'all' }) || []
    if (mainCatId.value == null) {
      const sys = categories.value.find((c) => c.is_system === 1 && c.name === '总库') || categories.value.find((c) => c.is_system === 1)
      mainCatId.value = sys ? sys.id : (categories.value[0] ? categories.value[0].id : null)
    }
    // 默认展开总库；优先恢复上次插入图片时选择的目录，其次定位到小说所在文件夹，最后退回总库
    expanded['root'] = true
    let located = false
    const saved = loadPickDir()
    if (saved && /^(root|cat:\d+|\d+)$/.test(saved)) {
      pickerFolder.value = saved
      located = true
      expanded[saved.startsWith('cat:') ? saved : 'f' + saved] = true
      if (/^\d+$/.test(saved)) {
        let cur = allFolders.value.find((x) => String(x.id) === saved)
        while (cur) { expanded['f' + cur.id] = true; cur = allFolders.value.find((x) => x.id === cur.parent_id) }
      }
    }
    if (!located && folderId) {
      const f = allFolders.value.find((x) => String(x.id) === String(folderId))
      if (f) {
        let cur = f
        while (cur) {
          expanded['f' + cur.id] = true
          cur = allFolders.value.find((x) => x.id === cur.parent_id)
        }
        pickerFolder.value = String(folderId)
        located = true
      }
    }
    if (!located) pickerFolder.value = 'root'
    loadPickerFiles()
  } catch (e) {
    toast.show('目录加载失败：' + (e.message || e), 'error')
  }
}

async function loadPickerFiles() {
  const token = ++pickToken
  pickerLoading.value = true
  pickerFiles.value = []
  selectedPickerId.value = null
  try {
    const items = await vfs.listFl(pickerFolder.value)
    if (token !== pickToken) return
    const imgs = items.filter((x) => x.kind === 'file' && x.fileType === 'image')
    pickerFiles.value = imgs.map((x) => ({ id: x.fileId, name: x.name, show: x.thumb || '' }))
    // 缩略图懒加载：先用库内缩略图，没有再拉原图 blob（4 并发，防一次打爆）
    const queue = pickerFiles.value.filter((im) => !im.show)
    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        if (token !== pickToken) return
        const im = queue[cursor++]
        let show = ''
        try { show = await apiClient.getFileLibraryThumbnail(im.id) } catch (e) {}
        if (!show) { try { show = await apiClient.getFileLibraryFileBlobUrl(im.id) } catch (e) {} }
        if (token !== pickToken) return
        im.show = show || ''
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
  } catch (e) {
    if (token === pickToken) pickerFiles.value = []
  } finally {
    if (token === pickToken) pickerLoading.value = false
  }
}

function confirmInsert() {
  const f = selectedPickerFile.value
  if (!f) { toast.show('请先选择一张图片', 'info'); return }
  savePickDir()
  embedImage(f.id, f.name)
  insertOpen.value = false
}

function embedImage(fid, name) {
  // 默认宽度 55% 且左浮动：多张小图会自动左右并排（缩小到 ~45% 以下即两列），
  // 想独占一行可用工具栏的「图片排列」按钮切换。宽度/浮动样式都随正文一起保存。
  const safeName = String(name || '图片').replace(/"/g, '')
  // 先不写 src（空 src 会被浏览器当成坏图），取到 blob 再回填
  const html = `<img data-fid="${fid}" alt="${safeName}" style="width:55%;height:auto;border-radius:6px;margin:6px 10px 6px 0;float:left;">`
  if (editorEl.value) {
    editorEl.value.focus()
    document.execCommand('insertHTML', false, html)
    nextTick(() => { resolveImages(editorEl.value); markSelection() })
  }
  onAnyInput()
}

// ---------- 编辑 / 阅读渲染 ----------
function loadEditor() {
  if (!editorEl.value || !current.value) return
  // 章节换了，旧的选中节点会跟着 innerHTML 一起被替换掉；
  // 不清空的话 selectedImg 指向一个已脱离 DOM 的图片，按 +/- 时"没反应"。
  clearImgSelection()
  editorEl.value.innerHTML = current.value.html || ''
  resolveImages(editorEl.value)
  markSelection()
}
function loadReader() {
  if (!readEl.value || !current.value) return
  readEl.value.innerHTML = current.value.html || ''
  resolveImages(readEl.value)
}
// 把编辑器里的内容写回章节对象。
// 编辑区是 v-if 渲染的：切回编辑模式时 DOM 是个全新的空盒子，
// 此时若把「空」写回章节，就等于把稿子抹掉（表现就是：点一下模式切换，内容全没了）。
// 所以凡是要把编辑器内容回写的场合，一律走这里做空值保护。
function syncEditorBack() {
  if (!current.value || !editorEl.value || reading.value) return false
  const html = editorEl.value.innerHTML || ''
  if (!html.trim() && String(current.value.html || '').trim()) return false // 空盒子，不回写
  current.value.html = html
  return true
}
function enterReading() {
  if (reading.value) return
  syncEditorBack()
  reading.value = true
  nextTick(loadReader)
}
function exitReading() {
  if (!reading.value) return
  reading.value = false
  // 编辑区刚被重建，必须把当前章节的正文重新灌进去，否则看到一片空白
  nextTick(loadEditor)
}

async function resolveImages(root) {
  if (!root) return
  const imgs = root.querySelectorAll('img[data-fid]')
  for (const img of imgs) {
    const fid = img.getAttribute('data-fid')
    if (!fid) continue
    if (resolvedFids.has(fid) && img.src) continue
    let url = ''
    try { url = await apiClient.getFileLibraryFileBlobUrl(fid) } catch (e) {}
    // 大图取不到（比如在别的电脑上生成、原路径已失效）时退回首图缩略图，至少能看见
    if (!url) { try { url = await apiClient.getFileLibraryThumbnail(fid) || '' } catch (e) {} }
    if (url) {
      img.src = url
      resolvedFids.add(fid)
      img.removeAttribute('data-missing')
    } else {
      img.setAttribute('data-missing', '1')
      img.title = '原图不可用（可能是在其它电脑上生成的，磁盘路径已失效）'
    }
  }
}

// 点击图片选中（蓝框），+/- 调整宽度；selPct 用于把选中状态显式显示在工具栏
let selectedImg = null
const selPct = ref(0)
const selectedImgFloat = ref(true) // 选中图片当前是否为「左右并排」状态（用于工具栏按钮）
// 选中改成「事件委托」（见 onEditorClick）。
// 旧写法给每张图打 dataset.nvBound='1' 做去重标记，但这个标记会随 innerHTML 一起存进库里；
// 下次加载时图片带着 data-nv-bound="1" 复活、addEventListener 却不会被序列化，
// 于是这里判断「已绑定」直接 return —— 监听器永远不再挂上去，图片就点不中也无法缩放。
function markSelection() {
  if (!editorEl.value) return
  // 顺手清掉历史数据里残留的绑定标记，防止脏标记再被存回去
  editorEl.value.querySelectorAll('img[data-nv-bound]').forEach((img) => img.removeAttribute('data-nv-bound'))
}
function clearImgSelection() {
  if (selectedImg) selectedImg.classList.remove('nv-img-sel')
  selectedImg = null
  selPct.value = 0
}
function selectImg(img) {
  selectedImg = img
  editorEl.value.querySelectorAll('img').forEach((x) => x.classList.remove('nv-img-sel'))
  img.classList.add('nv-img-sel')
  selPct.value = widthPctOf(img)
  // 记录当前图片是「并排(float:left)」还是「独占一行(float:none)」，用于工具栏按钮状态
  selectedImgFloat.value = String(img.style.float || 'none').toLowerCase().includes('left')
}
// 图片当前宽度占编辑区的百分比（优先读内联 style，其次按实际渲染宽度算）
function widthPctOf(img) {
  const m = String(img.style.width || '').match(/^([\d.]+)%$/)
  if (m) return Math.round(Number(m[1]))
  const parent = editorEl.value ? editorEl.value.clientWidth || 800 : 800
  return Math.max(1, Math.min(100, Math.round(((img.clientWidth || parent * 0.55) / parent) * 100)))
}
function onEditorInput() {
  onAnyInput()
  markSelection() // 粘贴 / 新插入的图片也要能点中
}
function onEditorMouseDown(e) {
  // 图片有时被包在 span/a 里，命中不了 e.target → 往上找最近的 IMG
  const img = pickImg(e.target)
  if (img) selectImg(img)
}
function pickImg(node) {
  let cur = node
  while (cur && cur !== editorEl.value) {
    if (cur && cur.tagName === 'IMG') return cur
    cur = cur.parentElement
  }
  return null
}
function onEditorClick(e) {
  // 事件委托：刚插入的、粘贴进来的、从数据库读出来的图片都能被点中。
  // 老写法给每张图挂独立 listener 并用 dataset 去重，而 dataset 会随 innerHTML 存进库里，
  // 下次加载标记还在、listener 却没了 → 判定「已绑定」直接跳过，永远点不中。
  const img = pickImg(e.target)
  if (img) { selectImg(img); return }
  if (e.target === editorEl.value) clearImgSelection()
}
function resizeImage(delta) {
  if (!selectedImg) { toast.show('请先单击选中一张图片', 'info'); return }
  const parentW = editorEl.value ? editorEl.value.clientWidth || 800 : 800
  const curW = selectedImg.clientWidth || parentW * 0.55
  let pct = Math.round((curW / parentW) * 100) + delta
  pct = Math.max(15, Math.min(100, pct))
  selectedImg.style.width = pct + '%'
  selectedImg.style.height = 'auto'
  selPct.value = pct
  onAnyInput()
}
function resetImgWidth() {
  if (!selectedImg) return
  selectedImg.style.width = '55%'
  selectedImg.style.height = 'auto'
  selPct.value = 55
  onAnyInput()
}
// 切换选中图片的排列：并排(float:left) ↔ 独占一行(float:none)
function toggleImgFloat() {
  if (!selectedImg) { toast.show('请先单击选中一张图片', 'info'); return }
  const nowLeft = String(selectedImg.style.float || 'none').toLowerCase().includes('left')
  if (nowLeft) {
    selectedImg.style.float = 'none'
    selectedImg.style.margin = '8px 0'
    selectedImgFloat.value = false
  } else {
    selectedImg.style.float = 'left'
    selectedImg.style.margin = '6px 10px 6px 0'
    selectedImgFloat.value = true
  }
  onAnyInput()
}

// ---------- 章节操作 ----------
function addChapter() {
  const ch = { id: 'c' + Date.now() + Math.floor(Math.random() * 999), title: '第' + (novel.chapters.length + 1) + '章', html: '' }
  novel.chapters.push(ch)
  selectChapter(ch.id)
  onAnyInput()
}
function removeChapter(ch) {
  const i = novel.chapters.findIndex((c) => c.id === ch.id)
  if (i < 0) return
  if (novel.chapters.length === 1) { novel.chapters = [{ id: ch.id, title: '第1章', html: '' }]; currentId.value = ch.id; onAnyInput(); return }
  novel.chapters.splice(i, 1)
  if (currentId.value === ch.id) currentId.value = novel.chapters[Math.max(0, i - 1)].id
  nextTick(() => { if (!reading.value) loadEditor(); else loadReader() })
  onAnyInput()
}
function moveChapter(i, dir) {
  const j = i + dir
  if (j < 0 || j >= novel.chapters.length) return
  const arr = novel.chapters
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  onAnyInput()
}
function startToc(ch) { editingTocId.value = ch.id }
// 把输入框里的值真正写回章节标题（旧实现只关闭了输入框，导致改名永远不生效）
function commitToc(ch, ev) {
  const v = ev && ev.target ? String(ev.target.value || '').trim() : ''
  if (v) ch.title = v
  editingTocId.value = null
  onAnyInput()
}

async function selectChapter(id) {
  if (id === currentId.value) return
  syncEditorBack() // 切章前先把当前正文收回来（带空值保护，不会把稿子抹掉）
  currentId.value = id
  await nextTick()
  if (!reading.value) loadEditor()
  else loadReader()
}

function fmt(cmd, val) {
  editorEl.value?.focus()
  document.execCommand(cmd, false, val || null)
  onAnyInput()
}

// ---------- 加载 ----------
function parse(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    if (o && Array.isArray(o.chapters)) return o
  } catch (e) {}
  // 空白文件：书名留空，只显示 placeholder「书名」。
  // 旧实现会把文件名（如「新建小说.novel」）填成书名，于是顶部凭空多出一个写着「新建小说」的输入框。
  return { v: 1, title: '', author: '', chapters: [] }
}

function updateTitle() {
  emit('set-title', (fileName.value || '新建小说.novel') + (dirty.value ? ' *' : ''))
}

async function load() {
  let raw = props.content
  try {
    const detail = await apiClient.getFileLibraryFileById(fileId.value)
    if (detail) {
      if (!raw && detail.content) raw = detail.content
      folderId = detail.folder_id ?? detail.folderId ?? folderId
      if (detail.name) fileName.value = detail.name
    }
  } catch (e) {}
  const data = parse(raw)
  novel.title = data.title || ''
  novel.author = data.author || ''
  novel.chapters = data.chapters && data.chapters.length
    ? data.chapters.map((c) => ({ id: c.id || 'c' + Math.random().toString(36).slice(2, 8), title: c.title || '', html: c.html || '' }))
    : [{ id: 'c' + Date.now(), title: '第1章', html: '' }]
  currentId.value = novel.chapters[0]?.id || null
  dirty.value = false
  updateTitle()
  await nextTick()
  if (!reading.value) loadEditor()
  else loadReader()
  // 预取保存弹窗需要的目录数据
  try {
    categories.value = await apiClient.getFileLibraryCategories() || []
    allFolders.value = await apiClient.getFileLibraryFolders({ parent_id: 'all' }) || []
    if (!saveCatId.value && categories.value.length) {
      const sys = categories.value.find((c) => c.is_system === 1 && c.name === '总库') || categories.value[0]
      saveCatId.value = sys ? sys.id : null
    }
    if (folderId) {
      const f = allFolders.value.find((x) => String(x.id) === String(folderId))
      if (f) { saveCatId.value = f.category_id; saveFolderId.value = f.id }
    }
  } catch (e) {}
}

// ---------- 保存 ----------
function onAnyInput() {
  dirty.value = true
  updateTitle()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 1500)
}

async function save() {
  if (saving.value) return
  if (!numericId(fileId.value) || asNew.value) { openSaveTo(asNew.value); return }
  await writeBack()
}
async function writeBack() {
  if (!fileName.value.trim()) { toast.show('文件名不能为空', 'error'); return }
  const id = numericId(fileId.value)
  if (!id) { openSaveTo(asNew.value); return }
  saving.value = true
  try {
    snapEditorHtml()
    const payload = JSON.stringify({ v: 1, title: novel.title, author: novel.author, chapters: novel.chapters })
    // 直接调 request 以便拿到后端结果：旧写法用 updateFileLibraryFile()，
    // 它在失败时只返回 null（不抛错），于是下面照样弹"已保存"——假成功。
    const res = await apiClient.request('PUT', `/api/file-library-files/${id}`, { name: fileName.value.trim(), content: payload })
    if (!res || res.success === false) throw new Error((res && res.message) || '后端未返回成功结果')
    dirty.value = false
    updateTitle()
    toast.show('已保存', 'success')
    window.dispatchEvent(new CustomEvent('fl-files-changed', { detail: { sender: 'novel' } }))
  } catch (e) {
    dirty.value = true
    toast.show('保存失败：' + (e.message || e), 'error')
  } finally {
    saving.value = false
  }
}
function openSaveTo(isAsNew = false) {
  asNew.value = isAsNew
  if (isAsNew) saveFolderId.value = null
  saveOpen.value = true
}
async function doSaveTo() {
  if (!fileName.value.trim()) { toast.show('请填写文件名', 'error'); return }
  saving.value = true
  try {
    if (current.value && editorEl.value && !reading.value) snapEditorHtml()
    const payload = JSON.stringify({ v: 1, title: novel.title, author: novel.author, chapters: novel.chapters })
    const r = await apiClient.createFileLibraryFile({
      name: fileName.value.trim(),
      content: payload,
      file_type: 'novel',
      category_id: Number(saveCatId.value) || 0,
      folder_id: saveFolderId.value ?? null,
    })
    if (!r || !r.id) throw new Error('后端未返回新建文件')
    fileId.value = r.id
    folderId = saveFolderId.value
    asNew.value = false
    dirty.value = false
    saveOpen.value = false
    updateTitle()
    toast.show('已保存', 'success')
    window.dispatchEvent(new CustomEvent('fl-files-changed', { detail: { sender: 'novel' } }))
  } catch (e) {
    toast.show('保存失败：' + (e.message || e), 'error')
  } finally {
    saving.value = false
  }
}
function saveAsNew() { openSaveTo(true) }

watch(() => props.title, (v) => { if (v && v !== '小说') fileName.value = v })

onMounted(load)
onBeforeUnmount(() => { if (saveTimer) { clearTimeout(saveTimer); save() } })
</script>

<style scoped>
.nov { position: relative; display: flex; flex-direction: column; height: 100%; background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); font-size: 14px; overflow: hidden; }

/* ---------- 顶部 ---------- */
.nov-top { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border-color, #e5e7eb); flex-shrink: 0; }
/* 顶部图标按钮：与文件资源管理器工具栏同一套（透明底 + hover + 选中高亮） */
.nv-tb-btn { width: 30px; height: 30px; flex: 0 0 30px; border: none; background: transparent; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary, #555); padding: 0; }
.nv-tb-btn :deep(svg) { width: 16px; height: 16px; }
.nv-tb-btn:hover { background: rgba(0,0,0,.07); }
.nv-tb-btn.on { background: rgba(0,103,192,.14); color: var(--accent-color, #0067c0); }

.nov-file-ico { width: 20px; height: 20px; flex-shrink: 0; display: inline-flex; }
.nov-file-ico :deep(svg) { width: 20px; height: 20px; }
.nov-file-name { flex: 0 1 240px; min-width: 120px; font-size: 13px; font-weight: 600; padding: 5px 9px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-primary, #1f2937); }
.nov-file-name:hover { border-color: var(--border-color, #d1d5db); }
.nov-file-name:focus { outline: none; border-color: var(--accent-color, #0067c0); background: var(--bg-surface, #fff); }
.nov-divider { width: 1px; height: 18px; background: var(--border-color, #e5e7eb); flex-shrink: 0; }
.nov-title { font-size: 15px; font-weight: 700; border: none; border-bottom: 1px dashed transparent; background: transparent; padding: 4px 2px; width: 150px; color: inherit; }
.nov-title:focus { border-bottom-color: #3a8dde; outline: none; }
.nov-author { border: none; border-bottom: 1px dashed transparent; background: transparent; padding: 4px 2px; width: 100px; color: var(--text-muted, #888); }
.nov-author:focus { border-bottom-color: #3a8dde; outline: none; }
.nov-modes { margin-left: auto; display: flex; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.nv-mode { padding: 5px 14px; border: none; background: transparent; cursor: pointer; color: inherit; }
.nv-mode.active { background: #3a8dde; color: #fff; }
.nov-save, .nov-save-as { padding: 5px 12px; border: 1px solid #3a8dde; background: #fff; color: #3a8dde; border-radius: 6px; cursor: pointer; font-size: 13px; flex-shrink: 0; }
.nov-save.dirty { background: #3a8dde; color: #fff; }
.nov-save:disabled, .nov-save-as:disabled { opacity: .5; cursor: default; }
.nov-dirty { color: #d97706; font-size: 11px; flex-shrink: 0; }

/* ---------- 主体 ---------- */
.nov-body { flex: 1; display: flex; min-height: 0; }
.nov-toc { width: 230px; flex: 0 0 230px; border-right: 1px solid var(--border-color, #e5e7eb); overflow: auto; background: rgba(0,0,0,.02); }
/* 目录标题行：左右两端在同一条水平线上，＋ 用图标居中（不再用会偏上的全角字符） */
.nov-toc-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; font-size: 12px; color: var(--text-muted, #888); text-transform: uppercase; letter-spacing: .4px; }
.nov-toc-h-label { line-height: 1; }
.nov-toc-add { width: 24px; height: 24px; flex: 0 0 24px; padding: 0; border: none; border-radius: 5px; background: rgba(0,103,192,.1); color: var(--accent-color, #0067c0); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.nov-toc-add :deep(svg) { width: 14px; height: 14px; }
.nov-toc-add:hover { background: rgba(0,103,192,.22); }
.nov-toc-list { padding: 0 8px 10px; }
.nov-toc-item { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 5px; cursor: pointer; min-width: 0; }
.nov-toc-item:hover { background: rgba(0,0,0,.06); }
.nov-toc-item.current { background: rgba(58,141,222,.14); }
.nov-toc-idx { width: 18px; color: var(--text-muted, #999); font-size: 12px; text-align: right; flex-shrink: 0; }
.nov-toc-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.nov-toc-edit { flex: 1 1 auto; border: 1px solid #3a8dde; border-radius: 4px; padding: 2px 4px; font-size: 13px; min-width: 0; }
/* 操作按钮浮层：hover 时才出现，白底浮在行尾，不挤压章节名 */
.nov-toc-ops { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: none; gap: 2px; padding: 1px 2px; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
.nov-toc-item:hover .nov-toc-ops { display: flex; background: var(--bg-surface, #fff); }
.nov-toc-ops button { border: none; background: rgba(0,0,0,.06); border-radius: 4px; width: 18px; height: 18px; cursor: pointer; font-size: 10px; color: #555; padding: 0; line-height: 1; }
.nov-toc-ops button.danger { color: #c0392b; }
.nov-toc-ops button:disabled { opacity: .35; cursor: default; }
.nov-toc-empty { padding: 16px 12px; color: var(--text-muted, #999); font-size: 12px; }


.nov-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.nov-empty { margin: auto; color: var(--text-muted, #999); }

/* ---------- 编辑 ---------- */
.nov-edit { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.nov-edit-bar { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb); flex-wrap: wrap; flex-shrink: 0; }
.nov-edit-bar button { border: 1px solid var(--border-color, #e5e7eb); background: #fff; border-radius: 5px; padding: 4px 9px; cursor: pointer; color: inherit; font-size: 13px; }
.nov-edit-bar button:hover:not(:disabled) { background: rgba(0,0,0,.05); }
.nov-edit-bar button:disabled { opacity: .5; cursor: default; }
.nov-vid-btn { opacity: .55; }
.nov-sep { width: 1px; height: 18px; background: var(--border-color, #e5e7eb); margin: 0 4px; }
.nov-ch-name { margin-left: auto; color: var(--text-muted, #999); font-size: 12px; }
.nov-sel-tip { font-size: 12px; color: var(--text-muted, #999); padding: 2px 8px; border-radius: 10px; background: rgba(0,0,0,.04); }
.nov-sel-tip.on { color: #fff; background: var(--accent-color, #0067c0); }
/* 注意：编辑器与阅读区的正文是 innerHTML 动态塞进去的（execCommand / 插入图片），
   这些节点不带 Vue 的 scoped 属性 → 必须走 :deep()，否则规则一条都不会命中。
   之前正是因为 .nov-editor img 没生效，图片既没有手型光标也没有蓝框，
   看起来就是「点不中 / 选不上」。 */
.nov-editor { flex: 1; overflow: auto; padding: 24px 32px; outline: none; line-height: 1.9; font-size: 15px; }
.nov-editor :deep(img) { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; cursor: pointer; display: block; }
.nov-editor :deep(img.nv-img-sel) { outline: 2px solid #3a8dde; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(58,141,222,.18); }
.nov-editor :deep(h1), .nov-editor :deep(h2) { font-size: 20px; margin: 18px 0 8px; }
.nov-editor :deep(h3) { font-size: 17px; margin: 16px 0 6px; }
.nov-editor :deep(blockquote) { border-left: 3px solid #cbd5e1; margin: 10px 0; padding: 4px 14px; color: #555; background: rgba(0,0,0,.03); }
.nov-editor :deep(ul), .nov-editor :deep(ol) { padding-left: 24px; margin: 8px 0; }

/* ---------- 阅读 ---------- */
.nov-read { flex: 1; overflow: auto; padding: 32px 18%; }
.nov-read-title { font-size: 24px; text-align: center; margin: 0 0 24px; }
.nov-read-body { line-height: 2; font-size: 17px; font-family: "Noto Serif SC", "Songti SC", serif; }
.nov-read-body :deep(img) { max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; display: block; }
.nov-read-body :deep(h1), .nov-read-body :deep(h2) { font-size: 22px; margin: 22px 0 10px; }
.nov-read-body :deep(blockquote) { border-left: 3px solid #cbd5e1; margin: 12px 0; padding: 4px 14px; color: #555; background: rgba(0,0,0,.03); }
.nov-read-body :deep(ul), .nov-read-body :deep(ol) { padding-left: 24px; margin: 8px 0; }
.nov-read-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--border-color, #e5e7eb); }
.nov-read-nav button { border: 1px solid var(--border-color, #e5e7eb); background: #fff; border-radius: 6px; padding: 7px 16px; cursor: pointer; color: #3a8dde; }
.nov-read-nav button:disabled { color: #bbb; cursor: default; }
.nov-read-pos { color: var(--text-muted, #999); }

/* ---------- 弹窗：absolute 盖住整个应用（窗口内容带 transform 时 fixed 会错位） ---------- */
.nov-mask { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 40; }

/* 保存 / 另存为 */
.nov-dlg { width: 400px; max-width: 92%; background: var(--bg-surface, #fff); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.35); padding: 14px 16px; }
.nov-dlg-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
.nov-field { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12.5px; }
.nov-field > span { width: 56px; flex-shrink: 0; color: var(--text-muted, #888); }
.nov-inp { flex: 1; min-width: 0; font-size: 12.5px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937); }
.nov-inp:focus { outline: none; border-color: var(--accent-color, #0067c0); }
.nov-dlg-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.nov-btn { border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); border-radius: 6px; padding: 5px 14px; font-size: 12.5px; cursor: pointer; color: var(--text-primary, #1f2937); }
.nov-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }
.nov-btn:disabled { opacity: .5; cursor: default; }

/* 图片选择器 */
.nov-picker { width: 760px; max-width: 94%; height: 540px; max-height: 90%; background: var(--bg-surface, #fff); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.35); display: flex; flex-direction: column; overflow: hidden; }
.nov-picker-h { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; font-weight: 700; border-bottom: 1px solid var(--border-color, #e5e7eb); flex-shrink: 0; }
.nov-modal-x { border: none; background: transparent; font-size: 16px; cursor: pointer; color: #888; }
.nov-picker-body { flex: 1; display: flex; min-height: 0; }
.nov-picker-tree { width: 230px; flex: 0 0 230px; border-right: 1px solid var(--border-color, #e5e7eb); overflow: auto; padding: 10px 6px; background: rgba(0,0,0,.02); }
.nv-tree-item { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 5px; cursor: pointer; font-size: 13px; white-space: nowrap; overflow: hidden; }
.nv-tree-item:hover { background: rgba(0,0,0,.06); }
.nv-tree-item.active { background: rgba(58,141,222,.16); color: #2b7fd0; font-weight: 600; }
.nv-arrow { width: 14px; flex-shrink: 0; text-align: center; color: var(--text-muted, #999); font-size: 10px; cursor: pointer; }
.nv-arrow-blank { cursor: default; }
.nv-tree-label { overflow: hidden; text-overflow: ellipsis; }
.nov-picker-files { flex: 1; min-width: 0; padding: 12px; overflow: auto; }
.nov-picker-tip { color: var(--text-muted, #999); font-size: 13px; text-align: center; padding: 60px 0; }
.nv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.nv-cell { border: 2px solid transparent; border-radius: 8px; padding: 5px; cursor: pointer; background: rgba(0,0,0,.03); display: flex; flex-direction: column; gap: 4px; }
.nv-cell:hover { border-color: #9ec9ee; }
.nv-cell.active { border-color: #3a8dde; background: rgba(58,141,222,.1); }
.nv-cell img { width: 100%; height: 90px; object-fit: cover; border-radius: 6px; background: rgba(0,0,0,.05); display: block; }
.nv-cell-loading { width: 100%; height: 90px; border-radius: 6px; background: rgba(0,0,0,.05); display: flex; align-items: center; justify-content: center; }
.nv-spin { width: 18px; height: 18px; border: 2px solid #cbd5e1; border-top-color: #3a8dde; border-radius: 50%; animation: nv-spin 0.8s linear infinite; }
@keyframes nv-spin { to { transform: rotate(360deg); } }
.nv-cell-name { font-size: 11px; color: var(--text-muted, #666); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nov-picker-foot { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--border-color, #e5e7eb); flex-shrink: 0; }
.nv-pick-count { flex: 1; font-size: 12px; color: var(--text-muted, #888); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
