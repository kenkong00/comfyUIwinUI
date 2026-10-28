<template>
  <div class="card task-manager">
    <h2>任务管理</h2>

    <p class="hint">将JSON管理中的分镜文件和工作流管理中的工作流打包成生成任务</p>

    <!-- 分类栏（参考 WorkflowEditor） -->
    <div class="category-bar">
      <div class="category-tabs">
        <!-- 系统分类：未完成任务 -->
        <div
          :class="['category-tab', { active: activeCategory === 'incomplete' }]"
          @click="switchCategory('incomplete')"
        >
          <span class="cat-name">未完成任务</span>
          <span class="cat-count">{{ incompleteCount }}</span>
        </div>
        <!-- 系统分类：已完成任务 -->
        <div
          :class="['category-tab', { active: activeCategory === 'completed' }]"
          @click="switchCategory('completed')"
        >
          <span class="cat-name">已完成任务</span>
          <span class="cat-count">{{ completedCount }}</span>
        </div>
        <!-- 用户自定义分类 -->
        <div
          v-for="cat in taskCategories"
          :key="cat.id"
          :class="['category-tab', { active: activeCategory === cat.id }]"
          @click="switchCategory(cat.id)"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ getCategoryCount(cat.id) }}</span>
          <span class="cat-actions" @click.stop>
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
        <button class="btn btn-primary" @click="openCreateDialog">+ 新建任务</button>
        <button class="btn btn-primary" @click="openFunctionPackageDialog">+ 新建功能任务包</button>
        <span class="btn-divider">|</span>
        <button
          v-if="activeCategory !== 'completed'"
          :disabled="selectedIds.length === 0"
          class="btn btn-sm"
          @click="batchReview"
        >批量审核 ({{ selectedIds.length }})</button>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm btn-danger"
          @click="confirmBatchDelete"
        >删除选中 ({{ selectedIds.length }})</button>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm"
          @click="showBatchMove = true; batchMoveTarget = null"
        >批量移动 ({{ selectedIds.length }})</button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="task-list" v-if="filteredTasks.length > 0">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-name">任务名称</div>
        <div class="col-workflow">使用工作流</div>
        <div class="col-count">文件个数</div>
        <div class="col-total">分镜总数</div>
        <div class="col-desc">描述</div>
        <div class="col-status">状态</div>
        <div class="col-date">创建时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div v-for="task in filteredTasks" :key="task.id" class="list-row">
        <div class="col-check" @click.stop="toggleSelect(task.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(task.id) }]"></div>
        </div>
        <div class="col-name" :title="task.name">{{ task.name }}</div>
        <div class="col-workflow">{{ getWorkflowName(task.workflow_api_id) }}</div>
        <div class="col-count">{{ task.total_count }}</div>
        <div class="col-total">{{ getStoryboardTotal(task) }}</div>
        <div class="col-desc" :title="task.description">{{ task.description || '-' }}</div>
        <div class="col-status">
          <span :class="['status-tag', statusClass(task)]">{{ statusLabel(task) }}</span>
        </div>
        <div class="col-date">{{ formatDate(task.created_at) }}</div>
        <div class="col-actions">
          <button class="btn-icon-sm" @click="editTask(task)" title="编辑">编辑</button>
          <button
            v-if="task.status !== 'completed' && task.reviewed !== 1"
            class="btn-icon-sm"
            @click="reviewTask(task)"
            title="审核"
          >审核</button>
          <button
            v-if="task.status !== 'completed' && task.reviewed === 1"
            class="btn-icon-sm"
            @click="unreviewTask(task)"
            title="取消审核"
          >取消审核</button>
          <button
            v-if="task.status !== 'completed'"
            class="btn-icon-sm"
            @click="confirmCompleteTask(task)"
            title="标记完成"
          >完成</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteTask(task)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>暂无任务，点击"新建任务"创建</p>
    </div>

    <!-- 新建/编辑任务对话框 -->
    <FloatingWindow v-model:open="showDialogOpen" :title="editingTask ? '编辑任务' : '新建任务'" size="large">
      <div class="form-group">
        <label>任务名称</label>
        <input type="text" v-model="taskForm.name" placeholder="例如: 120个单人摄影分镜" />
      </div>
      <div class="form-group">
        <label>描述（可选）</label>
        <input type="text" v-model="taskForm.description" placeholder="任务描述" />
      </div>
      <div class="form-group">
        <label>分类</label>
        <select v-model="taskForm.category_id">
          <option :value="0">未分类</option>
          <option v-for="cat in taskCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>插入提示词（可选，将拼接到每个分镜提示词前面）</label>
        <FileSelector
          v-model="taskForm.insertedPromptIds"
          file-type="prompt"
          mode="multiple"
          placeholder="未插入提示词"
        />
      </div>
      <div class="form-group">
        <label>使用工作流（单选）</label>
        <FileSelector
          v-model="taskForm.workflow_api_id"
          file-type="workflow"
          mode="single"
          placeholder="未选择工作流（将使用默认）"
        />
      </div>
      <div class="form-group">
        <label>选择分镜JSON文件</label>
        <FileSelector
          v-model="taskForm.selectedJsonIds"
          file-type="json"
          mode="multiple"
          placeholder="未选择JSON文件"
        />
      </div>
      <template #footer>
        <button class="btn" @click="closeDialog">取消</button>
        <button class="btn btn-primary" @click="doSaveTask" :disabled="!taskForm.name || taskForm.selectedJsonIds.length === 0">
          {{ editingTask ? '保存' : '创建' }}
        </button>
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

    <!-- 删除分类确认弹窗 -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除分类"{{ deleteConfirm.target?.name }}"吗？<br/><small>该分类下的任务将移到"未完成任务"</small></p>
      <template #footer>
        <button class="btn" @click="deleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除任务确认弹窗 -->
    <FloatingWindow v-model:open="taskDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除任务"{{ taskDeleteConfirm.target?.name }}"吗？</p>
      <template #footer>
        <button class="btn" @click="taskDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteTask">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 批量删除确认弹窗 -->
    <FloatingWindow v-model:open="batchDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除选中的 {{ batchDeleteConfirm.count }} 个任务吗？</p>
      <template #footer>
        <button class="btn" @click="batchDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doBatchDelete">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 标记完成确认弹窗 -->
    <FloatingWindow v-model:open="completeConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要将任务"{{ completeConfirm.target?.name }}"标记为已完成吗？<br/><small>已完成的任务将进入"已完成任务"分类</small></p>
      <template #footer>
        <button class="btn" @click="completeConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doCompleteTask">确定</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动弹窗 -->
    <FloatingWindow v-model:open="showBatchMove" :title="`批量移动 ${selectedIds.length} 个任务`" size="default">
      <p style="margin-bottom: 12px; color: var(--text-secondary);">选择目标分类：</p>
      <div class="move-target-list">
        <div
          :class="['move-target-item', { active: batchMoveTarget === 0 }]"
          @click="batchMoveTarget = 0"
        >未完成任务（默认）</div>
        <div
          v-for="cat in taskCategories"
          :key="cat.id"
          :class="['move-target-item', { active: batchMoveTarget === cat.id }]"
          @click="batchMoveTarget = cat.id"
        >{{ cat.name }}</div>
      </div>
      <template #footer>
        <button class="btn" @click="showBatchMove = false">取消</button>
        <button class="btn btn-primary" @click="confirmBatchMove" :disabled="batchMoveTarget === null">确定移动</button>
      </template>
    </FloatingWindow>

    <!-- 新建/编辑功能任务包对话框 -->
    <FloatingWindow v-model:open="showFunctionPackageDialogOpen" :title="editingFunctionPackageTask ? '编辑功能任务包' : '新建功能任务包'" size="large">
      <div class="form-group">
        <label>任务包名称</label>
        <input type="text" v-model="functionPackageForm.name" placeholder="例如：人像写真合集" />
      </div>
      <div class="form-group">
        <label>描述（可选）</label>
        <input type="text" v-model="functionPackageForm.description" placeholder="任务包描述" />
      </div>
      <div class="form-group">
        <label>分类</label>
        <select v-model="functionPackageForm.category_id">
          <option :value="0">未分类</option>
          <option v-for="cat in taskCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>选择功能任务单元（多选，来自文件库中类型为"功能"的文件）</label>
        <div class="function-checklist">
          <div class="checklist-search">
            <input
              type="text"
              v-model="functionSearchQuery"
              placeholder="搜索功能任务单元名称..."
              class="checklist-search-input"
            />
            <span class="checklist-search-count">{{ functionPackageForm.selectedFunctionIds.length }} 已选 / {{ availableFunctionFiles.length }} 个</span>
          </div>
          <div v-if="availableFunctionFiles.length === 0" class="empty-hint">暂无功能任务单元，请先在功能测试中保存</div>
          <label
            v-for="f in filteredFunctionFiles"
            :key="f.id"
            :class="['checklist-item', { checked: functionPackageForm.selectedFunctionIds.includes(f.id) }]"
          >
            <input
              type="checkbox"
              :value="f.id"
              :checked="functionPackageForm.selectedFunctionIds.includes(f.id)"
              @change="toggleFunctionSelect(f.id)"
            />
            <span class="checklist-name">{{ f.name }}</span>
            <span class="checklist-type">{{ getFunctionTabName(f) }}</span>
          </label>
          <div v-if="filteredFunctionFiles.length === 0 && availableFunctionFiles.length > 0" class="empty-hint">无匹配项</div>
        </div>
      </div>
      <div v-if="functionPackagePreview.length > 0" class="function-preview-list">
        <p class="preview-title">将包含以下功能单元：</p>
        <div v-for="(item, idx) in functionPackagePreview" :key="idx" class="preview-item">
          <span class="preview-index">{{ idx + 1 }}.</span>
          <span class="preview-name">{{ item.name }}</span>
          <span class="preview-type">{{ item.tabName }}</span>
        </div>
      </div>
      <template #footer>
        <button class="btn" @click="closeFunctionPackageDialog">取消</button>
        <button
          class="btn btn-primary"
          @click="doCreateFunctionPackage"
          :disabled="!functionPackageForm.name || functionPackageForm.selectedFunctionIds.length === 0"
        >{{ editingFunctionPackageTask ? '保存' : '创建并审核' }}</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { apiClient } from '@/services/api'
import FileSelector from '@/components/common/FileSelector.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const tasks = ref([])
const taskCategories = ref([])

// 可调用文件缓存（用于显示任务列表中的工作流名称和分镜总数）
const callableWorkflows = ref([])
const callableJsons = ref([])

const showDialog = ref(false)
const editingTask = ref(null)
// 当前正在编辑的功能任务包（若为 null 表示新建模式）
const editingFunctionPackageTask = ref(null)
const selectedIds = ref([])

const activeCategory = ref('incomplete')

const showAddCategory = ref(false)
const newCategoryName = ref('')
const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })
const deleteConfirm = ref({ show: false, target: null })
const taskDeleteConfirm = ref({ show: false, target: null })
const batchDeleteConfirm = ref({ show: false, count: 0 })
const completeConfirm = ref({ show: false, target: null })

const taskForm = reactive({
  name: '',
  description: '',
  category_id: 0,
  workflow_api_id: null,
  selectedJsonIds: [],
  insertedPromptIds: []
})

const incompleteCount = computed(() =>
  tasks.value.filter(t => t.status !== 'completed').length
)

const completedCount = computed(() =>
  tasks.value.filter(t => t.status === 'completed').length
)

const filteredTasks = computed(() => {
  if (activeCategory.value === 'incomplete') {
    return tasks.value.filter(t => t.status !== 'completed')
  }
  if (activeCategory.value === 'completed') {
    return tasks.value.filter(t => t.status === 'completed')
  }
  // 用户分类：按 category_id 过滤，且排除已完成
  return tasks.value.filter(t => t.category_id === activeCategory.value && t.status !== 'completed')
})

// FloatingWindow open proxies
const showDialogOpen = computed({
  get: () => showDialog.value,
  set: (v) => { if (!v) closeDialog() }
})
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})
const taskDeleteConfirmOpen = computed({
  get: () => taskDeleteConfirm.value.show,
  set: (v) => { if (!v) taskDeleteConfirm.value.show = false }
})
const batchDeleteConfirmOpen = computed({
  get: () => batchDeleteConfirm.value.show,
  set: (v) => { if (!v) batchDeleteConfirm.value.show = false }
})
const completeConfirmOpen = computed({
  get: () => completeConfirm.value.show,
  set: (v) => { if (!v) completeConfirm.value.show = false }
})
const showFunctionPackageDialogOpen = computed({
  get: () => showFunctionPackageDialog.value,
  set: (v) => { if (!v) closeFunctionPackageDialog() }
})

function getWorkflowName(workflowApiId) {
  if (!workflowApiId || workflowApiId === 0) return '默认工作流'
  const wf = callableWorkflows.value.find(w => w.id === workflowApiId)
  return wf ? wf.name : '未知'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function getStoryboardTotal(task) {
  let ids = task.storyboard_json_ids
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids) } catch (e) { ids = [] }
  }
  if (!Array.isArray(ids) || ids.length === 0) return 0
  return ids.reduce((total, id) => {
    const json = callableJsons.value.find(j => j.id === id)
    return total + (json ? (json.prompt_count || 0) : 0)
  }, 0)
}

function statusLabel(task) {
  if (task.status === 'completed') return '已完成'
  if (task.status === 'approved' || task.reviewed === 1) return '已审核'
  return '未审核'
}

function statusClass(task) {
  if (task.status === 'completed') return 'status-completed'
  if (task.status === 'approved' || task.reviewed === 1) return 'status-approved'
  return 'status-pending'
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

// 切换分类时清空勾选
function switchCategory(cat) {
  activeCategory.value = cat
  selectedIds.value = []
}

// 批量移动到分类
const showBatchMove = ref(false)
const batchMoveTarget = ref(null)
async function confirmBatchMove() {
  if (!batchMoveTarget.value || selectedIds.value.length === 0) return
  try {
    await apiClient.batchCategorizeGenerationTasks([...selectedIds.value], batchMoveTarget.value)
    selectedIds.value = []
    showBatchMove.value = false
    batchMoveTarget.value = null
    await loadTasks()
  } catch (e) {
    alert('批量移动失败: ' + e.message)
  }
}

function openCreateDialog() {
  editingTask.value = null
  taskForm.name = ''
  taskForm.description = ''
  taskForm.category_id = 0
  taskForm.workflow_api_id = null
  taskForm.selectedJsonIds = []
  taskForm.insertedPromptIds = []
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingTask.value = null
}

// ============ 新建功能任务包 ============
const showFunctionPackageDialog = ref(false)
const functionPackageForm = reactive({
  name: '',
  description: '',
  category_id: 0,
  selectedFunctionIds: []
})
// 文件库中所有 'function' 类型的文件
const availableFunctionFiles = ref([])
// 选中的功能单元预览（解析后的配置）
const functionPackagePreview = ref([])
// 功能任务单元搜索关键字
const functionSearchQuery = ref('')
// 按搜索词过滤后的功能文件列表
const filteredFunctionFiles = computed(() => {
  const q = functionSearchQuery.value.trim().toLowerCase()
  if (!q) return availableFunctionFiles.value
  return availableFunctionFiles.value.filter(f =>
    (f.name || '').toLowerCase().includes(q) ||
    (getFunctionTabName(f) || '').toLowerCase().includes(q)
  )
})

function getFunctionTabName(f) {
  try {
    const cfg = typeof f.content === 'string' ? JSON.parse(f.content) : (f.content || {})
    return cfg.tabName || '功能'
  } catch (e) {
    return '功能'
  }
}

function toggleFunctionSelect(id) {
  const idx = functionPackageForm.selectedFunctionIds.indexOf(id)
  if (idx > -1) functionPackageForm.selectedFunctionIds.splice(idx, 1)
  else functionPackageForm.selectedFunctionIds.push(id)
}

async function loadAvailableFunctionFiles() {
  try {
    const list = await apiClient.getFileLibraryFiles({ file_type: 'function' })
    availableFunctionFiles.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载功能文件列表失败:', e)
    availableFunctionFiles.value = []
  }
}

async function openFunctionPackageDialog() {
  editingFunctionPackageTask.value = null
  functionPackageForm.name = ''
  functionPackageForm.description = ''
  functionPackageForm.category_id = 0
  functionPackageForm.selectedFunctionIds = []
  functionPackagePreview.value = []
  functionSearchQuery.value = ''
  await loadAvailableFunctionFiles()
  showFunctionPackageDialog.value = true
}

function closeFunctionPackageDialog() {
  showFunctionPackageDialog.value = false
  editingFunctionPackageTask.value = null
}

// 监听选择变化，加载预览
async function refreshFunctionPackagePreview() {
  const ids = functionPackageForm.selectedFunctionIds || []
  if (ids.length === 0) {
    functionPackagePreview.value = []
    return
  }
  try {
    const items = await Promise.all(ids.map(id => apiClient.getFileLibraryFileById(id)))
    functionPackagePreview.value = items.filter(Boolean).map(f => {
      let cfg = {}
      try {
        cfg = typeof f.content === 'string' ? JSON.parse(f.content) : (f.content || {})
      } catch (e) { /* ignore */ }
      return {
        id: f.id,
        name: f.name,
        tabName: cfg.tabName || '功能',
        config: cfg
      }
    })
  } catch (e) {
    console.error('加载功能单元预览失败:', e)
    functionPackagePreview.value = []
  }
}

// 监听 selectedFunctionIds 变化，加载预览
watch(() => functionPackageForm.selectedFunctionIds, () => {
  refreshFunctionPackagePreview()
}, { deep: true })

async function doCreateFunctionPackage() {
  if (!functionPackageForm.name || functionPackageForm.selectedFunctionIds.length === 0) return
  try {
    // 加载每个功能单元的完整配置，构建 function_configs 数组
    const files = await Promise.all(
      functionPackageForm.selectedFunctionIds.map(id => apiClient.getFileLibraryFileById(id))
    )
    const functionConfigs = files.filter(Boolean).map(f => {
      try {
        const cfg = typeof f.content === 'string' ? JSON.parse(f.content) : (f.content || {})
        return {
          fileId: f.id,
          functionName: f.name,
          ...cfg
        }
      } catch (e) {
        return { fileId: f.id, functionName: f.name, promptText: '' }
      }
    })

    // 任务数据（storyboard_json_ids 为空，function_configs 填充）
    const data = {
      name: functionPackageForm.name,
      description: functionPackageForm.description,
      category_id: functionPackageForm.category_id,
      workflow_api_id: 0,
      storyboard_json_ids: [],
      inserted_prompt_ids: [],
      function_configs: functionConfigs
    }

    if (editingFunctionPackageTask.value) {
      // 编辑模式：更新已有任务
      await apiClient.updateGenerationTask(editingFunctionPackageTask.value.id, data)
    } else {
      // 新建模式：创建任务并自动审核
      const created = await apiClient.createGenerationTask(data)
      if (created && created.id) {
        // 自动审核，使其出现在批量任务列表中
        try {
          await apiClient.reviewGenerationTask(created.id)
        } catch (e) {
          console.warn('自动审核失败:', e)
        }
      }
    }
    closeFunctionPackageDialog()
    await loadTasks()
  } catch (e) {
    console.error('保存功能任务包失败:', e)
    alert('保存功能任务包失败: ' + e.message)
  }
}

async function editTask(task) {
  try {
    const full = await apiClient.getGenerationTaskById(task.id)
    if (!full) return

    // 检测是否为功能任务包：function_configs 字段存在且非空
    let functionConfigs = full.function_configs
    if (typeof functionConfigs === 'string') {
      try { functionConfigs = JSON.parse(functionConfigs) } catch (e) { functionConfigs = [] }
    }
    const isFunctionPackage = Array.isArray(functionConfigs) && functionConfigs.length > 0

    if (isFunctionPackage) {
      // 打开功能任务包弹窗，并填充已有数据
      editingFunctionPackageTask.value = full
      functionPackageForm.name = full.name || ''
      functionPackageForm.description = full.description || ''
      functionPackageForm.category_id = full.category_id || 0
      functionPackageForm.selectedFunctionIds = functionConfigs
        .map(c => c.fileId)
        .filter(Boolean)
      functionSearchQuery.value = ''
      await loadAvailableFunctionFiles()
      showFunctionPackageDialog.value = true
      return
    }

    // 普通任务：走原有逻辑
    editingTask.value = full
    taskForm.name = full.name
    taskForm.description = full.description || ''
    taskForm.category_id = full.category_id || 0
    taskForm.workflow_api_id = full.workflow_api_id || null
    let ids = full.storyboard_json_ids
    if (typeof ids === 'string') {
      try { ids = JSON.parse(ids) } catch (e) { ids = [] }
    }
    taskForm.selectedJsonIds = Array.isArray(ids) ? [...ids] : []
    // 加载已插入的提示词 ID
    let pids = full.inserted_prompt_ids
    if (typeof pids === 'string') {
      try { pids = JSON.parse(pids) } catch (e) { pids = [] }
    }
    taskForm.insertedPromptIds = Array.isArray(pids) ? [...pids] : []
    showDialog.value = true
  } catch (e) {
    console.error('加载任务失败:', e)
  }
}

async function doSaveTask() {
  if (!taskForm.name || taskForm.selectedJsonIds.length === 0) return
  try {
    const data = {
      name: taskForm.name,
      description: taskForm.description,
      category_id: taskForm.category_id,
      workflow_api_id: taskForm.workflow_api_id || 0,
      storyboard_json_ids: taskForm.selectedJsonIds,
      inserted_prompt_ids: taskForm.insertedPromptIds
    }
    if (editingTask.value) {
      await apiClient.updateGenerationTask(editingTask.value.id, data)
    } else {
      await apiClient.createGenerationTask(data)
    }
    closeDialog()
    await loadTasks()
  } catch (e) {
    console.error('保存任务失败:', e)
  }
}

function confirmDeleteTask(task) {
  taskDeleteConfirm.value = { show: true, target: task }
}

async function doDeleteTask() {
  const task = taskDeleteConfirm.value.target
  taskDeleteConfirm.value.show = false
  try {
    await apiClient.deleteGenerationTask(task.id)
    await loadTasks()
  } catch (e) {
    console.error('删除失败:', e)
  }
}

function confirmBatchDelete() {
  batchDeleteConfirm.value = { show: true, count: selectedIds.value.length }
}

async function doBatchDelete() {
  batchDeleteConfirm.value.show = false
  try {
    await apiClient.batchDeleteGenerationTasks([...selectedIds.value])
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量删除失败:', e)
  }
}

async function reviewTask(task) {
  try {
    await apiClient.reviewGenerationTask(task.id)
    await loadTasks()
  } catch (e) {
    console.error('审核失败:', e)
  }
}

async function unreviewTask(task) {
  try {
    await apiClient.unreviewGenerationTask(task.id)
    await loadTasks()
  } catch (e) {
    console.error('取消审核失败:', e)
  }
}

function confirmCompleteTask(task) {
  completeConfirm.value = { show: true, target: task }
}

async function doCompleteTask() {
  const task = completeConfirm.value.target
  completeConfirm.value.show = false
  try {
    await apiClient.completeGenerationTask(task.id)
    await loadTasks()
  } catch (e) {
    console.error('标记完成失败:', e)
  }
}

async function batchReview() {
  if (selectedIds.value.length === 0) return
  try {
    await apiClient.batchReviewGenerationTasks([...selectedIds.value])
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量审核失败:', e)
  }
}

async function loadTasks() {
  try {
    tasks.value = await apiClient.getGenerationTasks()
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      const validIds = new Set(tasks.value.map(item => item.id))
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载任务列表失败:', e)
  }
}

async function loadCallableFiles() {
  try {
    const [wfs, js] = await Promise.all([
      apiClient.getCallableFiles('workflow'),
      apiClient.getCallableFiles('json')
    ])
    callableWorkflows.value = wfs || []
    callableJsons.value = js || []
  } catch (e) {
    console.error('加载可调用文件失败:', e)
    callableWorkflows.value = []
    callableJsons.value = []
  }
}

async function loadTaskCategories() {
  try {
    taskCategories.value = await apiClient.getTaskCategories()
  } catch (e) {
    console.error('加载任务分类失败:', e)
  }
}

function getCategoryCount(catId) {
  return tasks.value.filter(t => t.category_id === catId && t.status !== 'completed').length
}

async function doAddCategory() {
  if (!newCategoryName.value) return
  try {
    await apiClient.createTaskCategory({ name: newCategoryName.value })
    showAddCategory.value = false
    newCategoryName.value = ''
    await loadTaskCategories()
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
  try {
    await apiClient.updateTaskCategory(renamingCategory.value.id, { name: renameForm.name })
    renamingCategory.value = null
    await loadTaskCategories()
  } catch (e) {
    console.error('重命名失败:', e)
  }
}

function confirmDeleteCategory(cat) {
  deleteConfirm.value = { show: true, target: cat }
}

async function doDeleteCategory() {
  const cat = deleteConfirm.value.target
  deleteConfirm.value.show = false
  try {
    await apiClient.deleteTaskCategory(cat.id)
    if (activeCategory.value === cat.id) activeCategory.value = 'incomplete'
    await loadTaskCategories()
    await loadTasks()
  } catch (e) {
    console.error('删除失败:', e)
  }
}

onMounted(() => {
  loadTasks()
  loadCallableFiles()
  loadTaskCategories()
})
</script>

<style scoped>
.task-manager {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.task-manager h2 {
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

/* 分类栏（参考 WorkflowEditor） */
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

/* 任务列表 */
.task-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--input-shadow);
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 36px 1.4fr 1.2fr 56px 56px 1fr 76px 92px 200px;
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
}

.col-workflow {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-count {
  font-size: 13px;
  color: var(--accent-color);
  font-weight: 600;
}

.col-total {
  font-size: 13px;
  color: var(--accent-color);
  font-weight: 600;
}

.col-desc {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-status {
  font-size: 12px;
}

.col-date {
  font-size: 12px;
  color: var(--text-muted);
}

.col-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

/* 状态标签 */
.status-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.status-pending {
  background: rgba(234, 179, 8, 0.15);
  color: #ca8a04;
}

.status-approved {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

.status-completed {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

/* 复选框（多选） */
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

/* 单选圆点（工作流单选） */
.radio {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted);
  border-radius: 50%;
  transition: all 0.15s ease;
  flex-shrink: 0;
  position: relative;
}

.radio.checked {
  border-color: var(--accent-color);
}

.radio.checked::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-color);
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

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* Buttons */
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

.move-target-list {
  max-height: 300px;
  overflow-y: auto;
}

.move-target-item {
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-primary);
  margin-bottom: 4px;
  transition: background 0.15s;
}
.move-target-item:hover {
  background: var(--bg-surface);
}
.move-target-item.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

/* 功能任务包预览列表 */
.function-preview-list {
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 8px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--bg-surface);
}
.function-preview-list .preview-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}
.function-preview-list .preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--border-color, rgba(255,255,255,0.05));
}
.function-preview-list .preview-item:last-child {
  border-bottom: none;
}
.function-preview-list .preview-index {
  color: var(--text-secondary);
  min-width: 24px;
}
.function-preview-list .preview-name {
  flex: 1;
  color: var(--text-primary);
}
.function-preview-list .preview-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-color);
  color: var(--accent-text, #fff);
}

/* 功能任务单元勾选列表 */
.function-checklist {
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 8px;
  padding: 6px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg-surface);
}
.function-checklist .checklist-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 8px;
  border-bottom: 1px solid var(--border-color, rgba(128,128,128,0.15));
  margin-bottom: 6px;
}
.function-checklist .checklist-search-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color, rgba(128,128,128,0.2));
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}
.function-checklist .checklist-search-input:focus {
  border-color: var(--accent-color);
}
.function-checklist .checklist-search-count {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.function-checklist .empty-hint {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
.function-checklist .checklist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.function-checklist .checklist-item:hover {
  background: var(--bg-secondary);
}
.function-checklist .checklist-item.checked {
  background: var(--bg-secondary);
}
.function-checklist .checklist-item input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  min-width: 16px;
}
.function-checklist .checklist-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.function-checklist .checklist-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-color);
  color: var(--accent-text, #fff);
  flex-shrink: 0;
  white-space: nowrap;
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
}

.form-group small {
  display: block;
  margin-top: 6px;
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 500;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-select {
  padding: 6px 10px;
  background: var(--bg-surface);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: var(--input-shadow);
}

.filter-search {
  flex: 1;
  min-width: 120px;
  padding: 6px 10px;
  background: var(--bg-surface);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: var(--input-shadow);
}

.json-select-list {
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 6px;
}

.json-select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.json-select-item:hover {
  background: var(--bg-secondary);
}

.json-select-item.selected {
  background: rgba(74, 158, 255, 0.1);
}

.json-select-item.invalid {
  opacity: 0.6;
}

.item-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.item-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
}

.item-status.valid {
  background: rgba(76, 175, 80, 0.15);
  color: #4CAF50;
}

.item-status.invalid {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.empty-hint {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
  font-size: 13px;
}

/* 提示词选择器 */
.prompt-selector {
  position: relative;
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 8px;
}

.selected-area {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.empty-hint-text {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 28px;
  flex: 1;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--accent-color);
  color: var(--accent-text);
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.chip-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.chip-remove:hover {
  background: rgba(255, 255, 255, 0.25);
}

.add-btn {
  padding: 4px 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px dashed var(--border-color, rgba(255,255,255,0.2));
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.add-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.picker-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--bg-surface);
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
}

.picker-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.picker-close {
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
}

.picker-close:hover {
  background: var(--bg-secondary);
}

.picker-search {
  padding: 8px 14px;
}

.picker-search .search-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color, rgba(255,255,255,0.1));
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}

.picker-search .search-input:focus {
  border-color: var(--accent-color);
}

.category-tabs-mini {
  display: flex;
  gap: 4px;
  padding: 0 14px 8px;
  overflow-x: auto;
}

.cat-tab-mini {
  padding: 4px 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cat-tab-mini:hover {
  color: var(--text-primary);
}

.cat-tab-mini.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.cat-count-mini {
  font-size: 10px;
  opacity: 0.8;
}

.prompt-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
}

.prompt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.prompt-item:hover {
  background: var(--bg-secondary);
}

.prompt-item.checked {
  background: rgba(74, 158, 255, 0.1);
}

.prompt-item .checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.prompt-item .checkbox.checked {
  background: var(--accent-color);
  border-color: var(--accent-color);
  position: relative;
}

.prompt-item .checkbox.checked::after {
  content: '✓';
  color: white;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.prompt-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.picker-empty {
  padding: 32px 14px;
  text-align: center;
  color: var(--text-secondary);
}

.picker-empty p {
  margin: 0 0 4px;
  font-size: 14px;
}

.picker-empty small {
  font-size: 12px;
}
</style>
