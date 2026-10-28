<template>
  <div class="card function-library">
    <h2>功能库</h2>

    <p class="hint">管理已配置好的功能单元（文生图、图像编辑、图生视频、文生视频、分镜生成、批量推理、文字编辑）。「文字编辑」类功能只做 AI 扩写/续写，在任意可输入文字的地方右键或按住快捷键即可调用</p>

    <!-- 分类栏 -->
    <div class="category-bar">
      <div class="category-tabs">
        <div
          :class="['category-tab', { active: activeCategory === 'all' }]"
          @click="switchCategory('all')"
        >
          <span class="cat-name">全部</span>
          <span class="cat-count">{{ functions.length }}</span>
        </div>
        <div
          :class="['category-tab', { active: activeCategory === 'uncategorized' }]"
          @click="switchCategory('uncategorized')"
        >
          <span class="cat-name">未分类</span>
          <span class="cat-count">{{ uncategorizedCount }}</span>
        </div>
        <div
          v-for="cat in functionCategories"
          :key="cat.id"
          :class="['category-tab', { active: activeCategory === cat.id }]"
          @click="switchCategory(cat.id)"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ getCategoryCount(cat.id) }}</span>
          <span v-if="cat.is_system" class="cat-lock" title="系统固定分类，不可删除 / 重命名">固定</span>
          <span class="cat-actions" @click.stop v-else>
            <button class="cat-action-btn" @click="renameCategory(cat)" title="重命名">改</button>
            <button class="cat-action-btn danger" @click="confirmDeleteCategory(cat)" title="删除">删</button>
          </span>
        </div>
      </div>
      <button class="btn btn-sm" @click="showAddCategory = true">+ 添加分类</button>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-primary" @click="openCreateDialog">+ 新建功能</button>
        <button
          v-if="functions.length > 0"
          class="btn btn-sm"
          @click="toggleSelectAll"
        >{{ isAllSelected ? '取消全选' : '全选' }}</button>
        <span class="btn-divider">|</span>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm"
          @click="openBatchMoveDialog"
        >移动选中 ({{ selectedIds.length }})</button>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm btn-danger"
          @click="confirmBatchDelete"
        >删除选中 ({{ selectedIds.length }})</button>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm"
          @click="batchTestConnection"
        >测试联通</button>
      </div>
      <div class="toolbar-right">
        <input
          type="text"
          class="filter-search"
          v-model="searchKeyword"
          placeholder="搜索功能名..."
        />
      </div>
    </div>

    <!-- 批量测试联通结果 -->
    <div v-if="connectionTestResults.length > 0" class="connection-results">
      <div class="connection-results-header">
        <span>联通测试结果</span>
        <button class="btn-icon-sm" @click="connectionTestResults = []">关闭</button>
      </div>
      <div v-for="r in connectionTestResults" :key="r.id || r.name" class="connection-result-row">
        <span class="conn-name">{{ r.name }}</span>
        <span :class="['conn-status', r.success ? 'success' : 'fail']">{{ r.success ? '成功' : '失败' }}</span>
        <span v-if="!r.success && r.error" class="conn-error">{{ r.error }}</span>
      </div>
    </div>

    <!-- 功能列表 -->
    <div class="entity-list" v-if="filteredFunctions.length > 0">
      <div class="list-header">
        <div class="col-check" @click="toggleSelectAll">
          <div :class="['checkbox', { checked: isAllSelected }]"></div>
        </div>
        <div class="col-name">功能名</div>
        <div class="col-cat">类型</div>
        <div class="col-cat">ComfyUI配置</div>
        <div class="col-cat">工作流</div>
        <div class="col-date">更新时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div v-for="fn in filteredFunctions" :key="fn.id" class="list-row">
        <div class="col-check" @click.stop="toggleSelect(fn.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(fn.id) }]"></div>
        </div>
        <div class="col-name" :title="fn.name" @click="editFunction(fn)">{{ fn.name }}</div>
        <div class="col-cat">{{ getTabName(fn.tab_id) }}</div>
        <div class="col-cat">{{ getComfyuiConfigName(fn) }}</div>
        <div class="col-cat">{{ getWorkflowName(fn) }}</div>
        <div class="col-date">{{ formatDate(fn.updated_at) }}</div>
        <div class="col-actions">
          <button
            :class="['btn-icon-sm', { 'act-on': fn.is_active }]"
            @click="toggleFunctionActive(fn)"
            :title="fn.is_active ? '已激活：出现在右键「用功能库生成」中，点击取消' : '未激活：点击后才会出现在右键「用功能库生成」中'"
          >{{ fn.is_active ? '已激活' : '激活' }}</button>
          <button class="btn-icon-sm" @click="editFunction(fn)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="openMoveDialog(fn)" title="移动">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteFunction(fn)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>暂无功能，点击"新建功能"创建</p>
    </div>

    <!-- 新建/编辑功能对话框 -->
    <FloatingWindow v-model:open="showDialog" :title="editingFunction ? '编辑功能' : '新建功能'" size="large" @close="closeDialog">
      <!-- 功能类型选项卡（样式参考 ComfyUI 配置页面的 .tabs/.tab-item） -->
      <div class="function-type-tabs">
        <div
          v-for="t in tabs"
          :key="t.id"
          class="function-type-tab"
          :class="{ active: editingTabId === t.id }"
          @click="editingTabId = t.id"
        >{{ t.name }}</div>
      </div>

        <!-- 功能编辑表单 -->
        <FunctionEditor :config="editingConfig" :tabId="editingTabId" />

        <!-- 文字编辑：样例测试区 -->
        <div v-if="isTextEditTab" class="text-edit-test">
          <div class="tet-head">样例测试（验证 API 配置与提示词效果，不影响任何文件）</div>
          <textarea
            v-model="textEditTest.input"
            class="tet-input"
            rows="3"
            spellcheck="false"
            placeholder="输入一段测试文本（会作为「选中文本」交给 AI 扩写）"
          ></textarea>
          <div class="tet-actions">
            <button class="btn btn-sm" :disabled="textEditTest.running" @click="runTextEditTest">
              测试<span v-if="textEditTest.running" class="loading"></span>
            </button>
            <span v-if="textEditTest.error" class="tet-err">{{ textEditTest.error }}</span>
          </div>
          <div v-if="textEditTest.output" class="tet-out">{{ textEditTest.output }}</div>
        </div>

        <!-- 测试结果区域 -->
        <div v-if="testResults.length > 0" class="test-results">
          <h4>测试结果</h4>
          <div class="test-result-grid">
            <div v-for="(r, idx) in testResults" :key="idx" class="test-result-item">
              <img
                v-if="!r.isVideo && r.thumbUrl"
                :src="r.thumbUrl"
                class="test-thumb"
                @click="previewImage = r.url"
              />
              <img
                v-else-if="!r.isVideo"
                :src="r.url"
                class="test-thumb"
                @click="previewImage = r.url"
              />
              <video
                v-else
                :src="r.url"
                class="test-thumb"
                controls
              ></video>
              <div class="test-result-name">{{ r.filename }}</div>
            </div>
          </div>
        </div>

        <!-- 状态/进度 -->
        <div v-if="generationStore.generationStatus" class="status-row">
          <span class="status-text">{{ generationStore.generationStatus }}</span>
          <span v-if="generationStore.progress > 0 && generationStore.progress < 100" class="status-progress">{{ generationStore.progress }}%</span>
        </div>
        <div v-if="generationStore.error" class="error-text">{{ generationStore.error }}</div>
        <transition name="save-fade">
          <span v-if="saveStatusMessage" class="save-status-msg">{{ saveStatusMessage }}</span>
        </transition>

      <template #footer>
        <button class="btn" @click="closeDialog">取消</button>
        <button
          class="btn btn-primary"
          @click="startGenerate"
          :disabled="generatingCount > 0"
        >测试<span v-if="generatingCount > 0" class="loading"></span></button>
        <button
          class="btn btn-primary"
          @click="saveFunction"
          :disabled="!editingConfig.functionName"
        >保存配置</button>
        <button
          class="btn"
          @click="saveAsTask"
          :disabled="!canSaveAsTask"
        >保存成任务</button>
      </template>
    </FloatingWindow>

    <!-- 添加分类对话框 -->
    <FloatingWindow v-model:open="showAddCategory" title="添加分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input type="text" v-model="newCategoryName" placeholder="输入分类名称" @keyup.enter="doAddCategory" />
      </div>
      <template #footer>
        <button class="btn" @click="showAddCategory = false">取消</button>
        <button class="btn btn-primary" @click="doAddCategory" :disabled="!newCategoryName">添加</button>
      </template>
    </FloatingWindow>

    <!-- 重命名分类对话框 -->
    <FloatingWindow v-model:open="renamingCategoryOpen" title="重命名分类" size="default">
      <template v-if="renamingCategory">
        <div class="form-group">
          <label>分类名称</label>
          <input type="text" v-model="renameForm.name" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory" :disabled="!renameForm.name">保存</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动到分类对话框 -->
    <FloatingWindow v-model:open="batchMoveDialogOpen" title="移动到分类" size="default">
      <p class="hint">将选中的 {{ selectedIds.length }} 个功能移动到指定分类</p>
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="batchMoveDialog.targetCategoryId">
          <option :value="0">未分类</option>
          <option v-for="cat in functionCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="batchMoveDialog.show = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove" :disabled="batchMoveDialog.targetCategoryId === null">移动</button>
      </template>
    </FloatingWindow>

    <!-- 单个移动对话框 -->
    <FloatingWindow v-model:open="moveDialogOpen" title="移动功能" size="default">
      <p class="hint">将"{{ moveDialog.functionName }}"移动到指定分类</p>
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="moveDialog.targetCategoryId">
          <option :value="0">未分类</option>
          <option v-for="cat in functionCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="moveDialog.show = false">取消</button>
        <button class="btn btn-primary" @click="doMoveFunction" :disabled="moveDialog.targetCategoryId === null">移动</button>
      </template>
    </FloatingWindow>

    <!-- 删除分类确认弹窗 -->
    <FloatingWindow v-model:open="deleteCategoryConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除分类"{{ deleteCategoryConfirm.target?.name }}"吗？<br /><small>该分类下的功能将移到"未分类"</small></p>
      <template #footer>
        <button class="btn" @click="deleteCategoryConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除功能确认弹窗 -->
    <FloatingWindow v-model:open="deleteFunctionConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除功能"{{ deleteFunctionConfirm.target?.name }}"吗？</p>
      <template #footer>
        <button class="btn" @click="deleteFunctionConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteFunction">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 批量删除确认弹窗 -->
    <FloatingWindow v-model:open="batchDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除选中的 {{ batchDeleteConfirm.count }} 个功能吗？</p>
      <template #footer>
        <button class="btn" @click="batchDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doBatchDelete">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 图片预览 -->
    <div v-if="previewImage" class="preview-overlay" @click="previewImage = ''">
      <img :src="previewImage" class="preview-img" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useGenerationStore } from '@/stores/generation'
import { useGalleryStore } from '@/stores/gallery'
import { useConfigStore } from '@/stores/config'
import { useTextEditStore } from '@/stores/textEdit'
import { apiClient } from '@/services/api'
import { useToast } from '@/shell/toast'
import FunctionEditor from '@/components/generation/FunctionEditor.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const generationStore = useGenerationStore()
const galleryStore = useGalleryStore()
const configStore = useConfigStore()
const textEditStore = useTextEditStore()
const toast = useToast()

// 功能类型定义（去 emoji，新增"批量推理"选项卡）
const tabs = [
  { id: 'text2img', name: '文生图' },
  { id: 'img2img', name: '图像编辑' },
  { id: 'text2video', name: '文生视频' },
  { id: 'img2video', name: '图生视频' },
  { id: 'storyboard', name: '分镜生成' },
  { id: 'batch-inference', name: '批量推理' },
  { id: 'text-edit', name: '文字编辑' }
]

// 图片编辑模式：多张输入图对应的工作流节点 ID（第1/2/3张）
const IMG_EDIT_NODE_IDS = ['63', '64', '61']

// ============ 数据状态 ============
const functions = ref([])
const functionCategories = ref([])
const activeCategory = ref('all')
const selectedIds = ref([])
const searchKeyword = ref('')

// ComfyUI 配置和工作流文件缓存（用于列表显示名称）
const activeComfyuiConfigs = ref([])
const workflowFiles = ref([])
const promptFiles = ref([])

// 对话框状态
const showDialog = ref(false)
const editingFunction = ref(null) // null=新建，对象=编辑
const editingTabId = ref('text2img')
const editingConfig = reactive(makeDefaultConfig())

// 分类管理对话框
const showAddCategory = ref(false)
const newCategoryName = ref('')
const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })
const deleteCategoryConfirm = ref({ show: false, target: null })

// 删除/移动对话框
const deleteFunctionConfirm = ref({ show: false, target: null })
const batchDeleteConfirm = ref({ show: false, count: 0 })
const batchMoveDialog = reactive({ show: false, targetCategoryId: 0 })
const moveDialog = reactive({ show: false, functionId: null, functionName: '', targetCategoryId: 0 })

// 测试状态
const generatingCount = ref(0)
const testResults = ref([])
const previewImage = ref('')
const connectionTestResults = ref([])

// 保存状态提示
const saveStatusMessage = ref('')
let saveStatusTimer = null
function showSaveStatus(msg) {
  if (saveStatusTimer) clearTimeout(saveStatusTimer)
  saveStatusMessage.value = msg
  saveStatusTimer = setTimeout(() => {
    saveStatusMessage.value = ''
  }, 3000)
}

// ============ 默认配置 ============
function makeDefaultConfig(tabId = 'text2img') {
  return {
    functionName: '',
    comfyuiConfigId: null,
    selectedWorkflowId: null,
    needsImage: (tabId === 'img2img' || tabId === 'img2video'),
    inputImages: [null, null, null, null],
    imageNodeIds: ['', '', '', ''],
    showImageNodeIds: true,
    insertedPromptIds: [],
    promptText: '',
    imageParams: {
      showImageParams: false,
      widthNodeId: '',
      width: null,
      heightNodeId: '',
      height: null
    },
    videoParams: {
      showVideoParams: false,
      promptNodeId: '352',
      widthNodeId: '292',
      heightNodeId: '293',
      lengthNodeId: '291',
      fpsNodeId: '285',
      t2vNodeId: '290',
      width: 512,
      height: 512,
      length: 25,
      fps: 8,
      textToVideo: false
    },
    // 批量推理专用字段
    apiConfigId: null,
    promptRuleFileIds: [],
    // 分镜生成：提示词来源 Json分镜 文件（单选 id），生成时调用该文件中的分镜提示词
    storyboardFileId: null,
    // 文字编辑专用：生成参数（留空沿用 API 配置默认值）
    textParams: { temperature: null, maxTokens: null }
  }
}

// ============ 计算属性 ============
const uncategorizedCount = computed(() =>
  functions.value.filter(f => !f.category_id).length
)

const filteredFunctions = computed(() => {
  let list = functions.value
  if (activeCategory.value === 'uncategorized') {
    list = list.filter(f => !f.category_id)
  } else if (activeCategory.value !== 'all') {
    list = list.filter(f => f.category_id === activeCategory.value)
  }
  const kw = searchKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(f => (f.name || '').toLowerCase().includes(kw))
  }
  return list
})

const isAllSelected = computed(() => {
  return filteredFunctions.value.length > 0 &&
    filteredFunctions.value.every(f => selectedIds.value.includes(f.id))
})

// ============ FloatingWindow open 代理 ============
// 对象/响应式对象类型对话框标志：用 writable computed 桥接到 v-model:open
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const batchMoveDialogOpen = computed({
  get: () => batchMoveDialog.show,
  set: (v) => { if (!v) batchMoveDialog.show = false }
})
const moveDialogOpen = computed({
  get: () => moveDialog.show,
  set: (v) => { if (!v) moveDialog.show = false }
})
const deleteCategoryConfirmOpen = computed({
  get: () => deleteCategoryConfirm.value.show,
  set: (v) => { if (!v) deleteCategoryConfirm.value.show = false }
})
const deleteFunctionConfirmOpen = computed({
  get: () => deleteFunctionConfirm.value.show,
  set: (v) => { if (!v) deleteFunctionConfirm.value.show = false }
})
const batchDeleteConfirmOpen = computed({
  get: () => batchDeleteConfirm.value.show,
  set: (v) => { if (!v) batchDeleteConfirm.value.show = false }
})

// ============ 工具函数 ============
function getCategoryCount(catId) {
  return functions.value.filter(f => f.category_id === catId).length
}

function getTabName(tabId) {
  const t = tabs.find(t => t.id === tabId)
  return t ? t.name : (tabId || '未知')
}

function getComfyuiConfigName(fn) {
  const cfg = parseConfigJson(fn)
  if (!cfg.comfyuiConfigId) return '默认'
  const found = activeComfyuiConfigs.value.find(c => c.id === cfg.comfyuiConfigId)
  return found ? found.name : '默认'
}

function getWorkflowName(fn) {
  const cfg = parseConfigJson(fn)
  if (!cfg.selectedWorkflowId) return '默认工作流'
  const found = workflowFiles.value.find(w => w.id === cfg.selectedWorkflowId)
  return found ? found.name : '默认工作流'
}

function parseConfigJson(fn) {
  if (!fn) return {}
  if (fn.config_json && typeof fn.config_json === 'object') return fn.config_json
  if (fn.config_json && typeof fn.config_json === 'string') {
    try { return JSON.parse(fn.config_json) } catch (e) { return {} }
  }
  return {}
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    return dateStr
  }
}

// ============ 选择/分类 ============
function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    const ids = filteredFunctions.value.map(f => f.id)
    selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
  } else {
    const ids = filteredFunctions.value.map(f => f.id)
    ids.forEach(id => {
      if (!selectedIds.value.includes(id)) selectedIds.value.push(id)
    })
  }
}

function switchCategory(cat) {
  activeCategory.value = cat
  selectedIds.value = []
}

// ============ 数据加载 ============
async function loadFunctions() {
  try {
    const list = await apiClient.getFunctions()
    functions.value = Array.isArray(list) ? list : []
    // 通知全局 AI 文字编辑层刷新已激活的「文字编辑」功能列表
    try { window.dispatchEvent(new CustomEvent('ai-textedit-refresh')) } catch { /* ignore */ }
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      const validIds = new Set(functions.value.map(item => item.id))
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载功能列表失败:', e)
    functions.value = []
  }
}

async function loadFunctionCategories() {
  try {
    const list = await apiClient.getFunctionCategories()
    functionCategories.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载功能分类失败:', e)
    functionCategories.value = []
  }
}

async function loadActiveComfyuiConfigs() {
  try {
    const list = await apiClient.getActiveComfyuiConfigs()
    activeComfyuiConfigs.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载激活 ComfyUI 配置列表失败:', e)
    activeComfyuiConfigs.value = []
  }
}

async function loadWorkflowFiles() {
  try {
    const list = await apiClient.getCallableFiles('workflow')
    workflowFiles.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载工作流文件失败:', e)
    workflowFiles.value = []
  }
}

async function loadPromptFiles() {
  try {
    const list = await apiClient.getCallableFiles('prompt')
    promptFiles.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载提示词文件失败:', e)
    promptFiles.value = []
  }
}

// ============ 新建/编辑功能 ============
function openCreateDialog() {
  editingFunction.value = null
  editingTabId.value = 'text2img'
  Object.assign(editingConfig, makeDefaultConfig('text2img'))
  testResults.value = []
  generationStore.generationStatus = ''
  generationStore.error = ''
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingFunction.value = null
  testResults.value = []
}

async function editFunction(fn) {
  editingFunction.value = fn
  const cfg = parseConfigJson(fn)
  editingTabId.value = fn.tab_id || cfg.tabId || 'text2img'
  // 重置为默认值然后用保存的配置覆盖
  const defaults = makeDefaultConfig(editingTabId.value)
  Object.assign(editingConfig, defaults)
  // 应用保存的配置字段
  if (cfg.functionName) editingConfig.functionName = cfg.functionName
  if (cfg.comfyuiConfigId !== undefined) editingConfig.comfyuiConfigId = cfg.comfyuiConfigId
  if (cfg.selectedWorkflowId !== undefined) editingConfig.selectedWorkflowId = cfg.selectedWorkflowId
  if (typeof cfg.needsImage === 'boolean') editingConfig.needsImage = cfg.needsImage
  if (Array.isArray(cfg.imageNodeIds)) editingConfig.imageNodeIds = [...cfg.imageNodeIds, '', '', '', ''].slice(0, 4)
  if (typeof cfg.showImageNodeIds === 'boolean') editingConfig.showImageNodeIds = cfg.showImageNodeIds
  if (Array.isArray(cfg.insertedPromptIds)) editingConfig.insertedPromptIds = [...cfg.insertedPromptIds]
  if (cfg.promptText !== undefined) editingConfig.promptText = cfg.promptText
  if (cfg.imageParams && typeof cfg.imageParams === 'object') {
    editingConfig.imageParams = { ...defaults.imageParams, ...cfg.imageParams }
  }
  if (cfg.videoParams && typeof cfg.videoParams === 'object') {
    editingConfig.videoParams = { ...defaults.videoParams, ...cfg.videoParams }
  }
  // 批量推理专用字段
  if (cfg.apiConfigId !== undefined) editingConfig.apiConfigId = cfg.apiConfigId
  if (Array.isArray(cfg.promptRuleFileIds)) editingConfig.promptRuleFileIds = [...cfg.promptRuleFileIds]
  // 分镜生成：Json分镜 文件 id
  if (cfg.storyboardFileId !== undefined && cfg.storyboardFileId !== null) editingConfig.storyboardFileId = cfg.storyboardFileId
  // 文字编辑：生成参数
  if (cfg.textParams && typeof cfg.textParams === 'object') {
    editingConfig.textParams = { ...defaults.textParams, ...cfg.textParams }
  }
  // 从图库重新加载输入图片的 preview
  if (Array.isArray(cfg.inputImages)) {
    editingConfig.inputImages = [null, null, null, null]
    await Promise.all(cfg.inputImages.map(async (imgData, i) => {
      if (i >= 4) return
      if (!imgData) return
      const fileId = imgData.fileId
      if (!fileId) return
      try {
        const base64 = await apiClient.getGalleryImageBase64(fileId)
        if (base64) {
          editingConfig.inputImages[i] = { base64, preview: base64, fileId }
        }
      } catch (e) {
        console.warn(`加载输入图片 ${i + 1} 失败:`, e)
      }
    }))
  }
  testResults.value = []
  generationStore.generationStatus = ''
  generationStore.error = ''
  showDialog.value = true
}

// ============ 配置序列化 ============
function serializeConfig() {
  return {
    functionName: editingConfig.functionName || '',
    comfyuiConfigId: editingConfig.comfyuiConfigId || null,
    selectedWorkflowId: editingConfig.selectedWorkflowId || null,
    needsImage: !!editingConfig.needsImage,
    inputImages: (editingConfig.inputImages || []).map(img => img ? { fileId: img.fileId || null } : null),
    imageNodeIds: [...(editingConfig.imageNodeIds || [])],
    showImageNodeIds: !!editingConfig.showImageNodeIds,
    insertedPromptIds: [...(editingConfig.insertedPromptIds || [])],
    promptText: editingConfig.promptText || '',
    imageParams: { ...(editingConfig.imageParams || {}) },
    videoParams: { ...(editingConfig.videoParams || {}) },
    // 批量推理专用字段
    apiConfigId: editingConfig.apiConfigId || null,
    promptRuleFileIds: [...(editingConfig.promptRuleFileIds || [])],
    // 分镜生成
    storyboardFileId: editingConfig.storyboardFileId || null,
    // 文字编辑
    textParams: { ...(editingConfig.textParams || {}) }
  }
}

// ============ 保存功能 ============
async function saveFunction() {
  const name = (editingConfig.functionName || '').trim()
  if (!name) {
    showSaveStatus('请输入功能名称')
    return
  }
  // 文字编辑：API 配置是必填项（没有它就调不动大模型）
  if (isTextEditTab.value && !editingConfig.apiConfigId) {
    showSaveStatus('请选择 API 配置')
    return
  }
  const configJson = serializeConfig()
  const payload = {
    name,
    description: `${getTabName(editingTabId.value)} - ${name}`,
    tab_id: editingTabId.value,
    config_json: configJson,
    category_id: editingFunction.value && !editingFunction.value._fromTask ? (editingFunction.value.category_id || 0) : 0
  }
  try {
    // 从任务库跳转来的，没有 function 文件 ID，只能新建
    if (editingFunction.value && !editingFunction.value._fromTask && editingFunction.value.id) {
      await apiClient.updateFunction(editingFunction.value.id, payload)
      showSaveStatus('保存成功')
    } else {
      const res = await apiClient.createFunction(payload)
      if (res && res.id) {
        editingFunction.value = res
        showSaveStatus('创建成功')
      } else {
        showSaveStatus('创建失败')
        return
      }
    }
    await loadFunctions()
  } catch (e) {
    console.error('保存功能失败:', e)
    showSaveStatus('保存失败: ' + (e.message || e))
  }
}

// ============ 保存成任务 ============
async function saveAsTask() {
  const name = (editingConfig.functionName || '').trim()
  if (!name) {
    showSaveStatus('请输入功能名称')
    return
  }
  // 批量推理 tab：5 项必填校验（名称 + ComfyUI + API + 工作流 + 提示词规则 + 提示词输入）
  if (editingTabId.value === 'batch-inference') {
    if (!editingConfig.comfyuiConfigId) {
      showSaveStatus('请选择 ComfyUI 配置')
      return
    }
    if (!editingConfig.apiConfigId) {
      showSaveStatus('请选择 API 配置')
      return
    }
    if (!editingConfig.selectedWorkflowId) {
      showSaveStatus('请选择使用工作流')
      return
    }
    if (!Array.isArray(editingConfig.promptRuleFileIds) || editingConfig.promptRuleFileIds.length === 0) {
      showSaveStatus('请插入提示词规则文件')
      return
    }
    if (!editingConfig.promptText || !editingConfig.promptText.trim()) {
      showSaveStatus('请输入提示词')
      return
    }
  }
  const cfg = editingConfig
  const functionConfigs = [{
    name: cfg.functionName,
    tabId: editingTabId.value,
    functionName: cfg.functionName,
    promptText: cfg.promptText,
    insertedPromptIds: cfg.insertedPromptIds || [],
    selectedWorkflowId: cfg.selectedWorkflowId,
    comfyuiConfigId: cfg.comfyuiConfigId,
    inputImages: (cfg.inputImages || []).map(img => img ? { fileId: img.fileId } : null),
    imageNodeIds: [...(cfg.imageNodeIds || [])],
    needsImage: cfg.needsImage,
    imageParams: { ...(cfg.imageParams || {}) },
    videoParams: { ...(cfg.videoParams || {}) },
    // 批量推理专用字段
    apiConfigId: cfg.apiConfigId || null,
    promptRuleFileIds: [...(cfg.promptRuleFileIds || [])],
    // 分镜生成
    storyboardFileId: cfg.storyboardFileId || null
  }]
  const taskData = {
    name: name + ' 任务',
    description: '由功能库生成',
    workflow_api_id: cfg.selectedWorkflowId || 0,
    storyboard_json_ids: isStoryboardTab.value && cfg.storyboardFileId ? [cfg.storyboardFileId] : [],
    inserted_prompt_ids: cfg.insertedPromptIds || [],
    function_configs: functionConfigs,
    category_id: 0
  }
  try {
    // 如果是从任务库跳转来编辑的，更新原任务
    if (editingFunction.value && editingFunction.value._fromTask && editingFunction.value.taskId) {
      await apiClient.updateGenerationTask(editingFunction.value.taskId, taskData)
      showSaveStatus('任务已更新')
    } else {
      await apiClient.createGenerationTask(taskData)
      showSaveStatus('已保存到任务库')
    }
  } catch (e) {
    console.error('保存任务失败:', e)
    showSaveStatus('保存任务失败: ' + (e.message || e))
  }
}

// ============ 测试生成（保留原 startGenerate 核心逻辑） ============
function buildCombinedPrompt() {
  const ids = editingConfig.insertedPromptIds || []
  const inserted = ids
    .map(id => {
      const f = promptFiles.value.find(p => p.id === id)
      return f
    })
    .filter(Boolean)
    .map(f => f.content)
    .filter(Boolean)
    .join('\n\n')
  const text = editingConfig.promptText || ''
  if (inserted && text) return inserted + '\n' + text
  return inserted || text
}

// 从 Json分镜 文件内容中提取提示词列表（兼容数组格式 [{id,prompt}] 与 {storyboards:[...]} 两种结构）
async function loadStoryboardPrompts(fileId) {
  try {
    const sbFile = await apiClient.getFileLibraryFileById(fileId)
    if (!sbFile || !sbFile.content) return []
    let arr = []
    try {
      const parsed = JSON.parse(sbFile.content)
      if (Array.isArray(parsed)) arr = parsed
      else if (parsed && Array.isArray(parsed.storyboards)) arr = parsed.storyboards
      else if (parsed && parsed.prompt) return [parsed.prompt]
      else if (parsed && parsed.content) return [parsed.content]
    } catch (e) {
      // 非 JSON：按双换行分镜
      return sbFile.content.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    }
    return (Array.isArray(arr) ? arr : [arr])
      .map(it => {
        if (typeof it === 'string') return it
        if (it && it.prompt) return it.prompt
        if (it && it.content) return it.content
        return ''
      })
      .filter(Boolean)
  } catch (e) {
    console.error('读取 Json分镜 文件失败:', e)
    return []
  }
}

const isVideoTab = computed(() => editingTabId.value === 'text2video' || editingTabId.value === 'img2video')
const isText2imgTab = computed(() => editingTabId.value === 'text2img')
const needsImageTab = computed(() => editingTabId.value === 'img2img' || editingTabId.value === 'img2video')
const isBatchInferenceTab = computed(() => editingTabId.value === 'batch-inference')
// 文字编辑：只调大模型改写/续写文字，不产生出图任务
const isTextEditTab = computed(() => editingTabId.value === 'text-edit')
// 分镜生成：与文生图配置基本相同，提示词改为来自选中的 Json分镜 文件
const isStoryboardTab = computed(() => editingTabId.value === 'storyboard')

// 文字编辑「测试」用的样例区
const textEditTest = reactive({
  input: '夜色像一块浸了墨的棉布，缓缓盖住整座城。',
  output: '',
  running: false,
  error: '',
})

// "保存成任务"按钮启用条件：
// - 通用：必须填写功能名称
// - 批量推理 tab：5 项必填（ComfyUI 配置、API 配置、工作流、提示词规则、提示词输入）
const canSaveAsTask = computed(() => {
  if (!editingConfig.functionName || !editingConfig.functionName.trim()) return false
  if (isBatchInferenceTab.value) {
    if (!editingConfig.comfyuiConfigId) return false
    if (!editingConfig.apiConfigId) return false
    if (!editingConfig.selectedWorkflowId) return false
    if (!Array.isArray(editingConfig.promptRuleFileIds) || editingConfig.promptRuleFileIds.length === 0) return false
    if (!editingConfig.promptText || !editingConfig.promptText.trim()) return false
  }
  if (isStoryboardTab.value) {
    // 分镜生成：必须选择 Json分镜 提示词文件
    if (!editingConfig.storyboardFileId) return false
  }
  // 文字编辑不产出图片任务，不能存成任务
  if (isTextEditTab.value) return false
  return true
})

// ---------- 文字编辑测试：直接拿样例文本跑一次大模型 ----------
async function runTextEditTest() {
  if (!editingConfig.apiConfigId) {
    textEditTest.error = '请先选择 API 配置'
    textEditTest.output = ''
    return
  }
  const sample = (textEditTest.input || '').trim()
  if (!sample) {
    textEditTest.error = '请输入一段测试文本'
    return
  }
  textEditTest.running = true
  textEditTest.error = ''
  textEditTest.output = ''
  generationStore.generationStatus = '正在调用 AI 生成…'
  try {
    const fakeFn = {
      id: editingFunction.value?.id || 0,
      name: editingConfig.functionName || '文字编辑',
      config_json: serializeConfig(),
    }
    const text = await textEditStore.runFunction(fakeFn, {
      mode: 'expand',
      selectedText: sample,
      beforeText: '',
      afterText: '',
      maxTokens: editingConfig.textParams?.maxTokens || undefined,
      temperature: editingConfig.textParams?.temperature ?? undefined,
    })
    textEditTest.output = text || ''
  } catch (e) {
    textEditTest.error = '生成失败：' + (e?.message || e)
  } finally {
    textEditTest.running = false
    generationStore.generationStatus = ''
  }
}

async function startGenerate() {
  // 文字编辑 tab：用样例文本直接跑一次大模型，验证 API 配置与提示词是否好用
  if (isTextEditTab.value) {
    await runTextEditTest()
    return
  }

  // 批量推理 tab：调用 AI 推理批量提示词 → 转换为 JSON 分镜 → 直接进入任务批量出图
  if (isBatchInferenceTab.value) {
    await runBatchInference()
    return
  }

  // 分镜生成 tab：提示词来自选中的 Json分镜 文件
  let combined
  if (isStoryboardTab.value) {
    const sbId = editingConfig.storyboardFileId
    if (!sbId) {
      generationStore.error = '请先选择 Json分镜 提示词文件'
      return
    }
    const prompts = await loadStoryboardPrompts(sbId)
    if (!prompts.length) {
      generationStore.error = 'Json分镜 文件无可用提示词'
      return
    }
    combined = prompts.join('\n\n')
  } else {
    combined = buildCombinedPrompt()
    if (!combined) {
      generationStore.error = '请输入提示词或插入提示词'
      return
    }
  }
  const hasAnyImage = (editingConfig.inputImages || []).some(i => i)
  if (needsImageTab.value && !hasAnyImage) {
    generationStore.error = '请提供输入图片'
    return
  }

  // 记录测试前结果长度，仅取本次新增作为测试结果
  const startLen = generationStore.results.length

  // 同步到 generationStore
  const workflowApiId = editingConfig.selectedWorkflowId || 0
  generationStore.generationOptions.prompt = combined
  generationStore.selectedWorkflowApiId = workflowApiId
  generationStore.error = ''

  // 临时切换 ComfyUI 配置（如果该功能选择了具体配置）
  const selectedCfgId = editingConfig.comfyuiConfigId
  let cfg = null
  if (selectedCfgId) {
    cfg = activeComfyuiConfigs.value.find(c => c.id === selectedCfgId)
  }
  const originalUrl = configStore.config.comfyuiUrl
  const originalDownloadDir = configStore.config.downloadDir
  const originalFilenamePrefix = configStore.config.filenamePrefix
  if (cfg && cfg.comfyui_url) {
    configStore.config.comfyuiUrl = cfg.comfyui_url
    if (cfg.download_dir) configStore.config.downloadDir = cfg.download_dir
    if (cfg.filename_prefix) configStore.config.filenamePrefix = cfg.filename_prefix
  }

  generatingCount.value++
  try {
    if (needsImageTab.value || isVideoTab.value) {
      // 构建带节点映射的图片槽位（只含非空位，保留原始位置→节点映射）
      const isImgEdit = editingTabId.value === 'img2img'
      const inputImageSlots = []
      ;(editingConfig.inputImages || []).forEach((img, idx) => {
        if (img) {
          // 优先使用用户配置的 imageNodeIds，img2img 回退到 IMG_EDIT_NODE_IDS
          const nodeId = (editingConfig.imageNodeIds && editingConfig.imageNodeIds[idx])
            ? editingConfig.imageNodeIds[idx]
            : (isImgEdit ? IMG_EDIT_NODE_IDS[idx] : null)
          inputImageSlots.push({
            base64: img.base64,
            nodeId
          })
        }
      })
      // 视频参数（仅视频 tab 传递，且仅当用户配置了节点 ID 时才注入）
      const vp = editingConfig.videoParams
      const videoParams = isVideoTab.value ? {
        promptNodeId: vp.promptNodeId,
        widthNodeId: vp.widthNodeId,
        heightNodeId: vp.heightNodeId,
        lengthNodeId: vp.lengthNodeId,
        fpsNodeId: vp.fpsNodeId,
        t2vNodeId: vp.t2vNodeId,
        width: vp.width,
        height: vp.height,
        length: vp.length,
        fps: vp.fps,
        textToVideo: vp.textToVideo
      } : null
      await generationStore.generateWithImage({
        prompt: combined,
        workflowApiId,
        inputImageSlots,
        videoParams
      })
    } else {
      // 文生图 / 分镜生成：传递图片参数（宽/高节点，默认空不影响工作流）
      const imageParams = (isText2imgTab.value || isStoryboardTab.value) ? editingConfig.imageParams : null
      await generationStore.generate({ imageParams })
    }

    // 收集本次测试新增的结果（压缩缩略图）
    const newResults = generationStore.results.slice(startLen)
    testResults.value = newResults.map(r => ({
      url: r.url,
      filename: r.filename,
      isVideo: r.isVideo,
      thumbUrl: r.thumbUrl || r.url
    }))
  } finally {
    // 恢复原有 ComfyUI 配置
    if (cfg && cfg.comfyui_url) {
      configStore.config.comfyuiUrl = originalUrl
      configStore.config.downloadDir = originalDownloadDir
      configStore.config.filenamePrefix = originalFilenamePrefix
    }
    generatingCount.value = Math.max(0, generatingCount.value - 1)
  }
}

// ============ 批量推理测试（调用 AI 生成批量提示词 → 转换 JSON 分镜 → 直接批量出图） ============
// 根据所选 AI 配置获取 API 基地址（参考 chat store 的 getApiBaseUrlForConfig）
function getAiApiBaseUrlForConfig(cfg) {
  if (!cfg) return ''
  const provider = cfg.provider
  if (provider === 'openrouter') return '/ai-api'
  if (provider === 'siliconflow') return '/siliconflow-api'
  if (provider === 'openai') return '/openai-api'
  if (provider === 'aliyun') return '/aliyun-api'
  if (provider === 'google') return '/google-api'
  if (provider === 'lmstudio') return '/lmstudio-api'
  if (provider === 'modelscope') return '/modelscope-api'
  const url = cfg.api_url || ''
  return url.endsWith('/') ? url.slice(0, -1) : url
}

// 从 AI 文本响应中提取批量提示词（兼容 JSON 数组、JSON 代码块、分隔符分隔文本三种格式）
function parseBatchPromptsFromAIResponse(text) {
  if (!text || typeof text !== 'string') return []
  let s = text.trim()

  // 1. 优先解析 JSON 代码块 ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    s = codeBlockMatch[1].trim()
  }

  // 2. 尝试 JSON.parse
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') return item.prompt || item.content || item.text || ''
          return ''
        })
        .filter(p => p && p.trim())
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.storyboards)) {
        return parsed.storyboards
          .map(sb => (sb && (sb.prompt || sb.content || '')) || '')
          .filter(p => p.trim())
      }
      if (parsed.prompt) return [parsed.prompt]
    }
  } catch (e) {
    // 不是 JSON，继续尝试分隔符方式
  }

  // 3. 兜底：按 ---、###、换行+数字编号 等分隔符切分
  // 移除可能的 markdown 标题
  const cleaned = s.replace(/^#+\s*.*/gm, '').trim()
  // 优先按 "---" 或 "===" 切分
  let parts = cleaned.split(/\n\s*---+\s*\n|\n\s*===+\s*\n/).map(p => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts

  // 按 "数字." 编号切分（如 "1. xxx\n2. xxx"）
  const numbered = cleaned.match(/(?:^|\n)\s*\d+[\.\)、]\s*([^\n]+)/g)
  if (numbered && numbered.length >= 2) {
    return numbered.map(m => m.replace(/^[^\d]*\d+[\.\)、]\s*/, '').trim()).filter(Boolean)
  }

  // 最后兜底：按双换行切分
  parts = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  return parts.length >= 1 ? parts : (cleaned ? [cleaned] : [])
}

async function runBatchInference() {
  // 5 项必填校验（与"保存成任务"一致）
  if (!editingConfig.functionName || !editingConfig.functionName.trim()) {
    generationStore.error = '请输入功能名称'
    return
  }
  if (!editingConfig.comfyuiConfigId) {
    generationStore.error = '请选择 ComfyUI 配置'
    return
  }
  if (!editingConfig.apiConfigId) {
    generationStore.error = '请选择 API 配置'
    return
  }
  if (!editingConfig.selectedWorkflowId) {
    generationStore.error = '请选择使用工作流'
    return
  }
  const ruleIds = editingConfig.promptRuleFileIds || []
  if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
    generationStore.error = '请插入提示词规则文件'
    return
  }
  if (!editingConfig.promptText || !editingConfig.promptText.trim()) {
    generationStore.error = '请输入提示词要求'
    return
  }

  generatingCount.value++
  generationStore.generationStatus = '正在加载提示词规则文件...'
  generationStore.error = ''

  try {
    // 1. 加载提示词规则文件内容
    const ruleFiles = await Promise.all(
      ruleIds.map(id => apiClient.getFileLibraryFileById(id))
    )
    const ruleContent = ruleFiles
      .filter(Boolean)
      .map(f => f.content || '')
      .filter(Boolean)
      .join('\n\n---\n\n')

    if (!ruleContent) {
      generationStore.error = '提示词规则文件为空，无法调用 AI 推理'
      return
    }

    // 2. 加载 AI 配置详情
    const aiCfg = await apiClient.getAiConfigById(editingConfig.apiConfigId)
    if (!aiCfg || !aiCfg.api_key || !aiCfg.model) {
      generationStore.error = 'API 配置不完整（缺少 api_key 或 model）'
      return
    }

    // 3. 构建请求消息（系统消息：规则 + 输出格式；用户消息：用户输入）
    const systemPrompt = `${ruleContent}

## 任务
请根据用户输入的要求，按照上述规则生成一组图片/视频提示词。

## 输出格式（必须严格遵守）
- 必须输出 JSON 数组，数组每个元素是 {"prompt": "提示词内容"}
- 不要输出任何 markdown 标题、解释性文字或额外说明
- 直接输出 JSON 数组本身，例如：
[{"prompt": "提示词1"}, {"prompt": "提示词2"}, {"prompt": "提示词3"}]

## 严格禁止
1. 禁止输出 JSON 之外的任何内容
2. 禁止输出 markdown 代码块标记（不要输出 \`\`\`json）
3. 禁止输出解释、说明、标题
4. 必须是合法的 JSON 数组`

    const userMessage = editingConfig.promptText.trim()

    generationStore.generationStatus = '正在调用 AI 推理批量提示词...'

    // 4. 调用 AI API（非流式）
    const aiApiBase = getAiApiBaseUrlForConfig(aiCfg)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiCfg.api_key}`
    }
    if (aiCfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Batch Inference'
    }

    const requestBody = {
      model: aiCfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      stream: false,
      max_tokens: aiCfg.max_tokens || 4000,
      temperature: aiCfg.temperature ?? 0.8,
      top_p: aiCfg.top_p ?? 1.0,
      frequency_penalty: aiCfg.frequency_penalty ?? 0,
      presence_penalty: aiCfg.presence_penalty ?? 0
    }
    // 思考功能：读取 API 配置中的 enable_thinking 设置（默认关闭）
    requestBody.enable_thinking = !!aiCfg.enable_thinking

    const response = await fetch(`${aiApiBase}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`AI 接口错误 (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const aiText = data?.choices?.[0]?.message?.content || ''
    if (!aiText) {
      generationStore.error = 'AI 未返回任何内容'
      return
    }

    // 5. 解析 AI 输出为批量提示词列表
    const prompts = parseBatchPromptsFromAIResponse(aiText)
    if (prompts.length === 0) {
      generationStore.error = 'AI 输出无法解析为批量提示词'
      return
    }

    generationStore.generationStatus = `AI 推理出 ${prompts.length} 条提示词，正在转换为 JSON 分镜...`

    // 6. 转换为 JSON 分镜格式（数组格式，与文件库"+JSON分镜"页面一致）
    const storyboardArray = prompts.map((p, i) => ({
      id: String(i + 1),
      prompt: p
    }))
    const jsonContent = JSON.stringify(storyboardArray, null, 2)
    const taskName = (editingConfig.functionName || '').trim()
    const jsonFileName = `${taskName}_分镜_${Date.now()}.json`

    // 7. 保存 JSON 分镜文件到文件库总库下任务名文件夹（与图片保存位置一致）
    try {
      // 查找"总库"系统分类（is_system = 1），与图片保存位置保持一致
      // 注意：getFileLibraryCategories 后端会在缺失时自动创建"总库"系统分类
      const categories = await apiClient.getFileLibraryCategories()
      const rootCat = (categories || []).find(c => c && c.is_system === 1)
      if (!rootCat) throw new Error('未找到"总库"系统分类')
      const rootCategoryId = rootCat.id
      // 在总库下查找/创建以任务名命名的顶级文件夹（parent_id 为 null/0）
      const allFolders = await apiClient.getFileLibraryFolders({ parent_id: 'all' })
      let targetFolder = (allFolders || []).find(
        f => f.name === taskName && (!f.parent_id || f.parent_id === 0) && f.category_id === rootCategoryId
      )
      if (!targetFolder) {
        targetFolder = await apiClient.createFileLibraryFolder({
          name: taskName,
          parent_id: 0,
          category_id: rootCategoryId,
          is_callable: 0
        })
      }
      // 在该文件夹下保存 JSON 文件
      await apiClient.createFileLibraryFile({
        name: jsonFileName,
        file_type: 'json',
        content: jsonContent,
        folder_id: targetFolder.id,
        category_id: rootCategoryId,
        file_size: jsonContent.length
      })
    } catch (e) {
      console.warn('保存 JSON 分镜文件失败:', e)
    }

    // 8. 直接进入批量出图：临时切换 ComfyUI 配置，然后调用批量生成
    const comfyuiList = await apiClient.getActiveComfyuiConfigs()
    const comfyuiCfg = (comfyuiList || []).find(c => c.id === editingConfig.comfyuiConfigId)
    const originalUrl = configStore.config.comfyuiUrl
    const originalDownloadDir = configStore.config.downloadDir
    const originalFilenamePrefix = configStore.config.filenamePrefix
    let swapped = false
    if (comfyuiCfg && comfyuiCfg.comfyui_url) {
      configStore.config.comfyuiUrl = comfyuiCfg.comfyui_url
      if (comfyuiCfg.download_dir) configStore.config.downloadDir = comfyuiCfg.download_dir
      if (comfyuiCfg.filename_prefix) configStore.config.filenamePrefix = comfyuiCfg.filename_prefix
      swapped = true
    }

    try {
      // 设置批量队列并触发批量生成
      generationStore.batchQueue = prompts.map(p => ({ prompt: p }))
      generationStore.batchWorkflowApiId = editingConfig.selectedWorkflowId
      generationStore.batchCategory = 'batch-inference'
      await generationStore.batchGenerate()
    } finally {
      // 恢复 ComfyUI 配置
      if (swapped) {
        configStore.config.comfyuiUrl = originalUrl
        configStore.config.downloadDir = originalDownloadDir
        configStore.config.filenamePrefix = originalFilenamePrefix
      }
    }

    // 显示测试结果
    testResults.value = generationStore.results.map(r => ({
      url: r.url,
      filename: r.filename,
      isVideo: r.isVideo,
      thumbUrl: r.thumbUrl || r.url
    }))
  } catch (err) {
    console.error('批量推理失败:', err)
    generationStore.error = `批量推理失败: ${err.message || err}`
  } finally {
    generatingCount.value = Math.max(0, generatingCount.value - 1)
  }
}

// ============ 批量测试联通 ============
async function batchTestConnection() {
  if (selectedIds.value.length === 0) return
  // 收集选中功能对应的 ComfyUI 配置（去重）
  const cfgMap = new Map()
  for (const id of selectedIds.value) {
    const fn = functions.value.find(f => f.id === id)
    if (!fn) continue
    const cfg = parseConfigJson(fn)
    const cfgId = cfg.comfyuiConfigId
    if (!cfgId) continue
    if (cfgMap.has(cfgId)) continue
    const comfyuiCfg = activeComfyuiConfigs.value.find(c => c.id === cfgId)
    if (comfyuiCfg && comfyuiCfg.comfyui_url) {
      cfgMap.set(cfgId, { id: cfgId, name: comfyuiCfg.name, url: comfyuiCfg.comfyui_url })
    }
  }
  if (cfgMap.size === 0) {
    connectionTestResults.value = [{ id: 0, name: '提示', success: false, error: '选中的功能均使用默认配置，无法批量测试' }]
    return
  }
  const configs = Array.from(cfgMap.values())
  try {
    const results = await apiClient.batchTestConnection(configs)
    connectionTestResults.value = Array.isArray(results) ? results : []
  } catch (e) {
    console.error('批量测试连通失败:', e)
    connectionTestResults.value = [{ id: 0, name: '测试失败', success: false, error: e.message || String(e) }]
  }
}

// ============ 删除/移动功能 ============
function confirmDeleteFunction(fn) {
  deleteFunctionConfirm.value = { show: true, target: fn }
}

// 激活/取消激活功能：只有已激活的功能才会出现在右键「用功能库生成」子菜单
async function toggleFunctionActive(fn) {
  try {
    const next = fn.is_active ? 0 : 1
    const r = await apiClient.updateFunction(fn.id, { is_active: next })
    if (!r) throw new Error('保存失败')
    fn.is_active = next
    // 文字编辑功能的激活状态会实时影响右键菜单/快捷键，广播刷新
    try { window.dispatchEvent(new CustomEvent('ai-textedit-refresh')) } catch { /* ignore */ }
    toast.show(
      next
        ? `已激活「${fn.name}」：右键生成菜单中将出现该功能`
        : `已取消激活「${fn.name}」：右键生成菜单中不再显示`,
      next ? 'success' : 'info',
    )
  } catch (e) {
    toast.show('设置失败: ' + (e.message || e), 'error')
  }
}

async function doDeleteFunction() {
  const fn = deleteFunctionConfirm.value.target
  deleteFunctionConfirm.value.show = false
  try {
    await apiClient.deleteFunction(fn.id)
    selectedIds.value = selectedIds.value.filter(id => id !== fn.id)
    await loadFunctions()
  } catch (e) {
    console.error('删除功能失败:', e)
  }
}

function confirmBatchDelete() {
  batchDeleteConfirm.value = { show: true, count: selectedIds.value.length }
}

async function doBatchDelete() {
  batchDeleteConfirm.value.show = false
  try {
    await apiClient.batchDeleteFunctions([...selectedIds.value])
    selectedIds.value = []
    await loadFunctions()
  } catch (e) {
    console.error('批量删除失败:', e)
  }
}

function openBatchMoveDialog() {
  batchMoveDialog.targetCategoryId = 0
  batchMoveDialog.show = true
}

async function doBatchMove() {
  const targetId = batchMoveDialog.targetCategoryId
  batchMoveDialog.show = false
  try {
    await apiClient.batchCategorizeFunctions([...selectedIds.value], targetId)
    selectedIds.value = []
    await loadFunctions()
  } catch (e) {
    console.error('批量移动失败:', e)
  }
}

function openMoveDialog(fn) {
  moveDialog.functionId = fn.id
  moveDialog.functionName = fn.name
  moveDialog.targetCategoryId = fn.category_id || 0
  moveDialog.show = true
}

async function doMoveFunction() {
  const targetId = moveDialog.targetCategoryId
  const fnId = moveDialog.functionId
  moveDialog.show = false
  try {
    await apiClient.batchCategorizeFunctions([fnId], targetId)
    await loadFunctions()
  } catch (e) {
    console.error('移动功能失败:', e)
  }
}

// ============ 分类管理 ============
async function doAddCategory() {
  if (!newCategoryName.value) return
  try {
    await apiClient.createFunctionCategory({ name: newCategoryName.value })
    showAddCategory.value = false
    newCategoryName.value = ''
    await loadFunctionCategories()
  } catch (e) {
    console.error('添加分类失败:', e)
  }
}

function renameCategory(cat) {
  renamingCategory.value = cat
  renameForm.name = cat.name
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renameForm.name) return
  if (renamingCategory.value.is_system) {
    toast.show('系统固定分类不可重命名', 'error')
    renamingCategory.value = null
    return
  }
  try {
    await apiClient.updateFunctionCategory(renamingCategory.value.id, { name: renameForm.name })
    renamingCategory.value = null
    await loadFunctionCategories()
  } catch (e) {
    console.error('重命名失败:', e)
    toast.show('重命名失败：' + (e.message || e), 'error')
  }
}

function confirmDeleteCategory(cat) {
  deleteCategoryConfirm.value = { show: true, target: cat }
}

async function doDeleteCategory() {
  const cat = deleteCategoryConfirm.value.target
  deleteCategoryConfirm.value.show = false
  if (cat && cat.is_system) {
    toast.show('系统固定分类不可删除', 'error')
    return
  }
  try {
    await apiClient.deleteFunctionCategory(cat.id)
    if (activeCategory.value === cat.id) activeCategory.value = 'all'
    await loadFunctionCategories()
    await loadFunctions()
  } catch (e) {
    console.error('删除失败:', e)
    toast.show('删除失败：' + (e.message || e), 'error')
  }
}

// ============ 从任务库跳转加载功能编辑 ============
watch(
  () => generationStore.pendingFunctionUnit,
  async (unit) => {
    if (!unit) return
    try {
      // 确保依赖数据已加载
      if (promptFiles.value.length === 0) await loadPromptFiles()
      if (activeComfyuiConfigs.value.length === 0) await loadActiveComfyuiConfigs()

      // 以"新建功能"模式打开，但填入任务库传来的配置
      editingFunction.value = null
      editingTabId.value = unit.tabId || 'text2img'
      const defaults = makeDefaultConfig(editingTabId.value)
      Object.assign(editingConfig, defaults)

      if (unit.functionName) editingConfig.functionName = unit.functionName
      if (unit.comfyuiConfigId !== undefined && unit.comfyuiConfigId !== null) {
        editingConfig.comfyuiConfigId = unit.comfyuiConfigId
      }
      if (unit.selectedWorkflowId !== undefined && unit.selectedWorkflowId !== null) {
        editingConfig.selectedWorkflowId = unit.selectedWorkflowId
      }
      if (typeof unit.needsImage === 'boolean') editingConfig.needsImage = unit.needsImage
      if (Array.isArray(unit.imageNodeIds)) {
        editingConfig.imageNodeIds = [...unit.imageNodeIds, '', '', '', ''].slice(0, 4)
      }
      if (Array.isArray(unit.insertedPromptIds)) {
        editingConfig.insertedPromptIds = [...unit.insertedPromptIds]
      }
      if (unit.promptText !== undefined) editingConfig.promptText = unit.promptText
      if (unit.imageParams && typeof unit.imageParams === 'object') {
        editingConfig.imageParams = { ...defaults.imageParams, ...unit.imageParams }
      }
      if (unit.videoParams && typeof unit.videoParams === 'object') {
        editingConfig.videoParams = { ...defaults.videoParams, ...unit.videoParams }
      }
      // 批量推理专用字段
      if (unit.apiConfigId !== undefined && unit.apiConfigId !== null) {
        editingConfig.apiConfigId = unit.apiConfigId
      }
      if (Array.isArray(unit.promptRuleFileIds)) {
        editingConfig.promptRuleFileIds = [...unit.promptRuleFileIds]
      }
      if (unit.storyboardFileId !== undefined && unit.storyboardFileId !== null) {
        editingConfig.storyboardFileId = unit.storyboardFileId
      }
      // 从图库重新加载输入图片的 preview
      if (Array.isArray(unit.inputImages)) {
        editingConfig.inputImages = [null, null, null, null]
        await Promise.all(unit.inputImages.map(async (imgData, i) => {
          if (i >= 4) return
          if (!imgData) return
          const fileId = imgData.fileId
          if (!fileId) return
          try {
            const base64 = await apiClient.getGalleryImageBase64(fileId)
            if (base64) {
              editingConfig.inputImages[i] = { base64, preview: base64, fileId }
            }
          } catch (e) {
            console.warn('加载输入图片失败:', e)
          }
        }))
      }

      // 如果来自任务库，设置 editingFunction 为一个标记对象（包含 taskId），使保存时更新任务而非新建功能
      if (unit.taskId) {
        editingFunction.value = { _fromTask: true, taskId: unit.taskId, name: unit.taskName || unit.functionName }
      }

      testResults.value = []
      generationStore.generationStatus = ''
      generationStore.error = ''
      showDialog.value = true
    } catch (e) {
      console.error('加载任务库功能配置失败:', e)
    } finally {
      // 清除 pending 状态
      generationStore.clearPendingFunctionUnit()
    }
  }
)

// ============ 初始化 ============
onMounted(async () => {
  try {
    await Promise.all([
      loadFunctions(),
      loadFunctionCategories(),
      loadActiveComfyuiConfigs(),
      loadWorkflowFiles(),
      loadPromptFiles(),
      galleryStore.loadAll()
    ])
  } catch (e) {
    console.error('加载数据失败:', e)
  }
})
</script>

<style scoped>
.function-library {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.function-library h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}

/* 分类栏 */
.category-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.category-tabs {
  display: flex;
  gap: 4px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  flex-wrap: wrap;
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
}

.category-tab:hover {
  color: var(--text-primary);
}

.category-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color, #4a9eff);
}

.cat-count {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.7;
}

.cat-actions {
  display: none;
  gap: 2px;
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 4px;
  z-index: 10;
}

.cat-lock {
  margin-left: 4px;
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
}

.category-tab:hover .cat-actions {
  display: flex;
}

.cat-action-btn {
  padding: 1px 4px;
  background: transparent;
  border: 1px solid var(--text-muted, #555);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
  line-height: 1.2;
}

.cat-action-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.cat-action-btn.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 联通测试结果 */
.connection-results {
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}

.connection-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.connection-result-row {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
}

.conn-name {
  flex: 1;
  color: var(--text-primary);
}

.conn-status {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.conn-status.success {
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.1);
}

.conn-status.fail {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.conn-error {
  color: var(--text-secondary);
  font-size: 11px;
}

/* 功能列表 */
.entity-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--input-shadow);
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 36px 1.5fr 90px 1fr 1fr 130px 150px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128, 128, 128, 0.15));
}

.list-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128, 128, 128, 0.05));
  transition: background 0.15s ease;
}

.list-row:hover {
  background: var(--bg-secondary);
}

.list-row:last-child {
  border-bottom: none;
}

.col-check {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.col-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.col-name:hover {
  color: var(--accent-color);
}

.col-cat {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-date {
  font-size: 11px;
  color: var(--text-muted);
}

.col-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

/* 复选框 */
.checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.checkbox.checked {
  background: var(--accent-color);
  border-color: var(--accent-color);
  position: relative;
}

.checkbox.checked::after {
  content: '✓';
  color: white;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.btn-icon-sm {
  padding: 4px 8px;
  background: var(--bg-secondary);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-icon-sm:hover {
  background: var(--bg-primary);
}

.btn-icon-sm.danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* 已激活功能按钮：绿色高亮，与 ComfyUI 配置的"已激活"风格一致 */
.btn-icon-sm.act-on {
  background: rgba(46, 204, 113, 0.18);
  color: #27ae60;
  border: 1px solid rgba(46, 204, 113, 0.45);
}
.btn-icon-sm.act-on:hover {
  background: rgba(46, 204, 113, 0.3);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* 按钮 */
.btn {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: none;
}

.btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent-color, #4a9eff);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 批量按钮分隔符 */
.btn-divider {
  color: var(--text-tertiary, #666);
  margin: 0 4px;
  opacity: 0.5;
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* 搜索框 */
.filter-search {
  flex: 1;
  min-width: 180px;
  padding: 7px 12px;
  background: var(--bg-surface);
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  box-shadow: var(--input-shadow);
  outline: none;
}

.filter-search:focus {
  box-shadow: 0 0 0 2px var(--accent-color);
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-shadow: var(--input-shadow);
  box-sizing: border-box;
}

/* 功能类型选项卡（样式参考 ComfyUI 配置页面的 .tabs/.tab-item） */
.function-type-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border-color);
}

.function-type-tab {
  padding: 10px 16px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.function-type-tab:hover {
  color: var(--text-primary);
}

.function-type-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color, #4a9eff);
  box-shadow: none;
}

/* 测试结果 */
.test-results {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}

.test-results h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.test-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.test-result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.test-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.2));
  display: block;
}

.test-result-name {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态/进度 */
.status-row {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 10px;
}

.status-progress {
  color: var(--accent-color);
  font-weight: 600;
}

.error-text {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}

.loading {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-left: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 保存状态渐隐文字 */
.save-status-msg {
  display: block;
  font-size: 13px;
  color: #2ecc71;
  font-weight: 600;
  margin-top: 8px;
}

.save-fade-enter-active {
  transition: opacity 0.3s ease;
}

.save-fade-leave-active {
  transition: opacity 2.5s ease;
}

.save-fade-enter-from,
.save-fade-leave-to {
  opacity: 0;
}

/* FloatingWindow confirm 消息样式（保留原 .confirm-dialog p 的视觉效果） */
.fw-confirm-msg {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

.fw-confirm-msg small {
  font-size: 12px;
  color: var(--text-muted);
}

/* 图片预览 */
.preview-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  cursor: zoom-out;
}

.preview-img {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 4px;
}

/* 文字编辑：样例测试区 */
.text-edit-test {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 8px;
  background: var(--bg-secondary);
}

.tet-head {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.tet-input,
.tet-out {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.7;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.tet-out {
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-surface);
}

.tet-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tet-err {
  font-size: 12px;
  color: #ef4444;
}
</style>
