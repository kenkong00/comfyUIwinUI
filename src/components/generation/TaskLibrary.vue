<template>
  <div class="card task-library">
    <h2>任务</h2>
    <p class="section-desc">管理生成任务、执行队列和历史记录</p>

    <!-- 三选项卡 -->
    <div class="tabs">
      <div class="tab-item" :class="{ active: activeTab === 'executing' }" @click="switchTab('executing')">
        执行中任务<span class="tab-count">{{ executingDbTasks.length }}</span>
      </div>
      <div class="tab-item" :class="{ active: activeTab === 'completed' }" @click="switchTab('completed')">
        已完成任务<span class="tab-count">{{ completedTasks.length }}</span>
      </div>
      <div class="tab-item" :class="{ active: activeTab === 'library' }" @click="switchTab('library')">
        任务库<span class="tab-count">{{ libraryTasks.length }}</span>
      </div>
    </div>

    <!-- 临时反馈条（悬浮在页面底部，淡入淡出） -->
    <Teleport to="body">
      <Transition name="feedback-fade">
        <div v-if="feedback" class="feedback-bar">{{ feedback }}</div>
      </Transition>
    </Teleport>

    <!-- ============ 选项卡1：任务库 ============ -->
    <div v-show="activeTab === 'library'" class="tab-content">
      <!-- 第一层：JSON类 / 功能类 页面切换 -->
      <div class="library-page-tabs">
        <div :class="['lib-page-tab', { active: activeLibraryPage === 'json' }]" @click="switchLibraryPage('json')">
          <span>JSON类</span>
          <span class="tab-count">{{ jsonLibraryTasks.length }}</span>
        </div>
        <div :class="['lib-page-tab', { active: activeLibraryPage === 'function' }]" @click="switchLibraryPage('function')">
          <span>功能类</span>
          <span class="tab-count">{{ functionLibraryTasks.length }}</span>
        </div>
      </div>

      <!-- 当前页面的分类栏 -->
      <div class="category-bar">
        <div class="category-tabs">
          <div
            :class="['category-tab', { active: activeCategory === 0 }]"
            @click="switchCategory(0)"
          >
            <span class="cat-name">全部</span>
            <span class="cat-count">{{ getCategoryCount(0) }}</span>
          </div>
          <div
            v-for="cat in currentPageCategories"
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
        <button class="btn btn-sm" @click="openAddCategory(currentLibraryType)">+ 添加分类</button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-primary" @click="openCreateDialog">
            {{ activeLibraryPage === 'json' ? '+ json任务' : '+ 功能任务' }}
          </button>
          <button class="btn btn-sm" @click="toggleSelectAllLibrary">
            {{ allLibrarySelected ? '取消全选' : '全选' }}
          </button>
          <span class="btn-divider">|</span>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm btn-primary"
            @click="batchExecuteFromLibrary"
          >批量执行 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm btn-danger"
            @click="confirmBatchDelete"
          >删除选中 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm"
            @click="showBatchMove = true; batchMoveTarget = null"
          >移动选中 ({{ selectedIds.length }})</button>
        </div>
        <div class="toolbar-right">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="搜索任务名..."
            class="search-input"
          />
          <button class="btn btn-sm" @click="loadTasks" title="刷新任务列表">刷新</button>
        </div>
      </div>

      <!-- 任务列表 -->
      <div class="entity-list" v-if="filteredLibraryTasks.length > 0">
        <div class="list-header lib-grid">
          <div class="col-check"></div>
          <div class="col-name">任务名称</div>
          <div class="col-content">包含内容</div>
          <div class="col-cat">分类</div>
          <div class="col-date">创建时间</div>
          <div class="col-actions">操作</div>
        </div>
        <div v-for="task in filteredLibraryTasks" :key="task.id" class="list-row lib-grid">
          <div class="col-check" @click.stop="toggleSelect(task.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(task.id) }]"></div>
          </div>
          <div class="col-name" :title="task.name">{{ task.name }}</div>
          <div class="col-content" :title="isFunctionTask(task) ? getFunctionNames(task).join('、') : ''">{{ getContentDisplay(task) }}</div>
          <div class="col-cat">{{ getCategoryName(task.category_id) }}</div>
          <div class="col-date">{{ formatDate(task.created_at) }}</div>
          <div class="col-actions">
            <button class="btn-icon-sm exec" @click="executeFromLibrary(task)" title="执行">执行</button>
            <button class="btn-icon-sm" @click="editTask(task)" title="编辑">编辑</button>
            <button class="btn-icon-sm" @click="openBatchMoveSingle(task)" title="移动">移动</button>
            <button class="btn-icon-sm danger" @click="confirmDeleteTask(task)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>{{ searchQuery ? '没有匹配的任务' : (activeLibraryPage === 'json' ? '暂无JSON类任务，点击"+ json任务"创建' : '暂无功能类任务，点击"+ 功能任务"创建') }}</p>
      </div>
    </div>

    <!-- ============ 选项卡2：执行中任务 ============ -->
    <div v-show="activeTab === 'executing'" class="tab-content">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm" @click="toggleSelectAllExecuting">
            {{ allExecutingSelected ? '取消全选' : '全选' }}
          </button>
          <span class="btn-divider">|</span>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm btn-primary"
            @click="batchExecuteSelected"
          >执行 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0 || !generationStore.isGenerating"
            class="btn btn-sm btn-warn"
            @click="batchPauseSelected"
          >暂停 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm"
            @click="batchComplete"
          >完成 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm btn-danger"
            @click="confirmBatchRemoveFromExecuting"
          >删除 ({{ selectedIds.length }})</button>
        </div>
      </div>

      <!-- 执行中任务列表 -->
      <div class="entity-list" v-if="executingDisplayTasks.length > 0">
        <div class="list-header exec-grid">
          <div class="col-check"></div>
          <div class="col-name">任务名称</div>
          <div class="col-workflow">使用工作流</div>
          <div class="col-comfyui">ComfyUI配置</div>
          <div class="col-progress">进度</div>
          <div class="col-status">状态</div>
          <div class="col-actions">操作</div>
        </div>
        <div
          v-for="item in executingDisplayTasks"
          :key="item.db.id"
          :class="['list-row', 'exec-grid', { current: item.live && item.live.status === 'running' }]"
        >
          <div class="col-check" @click.stop="toggleSelect(item.db.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(item.db.id), disabled: item.live && item.live.status === 'running' }]"></div>
          </div>
          <div class="col-name" :title="item.db.name">{{ item.db.name }}</div>
          <div class="col-workflow" :title="getWorkflowName(item.db.workflow_api_id)">{{ getWorkflowName(item.db.workflow_api_id) }}</div>
          <div class="col-comfyui">{{ getComfyuiName(item.db) }}</div>
          <div class="col-progress">
            <div class="progress-wrap">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: getExecProgressPercent(item) + '%' }"></div>
              </div>
              <span class="progress-text">{{ getExecProgressText(item) }}</span>
            </div>
          </div>
          <div class="col-status">
            <span :class="['status-badge', getExecStatusClass(item)]">{{ getExecStatusText(item) }}</span>
            <div v-if="item.live && item.live.status === 'error'" class="task-error-msg" :title="item.live.errorMessage">
              {{ item.live.errorMessage }}
            </div>
            <div v-else-if="!item.live && item.db.error_message" class="task-error-msg" :title="item.db.error_message">
              {{ item.db.error_message }}
            </div>
          </div>
          <div class="col-actions">
            <button
              v-if="item.live && item.live.status === 'running' && !item.live.paused"
              class="btn-icon-sm"
              @click="generationStore.pauseTask(item.db.id)"
            >暂停</button>
            <button
              v-else-if="item.live && item.live.paused"
              class="btn-icon-sm"
              @click="generationStore.resumeTask(item.db.id)"
            >恢复</button>
            <button
              v-else-if="(item.live && item.live.status === 'error') || (!item.live && item.db.error_message)"
              class="btn-icon-sm exec"
              @click="retryTask(item.db)"
              title="重新执行"
            >重试</button>
            <button
              v-else-if="!item.live"
              class="btn-icon-sm exec"
              @click="startQueuedTask(item.db)"
              title="执行"
            >执行</button>
            <button
              v-else
              class="btn-icon-sm"
              @click="cancelQueuedTask(item.db.id)"
              title="取消排队"
            >取消</button>
            <button
              v-if="item.live && item.live.status === 'completed'"
              class="btn-icon-sm complete"
              @click="manualComplete(item.db)"
              title="移到已完成"
            >完成</button>
            <button class="btn-icon-sm danger" @click="confirmRemoveFromExecuting(item.db)" title="移回任务库">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>暂无执行中任务</p>
      </div>

      <!-- 总进度 -->
      <div v-if="generationStore.taskExecution.tasks.length > 0" class="overall-progress">
        <div class="progress-header">
          <span>{{ generationStore.generationStatus }}</span>
          <span class="progress-numbers">{{ generationStore.taskExecution.overallCompleted }} / {{ generationStore.taskExecution.overallTotal }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (generationStore.progress || 0) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- ============ 选项卡3：已完成任务 ============ -->
    <div v-show="activeTab === 'completed'" class="tab-content">
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm" @click="toggleSelectAllCompleted">
            {{ allCompletedSelected ? '取消全选' : '全选' }}
          </button>
          <span class="btn-divider">|</span>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm"
            @click="batchReexecute"
          >重新执行 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm btn-danger"
            @click="confirmBatchRemoveFromCompleted"
          >移出历史 ({{ selectedIds.length }})</button>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-sm" @click="loadTasks">刷新</button>
        </div>
      </div>

      <div class="entity-list" v-if="completedTasks.length > 0">
        <div class="list-header done-grid">
          <div class="col-check"></div>
          <div class="col-name">任务名称</div>
          <div class="col-workflow">使用工作流</div>
          <div class="col-date">完成时间</div>
          <div class="col-count">生成数量</div>
          <div class="col-actions">操作</div>
        </div>
        <div v-for="task in completedTasks" :key="task.id" class="list-row done-grid">
          <div class="col-check" @click.stop="toggleSelect(task.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(task.id) }]"></div>
          </div>
          <div class="col-name" :title="task.name">{{ task.name }}</div>
          <div class="col-workflow" :title="getWorkflowName(task.workflow_api_id)">{{ getWorkflowName(task.workflow_api_id) }}</div>
          <div class="col-date">{{ formatDate(task.updated_at || task.created_at) }}</div>
          <div class="col-count">{{ task.total_count || getStoryboardTotal(task) || 0 }}</div>
          <div class="col-actions">
            <button class="btn-icon-sm exec" @click="reexecuteFromCompleted(task)" title="重新执行">重新执行</button>
            <button class="btn-icon-sm danger" @click="removeFromCompleted(task)" title="移回任务库">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>暂无已完成任务</p>
      </div>
    </div>

    <!-- ============ 新建/编辑任务对话框 ============ -->
    <FloatingWindow v-model:open="showDialog" :title="editingTask?.id ? '编辑任务' : '新建任务'" size="large">
      <!-- 任务头部：名称 + ComfyUI配置选择（仅 JSON 类任务显示 ComfyUI 配置） -->
      <div class="task-form-header" v-if="!isEditingFunctionTask">
        <div class="form-group task-name-group">
          <label>任务名称<span class="required-mark">*</span></label>
          <input type="text" v-model="taskForm.name" placeholder="例如: 120个单人摄影分镜" />
        </div>
        <div class="form-group comfyui-select-group">
          <label>ComfyUI 配置（单选）<span class="required-mark">*</span></label>
          <select v-model="taskForm.comfyui_config_id">
            <option :value="null" disabled>请选择 ComfyUI 配置</option>
            <option :value="0">使用主激活配置</option>
            <option
              v-for="cfg in comfyuiConfigs"
              :key="cfg.id"
              :value="cfg.id"
            >{{ cfg.name }}</option>
          </select>
        </div>
      </div>
      <div class="form-group" v-else>
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
          <option v-for="cat in currentPageCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
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
      <div class="form-group" v-if="!isEditingFunctionTask">
        <label>使用工作流（单选）<span class="required-mark">*</span></label>
        <FileSelector
          v-model="taskForm.workflow_api_id"
          file-type="workflow"
          mode="single"
          placeholder="未选择工作流（将使用默认）"
        />
      </div>
      <div class="form-group" v-if="!isEditingFunctionTask">
        <label>选择分镜JSON文件<span class="required-mark">*</span></label>
        <FileSelector
          v-model="taskForm.selectedJsonIds"
          file-type="json"
          mode="multiple"
          placeholder="未选择JSON文件"
        />
      </div>
      <template #footer>
        <button class="btn" @click="closeDialog">取消</button>
        <button class="btn btn-primary" @click="doSaveTask" :disabled="!canSaveTask">
          {{ editingTask?.id ? '保存' : '创建' }}
        </button>
      </template>
    </FloatingWindow>

    <!-- 添加分类对话框 -->
    <FloatingWindow v-model:open="showAddCategory" :title="`添加${currentLibraryType === 'function' ? '功能类' : 'JSON类'}分类`" size="default">
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

    <!-- 批量移动弹窗 -->
    <FloatingWindow v-model:open="showBatchMove" :title="`移动 ${selectedIds.length} 个任务到分类`" size="default">
      <div class="move-target-list">
        <div
          :class="['move-target-item', { active: batchMoveTarget === 0 }]"
          @click="batchMoveTarget = 0"
        >未分类</div>
        <div
          v-for="cat in currentPageCategories"
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

    <!-- 删除分类确认 -->
    <FloatingWindow v-model:open="deleteCategoryConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除分类"{{ deleteCategoryConfirm.target?.name }}"吗？<br /><small>该分类下的任务将移到"未分类"</small></p>
      <template #footer>
        <button class="btn" @click="deleteCategoryConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除任务确认（任务库中真正删除） -->
    <FloatingWindow v-model:open="taskDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除任务"{{ taskDeleteConfirm.target?.name }}"吗？<br /><small>该操作会从数据库永久移除</small></p>
      <template #footer>
        <button class="btn" @click="taskDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteTask">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 批量删除确认（任务库） -->
    <FloatingWindow v-model:open="batchDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除选中的 {{ batchDeleteConfirm.count }} 个任务吗？<br /><small>该操作会从数据库永久移除</small></p>
      <template #footer>
        <button class="btn" @click="batchDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doBatchDelete">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 批量移出执行队列确认 -->
    <FloatingWindow v-model:open="batchRemoveExecConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要将选中的 {{ batchRemoveExecConfirm.count }} 个任务移出执行队列吗？<br /><small>任务将回到任务库，不会删除数据库记录</small></p>
      <template #footer>
        <button class="btn" @click="batchRemoveExecConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doBatchRemoveFromExecuting">确定移出</button>
      </template>
    </FloatingWindow>

    <!-- 单个移出执行队列确认 -->
    <FloatingWindow v-model:open="singleRemoveExecConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg" v-if="singleRemoveExecConfirm.task">确定要将任务"{{ singleRemoveExecConfirm.task.name }}"移出执行队列吗？<br /><small>任务将回到任务库，不会删除数据库记录</small></p>
      <template #footer>
        <button class="btn" @click="singleRemoveExecConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="singleRemoveExecConfirm.show = false; removeFromExecuting(singleRemoveExecConfirm.task)">确定移出</button>
      </template>
    </FloatingWindow>

    <!-- 批量移出已完成确认 -->
    <FloatingWindow v-model:open="batchRemoveDoneConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要将选中的 {{ batchRemoveDoneConfirm.count }} 个任务移出历史记录吗？<br /><small>任务将回到任务库，不会删除数据库记录</small></p>
      <template #footer>
        <button class="btn" @click="batchRemoveDoneConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doBatchRemoveFromCompleted">确定移出</button>
      </template>
    </FloatingWindow>

    <!-- 停止执行确认 -->
    <FloatingWindow v-model:open="showStopConfirm" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要停止任务执行吗？<br /><small>已完成的图片不会丢失</small></p>
      <template #footer>
        <button class="btn" @click="showStopConfirm = false">继续执行</button>
        <button class="btn btn-danger" @click="doStop">确定停止</button>
      </template>
    </FloatingWindow>

    <!-- ============ 功能编辑器对话框（功能类任务新建/编辑，不跳转功能库） ============ -->
    <FloatingWindow
      v-model:open="showFunctionDialog"
      :title="editingFunctionTask ? '编辑功能任务' : '新建功能任务'"
      size="large"
      @close="closeFunctionDialog"
    >
      <!-- 功能类型选项卡（样式参考 ComfyUI 配置页面的 .tabs/.tab-item） -->
      <div class="function-type-tabs">
        <div
          v-for="t in functionTabs"
          :key="t.id"
          class="function-type-tab"
          :class="{ active: functionEditingTabId === t.id }"
          @click="functionEditingTabId = t.id"
        >{{ t.name }}</div>
      </div>

      <!-- 功能编辑表单 -->
      <FunctionEditor :config="functionEditingConfig" :tabId="functionEditingTabId" />

      <!-- 保存状态 -->
      <transition name="save-fade">
        <span v-if="functionSaveStatus" class="save-status-msg">{{ functionSaveStatus }}</span>
      </transition>

      <template #footer>
        <button class="btn" @click="closeFunctionDialog">取消</button>
        <button
          class="btn btn-primary"
          @click="saveFunctionAsTask"
          :disabled="!canSaveFunctionTask"
        >保存成任务</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { apiClient } from '@/services/api'
import { useGenerationStore } from '@/stores/generation'
import { useTaskQueueStore } from '@/stores/taskQueue'
import FileSelector from '@/components/common/FileSelector.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import FunctionEditor from '@/components/generation/FunctionEditor.vue'

const generationStore = useGenerationStore()

// ============ 数据 ============
const allTasks = ref([])
// 任务分类：按 category_type 分为两组
const jsonTaskCategories = ref([])
const functionTaskCategories = ref([])
const callableWorkflows = ref([])
const callableJsons = ref([])
const comfyuiConfigs = ref([])

// ============ 选项卡与选择 ============
const taskProps = defineProps({
  initialFilter: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['navigate'])

const activeTab = ref(
  taskProps.initialFilter === 'running' ? 'executing' :
  taskProps.initialFilter === 'done' ? 'completed' :
  'library'
)

// 选项卡 → 侧边栏 navId 映射
const tabToNavId = (tab) => {
  if (tab === 'executing') return 'task-running'
  if (tab === 'completed') return 'task-done'
  return 'task'
}

// 监听 initialFilter 变化（侧边栏点击时同步选项卡）
watch(
  () => taskProps.initialFilter,
  (newFilter) => {
    const newTab = newFilter === 'running' ? 'executing' : newFilter === 'done' ? 'completed' : 'library'
    if (newTab !== activeTab.value) {
      activeTab.value = newTab
      selectedIds.value = []
    }
  }
)
// 任务库下的二级页面：'json' | 'function'
const activeLibraryPage = ref('json')
const selectedIds = ref([])
const searchQuery = ref('')
const activeCategory = ref(0)

// ============ 反馈 ============
const feedback = ref('')
let feedbackTimer = null
function showFeedback(msg) {
  feedback.value = msg
  clearTimeout(feedbackTimer)
  // 2s 后开始淡出，2.5s 后移除元素
  feedbackTimer = setTimeout(() => { feedback.value = '' }, 2500)
}

// ============ 对话框状态 ============
const showDialog = ref(false)
const editingTask = ref(null)
const taskForm = reactive({
  name: '',
  description: '',
  category_id: 0,
  workflow_api_id: null,
  comfyui_config_id: null,
  selectedJsonIds: [],
  insertedPromptIds: []
})
// 当前编辑的是否为功能类任务（用于在对话框中放宽 JSON 必填校验）
const isEditingFunctionTask = computed(() => !!editingTask.value && isFunctionTask(editingTask.value))
// 保存按钮可用条件：
// - 功能类任务：仅需任务名称
// - JSON 类任务：名称、ComfyUI 配置（单选）、使用工作流（单选）、选择分镜 JSON 文件 四项必填
const canSaveTask = computed(() => {
  if (!taskForm.name) return false
  if (isEditingFunctionTask.value) return true
  // JSON 类任务四项必填校验
  if (taskForm.comfyui_config_id === null || taskForm.comfyui_config_id === undefined) return false
  if (!taskForm.workflow_api_id || taskForm.workflow_api_id <= 0) return false
  if (!Array.isArray(taskForm.selectedJsonIds) || taskForm.selectedJsonIds.length === 0) return false
  return true
})

// ============ 功能编辑器状态（功能类任务新建/编辑，不跳转功能库） ============
const functionTabs = [
  { id: 'text2img', name: '文生图' },
  { id: 'img2img', name: '图像编辑' },
  { id: 'text2video', name: '文生视频' },
  { id: 'img2video', name: '图生视频' },
  { id: 'batch-inference', name: '批量推理' }
]
const showFunctionDialog = ref(false)
const functionEditingTabId = ref('text2img')
const functionEditingConfig = reactive(makeDefaultFunctionConfig('text2img'))
const editingFunctionTask = ref(null)  // 正在编辑的任务对象（null 表示新建）
const functionSaveStatus = ref('')

function makeDefaultFunctionConfig(tabId = 'text2img') {
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
    apiConfigId: null,
    promptRuleFileIds: []
  }
}

// 功能保存为任务：5项必填校验（仅批量推理 tab）
const canSaveFunctionTask = computed(() => {
  if (!functionEditingConfig.functionName || !functionEditingConfig.functionName.trim()) return false
  if (functionEditingTabId.value === 'batch-inference') {
    if (!functionEditingConfig.comfyuiConfigId) return false
    if (!functionEditingConfig.apiConfigId) return false
    if (!functionEditingConfig.selectedWorkflowId) return false
    if (!Array.isArray(functionEditingConfig.promptRuleFileIds) || functionEditingConfig.promptRuleFileIds.length === 0) return false
    if (!functionEditingConfig.promptText || !functionEditingConfig.promptText.trim()) return false
  }
  return true
})

function openFunctionCreateDialog() {
  editingFunctionTask.value = null
  functionEditingTabId.value = 'text2img'
  Object.assign(functionEditingConfig, makeDefaultFunctionConfig('text2img'))
  functionSaveStatus.value = ''
  showFunctionDialog.value = true
}

async function openFunctionEditDialog(task) {
  editingFunctionTask.value = task
  let cfgs = task.function_configs
  if (typeof cfgs === 'string') {
    try { cfgs = JSON.parse(cfgs) } catch (e) { cfgs = [] }
  }
  const fc = Array.isArray(cfgs) && cfgs.length > 0 ? cfgs[0] : null
  const tabId = fc?.tabId || 'text2img'
  functionEditingTabId.value = tabId
  // 重置为默认值然后用保存的配置覆盖
  Object.assign(functionEditingConfig, makeDefaultFunctionConfig(tabId))
  if (fc) {
    if (fc.functionName) functionEditingConfig.functionName = fc.functionName
    if (fc.comfyuiConfigId !== undefined) functionEditingConfig.comfyuiConfigId = fc.comfyuiConfigId
    if (fc.selectedWorkflowId !== undefined) functionEditingConfig.selectedWorkflowId = fc.selectedWorkflowId
    if (typeof fc.needsImage === 'boolean') functionEditingConfig.needsImage = fc.needsImage
    if (Array.isArray(fc.imageNodeIds)) functionEditingConfig.imageNodeIds = [...fc.imageNodeIds, '', '', '', ''].slice(0, 4)
    if (Array.isArray(fc.insertedPromptIds)) functionEditingConfig.insertedPromptIds = [...fc.insertedPromptIds]
    if (fc.promptText !== undefined) functionEditingConfig.promptText = fc.promptText
    if (fc.imageParams && typeof fc.imageParams === 'object') {
      functionEditingConfig.imageParams = { ...makeDefaultFunctionConfig(tabId).imageParams, ...fc.imageParams }
    }
    if (fc.videoParams && typeof fc.videoParams === 'object') {
      functionEditingConfig.videoParams = { ...makeDefaultFunctionConfig(tabId).videoParams, ...fc.videoParams }
    }
    if (fc.apiConfigId !== undefined) functionEditingConfig.apiConfigId = fc.apiConfigId
    if (Array.isArray(fc.promptRuleFileIds)) functionEditingConfig.promptRuleFileIds = [...fc.promptRuleFileIds]
    // 重新加载输入图片预览
    if (Array.isArray(fc.inputImages)) {
      functionEditingConfig.inputImages = [null, null, null, null]
      await Promise.all(fc.inputImages.map(async (imgData, i) => {
        if (i >= 4) return
        if (!imgData) return
        const fileId = imgData.fileId
        if (!fileId) return
        try {
          const base64 = await apiClient.getGalleryImageBase64(fileId)
          if (base64) {
            functionEditingConfig.inputImages[i] = { base64, preview: base64, fileId }
          }
        } catch (e) {
          console.warn(`加载输入图片 ${i + 1} 失败:`, e)
        }
      }))
    }
  }
  functionSaveStatus.value = ''
  showFunctionDialog.value = true
}

function closeFunctionDialog() {
  showFunctionDialog.value = false
  editingFunctionTask.value = null
  functionSaveStatus.value = ''
}

async function saveFunctionAsTask() {
  const name = (functionEditingConfig.functionName || '').trim()
  if (!name) {
    functionSaveStatus.value = '请输入功能名称'
    return
  }
  const cfg = functionEditingConfig
  const functionConfigs = [{
    name: cfg.functionName,
    tabId: functionEditingTabId.value,
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
    apiConfigId: cfg.apiConfigId || null,
    promptRuleFileIds: [...(cfg.promptRuleFileIds || [])]
  }]
  const taskData = {
    name: name + ' 任务',
    description: '由任务库功能类创建',
    workflow_api_id: cfg.selectedWorkflowId || 0,
    storyboard_json_ids: [],
    inserted_prompt_ids: cfg.insertedPromptIds || [],
    function_configs: functionConfigs,
    category_id: 0
  }
  try {
    if (editingFunctionTask.value && editingFunctionTask.value.id) {
      // 编辑现有任务
      await apiClient.updateGenerationTask(editingFunctionTask.value.id, taskData)
      functionSaveStatus.value = '任务已更新'
    } else {
      await apiClient.createGenerationTask(taskData)
      functionSaveStatus.value = '已保存到任务库'
    }
    await loadTasks()
    setTimeout(() => {
      closeFunctionDialog()
    }, 1000)
  } catch (e) {
    console.error('保存任务失败:', e)
    functionSaveStatus.value = '保存失败: ' + (e.message || e)
  }
}

const showAddCategory = ref(false)
const newCategoryName = ref('')
const newCategoryType = ref('json')
const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })
const deleteCategoryConfirm = ref({ show: false, target: null })
const taskDeleteConfirm = ref({ show: false, target: null })
const batchDeleteConfirm = ref({ show: false, count: 0 })
const batchRemoveExecConfirm = ref({ show: false, count: 0 })
const batchRemoveDoneConfirm = ref({ show: false, count: 0 })
const showStopConfirm = ref(false)

const showBatchMove = ref(false)
const batchMoveTarget = ref(null)

// ============ 执行状态辅助 ============
function getExecutionStatus(task) {
  // 兼容旧任务：未设置 execution_status 视为 idle
  return task.execution_status || 'idle'
}

// ============ 计算属性：三个选项卡的数据分组 ============
const libraryTasks = computed(() =>
  allTasks.value.filter(t => getExecutionStatus(t) === 'idle')
)
// 执行中 = 正在跑 + 已暂停（暂停的任务也要留在任务中心，除非手动删除）；
// 出错(failed)也归入这里，方便看到失败原因并继续/删除
const executingDbTasks = computed(() =>
  allTasks.value.filter(t => ['executing', 'paused', 'failed'].includes(getExecutionStatus(t)))
)
const completedTasks = computed(() =>
  allTasks.value.filter(t => getExecutionStatus(t) === 'completed')
)

// 任务库按 JSON 类 / 功能类 拆分
const jsonLibraryTasks = computed(() => libraryTasks.value.filter(t => !isFunctionTask(t)))
const functionLibraryTasks = computed(() => libraryTasks.value.filter(t => isFunctionTask(t)))

// 当前页面对应的分类列表与 category_type
const currentLibraryType = computed(() => activeLibraryPage.value === 'function' ? 'function' : 'json')
const currentPageCategories = computed(() =>
  activeLibraryPage.value === 'function' ? functionTaskCategories.value : jsonTaskCategories.value
)

// 任务库中按分类+搜索过滤（基于当前二级页面）
const filteredLibraryTasks = computed(() => {
  let list = activeLibraryPage.value === 'function' ? functionLibraryTasks.value : jsonLibraryTasks.value
  if (activeCategory.value !== 0) {
    list = list.filter(t => t.category_id === activeCategory.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(t => (t.name || '').toLowerCase().includes(q))
  }
  return list
})

// 执行中：合并 DB 任务与 store 实时执行状态，按状态排序（执行中 > 暂停 > 错误 > 排队）
const executingDisplayTasks = computed(() => {
  const items = executingDbTasks.value.map(dbTask => {
    const live = generationStore.taskExecution.tasks.find(t => t.id === dbTask.id) || null
    return { db: dbTask, live }
  })
  // 排序优先级：running > loading > paused > error > queued
  const statusOrder = (item) => {
    if (item.live && item.live.status === 'running') return 0
    if (item.live && item.live.status === 'loading') return 1
    if (item.live && item.live.paused) return 2
    if (item.live && item.live.status === 'error') return 3
    if (item.db.error_message) return 3
    return 4 // 排队中
  }
  return items.sort((a, b) => statusOrder(a) - statusOrder(b))
})

// ============ 全选 ============
const allLibrarySelected = computed(() => {
  const list = filteredLibraryTasks.value
  return list.length > 0 && list.every(t => selectedIds.value.includes(t.id))
})
const allExecutingSelected = computed(() => {
  const list = executingDbTasks.value
  return list.length > 0 && list.every(t => selectedIds.value.includes(t.id))
})
const allCompletedSelected = computed(() => {
  const list = completedTasks.value
  return list.length > 0 && list.every(t => selectedIds.value.includes(t.id))
})

// ============ 对话框 open 代理（对象/嵌套 show 字段） ============
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const deleteCategoryConfirmOpen = computed({
  get: () => deleteCategoryConfirm.value.show,
  set: (v) => { if (!v) deleteCategoryConfirm.value.show = false }
})
const taskDeleteConfirmOpen = computed({
  get: () => taskDeleteConfirm.value.show,
  set: (v) => { if (!v) taskDeleteConfirm.value.show = false }
})
const batchDeleteConfirmOpen = computed({
  get: () => batchDeleteConfirm.value.show,
  set: (v) => { if (!v) batchDeleteConfirm.value.show = false }
})
const batchRemoveExecConfirmOpen = computed({
  get: () => batchRemoveExecConfirm.value.show,
  set: (v) => { if (!v) batchRemoveExecConfirm.value.show = false }
})
const batchRemoveDoneConfirmOpen = computed({
  get: () => batchRemoveDoneConfirm.value.show,
  set: (v) => { if (!v) batchRemoveDoneConfirm.value.show = false }
})

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAllLibrary() {
  const list = filteredLibraryTasks.value
  if (allLibrarySelected.value) {
    const ids = new Set(list.map(t => t.id))
    selectedIds.value = selectedIds.value.filter(id => !ids.has(id))
  } else {
    list.forEach(t => { if (!selectedIds.value.includes(t.id)) selectedIds.value.push(t.id) })
  }
}
function toggleSelectAllExecuting() {
  const list = executingDbTasks.value
  if (allExecutingSelected.value) {
    const ids = new Set(list.map(t => t.id))
    selectedIds.value = selectedIds.value.filter(id => !ids.has(id))
  } else {
    list.forEach(t => { if (!selectedIds.value.includes(t.id)) selectedIds.value.push(t.id) })
  }
}
function toggleSelectAllCompleted() {
  const list = completedTasks.value
  if (allCompletedSelected.value) {
    const ids = new Set(list.map(t => t.id))
    selectedIds.value = selectedIds.value.filter(id => !ids.has(id))
  } else {
    list.forEach(t => { if (!selectedIds.value.includes(t.id)) selectedIds.value.push(t.id) })
  }
}

function switchTab(tab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  selectedIds.value = []
  // 通知父组件更新侧边栏激活状态
  emit('navigate', tabToNavId(tab))
}

function switchLibraryPage(page) {
  activeLibraryPage.value = page
  activeCategory.value = 0
  selectedIds.value = []
  searchQuery.value = ''
}

function openAddCategory(type) {
  newCategoryName.value = ''
  newCategoryType.value = type
  showAddCategory.value = true
}

function switchCategory(catId) {
  activeCategory.value = catId
  selectedIds.value = []
}

// ============ 显示辅助 ============
function getWorkflowName(workflowApiId) {
  if (!workflowApiId || workflowApiId === 0) return '默认工作流'
  const wf = callableWorkflows.value.find(w => w.id === workflowApiId)
  return wf ? wf.name : '未知'
}

function getCategoryName(catId) {
  if (!catId || catId === 0) return '未分类'
  const cat = [...jsonTaskCategories.value, ...functionTaskCategories.value].find(c => c.id === catId)
  return cat ? cat.name : '未分类'
}

function getComfyuiName(task) {
  let cfgs = task.function_configs
  if (typeof cfgs === 'string') {
    try { cfgs = JSON.parse(cfgs) } catch (e) { cfgs = [] }
  }
  if (Array.isArray(cfgs) && cfgs.length > 0 && cfgs[0].comfyuiConfigId) {
    const cfg = comfyuiConfigs.value.find(c => c.id === cfgs[0].comfyuiConfigId)
    return cfg ? cfg.name : '默认配置'
  }
  return '默认配置'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getStoryboardFileCount(task) {
  let ids = task.storyboard_json_ids
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids) } catch (e) { ids = [] }
  }
  return Array.isArray(ids) ? ids.length : 0
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

// 判断是否为功能类任务（function_configs 非空）
function isFunctionTask(task) {
  let cfgs = task.function_configs
  if (typeof cfgs === 'string') {
    try { cfgs = JSON.parse(cfgs) } catch (e) { cfgs = [] }
  }
  return Array.isArray(cfgs) && cfgs.length > 0
}

// 获取功能类任务的功能数量
function getFunctionCount(task) {
  let cfgs = task.function_configs
  if (typeof cfgs === 'string') {
    try { cfgs = JSON.parse(cfgs) } catch (e) { cfgs = [] }
  }
  return Array.isArray(cfgs) ? cfgs.length : 0
}

// 获取功能类任务的功能名称列表
function getFunctionNames(task) {
  let cfgs = task.function_configs
  if (typeof cfgs === 'string') {
    try { cfgs = JSON.parse(cfgs) } catch (e) { cfgs = [] }
  }
  if (!Array.isArray(cfgs)) return []
  return cfgs.map(c => c.functionName || c.name || '未命名').filter(Boolean)
}

// 获取任务包含内容的显示文本
function getContentDisplay(task) {
  if (isFunctionTask(task)) {
    const count = getFunctionCount(task)
    return `${count}个功能`
  }
  return `${getStoryboardFileCount(task)}文件 · ${getStoryboardTotal(task)}分镜`
}

function getCategoryCount(catId) {
  // 计数基于当前二级页面的任务列表
  const baseList = activeLibraryPage.value === 'function' ? functionLibraryTasks.value : jsonLibraryTasks.value
  if (catId === 0) return baseList.length
  return baseList.filter(t => t.category_id === catId).length
}

// ============ 执行中状态显示 ============
function getExecProgressText(item) {
  // 统一显示"完成分镜数/总分镜数"
  if (item.live) {
    // 已完成的任务保持显示 完成数/总数（满条状态）
    if (item.live.status === 'completed') {
      return `${item.live.total}/${item.live.total}`
    }
    return `${item.live.completed}/${item.live.total}`
  }
  // 排队/等待中：显示 0/总分镜数（优先使用分镜总数，其次 total_count）
  const storyboardTotal = getStoryboardTotal(item.db)
  const total = storyboardTotal || item.db.total_count || 0
  return `0/${total}`
}
function getExecProgressPercent(item) {
  if (item.live) {
    // 已完成的任务进度条显示满条
    if (item.live.status === 'completed') return 100
    if (!item.live.total) return 0
    return Math.round((item.live.completed / item.live.total) * 100)
  }
  return 0
}
function getExecStatusText(item) {
  if (!item.live) {
    // 没有实时状态，但数据库有错误信息
    if (item.db.error_message) return '错误'
    return '排队'
  }
  if (item.live.paused) return '已暂停'
  switch (item.live.status) {
    case 'running': return '执行中'
    case 'loading': return '加载中'
    case 'completed': return '已完成'
    case 'cancelled': return '已停止'
    case 'error': return '错误'
    case 'paused': return '已暂停'
    default: return '等待中'
  }
}
function getExecStatusClass(item) {
  if (!item.live) {
    if (item.db.error_message) return 'error'
    return 'queued'
  }
  if (item.live.paused) return 'paused'
  return item.live.status || 'pending'
}

// ============ 数据加载 ============
async function loadTasks() {
  try {
    const list = await apiClient.getGenerationTasks()
    allTasks.value = Array.isArray(list) ? list : []
    // 预加载任务引用的 JSON 文件信息（用于显示分镜数）
    await preloadTaskJsonFiles()
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      const validIds = new Set(allTasks.value.map(item => item.id))
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载任务列表失败:', e)
  }
}

// 预加载任务引用的 JSON 文件（补齐 callableJsons 中缺失的）
async function preloadTaskJsonFiles() {
  const knownIds = new Set(callableJsons.value.map(j => j.id))
  const missingIds = new Set()
  for (const task of allTasks.value) {
    let ids = task.storyboard_json_ids
    if (typeof ids === 'string') {
      try { ids = JSON.parse(ids) } catch (e) { ids = [] }
    }
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (id && !knownIds.has(id)) missingIds.add(id)
      }
    }
  }
  // 获取缺失的 JSON 文件信息
  for (const id of missingIds) {
    try {
      const file = await apiClient.getFileLibraryFileById(id)
      if (file) {
        callableJsons.value.push(file)
        knownIds.add(id)
      }
    } catch (e) { /* ignore */ }
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
    // 补齐任务引用但不在 callable 文件夹中的 JSON 文件
    await preloadTaskJsonFiles()
  } catch (e) {
    console.error('加载可调用文件失败:', e)
    callableWorkflows.value = []
    callableJsons.value = []
  }
}

async function loadTaskCategories() {
  try {
    const [jsonCats, funcCats] = await Promise.all([
      apiClient.getTaskCategories('json'),
      apiClient.getTaskCategories('function')
    ])
    jsonTaskCategories.value = jsonCats || []
    functionTaskCategories.value = funcCats || []
  } catch (e) {
    console.error('加载任务分类失败:', e)
    jsonTaskCategories.value = []
    functionTaskCategories.value = []
  }
}

async function loadComfyuiConfigs() {
  try {
    const list = await apiClient.getActiveComfyuiConfigs()
    comfyuiConfigs.value = Array.isArray(list) ? list : []
  } catch (e) {
    comfyuiConfigs.value = []
  }
}

// ============ 新建/编辑任务 ============
function openCreateDialog() {
  // 功能类任务：打开功能编辑器弹窗（不跳转功能库）
  if (activeLibraryPage.value === 'function') {
    openFunctionCreateDialog()
    return
  }
  editingTask.value = null
  taskForm.name = ''
  taskForm.description = ''
  taskForm.category_id = 0
  taskForm.workflow_api_id = null
  taskForm.comfyui_config_id = null
  taskForm.selectedJsonIds = []
  taskForm.insertedPromptIds = []
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingTask.value = null
}

async function editTask(task) {
  try {
    const full = await apiClient.getGenerationTaskById(task.id)
    if (!full) return

    // 功能类任务：打开功能编辑器弹窗（不跳转功能库）
    if (isFunctionTask(full)) {
      openFunctionEditDialog(full)
      return
    }

    // JSON 类任务：走原有编辑逻辑
    editingTask.value = full
    taskForm.name = full.name
    taskForm.description = full.description || ''
    taskForm.category_id = full.category_id || 0
    taskForm.workflow_api_id = full.workflow_api_id || null
    // 兼容旧任务：comfyui_config_id 字段可能不存在，缺失时默认为 null（让用户重新选择）
    const rawCfgId = full.comfyui_config_id
    taskForm.comfyui_config_id = (rawCfgId === undefined || rawCfgId === null) ? null : Number(rawCfgId)
    let ids = full.storyboard_json_ids
    if (typeof ids === 'string') {
      try { ids = JSON.parse(ids) } catch (e) { ids = [] }
    }
    taskForm.selectedJsonIds = Array.isArray(ids) ? [...ids] : []
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
  // 功能类任务编辑时 selectedJsonIds 可以为空，仅校验名称
  const isEditingFunction = editingTask.value && isFunctionTask(editingTask.value)
  if (!taskForm.name) return
  if (!isEditingFunction) {
    // JSON 类任务四项必填校验
    if (taskForm.comfyui_config_id === null || taskForm.comfyui_config_id === undefined) {
      showFeedback('请选择 ComfyUI 配置')
      return
    }
    if (!taskForm.workflow_api_id || taskForm.workflow_api_id <= 0) {
      showFeedback('请选择使用工作流')
      return
    }
    if (taskForm.selectedJsonIds.length === 0) {
      showFeedback('请选择分镜 JSON 文件')
      return
    }
  }
  try {
    const data = {
      name: taskForm.name,
      description: taskForm.description,
      category_id: taskForm.category_id,
      workflow_api_id: taskForm.workflow_api_id || 0,
      storyboard_json_ids: taskForm.selectedJsonIds,
      inserted_prompt_ids: taskForm.insertedPromptIds
    }
    // JSON 类任务携带任务级 ComfyUI 配置；功能类任务不写该字段（功能自带配置）
    if (!isEditingFunction) {
      data.comfyui_config_id = taskForm.comfyui_config_id || 0
    }
    if (editingTask.value) {
      await apiClient.updateGenerationTask(editingTask.value.id, data)
      showFeedback('任务已更新')
    } else {
      await apiClient.createGenerationTask(data)
      showFeedback('任务已创建')
    }
    closeDialog()
    await loadTasks()
  } catch (e) {
    console.error('保存任务失败:', e)
    alert('保存任务失败: ' + e.message)
  }
}

// ============ 任务库删除（真正删除） ============
function confirmDeleteTask(task) {
  taskDeleteConfirm.value = { show: true, target: task }
}
async function doDeleteTask() {
  const task = taskDeleteConfirm.value.target
  taskDeleteConfirm.value.show = false
  try {
    await apiClient.deleteGenerationTask(task.id)
    useTaskQueueStore().purgeRecord(task.id) // 托盘队列/目录瓦片同步移除
    showFeedback(`任务"${task.name}"已删除`)
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
  const ids = [...selectedIds.value]
  try {
    await apiClient.batchDeleteGenerationTasks(ids)
    const qs = useTaskQueueStore()
    ids.forEach((id) => qs.purgeRecord(id)) // 托盘队列/目录瓦片同步移除
    showFeedback(`已删除 ${ids.length} 个任务`)
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量删除失败:', e)
  }
}

// ============ 批量移动 ============
function openBatchMoveSingle(task) {
  selectedIds.value = [task.id]
  showBatchMove.value = true
  batchMoveTarget.value = null
}

async function confirmBatchMove() {
  if (batchMoveTarget.value === null || selectedIds.value.length === 0) return
  try {
    await apiClient.batchCategorizeGenerationTasks([...selectedIds.value], batchMoveTarget.value)
    showFeedback(`已移动 ${selectedIds.value.length} 个任务`)
    selectedIds.value = []
    showBatchMove.value = false
    batchMoveTarget.value = null
    await loadTasks()
  } catch (e) {
    console.error('批量移动失败:', e)
    alert('批量移动失败: ' + e.message)
  }
}

// ============ 分类管理 ============
async function doAddCategory() {
  if (!newCategoryName.value) return
  try {
    await apiClient.createTaskCategory({ name: newCategoryName.value, category_type: newCategoryType.value })
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
  deleteCategoryConfirm.value = { show: true, target: cat }
}
async function doDeleteCategory() {
  const cat = deleteCategoryConfirm.value.target
  deleteCategoryConfirm.value.show = false
  try {
    await apiClient.deleteTaskCategory(cat.id)
    if (activeCategory.value === cat.id) activeCategory.value = 0
    await loadTaskCategories()
    await loadTasks()
  } catch (e) {
    console.error('删除失败:', e)
  }
}

// ============ 执行状态流转 ============
// 任务库 → 执行中
async function executeFromLibrary(task) {
  try {
    await apiClient.updateGenerationTask(task.id, { execution_status: 'executing', error_message: '' })
    // 重置完成/错误标记，使 watcher 能再次检测到完成状态
    markedCompletedIds.value.delete(task.id)
    markedErrorIds.value.delete(task.id)
    await loadTasks()
    // 不跳转到"执行中任务"页面，仅刷新当前列表
    selectedIds.value = []
    if (generationStore.isGenerating) {
      showFeedback(`任务"${task.name}"已加入执行队列，将在当前任务完成后自动开始`)
      // 追加到执行队列，执行循环会自动接力
      generationStore.addTaskToQueue(task.id).catch(e => console.error('加入队列失败:', e))
    } else {
      showFeedback(`任务"${task.name}"开始执行`)
      // 触发 store 执行（不阻塞 UI）
      generationStore.executeTasks([task.id]).catch(e => {
        console.error('执行失败:', e)
      })
    }
  } catch (e) {
    console.error('执行任务失败:', e)
    alert('执行任务失败: ' + e.message)
  }
}

// 任务库批量执行选中任务（不跳转到执行中页面）
async function batchExecuteFromLibrary() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  try {
    // 先把所有选中任务状态置为 executing
    for (const id of ids) {
      await apiClient.updateGenerationTask(id, { execution_status: 'executing', error_message: '' })
      markedCompletedIds.value.delete(id)
      markedErrorIds.value.delete(id)
    }
    if (generationStore.isGenerating) {
      // 已有任务在执行，逐个加入队列
      for (const id of ids) {
        await generationStore.addTaskToQueue(id)
      }
      showFeedback(`${ids.length} 个任务已加入执行队列，将在当前任务完成后自动开始`)
    } else {
      showFeedback(`开始执行 ${ids.length} 个任务`)
      generationStore.executeTasks(ids).catch(e => console.error('执行失败:', e))
    }
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量执行失败:', e)
  }
}

// 执行中排队任务手动启动
async function startQueuedTask(task) {
  try {
    if (generationStore.isGenerating) {
      // 已有任务在执行，加入队列等当前任务完成后自动执行
      await generationStore.addTaskToQueue(task.id)
      showFeedback(`任务"${task.name}"已加入执行队列`)
    } else {
      showFeedback(`任务"${task.name}"开始执行`)
      await generationStore.executeTasks([task.id])
    }
    await loadTasks()
  } catch (e) {
    console.error('执行失败:', e)
  }
}

// 取消排队（从 store 队列中移除，但保留在执行中任务列表，状态变回等待执行）
async function cancelQueuedTask(taskId) {
  try {
    const liveIdx = generationStore.taskExecution.tasks.findIndex(t => t.id === taskId)
    if (liveIdx >= 0) {
      generationStore.taskExecution.tasks.splice(liveIdx, 1)
    }
    showFeedback('已取消排队')
    await loadTasks()
  } catch (e) {
    console.error('取消排队失败:', e)
  }
}

// 批量执行选中的任务
async function batchExecuteSelected() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  try {
    // 先把所有选中任务状态确保为 executing
    for (const id of ids) {
      markedCompletedIds.value.delete(id)
      markedErrorIds.value.delete(id)
    }
    if (generationStore.isGenerating) {
      // 已有任务在执行，逐个加入队列
      for (const id of ids) {
        await generationStore.addTaskToQueue(id)
      }
      showFeedback(`${ids.length} 个任务已加入执行队列`)
    } else {
      showFeedback(`开始执行 ${ids.length} 个任务`)
      generationStore.executeTasks(ids).catch(e => console.error('执行失败:', e))
    }
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量执行失败:', e)
  }
}

// 重试出错的任务（清除错误信息后重新执行）
async function retryTask(task) {
  try {
    // 清除数据库中的错误信息
    await apiClient.updateGenerationTask(task.id, { error_message: '', execution_status: 'executing' })
    // 重置完成/错误标记，使 watcher 能再次检测到完成状态
    markedCompletedIds.value.delete(task.id)
    markedErrorIds.value.delete(task.id)
    await loadTasks()
    if (generationStore.isGenerating) {
      showFeedback(`任务"${task.name}"已加入执行队列，将在当前任务完成后自动开始`)
      generationStore.addTaskToQueue(task.id).catch(e => console.error('加入队列失败:', e))
    } else {
      showFeedback(`任务"${task.name}"重新执行`)
      generationStore.executeTasks([task.id]).catch(e => console.error('重试执行失败:', e))
    }
  } catch (e) {
    console.error('重试失败:', e)
  }
}

// 执行中 → 已完成（手动完成）
async function manualComplete(task) {
  try {
    // 先调用 store 的 completeTask（清理 store 状态 + 调用 complete API）
    await generationStore.completeTask(task.id)
    // 显式设置新的 execution_status
    await apiClient.updateGenerationTask(task.id, { execution_status: 'completed' })
    showFeedback(`任务"${task.name}"已完成`)
    await loadTasks()
  } catch (e) {
    console.error('标记完成失败:', e)
  }
}

// 执行中 → 任务库（移出队列，不删除数据库记录）
const singleRemoveExecConfirm = ref({ show: false, task: null })
const singleRemoveExecConfirmOpen = computed({
  get: () => singleRemoveExecConfirm.value.show,
  set: (v) => { if (!v) singleRemoveExecConfirm.value.show = false }
})

function confirmRemoveFromExecuting(task) {
  singleRemoveExecConfirm.value = { show: true, task }
}

async function removeFromExecuting(task) {
  try {
    const liveIdx = generationStore.taskExecution.tasks.findIndex(t => t.id === task.id)
    if (liveIdx >= 0) {
      generationStore.taskExecution.tasks.splice(liveIdx, 1)
    }
    await apiClient.updateGenerationTask(task.id, { execution_status: 'idle' })
    showFeedback(`任务"${task.name}"已移回任务库`)
    await loadTasks()
  } catch (e) {
    console.error('移出队列失败:', e)
  }
}

function confirmBatchRemoveFromExecuting() {
  batchRemoveExecConfirm.value = { show: true, count: selectedIds.value.length }
}
async function doBatchRemoveFromExecuting() {
  batchRemoveExecConfirm.value.show = false
  const ids = [...selectedIds.value]
  try {
    for (const id of ids) {
      const liveIdx = generationStore.taskExecution.tasks.findIndex(t => t.id === id)
      if (liveIdx >= 0) generationStore.taskExecution.tasks.splice(liveIdx, 1)
      await apiClient.updateGenerationTask(id, { execution_status: 'idle' })
    }
    showFeedback(`已移出 ${ids.length} 个任务`)
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量移出失败:', e)
  }
}

// 批量暂停（仅对实时执行中的任务生效）
async function batchPauseSelected() {
  const ids = [...selectedIds.value]
  try {
    await generationStore.batchPauseTasks(ids)
    showFeedback(`已暂停 ${ids.length} 个任务`)
    selectedIds.value = []
  } catch (e) {
    console.error('批量暂停失败:', e)
  }
}

// 批量完成（将选中的执行中任务移到已完成）
async function batchComplete() {
  const ids = [...selectedIds.value]
  try {
    for (const id of ids) {
      // 从 store 中移除实时状态
      const liveIdx = generationStore.taskExecution.tasks.findIndex(t => t.id === id)
      if (liveIdx >= 0) generationStore.taskExecution.tasks.splice(liveIdx, 1)
      await apiClient.updateGenerationTask(id, { execution_status: 'completed', error_message: '', completed_at: new Date().toISOString() })
    }
    showFeedback(`已将 ${ids.length} 个任务移到已完成`)
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量完成失败:', e)
  }
}

// 已完成 → 任务库（移出历史）
async function removeFromCompleted(task) {
  try {
    await apiClient.updateGenerationTask(task.id, { execution_status: 'idle' })
    showFeedback(`任务"${task.name}"已移回任务库`)
    await loadTasks()
  } catch (e) {
    console.error('移出历史失败:', e)
  }
}

function confirmBatchRemoveFromCompleted() {
  batchRemoveDoneConfirm.value = { show: true, count: selectedIds.value.length }
}
async function doBatchRemoveFromCompleted() {
  batchRemoveDoneConfirm.value.show = false
  const ids = [...selectedIds.value]
  try {
    for (const id of ids) {
      await apiClient.updateGenerationTask(id, { execution_status: 'idle' })
    }
    showFeedback(`已移出 ${ids.length} 个任务`)
    selectedIds.value = []
    await loadTasks()
  } catch (e) {
    console.error('批量移出失败:', e)
  }
}

// 已完成 → 执行中（重新执行）
async function reexecuteFromCompleted(task) {
  try {
    await apiClient.updateGenerationTask(task.id, { execution_status: 'executing' })
    // 重置完成/错误标记，使 watcher 能再次检测到完成状态
    markedCompletedIds.value.delete(task.id)
    markedErrorIds.value.delete(task.id)
    await loadTasks()
    activeTab.value = 'executing'
    selectedIds.value = []
    emit('navigate', 'task-running')
    if (generationStore.isGenerating) {
      showFeedback(`任务"${task.name}"已加入执行队列，将在当前任务完成后自动开始`)
      generationStore.addTaskToQueue(task.id).catch(e => console.error('加入队列失败:', e))
    } else {
      showFeedback(`任务"${task.name}"重新执行`)
      generationStore.executeTasks([task.id]).catch(e => console.error('执行失败:', e))
    }
  } catch (e) {
    console.error('重新执行失败:', e)
  }
}

async function batchReexecute() {
  const ids = [...selectedIds.value]
  try {
    for (const id of ids) {
      await apiClient.updateGenerationTask(id, { execution_status: 'executing' })
      // 重置完成/错误标记
      markedCompletedIds.value.delete(id)
      markedErrorIds.value.delete(id)
    }
    selectedIds.value = []
    await loadTasks()
    activeTab.value = 'executing'
    emit('navigate', 'task-running')
    if (generationStore.isGenerating) {
      showFeedback(`${ids.length} 个任务已加入执行队列，将在当前任务完成后自动开始`)
      // 逐个追加到执行队列
      ids.forEach(id => generationStore.addTaskToQueue(id).catch(e => console.error('加入队列失败:', e)))
    } else {
      showFeedback(`开始执行 ${ids.length} 个任务`)
      generationStore.executeTasks(ids).catch(e => console.error('执行失败:', e))
    }
  } catch (e) {
    console.error('批量重新执行失败:', e)
  }
}

// 停止执行
function confirmStop() {
  showStopConfirm.value = true
}
async function doStop() {
  showStopConfirm.value = false
  try {
    await generationStore.cancelTaskExecution()
    showFeedback('已停止执行')
    await loadTasks()
  } catch (e) {
    console.error('停止失败:', e)
  }
}

// ============ 监听 store 自动完成/错误 → 同步 execution_status ============
const markedCompletedIds = ref(new Set())
const markedErrorIds = ref(new Set())
watch(
  () => generationStore.taskExecution.tasks,
  (tasks) => {
    // 先收集需要处理的任务，避免在迭代中修改数组
    const toComplete = []
    const toError = []
    for (const t of tasks) {
      if (t.status === 'completed' && !markedCompletedIds.value.has(t.id)) {
        markedCompletedIds.value.add(t.id)
        toComplete.push(t)
      }
      if (t.status === 'error' && !markedErrorIds.value.has(t.id)) {
        markedErrorIds.value.add(t.id)
        toError.push(t)
      }
    }
    // 处理完成的任务：从 store 实时列表移除 + 更新数据库状态
    for (const t of toComplete) {
      const liveIdx = generationStore.taskExecution.tasks.findIndex(lt => lt.id === t.id)
      if (liveIdx >= 0) generationStore.taskExecution.tasks.splice(liveIdx, 1)
      apiClient.updateGenerationTask(t.id, { execution_status: 'completed', error_message: '', completed_at: new Date().toISOString() })
        .then(() => loadTasks())
        .catch(e => console.error('同步完成状态失败:', e))
    }
    // 处理出错的任务：刷新列表
    if (toError.length > 0) {
      loadTasks()
    }
  },
  { deep: true }
)

// ============ 初始化 ============
// 队列/目录里删除任务后广播的事件 → 任务中心立即刷新，保持同步
const onTasksChanged = () => { loadTasks() }
onMounted(async () => {
  // 先加载可调用文件（确保 callableJsons 填充），再加载任务（依赖 callableJsons 计算分镜数）
  await loadCallableFiles()
  loadTaskCategories()
  loadComfyuiConfigs()
  await loadTasks()
  window.addEventListener('generation-tasks-changed', onTasksChanged)
})
onUnmounted(() => {
  window.removeEventListener('generation-tasks-changed', onTasksChanged)
})
</script>

<style scoped>
.task-library {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.task-library h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}

/* 选项卡 */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  background: var(--bg-surface);
  border-radius: 10px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.tab-item:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-item.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.tab-count {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.25);
  color: inherit;
}

.tab-item.active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}

.tab-content {
  min-height: 200px;
}

/* 任务库二级页面切换（JSON类 / 功能类） */
.library-page-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  border-bottom: 2px solid var(--bg-surface);
  padding-bottom: 0;
}

.lib-page-tab {
  padding: 8px 18px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.lib-page-tab:hover {
  color: var(--text-primary);
}

.lib-page-tab.active {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
}

/* 反馈条 */
.feedback-bar {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  background: rgba(34, 197, 94, 0.95);
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
  white-space: nowrap;
  pointer-events: none;
}

/* 淡入淡出过渡 */
.feedback-fade-enter-active {
  animation: feedback-in 0.3s ease;
}
.feedback-fade-leave-active {
  animation: feedback-out 0.5s ease forwards;
}
@keyframes feedback-in {
  from { opacity: 0; transform: translate(-50%, 20px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes feedback-out {
  from { opacity: 1; transform: translate(-50%, 0); }
  to { opacity: 0; transform: translate(-50%, 10px); }
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

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  width: 200px;
  box-shadow: none;
  box-sizing: border-box;
}

.exec-status {
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 实体列表 */
.entity-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--input-shadow);
}

.list-header,
.list-row {
  display: grid;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.lib-grid {
  grid-template-columns: 36px 1.6fr 1fr 1fr 1.2fr 220px;
}

.exec-grid {
  grid-template-columns: 36px 1.4fr 1fr 1fr 1.4fr 80px 180px;
}

.done-grid {
  grid-template-columns: 36px 1.6fr 1fr 1.2fr 90px 200px;
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

.list-row.current {
  background: rgba(74, 158, 255, 0.14);
  box-shadow: inset 3px 0 0 var(--accent-color);
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

.col-content,
.col-cat,
.col-workflow,
.col-comfyui,
.col-date,
.col-count {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-progress {
  min-width: 0;
}

.col-status {
  text-align: center;
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

.checkbox.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 进度条 */
.progress-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
  min-width: 60px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A, #CDDC39);
  border-radius: 4px;
  transition: width 0.5s ease-out;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-color);
  white-space: nowrap;
}

/* 状态徽章 */
.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge.pending {
  background: rgba(128, 128, 128, 0.15);
  color: var(--text-secondary);
}

.status-badge.queued {
  background: rgba(128, 128, 128, 0.15);
  color: var(--text-secondary);
}

.status-badge.loading {
  background: rgba(74, 158, 255, 0.15);
  color: var(--accent-color);
  animation: pulse-loading 1.5s ease-in-out infinite;
}

@keyframes pulse-loading {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
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

.status-badge.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.task-error-msg {
  font-size: 11px;
  color: #ef4444;
  margin-top: 2px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

/* 操作按钮 */
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

.btn-icon-sm:hover:not(:disabled) {
  background: var(--bg-primary);
}

.btn-icon-sm.exec {
  color: var(--accent-color);
}

.btn-icon-sm.exec:hover:not(:disabled) {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-icon-sm.complete {
  color: #22c55e;
}

.btn-icon-sm.complete:hover:not(:disabled) {
  background: #22c55e;
  color: #fff;
}

.btn-icon-sm.danger {
  color: #ef4444;
}

.btn-icon-sm.danger:hover:not(:disabled) {
  background: #fee2e2;
  color: #ef4444;
}

.btn-icon-sm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* 总进度 */
.overall-progress {
  margin-top: 16px;
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
  gap: 8px;
}

.progress-numbers {
  font-weight: 600;
  color: var(--accent-color);
  white-space: nowrap;
}

/* 通用按钮 */
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

.btn-warn {
  background: #f59e0b;
  color: white;
}

/* Modal body/footer helpers (kept for legacy references) */
.modal-body {
  margin-bottom: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

/* 表单 */
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

/* 任务表单头部：名称 + ComfyUI 配置 并排显示 */
.task-form-header {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.task-form-header .task-name-group {
  flex: 1;
  min-width: 220px;
}

.task-form-header .comfyui-select-group {
  flex: 1;
  min-width: 220px;
}

/* 必填项标记 */
.required-mark {
  color: #ef4444;
  margin-left: 2px;
  font-weight: 700;
}

/* 确认弹窗正文（FloatingWindow 内） */
.fw-confirm-msg {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

.fw-confirm-msg small {
  font-size: 12px;
  color: var(--text-muted);
}

/* 功能类型选项卡（样式参考 ComfyUI 配置页面的 .tabs/.tab-item） */
.function-type-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}
.function-type-tab {
  padding: 10px 16px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.function-type-tab:hover {
  color: var(--text-primary, #333);
}
.function-type-tab.active {
  color: var(--text-primary, #333);
  border-bottom-color: var(--accent-color, #4a9eff);
  box-shadow: none;
}

/* 保存状态消息 */
.save-status-msg {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 12px;
  font-size: 13px;
  color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 4px;
}
.save-fade-enter-active,
.save-fade-leave-active {
  transition: opacity 0.3s ease;
}
.save-fade-enter-from,
.save-fade-leave-to {
  opacity: 0;
}
</style>
