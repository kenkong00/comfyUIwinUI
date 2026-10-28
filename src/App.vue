<template>
  <div id="app">
    <!-- 已登录时显示 Windows 11 风格桌面 -->
    <div v-if="user">
      <!-- 顶部生成进度（全宽） -->
      <GenerationProgress />
      <!-- 退出确认弹窗 -->
      <FloatingWindow v-model:open="showLogoutConfirm" title="确认" size="confirm">
        <p class="fw-confirm-msg">确定要退出登录吗？</p>
        <template #footer>
          <button class="btn" @click="showLogoutConfirm = false">取消</button>
          <button class="btn btn-danger" @click="doLogout">确定</button>
        </template>
      </FloatingWindow>
      <Desktop :user="user" @logout="showLogoutConfirm = true" />
    </div>

    <!-- 未登录时显示登录/注册界面 -->
    <AuthModal 
      v-else-if="!isLoading"
      :isVisible="true"
      @authenticated="onAuthenticated"
      @close="handleAuthClose"
    />

    <!-- 加载中 -->
    <div v-else class="loading-screen">
      <div class="loading-bar-container">
        <div class="loading-bar"></div>
      </div>
      <p>{{ loadingText || '正在加载...' }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { apiClient } from '@/services/api';
import { useConfigStore } from '@/stores/config'
import { useCharacterStore } from '@/stores/character'
import { useRulesStore } from '@/stores/rules'
import { useGenerationStore } from '@/stores/generation'
import Sidebar from '@/components/layout/Sidebar.vue'
import MainContent from '@/components/layout/MainContent.vue'
import GenerationProgress from '@/components/layout/GenerationProgress.vue'
import RightFilterPanel from '@/components/layout/RightFilterPanel.vue'
import AuthModal from '@/components/auth/AuthModal.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import Desktop from '@/shell/Desktop.vue'
import { useSession } from '@/shell/session'

const configStore = useConfigStore()
const session = useSession()
const characterStore = useCharacterStore()
const rulesStore = useRulesStore()
const generationStore = useGenerationStore()

// 关闭/刷新浏览器标签时，若任务执行中则弹出警告
function handleBeforeUnload(e) {
  if (generationStore.isGenerating) {
    e.preventDefault()
    e.returnValue = '任务正在执行中，确定要离开吗？'
    return '任务正在执行中，确定要离开吗？'
  }
}

const activeNav = ref('chat')
const user = ref(null)
const showLogoutConfirm = ref(false)
const rightPanelCollapsed = ref(false)
const loadingText = ref('正在连接数据库...')
const isLoading = ref(true)

const lastSyncTime = computed(() => {
  return configStore.lastSyncTime || null;
});

const lastSyncDisplay = computed(() => {
  if (!lastSyncTime.value) return '从未同步';
  const date = new Date(lastSyncTime.value);
  return date.toLocaleString('zh-CN');
});

const syncStatusIcon = computed(() => {
  if (!user.value) return '⚠️';
  if (characterStore.isLoading || configStore.isLoading) return '⏳';
  if (lastSyncTime.value) return '✅';
  return '⏳';
});

const syncStatusText = computed(() => {
  if (!user.value) return '未登录';
  if (characterStore.isLoading || configStore.isLoading) return '同步中...';
  if (lastSyncTime.value) return `已保存`;
  return '待同步';
});

const userAvatar = computed(() => {
  if (!user.value) return '?';
  if (user.value.avatar_url) return user.value.avatar_url;
  const name = user.value.username || '';
  return name.charAt(0).toUpperCase();
});

const displayUserName = computed(() => {
  if (!user.value) return '';
  const name = user.value.username || 'User';
  return name.length > 15 ? name.substring(0, 15) + '...' : name;
});

function onAvatarUpdated(avatar) {
  if (user.value) {
    user.value = { ...user.value, avatar_url: avatar };
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  await initializeApp()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

async function initializeApp() {
  try {
    loadingText.value = '正在检查登录状态...'
    
    if (apiClient.isLoggedIn()) {
      const result = await apiClient.verifyToken()
      
      if (result.success) {
        user.value = apiClient.getUser()
        // 从服务器获取最新用户信息（包括头像）
        try {
          const userRes = await apiClient.getCurrentUser()
          if (userRes.success && userRes.data) {
            user.value = { ...user.value, ...userRes.data }
          }
          session.setUser(user.value)
        } catch (e) {
          console.log('[App] 获取用户信息失败:', e)
        }
        console.log('[App] 用户已登录:', user.value.username)
        await loadUserData()
        return
      } else {
        console.log('[App] Token 无效，尝试自动登录...')
      }
    }
    
    await autoLogin()
    
  } catch (err) {
    console.error('[App] 初始化失败:', err)
    loadingText.value = '连接失败，正在重试...'
    setTimeout(() => initializeApp(), 2000)
  }
}

async function autoLogin() {
  loadingText.value = '正在自动登录...'
  console.log('[App] 需要手动登录')
  loadingText.value = ''
  isLoading.value = false
}

function onAuthenticated(userData) {
  user.value = userData
  session.setUser(userData)
  session.loadMembership()
  console.log('[App] 登录/注册成功:', userData.username, '- 正在重置并加载数据...')
  resetAllStores()
  loadUserData()
}

function handleAuthClose() {
  // 用户关闭了登录框，保持在登录界面
}

function resetAllStores() {
  console.log('[App] 🔄 重置所有 Store 状态...')
  characterStore.characters = []
  characterStore.teams = []
  characterStore.currentTeamId = null
  characterStore.currentCharacterId = null
  configStore.resetToDefaults(true)
  console.log('[App] ✓ 所有 Store 已重置')
}

async function loadUserData() {
  try {
    loadingText.value = '正在加载数据...'
    console.log('[App] 开始加载用户数据...')

    await configStore.loadConfigsFromDB()
    await rulesStore.loadAll()
    await characterStore.loadAll()

    const configs = await apiClient.getConfigs()
    if (configs && typeof configs === 'object') {
      if (configs.global_settings) {
        const data = typeof configs.global_settings === 'string' ? JSON.parse(configs.global_settings) : configs.global_settings
        Object.assign(configStore.globalSettings, data)
      }
      if (configs.ai_providers) {
        const data = typeof configs.ai_providers === 'string' ? JSON.parse(configs.ai_providers) : configs.ai_providers
        configStore.aiProviders = data.providers || []
      }
      configStore.lastSyncTime = new Date().toISOString()
    }

    await ensureDefaultData()

    console.log('[App] ✓ 用户数据加载完成')
  } catch (err) {
    console.error('[App] ✗ 加载用户数据失败:', err)
  }
}

async function ensureDefaultData() {
  if (rulesStore.rules.length === 0) {
    console.log('[App] 规则库为空，创建默认规则...')
    await createDefaultRules()
  }
  if (characterStore.characters.length === 0) {
    console.log('[App] 角色列表为空，创建默认角色...')
    await createDefaultCharacter()
  }
}

async function createDefaultRules() {
  try {
    const cat = await rulesStore.createCategory('默认规则')
    const catId = cat?.id || 0

    await rulesStore.createRule({
      name: '默认系统规则',
      content: '# 这是一个位于异于地球的平行时空。你每次输出的内容会尽可能地详细并始终遵循我给你的设定和规则。\n\n## 努力扮演好你的角色\n- 保持上下文角色一致性，用角色的语气和风格交流。\n- 对话内容格式：对话（人物动作互动）',
      category_id: catId,
      type: 'system',
      description: '影响所有角色的基础系统规则'
    })

    await rulesStore.createRule({
      name: '默认生图规则',
      content: '- 默认中文输出\n- 人物国籍，姓名，年龄，外貌，视角，动作，互动，场景，必须要有的。\n- 提示词最少150个字，不多于200个字，动作和场景要详细。',
      category_id: catId,
      type: 'image',
      description: '生图模式的提示词规则'
    })

    await rulesStore.createRule({
      name: '默认对话规则',
      content: '1. 回复要详细生动，多描述心理活动\n2. 增加互动性，引导用户参与对话\n3. 用括号表示动作和神态，增强代入感',
      category_id: catId,
      type: 'chat',
      description: '普通对话模式的规则'
    })

    await rulesStore.createRule({
      name: '默认多人对话规则',
      content: '1. 每次回复时，所有选中的角色都必须发言，每个角色只说一次\n2. 用【角色名】开头标明是哪个角色在说话\n3. 不同角色之间可以有互动和对话\n4. 保持每个角色的独特性格和说话风格',
      category_id: catId,
      type: 'dialogue',
      description: '多角色群聊模式的规则'
    })

    console.log('[App] ✓ 已创建默认规则')
  } catch (e) {
    console.error('[App] 创建默认规则失败:', e)
  }
}

async function createDefaultCharacter() {
  try {
    const char = await characterStore.createCharacter({
      name: '小雪',
      description: '一个温柔可爱的女孩，18岁，长发飘飘，喜欢穿白色连衣裙。性格温柔体贴，说话轻声细语，喜欢帮助别人。大学生，主修文学，平时喜欢在图书馆和花园度过时光。',
      gender: '女',
      avatar_url: '',
      rule_refs: JSON.stringify({ chatRuleIds: [], chatRuleText: '' }),
      function_config: JSON.stringify({ enabled: false, selectedFunctionIds: [], functionRules: '', functionRuleFileIds: [] }),
      ai_config_override: JSON.stringify({ enabled: false })
    })

    if (char && characterStore.currentTeamId) {
      await characterStore.addMember(char.id)
    }
    console.log('[App] ✓ 已创建默认角色')
  } catch (e) {
    console.error('[App] 创建默认角色失败:', e)
  }
}

async function doLogout() {
  showLogoutConfirm.value = false
  try {
    await apiClient.logout()
    characterStore.characters = []
    characterStore.teams = []
    characterStore.currentTeamId = null
    characterStore.currentCharacterId = null
    configStore.resetToDefaults?.()
    console.log('Logged out successfully')
  } catch (err) {
    console.error('Logout failed:', err)
  }

  user.value = null
  session.clear()
  isLoading.value = false
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
}

.btn {
  padding: 8px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.btn:hover {
  opacity: 0.85;
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

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app.loading {
  opacity: 0.6;
  pointer-events: none;
}

.app-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow: hidden;
  background: var(--bg-primary, #f3f4f6);
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f9fafb;
  gap: 16px;
  position: relative;
}

.loading-screen::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: #e5e7eb;
}

.loading-bar-container {
  width: 200px;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.loading-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 2px;
  animation: loading 1.5s ease-in-out infinite;
}

.loading-screen p {
  color: #6b7280;
  font-size: 15px;
}

@keyframes loading {
  0% {
    width: 0%;
  }
  50% {
    width: 70%;
  }
  100% {
    width: 0%;
  }
}
</style>
