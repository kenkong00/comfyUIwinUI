<template>
  <aside :class="['sidebar left-sidebar', { collapsed: isCollapsed }]">
    <div class="sidebar-top-btns">
      <button
        v-if="!isCollapsed"
        :class="['top-btn', { active: currentTheme === 'light' }]"
        @click.prevent="setTheme('light')"
        title="浅色主题"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="12" cy="12" r="5"></circle>
          <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
        </svg>
      </button>
      <button
        v-if="!isCollapsed"
        :class="['top-btn', { active: currentTheme === 'dark' }]"
        @click.prevent="setTheme('dark')"
        title="深色主题"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
      <button class="top-btn" @click.prevent="toggleSidebar" :title="isCollapsed ? '展开侧栏' : '收起侧栏'">
        <svg v-if="isCollapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
          <polyline points="13 10 16 12 13 14"></polyline>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
      </button>
    </div>

    <div class="sidebar-content" v-show="!isCollapsed">
      <!-- 用户头像（点击进入用户页面） -->
      <div class="user-avatar-section" v-if="userInfo" @click="$emit('show-profile')" :title="userInfo.email || userInfo.username">
        <div class="avatar">
          <img v-if="isImageAvatar(userInfo.avatar)" :src="userInfo.avatar" alt="头像" />
          <span v-else>{{ userInfo.avatar }}</span>
        </div>
      </div>


      <!-- 分组式导航 -->
      <nav class="nav-groups">
        <div
          v-for="group in navGroups"
          :key="group.id"
          class="nav-group"
        >
          <!-- 有子项的栏目组：可折叠 -->
          <template v-if="group.children && group.children.length > 0">
            <div
              class="nav-group-header"
              @click="toggleGroup(group.id)"
            >
              <span class="nav-group-name">{{ group.name }}</span>
              <svg
                :class="['nav-group-arrow', { collapsed: collapsedGroups[group.id] }]"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <div class="nav-group-children" v-show="!collapsedGroups[group.id]">
              <div
                v-for="child in group.children"
                :key="child.id"
                class="nav-child-wrapper"
              >
                <button
                  :class="['nav-child-item', { active: activeNav === child.id }]"
                  @click.prevent="selectNav(child.id)"
                >{{ child.name }}</button>
                <!-- 执行中的任务：开始/暂停按钮 -->
                <template v-if="child.id === 'task-running'">
                  <button
                    class="nav-task-action nav-task-start"
                    :class="{ running: hasRunningTask, disabled: allPaused }"
                    @click.stop="startAllExecutingTasks"
                    title="开始任务"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5,3 19,12 5,21"></polygon></svg>
                  </button>
                  <button
                    class="nav-task-action nav-task-pause"
                    :class="{ disabled: allPaused }"
                    @click.stop="pauseAllRunningTasks"
                    title="暂停任务"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                  </button>
                </template>
              </div>
            </div>
          </template>
          <!-- 无子项的栏目：直接可点击 -->
          <template v-else>
            <div class="nav-group-header nav-group-leaf" @click.prevent="selectNav(group.id)">
              <span class="nav-group-name" :class="{ active: activeNav === group.id }">{{ group.name }}</span>
              <!-- AI对话旁边的新建按钮 -->
              <button
                v-if="group.id === 'chat'"
                class="nav-item-action"
                @click.stop="handleNewChat"
                title="新建对话"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </button>
            </div>
            <!-- AI对话下方的最近对话 -->
            <div v-if="group.id === 'chat' && recentConversations.length > 0" class="recent-conversations">
              <div
                v-for="conv in recentConversations"
                :key="conv.id"
                :class="['recent-conv-item', { active: chatStore.currentConversationId === conv.id }]"
                @click="openRecentConv(conv)"
                :title="conv.title || '新对话'"
              >
                <div class="recent-conv-thumb">
                  <div v-if="getConvThumb(conv)" class="recent-conv-thumb-img" :style="{ backgroundImage: `url(${getConvThumb(conv)})` }"></div>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <span class="recent-conv-title">{{ conv.title || '新对话' }}</span>
              </div>
              <button class="more-conv-btn" @click.prevent="selectNav('history')">更多</button>
            </div>
          </template>
        </div>
      </nav>
    </div>
  </aside>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { navGroups } from '@/config/workflow'
import { useChatStore } from '@/stores/chat'
import { useGenerationStore } from '@/stores/generation'
import apiClient from '@/services/api'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  userInfo: {
    type: Object,
    default: null
  },
  syncStatus: {
    type: Object,
    default: null
  },
  isLocalMode: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'show-profile'])

const chatStore = useChatStore()
const generationStore = useGenerationStore()

// ============ 执行中任务：开始/暂停全部 ============
// 是否有任务正在运行（未暂停）
const hasRunningTask = computed(() =>
  generationStore.taskExecution.tasks.some(t => t.status === 'running' && !t.paused)
)
// 全部暂停状态（有任务但无运行中的）
const allPaused = computed(() =>
  generationStore.taskExecution.tasks.length > 0 && !hasRunningTask.value
)

// 开始执行"执行中的任务"列表里的全部任务
async function startAllExecutingTasks() {
  try {
    const list = await apiClient.getGenerationTasks()
    const executingIds = (Array.isArray(list) ? list : [])
      .filter(t => (t.execution_status || 'idle') === 'executing')
      .map(t => t.id)
    if (executingIds.length === 0) {
      console.log('没有执行中的任务')
      return
    }
    if (generationStore.isGenerating) {
      for (const id of executingIds) {
        await generationStore.addTaskToQueue(id)
      }
    } else {
      await generationStore.executeTasks(executingIds)
    }
  } catch (e) {
    console.error('开始全部任务失败:', e)
  }
}

// 暂停全部运行中的任务
async function pauseAllRunningTasks() {
  try {
    const runningIds = generationStore.taskExecution.tasks
      .filter(t => t.status === 'running' && !t.paused)
      .map(t => t.id)
    if (runningIds.length === 0) {
      console.log('没有运行中的任务可暂停')
      return
    }
    await generationStore.batchPauseTasks(runningIds)
  } catch (e) {
    console.error('暂停全部任务失败:', e)
  }
}

function isImageAvatar(val) {
  return typeof val === 'string' && val.startsWith('data:image/')
}

const currentTheme = ref('light')
const isCollapsed = ref(false)
const collapsedGroups = reactive({})

const activeNav = computed(() => props.modelValue)

// 最近5条对话记录
const recentConversations = computed(() => (chatStore.conversations || []).slice(0, 5))

function getConvThumb(conv) {
  if (!conv || !conv.messages) return ''
  let msgs = conv.messages
  if (typeof msgs === 'string') {
    try { msgs = JSON.parse(msgs) } catch { return '' }
  }
  if (!Array.isArray(msgs)) return ''
  for (const m of msgs) {
    if (m.role === 'assistant' && m.thumbUrl) return m.thumbUrl
    if (m.role === 'user' && m.images && m.images.length > 0 && m.images[0].thumb) return m.images[0].thumb
  }
  return ''
}

async function openRecentConv(conv) {
  if (chatStore.isAITyping || chatStore.isGeneratingImage) return
  await chatStore.loadConversation(conv.id)
  emit('update:modelValue', 'chat')
}

const selectNav = (navId) => {
  emit('update:modelValue', navId)
}

const toggleGroup = (groupId) => {
  collapsedGroups[groupId] = !collapsedGroups[groupId]
}

// 新建对话
const handleNewChat = async () => {
  emit('update:modelValue', 'chat')
  await chatStore.startNewConversation()
}

const setTheme = (theme) => {
  currentTheme.value = theme
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('app-theme', theme)
  console.log('🎨 已切换主题:', theme)
}

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

onMounted(async () => {
  const savedTheme = localStorage.getItem('app-theme') || 'light'
  currentTheme.value = savedTheme
  document.documentElement.setAttribute('data-theme', savedTheme)
  console.log('🎨 已加载主题:', savedTheme)
  await chatStore.loadConversations()
})
</script>

<style scoped>
.sidebar {
  position: relative;
  height: 100vh;
  background: var(--bg-sidebar);
  z-index: 1000;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
}

.left-sidebar {
  left: 0;
  width: 270px;
}

.left-sidebar.collapsed {
  width: 50px;
}

.sidebar-top-btns {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 4px 8px;
  flex-shrink: 0;
}

.top-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.15s ease, background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.top-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.top-btn.active {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.sidebar-content {
  padding: 4px 8px 8px 8px;
  overflow-y: auto;
  flex: 1;
}

/* 用户头像区域 */
.user-avatar-section {
  display: flex;
  justify-content: center;
  padding: 4px 0 12px 0;
  cursor: pointer;
}

.user-avatar-section .avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 36px;
  flex-shrink: 0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
}

.user-avatar-section .avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-section:hover .avatar {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 分组式导航 */
.nav-groups {
  display: flex;
  flex-direction: column;
}

.nav-group {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color-strong);
}

.nav-group:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.nav-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.nav-group-header:hover {
  background: var(--bg-secondary);
}

.nav-group-leaf {
  cursor: pointer;
}

.nav-group-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.nav-group-name.active {
  color: var(--accent-color);
}

.nav-group-arrow {
  transition: transform 0.2s ease;
  color: var(--text-muted);
  flex-shrink: 0;
}

.nav-group-arrow.collapsed {
  transform: rotate(-90deg);
}

.nav-group-children {
  display: flex;
  flex-direction: column;
  padding-left: 14px;
}

.nav-child-wrapper {
  display: flex;
  align-items: center;
  gap: 2px;
}

.nav-child-wrapper .nav-child-item {
  flex: 1;
  min-width: 0;
}

.nav-child-item {
  padding: 6px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  font-weight: 400;
  transition: all 0.15s ease;
}

/* 执行中任务：开始/暂停按钮 */
.nav-task-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.nav-task-action:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* 运行中：开始按钮变绿 */
.nav-task-start.running {
  color: #22c55e;
}

.nav-task-start.running:hover {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

/* 全部暂停状态：两个图标都变灰 */
.nav-task-action.disabled {
  color: var(--text-muted, #999);
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-task-action.disabled:hover {
  background: none;
  color: var(--text-muted, #999);
}

.nav-child-item:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.nav-child-item.active {
  color: var(--accent-color);
  font-weight: 600;
}

.nav-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.nav-item-action:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* 对话栏目下方的最近对话列表 */
.recent-conversations {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0 4px 10px;
  margin-bottom: 4px;
  border-left: 2px solid var(--border-color);
  margin-left: 6px;
}

.recent-conv-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 12px;
  color: var(--text-secondary);
}

.recent-conv-item:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.recent-conv-item.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.recent-conv-thumb {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  color: var(--text-muted);
}

.recent-conv-thumb-img {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.recent-conv-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-conv-btn {
  align-self: flex-end;
  border: none;
  background: transparent;
  color: var(--accent-color);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 8px;
  text-align: right;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.more-conv-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

@media (max-width: 768px) {
  .left-sidebar {
    width: 195px;
  }

  .left-sidebar.collapsed {
    width: 50px;
  }
}
</style>
