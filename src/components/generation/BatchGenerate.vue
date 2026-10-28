<template>
  <div class="card batch-tasks">
    <h2>批量任务</h2>

    <p class="hint">选择已审核任务批量执行，支持搜索、排序、暂停/恢复、断点续传和完成标记。</p>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <input
          type="text"
          v-model="searchQuery"
          placeholder="搜索任务名..."
          class="search-input"
          :disabled="isExecView"
        />
        <button class="btn btn-sm" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <span v-if="selectedIds.length > 0" class="selected-info">已选 {{ selectedIds.length }} 个</span>
        <span class="btn-divider">|</span>
        <button
          v-if="isExecView && generationStore.isGenerating"
          :disabled="selectedIds.length === 0"
          class="btn btn-sm btn-warn"
          @click="batchPause"
        >批量暂停 ({{ selectedIds.length }})</button>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm" @click="loadTasks" :disabled="generationStore.isGenerating">刷新</button>
        <button
          v-if="isExecView && hasResumableTasks && !generationStore.isGenerating"
          class="btn btn-sm btn-primary"
          @click="continueExecution"
        >继续执行</button>
        <span class="btn-divider">|</span>
        <button
          v-if="isExecView && !generationStore.isGenerating"
          :disabled="selectedIds.length === 0"
          class="btn btn-sm btn-complete"
          @click="confirmComplete"
        >确定完成</button>
      </div>
    </div>

    <!-- 任务列表 -->
    <div class="task-list" v-if="displayTasks.length > 0">
      <div class="list-header">
        <div class="col-check">选择</div>
        <div class="col-name">任务名称</div>
        <div class="col-progress">进度</div>
        <div class="col-workflow">使用工作流</div>
        <div class="col-status">状态</div>
        <div class="col-action">操作</div>
        <div class="col-sort">排序</div>
      </div>
      <div
        v-for="(task, idx) in displayTasks"
        :key="task.id"
        :class="['list-row', {
          selected: selectedIds.includes(task.id),
          current: isExecView && generationStore.taskExecution.currentTaskIndex === idx
        }]"
      >
        <div class="col-check" @click.stop="toggleSelect(task.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(task.id), disabled: checkboxDisabled(task) }]"></div>
          <div v-if="isExecView" class="completion-hint">
            {{ isTaskCompleted(task) ? '已完成' : '未完成' }}
          </div>
        </div>
        <div class="col-name" :title="task.name">{{ task.name }}</div>
        <div class="col-progress">
          <span v-if="isExecView" class="progress-badge">{{ task.completed }}/{{ task.total }}</span>
          <span v-else-if="task.progress_index > 0" class="progress-badge">{{ task.progress_index }}/{{ task.total_prompts || task.total_count || '?' }}</span>
          <span v-else class="progress-badge">{{ task.total_count || 0 }}/{{ task.total_count || 0 }}</span>
        </div>
        <div class="col-workflow" :title="getWorkflowName(task.workflow_api_id)">{{ getWorkflowName(task.workflow_api_id) }}</div>
        <div class="col-status">
          <span :class="['status-badge', getTaskStatusClass(task)]">
            {{ getTaskStatusText(task) }}
          </span>
        </div>
        <div class="col-action">
          <button
            v-if="isExecView && task.status === 'running' && !task.paused"
            class="btn-icon-sm"
            @click="generationStore.pauseTask(task.id)"
          >暂停</button>
          <button
            v-else-if="isExecView && (task.paused || (task.status === 'pending' && task.progressIndex < task.total))"
            class="btn-icon-sm"
            @click="generationStore.resumeTask(task.id)"
          >恢复</button>
          <button
            v-else-if="isExecView && isTaskCompleted(task)"
            class="btn-icon-sm btn-complete-action"
            @click="completeSingleTask(task.id)"
            title="标记为已完成并从列表移除"
          >完成</button>
          <span v-else-if="!isExecView && task.progress_index > 0" class="action-placeholder">续传</span>
          <span v-else class="action-placeholder">-</span>
        </div>
        <div class="col-sort">
          <button
            class="btn-icon-sm"
            @click="moveTaskUp(idx)"
            :disabled="idx === 0 || generationStore.isGenerating"
            title="上移"
          >↑</button>
          <button
            class="btn-icon-sm"
            @click="moveTaskDown(idx)"
            :disabled="idx === displayTasks.length - 1 || generationStore.isGenerating"
            title="下移"
          >↓</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>{{ emptyStateText }}</p>
    </div>

    <!-- 总进度 -->
    <div v-if="isExecView || generationStore.progress > 0" class="overall-progress">
      <div class="progress-header">
        <span>{{ generationStore.generationStatus }}</span>
        <span class="progress-numbers">{{ generationStore.taskExecution.overallCompleted }} / {{ generationStore.taskExecution.overallTotal }}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: (generationStore.progress || 0) + '%' }"></div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="button-row">
      <button
        v-if="!generationStore.isGenerating && !isExecView"
        @click.prevent="startExecution"
        :disabled="selectedIds.length === 0"
        class="generate-btn"
      >
        开始批量生成
      </button>
      <button
        v-if="generationStore.isGenerating"
        @click.prevent="confirmStop"
        class="stop-btn"
      >
        停止执行
      </button>
      <button
        v-if="isExecView && !generationStore.isGenerating"
        @click.prevent="exitExecView"
        class="generate-btn"
      >
        返回列表
      </button>
    </div>

    <!-- 停止确认 -->
    <FloatingWindow v-model:open="showStopConfirm" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要停止任务执行吗？<br/><small>已完成的图片不会丢失</small></p>
      <template #footer>
        <button class="btn" @click="showStopConfirm = false">继续执行</button>
        <button class="btn btn-danger" @click="doStop">确定停止</button>
      </template>
    </FloatingWindow>

    <!-- 完成确认 -->
    <FloatingWindow v-model:open="showCompleteConfirm" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要将选中的 {{ selectedIds.length }} 个任务标记为已完成吗？<br/><small>这些任务将从批量列表中移除</small></p>
      <template #footer>
        <button class="btn" @click="showCompleteConfirm = false">取消</button>
        <button class="btn btn-danger" @click="doComplete">确定完成</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGenerationStore } from '@/stores/generation'
import { apiClient } from '@/services/api'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const generationStore = useGenerationStore()

const approvedTasks = ref([])
const workflows = ref([])
const searchQuery = ref('')
const selectedIds = ref([])
const showStopConfirm = ref(false)
const showCompleteConfirm = ref(false)

// 按任务名搜索过滤（仅作用于候选列表）
const filteredTasks = computed(() => {
  if (!searchQuery.value) return approvedTasks.value
  const q = searchQuery.value.toLowerCase()
  return approvedTasks.value.filter(t => (t.name || '').toLowerCase().includes(q))
})

// 执行中或执行后(taskExecution.tasks 非空)：显示实时进度列表；否则显示候选列表
const isExecView = computed(() => generationStore.taskExecution.tasks.length > 0)

const displayTasks = computed(() => isExecView.value ? generationStore.taskExecution.tasks : filteredTasks.value)

const allSelected = computed(() => {
  const pickable = displayTasks.value.filter(t => !checkboxDisabled(t))
  return pickable.length > 0 && pickable.every(t => selectedIds.value.includes(t.id))
})

const emptyStateText = computed(() => {
  if (isExecView.value) return '暂无执行任务'
  if (searchQuery.value) return '没有匹配的任务'
  return '暂无已审核任务，请先在"任务管理"中审核任务'
})

// 是否有可恢复的任务（暂停后待执行的）
const hasResumableTasks = computed(() => {
  return generationStore.taskExecution.tasks.some(t =>
    t.status === 'pending' && !t.paused && t.progressIndex < t.total
  )
})

function isTaskCompleted(task) {
  return task.total && task.completed >= task.total
}

function isTaskRunning(task) {
  return task.status === 'running' && generationStore.isGenerating
}

function checkboxDisabled(task) {
  // 执行视图中，正在执行的任务不允许勾选完成
  if (isExecView.value && isTaskRunning(task)) return true
  return false
}

function getTaskProgress(task) {
  if (!task.total) return 0
  return Math.round((task.completed / task.total) * 100)
}

function getCandidateProgress(task) {
  const total = task.total_prompts || task.total_count || 0
  if (!total) return 0
  return Math.round(((task.progress_index || 0) / total) * 100)
}

function getWorkflowName(wfId) {
  if (!wfId || wfId === 0) return '默认工作流'
  const wf = workflows.value.find(w => w.id === wfId)
  return wf ? wf.name : '未知工作流'
}

function getTaskStatusText(task) {
  if (isExecView.value) {
    if (task.paused) return '已暂停'
    switch (task.status) {
      case 'running': return '执行中'
      case 'completed': return '已完成'
      case 'cancelled': return '已停止'
      case 'pending': return '等待中'
      default: return '待执行'
    }
  }
  // 候选视图：显示保存的进度状态
  if (task.progress_index > 0) return '续传'
  return '待执行'
}

function getTaskStatusClass(task) {
  if (isExecView.value) {
    if (task.paused) return 'paused'
    return task.status || 'pending'
  }
  if (task.progress_index > 0) return 'paused'
  return 'pending'
}

function toggleSelect(id) {
  const task = displayTasks.value.find(t => t.id === id)
  if (!task || checkboxDisabled(task)) return
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  const pickable = displayTasks.value.filter(t => !checkboxDisabled(t))
  if (pickable.length > 0 && pickable.every(t => selectedIds.value.includes(t.id))) {
    // 取消全选：仅移除当前可见且可选的
    const visibleIds = new Set(pickable.map(t => t.id))
    selectedIds.value = selectedIds.value.filter(id => !visibleIds.has(id))
  } else {
    pickable.forEach(t => {
      if (!selectedIds.value.includes(t.id)) selectedIds.value.push(t.id)
    })
  }
}

async function loadTasks() {
  try {
    approvedTasks.value = await apiClient.getGenerationTasks({ status: 'approved' })
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      const validIds = new Set(approvedTasks.value.map(item => item.id))
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载已审核任务失败:', e)
  }
}

async function loadWorkflows() {
  try {
    workflows.value = await apiClient.getCallableFiles('workflow')
  } catch (e) {
    console.error('加载工作流失败:', e)
  }
}

async function startExecution() {
  if (selectedIds.value.length === 0) return
  // 按 approvedTasks 的当前顺序传入（执行前的排序生效）
  const orderedIds = approvedTasks.value
    .filter(t => selectedIds.value.includes(t.id))
    .map(t => t.id)
  selectedIds.value = []
  await generationStore.executeTasks(orderedIds)
  // 执行结束后刷新候选列表（status 可能已变化）
  await loadTasks()
}

// 排序：上移/下移
async function moveTaskUp(idx) {
  if (idx <= 0 || generationStore.isGenerating) return
  if (isExecView.value) return // 执行中不允许调整顺序
  const tasks = approvedTasks.value
  ;[tasks[idx], tasks[idx - 1]] = [tasks[idx - 1], tasks[idx]]
  await persistSort(tasks)
}

async function moveTaskDown(idx) {
  if (idx >= displayTasks.value.length - 1 || generationStore.isGenerating) return
  if (isExecView.value) return // 执行中不允许调整顺序
  const tasks = approvedTasks.value
  ;[tasks[idx], tasks[idx + 1]] = [tasks[idx + 1], tasks[idx]]
  await persistSort(tasks)
}

async function persistSort(tasks) {
  try {
    const items = tasks.map((t, i) => ({ id: t.id, sort_order: i + 1 }))
    await apiClient.batchSortGenerationTasks(items)
  } catch (e) {
    console.error('保存排序失败:', e)
  }
}

function confirmStop() {
  showStopConfirm.value = true
}

async function doStop() {
  showStopConfirm.value = false
  await generationStore.cancelTaskExecution()
  await loadTasks()
}

function confirmComplete() {
  if (selectedIds.value.length === 0) return
  showCompleteConfirm.value = true
}

async function doComplete() {
  showCompleteConfirm.value = false
  const ids = [...selectedIds.value]
  selectedIds.value = []
  for (const id of ids) {
    await generationStore.completeTask(id)
  }
  await loadTasks()
}

// 单个任务标记完成（从操作栏点击）
async function completeSingleTask(taskId) {
  await generationStore.completeTask(taskId)
  await loadTasks()
}

// 批量暂停选中任务
async function batchPause() {
  const ids = [...selectedIds.value]
  await generationStore.batchPauseTasks(ids)
  selectedIds.value = []
}

// 继续执行（恢复暂停的任务后重启执行循环）
async function continueExecution() {
  await generationStore.resumeExecution()
  await loadTasks()
}

// 退出执行视图，返回候选列表
function exitExecView() {
  generationStore.taskExecution.tasks = []
  generationStore.taskExecution.currentTaskIndex = -1
  generationStore.taskExecution.overallCompleted = 0
  generationStore.taskExecution.overallTotal = 0
  generationStore.progress = 0
  generationStore.generationStatus = ''
  selectedIds.value = []
  loadTasks()
}

onMounted(() => {
  loadTasks()
  loadWorkflows()
})
</script>

<style scoped>
.batch-tasks {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.batch-tasks h2 {
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

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  padding: 6px 12px;
  background: var(--bg-surface);
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  width: 200px;
  box-shadow: var(--input-shadow);
}

.search-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.selected-info {
  font-size: 13px;
  color: var(--accent-color);
  font-weight: 500;
}

.task-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 70px 1.5fr 1.2fr 1.2fr 90px 80px 70px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.1));
}

.list-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.05));
  transition: background 0.15s ease;
}

.list-row:hover {
  background: var(--bg-secondary);
}

.list-row.selected {
  background: rgba(74, 158, 255, 0.08);
}

.list-row.current {
  background: rgba(74, 158, 255, 0.14);
  box-shadow: inset 3px 0 0 var(--accent-color);
}

.list-row:last-child {
  border-bottom: none;
}

.col-check {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
}

.checkbox.checked {
  background: var(--accent-color);
  border-color: var(--accent-color);
  position: relative;
}

.checkbox.checked::after {
  content: '✓';
  color: white;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.checkbox.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.completion-hint {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1;
}

.col-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-progress {
  min-width: 0;
  text-align: center;
}

/* 进度数字徽章：绿底白字，字体放大 */
.progress-badge {
  display: inline-block;
  padding: 4px 12px;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  border-radius: 10px;
  white-space: nowrap;
  letter-spacing: 0.5px;
  box-shadow: 0 0 6px rgba(76, 175, 80, 0.4);
}

.col-workflow {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.col-status {
  text-align: center;
}

.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.status-badge.pending {
  background: rgba(128, 128, 128, 0.15);
  color: var(--text-secondary);
}

.status-badge.running {
  background: rgba(74, 158, 255, 0.15);
  color: var(--accent-color);
}

.status-badge.paused {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.status-badge.completed {
  background: rgba(76, 175, 80, 0.15);
  color: #4CAF50;
}

.status-badge.cancelled {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.col-action {
  display: flex;
  justify-content: center;
}

.action-placeholder {
  color: var(--text-muted);
  font-size: 12px;
}

.col-sort {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.btn-icon-sm {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}

.btn-icon-sm:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.btn-icon-sm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-complete-action {
  border-color: #22c55e;
  color: #22c55e;
}
.btn-complete-action:hover:not(:disabled) {
  background: #22c55e;
  color: #fff;
  border-color: #22c55e;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.overall-progress {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.progress-numbers {
  font-weight: 600;
  color: var(--accent-color);
}

.progress-bar {
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A, #CDDC39);
  border-radius: 4px;
  transition: width 0.5s ease-out;
}

.button-row {
  display: flex;
  gap: 10px;
}

.generate-btn {
  background: linear-gradient(135deg, var(--accent-color), #4a9eff);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 24px;
  transition: opacity 0.15s ease;
  box-shadow: 0 4px 14px rgba(74,158,255,0.35);
}

.generate-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-btn {
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 20px;
  transition: opacity 0.15s ease;
}

.stop-btn:hover {
  opacity: 0.85;
}

/* Buttons */
.btn {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: var(--input-shadow);
}

.btn:hover:not(:disabled) {
  box-shadow: var(--card-shadow);
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

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

.btn-complete {
  background: #4CAF50;
  color: white;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
}

.btn-complete:hover:not(:disabled) {
  opacity: 0.9;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text, white);
  box-shadow: 0 2px 8px rgba(74, 158, 255, 0.3);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-warn {
  background: #f59e0b;
  color: white;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

.btn-warn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

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
</style>
