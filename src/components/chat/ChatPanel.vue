<template>
  <div class="card chat-card">

    <div class="profile-switch-bar" v-if="characterStore.teams.length > 1">
      <label>当前团队：</label>
      <select :value="characterStore.currentTeamId" @change="onTeamSwitch" class="profile-select">
        <option v-for="t in characterStore.teams" :key="t.id" :value="t.id">{{ t.name }} ({{ getTeamMemberCount(t.id) }}人)</option>
      </select>
    </div>

    <div class="chat-characters-select">

      <div class="character-chips">
        <div
          v-for="member in characterStore.currentMembers"
          :key="member.character_id"
          v-show="!member.is_user"
          :class="['character-chip', { active: member.is_active }]"
          @click="characterStore.toggleMemberActive(member.character_id)"
        >
          {{ characterStore.getCharacterName(member.character_id) }}
          <span v-if="isMemberFunctionEnabled(member.character_id)" class="chip-fn-dot" title="该角色已开启功能">⚙</span>
        </div>
      </div>
    </div>

    <div v-if="configStore.aiAutoSwitchNotice" class="chat-notice">
      <span class="chat-notice-text">ℹ️ {{ configStore.aiAutoSwitchNotice }}</span>
      <button class="chat-notice-close" @click="configStore.aiAutoSwitchNotice = ''">×</button>
    </div>

    <div class="chat-messages" ref="chatMessagesRef">
      <div v-if="chatStore.chatMessages.length === 0" class="chat-empty">
        <p>欢迎使用对话功能！</p>
        <p>你可以用自然语言描述想要生成的图片，AI会帮你调用生图功能。</p>
        <p>例如："帮我生成一张美女照片"</p>
      </div>
      <template v-for="(msg, index) in chatStore.chatMessages">
        <div v-if="msg.role === 'user'" :key="`user-${index}`" class="chat-message user">
          <div class="message-avatar user-avatar" :style="getUserCharacterAvatar() ? { backgroundImage: `url(${getUserCharacterAvatar()})` } : {}">
            <span v-if="!getUserCharacterAvatar()">{{ getUserCharacterName().charAt(0) }}</span>
          </div>
          <div class="message-content">
            <div class="message-text">{{ msg.content }}</div>
            <div v-if="msg.images && msg.images.length" class="message-images">
              <img
                v-for="(img, i) in msg.images"
                :key="i"
                :src="img.thumb || img.base64"
                class="msg-thumb"
                @click="openViewer(img.base64)"
              />
            </div>
            <div class="message-meta">
              <span class="message-time">{{ chatStore.formatTime(msg.timestamp) }}</span>
            </div>
          </div>
        </div>

        <template v-else>
          <div
            v-for="(charMsg, charIndex) in chatStore.getParsedMessages(msg, index, isStreaming(msg, index))"
            :key="`msg-${index}-char-${charIndex}`"
            :class="['chat-message', 'assistant', { 'multi-character': charMsg.characterId != null, 'single-image-msg': msg.isSingleImage }]"
          >
            <div class="message-avatar" :style="getCharacterAvatar(charMsg.characterId) ? { backgroundImage: `url(${getCharacterAvatar(charMsg.characterId)})` } : {}">
              <span v-if="!getCharacterAvatar(charMsg.characterId)">{{ charMsg.characterId != null ? getCharacterName(charMsg.characterId).charAt(0) : '🖼️' }}</span>
            </div>
            <div class="message-content">
              <div v-if="charMsg.characterId != null && !msg.isSingleImage" class="character-name-label">
                {{ getCharacterName(charMsg.characterId) }}
                <span v-if="msg.functionName" class="function-badge">调用功能: {{ msg.functionName }}</span>
              </div>
              <div v-if="charMsg.content" class="message-text">{{ formatMessageContent(charMsg.content) }}</div>
              <div v-if="msg.functionError" class="function-error-text">⚠ 功能执行失败: {{ msg.functionError }}</div>
              <div v-if="charMsg.isLast && !msg.isSingleImage && (msg.prompt || msg.generatingPrompt)" class="message-prompt">
                <div class="prompt-label" @click="msg.showPrompt = !msg.showPrompt">
                  <span>📝 图片提示词</span>
                  <span class="prompt-toggle">{{ msg.showPrompt ? '▼' : '▶' }}</span>
                </div>
                <div v-if="msg.generatingPrompt && !msg.prompt" class="prompt-loading">
                  <span class="loading-dots">正在生成提示词</span>
                </div>
                <div v-else-if="msg.showPrompt" class="prompt-text">{{ msg.prompt }}</div>
              </div>
              <div v-if="charMsg.isLast && msg.imageUrl" class="message-image">
                <video v-if="msg.isVideo" :src="getChatMediaSrc(msg)" controls class="msg-video"></video>
                <img v-else :src="msg.thumbUrl || getChatMediaSrc(msg)" :alt="'生成的图片'" @error="handleChatImageError($event, msg)" @click="openViewer(getChatMediaSrc(msg))" />
              </div>
              <div v-if="charMsg.isLast" class="message-meta">
                <span class="message-time">{{ chatStore.formatTime(msg.timestamp) }}</span>
                <span v-if="msg.responseTime" class="response-time">⏱️ {{ formatResponseTime(msg.responseTime) }}</span>
              </div>
            </div>
          </div>
        </template>
      </template>
      <template v-if="chatStore.isAITyping && !hasLastAssistantContent">
        <div v-for="(char, index) in characterStore.activeCharacters" :key="`typing-${index}`" class="chat-message assistant">
          <div class="message-avatar" :style="char?.avatar_url ? { backgroundImage: `url(${char.avatar_url})` } : {}">
            <span v-if="!char?.avatar_url">{{ (char?.name || 'AI').charAt(0) }}</span>
          </div>
          <div class="message-content">
            <div class="message-text typing">
              <span class="typing-dot">.</span>
              <span class="typing-dot">.</span>
              <span class="typing-dot">.</span>
            </div>
          </div>
        </div>
      </template>
      <template v-if="chatStore.isGeneratingImage">
        <div
          v-if="chatStore.generatingCharacterIndex >= 0"
          class="chat-message assistant generating-msg"
        >
          <div class="message-content">
            <div class="message-text">
              <span class="generating-text">{{ chatStore.generationStatusText || '功能执行中' }}</span>
              <span class="typing-dot">.</span>
              <span class="typing-dot">.</span>
              <span class="typing-dot">.</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="chat-input-area">
      <!-- 操作行：生图 + 共享 + 图片上传区 + 模型选择（同一行） -->
      <div class="chat-actions-row">
        <div class="toggle-group">
          <Tooltip text="打开时会自动生图，关掉则是普通对话">
            <button
              :class="['segment-btn', { active: chatStore.autoGenerateImage, disabled: chatStore.isAITyping || chatStore.isGeneratingImage }]"
              :disabled="chatStore.isAITyping || chatStore.isGeneratingImage"
              @click.prevent="!chatStore.isAITyping && !chatStore.isGeneratingImage && (chatStore.autoGenerateImage = !chatStore.autoGenerateImage)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              生图
            </button>
          </Tooltip>
          <Tooltip text="开启后多角色之间可以看到对方，关掉则独自隔离">
            <button
              :class="['segment-btn', { active: characterStore.contextIsolation, disabled: chatStore.isAITyping || chatStore.isGeneratingImage }]"
              :disabled="chatStore.isAITyping || chatStore.isGeneratingImage"
              @click.prevent="!chatStore.isAITyping && !chatStore.isGeneratingImage && (characterStore.contextIsolation = !characterStore.contextIsolation)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              共享
            </button>
          </Tooltip>
        </div>

        <!-- 图片输入区（内联，可拖入图片） -->
        <div
          :class="['chat-image-input', { disabled: !imageInputEnabled, 'drag-over': imgDropIsOver && imgDropAccept, 'drag-forbidden': imgDropIsOver && !imgDropAccept }]"
          @dragover="onImgDragOver"
          @dragleave="onImgDragLeave"
          @drop="onImgDrop"
        >
          <button
            class="img-action-btn"
            :disabled="!imageInputEnabled || inputImages.length >= 4"
            @click.prevent="openGalleryPicker"
            title="从图库选择"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </button>
          <button
            class="img-action-btn"
            :disabled="!imageInputEnabled || inputImages.length >= 4"
            @click.prevent="triggerImageUpload"
            title="上传图片"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </button>
          <input
            ref="imageUploadRef"
            type="file"
            accept="image/*"
            multiple
            style="display:none"
            @change="handleImageUpload"
          />
          <!-- 缩略图（小尺寸，内联在 + 按钮后面） -->
          <div class="image-thumbnails" v-if="inputImages.length > 0">
            <div class="img-thumb-item" v-for="(img, i) in inputImages" :key="i">
              <img :src="img.thumb || img.base64" @click="openViewer(img.base64)" />
              <button class="img-thumb-remove" @click.stop="removeInputImage(i)" v-if="imageInputEnabled">×</button>
            </div>
          </div>
          <span v-if="!imageInputEnabled" class="image-input-hint">未开启功能</span>
          <span v-else class="image-input-hint">{{ inputImages.length }}/4</span>
        </div>

        <div class="model-selector" v-if="availableModels.length > 0" ref="modelSelectorRef">
          <button
            type="button"
            class="model-select-btn"
            :class="{ 'is-active-config': !!configStore.activeAiConfigId }"
            :title="`实际调用的配置：${configStore.activeAiConfigName || '未设置'}`"
            @click="toggleModelDropdown"
          >
            {{ currentModelDisplayName }}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <path d="M18 15l-6-6-6 6"></path>
            </svg>
          </button>
          <Transition name="dropdown">
            <div v-if="showModelDropdown" class="model-dropdown-menu">
              <div
                v-for="model in availableModels"
                :key="model.id"
                :class="['model-option', { active: selectedModel === model.id }]"
                @click="selectModelDirect(model.id)"
              >
                {{ model.name }}
              </div>
            </div>
          </Transition>
        </div>
        <div class="model-selector" v-else>
          <span class="model-placeholder">未配置模型</span>
        </div>
      </div>

      <div
        :class="['chat-input-row', { 'drag-over': textDropIsOver && textDropAccept, 'drag-forbidden': textDropIsOver && !textDropAccept }]"
        @dragover="onTextDragOver"
        @dragleave="onTextDragLeave"
        @drop="onTextDrop"
      >
        <textarea
          v-model="chatStore.chatInput"
          placeholder="输入消息...（可拖入 .txt/.md/.json/.prompt 或内部 prompt/rule）"
          @keydown.enter.exact.prevent="handleSend"
          rows="1"
        ></textarea>
        <button
          @click.prevent="handleSendOrStop"
          :disabled="!chatStore.chatInput.trim() && !(chatStore.isAITyping || chatStore.isGeneratingImage)"
          class="send-btn"
          :class="{ 'stop-mode': chatStore.isAITyping || chatStore.isGeneratingImage }"
        >
          <svg v-if="chatStore.isAITyping || chatStore.isGeneratingImage" viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <rect x="6" y="6" width="12" height="12" rx="2"></rect>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- 图库选择器 -->
    <FloatingWindow v-model:open="galleryPickerOpen" title="从图库选择图片" size="large">
      <div class="gallery-picker-grid" v-if="galleryImages.length > 0">
        <div
          v-for="img in galleryImages"
          :key="img.id"
          class="picker-item"
          @click="selectImageFromGallery(img)"
        >
          <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
          <div v-else class="thumb-placeholder">无图</div>
          <div class="picker-name">{{ img.name }}</div>
        </div>
      </div>
      <div v-else class="empty-state"><p>图库暂无图片</p></div>
      <template #footer>
        <button class="btn" @click="galleryPickerOpen = false">取消</button>
      </template>
    </FloatingWindow>

    <ImageViewer v-model:visible="viewerVisible" :src="viewerSrc" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useCharacterStore } from '@/stores/character'
import { useConfigStore } from '@/stores/config'
import { useGalleryStore } from '@/stores/gallery'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import { useDropTarget } from '@/composables/useDragDrop'
import apiClient from '@/services/api'
import Tooltip from '@/components/ui/Tooltip.vue'
import ImageViewer from '@/components/ui/ImageViewer.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const chatStore = useChatStore()
const fileLibraryStore = useFileLibraryStore()
const characterStore = useCharacterStore()
const configStore = useConfigStore()
const galleryStore = useGalleryStore()

const chatMessagesRef = ref(null)
const viewerVisible = ref(false)
const viewerSrc = ref('')

const openViewer = (src) => {
  if (!src) return
  viewerSrc.value = src
  viewerVisible.value = true
}

// 获取对话图片的最佳可访问源
// 优先使用硬盘已保存的文件路径（通过 serve-file 接口），fallback 到 ComfyUI URL
// 下载服务地址：开发环境走 vite 同源代理 /dl（见 vite.config.js）
const DOWNLOAD_SERVER = '/dl'

function getChatMediaSrc(msg) {
  if (!msg) return ''
  // 优先用已保存到硬盘的文件路径
  if (Array.isArray(msg.savedFiles) && msg.savedFiles.length > 0) {
    const p = msg.savedFiles[0]
    if (typeof p === 'string' && p.trim()) {
      return `${DOWNLOAD_SERVER}/api/serve-file?path=${encodeURIComponent(p)}`
    }
  }
  // fallback 到 ComfyUI URL
  return msg.imageUrl || ''
}

// 图片加载失败时，尝试切换到硬盘文件源
function handleChatImageError(event, msg) {
  const img = event.target
  // 如果当前 src 不是 serve-file，且有 savedFiles，则切换到 serve-file
  if (img && msg && Array.isArray(msg.savedFiles) && msg.savedFiles.length > 0) {
    const p = msg.savedFiles[0]
    if (typeof p === 'string' && p.trim()) {
      const newSrc = `${DOWNLOAD_SERVER}/api/serve-file?path=${encodeURIComponent(p)}`
      if (img.src !== newSrc) {
        img.src = newSrc
        return
      }
    }
  }
  // 最终 fallback：如果有缩略图就显示缩略图
  if (img && msg && msg.thumbUrl && img.src !== msg.thumbUrl) {
    img.src = msg.thumbUrl
    return
  }
  // 全部失败则隐藏
  console.error('图片加载失败:', msg.imageUrl)
  img.style.display = 'none'
}

const onTeamSwitch = (e) => {
  characterStore.switchTeam(Number(e.target.value))
}

const getTeamMemberCount = (teamId) => {
  const t = characterStore.teams.find(x => x.id === teamId)
  if (!t) return 0
  try {
    const mc = typeof t.member_config === 'string' ? JSON.parse(t.member_config || '[]') : (t.member_config || [])
    return mc.filter(m => !m.is_user).length
  } catch { return 0 }
}

// ============ 模型选择 ============
const availableModels = computed(() => {
  return (configStore.aiConfigs || [])
    .filter(c => c.is_callable)
    .map(c => ({
      id: c.id,
      name: c.name || c.model || `配置#${c.id}`,
      configId: c.id
    }))
})

const selectedModel = ref('')
const showModelDropdown = ref(false)
const modelSelectorRef = ref(null)

const currentModelDisplayName = computed(() => {
  const model = availableModels.value.find(m => m.id === selectedModel.value)
  return model ? model.name : '选择模型'
})

const toggleModelDropdown = () => {
  showModelDropdown.value = !showModelDropdown.value
  if (showModelDropdown.value) {
    nextTick(() => {
      document.addEventListener('click', closeModelDropdownOnOutsideClick)
    })
  }
}

const closeModelDropdownOnOutsideClick = (e) => {
  if (modelSelectorRef.value && !modelSelectorRef.value.contains(e.target)) {
    showModelDropdown.value = false
    document.removeEventListener('click', closeModelDropdownOnOutsideClick)
  }
}

const selectModelDirect = async (modelId) => {
  showModelDropdown.value = false
  document.removeEventListener('click', closeModelDropdownOnOutsideClick)
  const model = availableModels.value.find(m => m.id === modelId)
  if (!model) return
  selectedModel.value = modelId
  configStore.aiAutoSwitchNotice = '' // 用户手动换了模型，之前的自动切换提示作废
  try {
    await configStore.setActiveAiConfig(model.configId)
  } catch (e) {
    console.error('切换激活 AI 配置失败:', e)
  }
}

watch(availableModels, async (models) => {
  if (models.length === 0) return
  const activeId = configStore.activeAiConfigId
  if (activeId && models.some(m => m.id === activeId)) {
    selectedModel.value = activeId
    return
  }
  // 关键：对话里显示哪个模型，就必须真的用哪个模型。
  // 当前「使用中」的配置不在「可调用」列表里时，把列表第一个设为使用中，
  // 否则会出现"下拉显示 gemma、实际调用另一条配置"的错位。
  const target = models[0].id
  const changed = selectedModel.value !== target
  selectedModel.value = target
  if (changed) {
    try {
      await configStore.setActiveAiConfig(target)
      console.log('🔗 对话已同步激活 AI 配置:', target)
    } catch (e) {
      console.error('同步激活 AI 配置失败:', e)
    }
  }
}, { immediate: true })

// ============ 对话消息相关 ============
const hasLastAssistantContent = computed(() => {
  const messages = chatStore.chatMessages
  if (messages.length === 0) return false
  const lastMsg = messages[messages.length - 1]
  if (lastMsg.role === 'assistant' && chatStore.isAITyping) return true
  return lastMsg.role === 'assistant' && lastMsg.content && lastMsg.content.trim().length > 0
})

const isStreaming = (msg, index) => {
  const messages = chatStore.chatMessages
  return chatStore.isAITyping &&
         index === messages.length - 1 &&
         msg.role === 'assistant'
}

const getCharacterAvatar = (id) => characterStore.getCharacterAvatar(id)
const getCharacterName = (id) => characterStore.getCharacterName(id)

const getUserCharacterAvatar = () => {
  const uc = characterStore.userCharacter
  return uc?.avatar_url || uc?.avatar || null
}

const getUserCharacterName = () => {
  const uc = characterStore.userCharacter
  return uc?.name || '我'
}

const formatResponseTime = (ms) => {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const formatMessageContent = (content) => {
  if (!content) return ''
  return content.replace(/\n{2,}/g, '\n').trim()
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
    return d.toLocaleDateString('zh-CN')
  } catch { return '' }
}

const scrollToBottom = () => {
  if (chatMessagesRef.value) {
    setTimeout(() => {
      chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
    }, 100)
  }
}

// ============ 功能开启检测 ============
// 判断指定角色是否开启了功能
const isMemberFunctionEnabled = (characterId) => {
  const char = characterStore.getCharacterById(characterId) || characterStore.characters.find(c => c.id === characterId)
  if (!char) return false
  return characterStore.isCharacterFunctionEnabled(char)
}

// 图片输入功能是否可用：当前任意激活角色开启了功能即启用
const imageInputEnabled = computed(() => {
  const active = characterStore.activeCharacters || []
  if (active.length === 0) return false
  return active.some(c => characterStore.isCharacterFunctionEnabled(c))
})

// ============ 图片输入管理 ============
// 输入图片列表与 chatStore.pendingInputImages 双向同步，切换角色不丢失
const inputImages = ref([...(chatStore.pendingInputImages || [])])

watch(inputImages, (val) => {
  chatStore.setPendingInputImages(val)
}, { deep: true })

watch(() => chatStore.pendingInputImages, (val) => {
  if (val !== inputImages.value) {
    inputImages.value = Array.isArray(val) ? [...val] : []
  }
})

const imageUploadRef = ref(null)

const triggerImageUpload = () => {
  if (!imageInputEnabled.value || inputImages.value.length >= 4) return
  if (imageUploadRef.value) imageUploadRef.value.click()
}

// 将 File 转为 base64
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 生成缩略图 base64（最长边 300px）
const generateThumb = (base64DataUrl, maxSize = 300) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > height) {
        if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize }
      } else {
        if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => resolve('')
    img.src = base64DataUrl
  })
}

const handleImageUpload = async (e) => {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!imageInputEnabled.value) return
  for (const file of files) {
    if (inputImages.value.length >= 4) break
    if (!file.type.startsWith('image/')) continue
    try {
      const base64 = await fileToBase64(file)
      const thumb = await generateThumb(base64)
      inputImages.value.push({ base64, thumb, name: file.name })
    } catch (err) {
      console.error('上传图片失败:', err)
    }
  }
}

// 图片区 drop target：接受内部 image 文件 + 外部图片文件
const {
  isOver: imgDropIsOver,
  isAcceptable: imgDropAccept,
  onDragOver: onImgDragOver,
  onDragLeave: onImgDragLeave,
  onDropEvent: onImgDrop
} = useDropTarget(
  (types) => {
    if (!imageInputEnabled.value || inputImages.value.length >= 4) return false
    const t = Array.from(types)
    return t.includes('application/x-rfp-type-image') || t.includes('Files')
  },
  async (item, e) => {
    if (!imageInputEnabled.value || inputImages.value.length >= 4) return
    if (item && item._kind === 'file' && item.file_type === 'image') {
      try {
        const full = await fileLibraryStore.getFileById(item.id)
        const thumb = full?.thumbnail_data || ''
        // 图片文件存储在磁盘上，需通过 blob URL 加载
        let imageSrc = thumb
        try {
          const blobUrl = await apiClient.getFileLibraryFileBlobUrl(item.id)
          if (blobUrl) imageSrc = blobUrl
        } catch (err) {
          console.warn('获取原图 blob 失败，使用缩略图:', err)
        }
        if (imageSrc) {
          inputImages.value.push({
            base64: imageSrc,
            thumb: thumb || imageSrc,
            name: item.name
          })
        }
      } catch (err) {
        console.error('从文件库拖入图片失败:', err)
      }
      return
    }
    if (e && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (inputImages.value.length >= 4) break
        if (!file.type.startsWith('image/')) continue
        try {
          const base64 = await fileToBase64(file)
          const thumb = await generateThumb(base64)
          inputImages.value.push({ base64, thumb, name: file.name })
        } catch (err) {
          console.error('拖入图片失败:', err)
        }
      }
    }
  }
)

// 文本区 drop target：接受 .txt/.md/.json/.prompt 外部文件 + 内部 prompt/rule 文件
const {
  isOver: textDropIsOver,
  isAcceptable: textDropAccept,
  onDragOver: onTextDragOver,
  onDragLeave: onTextDragLeave,
  onDropEvent: onTextDrop
} = useDropTarget(
  (types) => {
    const t = Array.from(types)
    return t.includes('application/x-rfp-type-prompt') ||
           t.includes('application/x-rfp-type-rule') ||
           t.includes('Files')
  },
  async (item, e) => {
    if (item && item._kind === 'file') {
      try {
        const full = await fileLibraryStore.getFileById(item.id)
        const content = full?.content || ''
        if (content) {
          chatStore.chatInput = chatStore.chatInput
            ? chatStore.chatInput + '\n' + content
            : content
        }
      } catch (err) {
        console.error('从文件库拖入文本失败:', err)
      }
      return
    }
    if (e && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (!/\.(txt|md|json|prompt)$/i.test(file.name)) continue
        try {
          const text = await file.text()
          chatStore.chatInput = chatStore.chatInput
            ? chatStore.chatInput + '\n' + text
            : text
        } catch (err) {
          console.error('读取拖入文件失败:', file.name, err)
        }
      }
    }
  }
)

const removeInputImage = (index) => {
  if (index < 0 || index >= inputImages.value.length) return
  inputImages.value.splice(index, 1)
}

// ============ 图库选择器 ============
const galleryPickerOpen = ref(false)
const galleryImages = computed(() => galleryStore.images || [])

const openGalleryPicker = () => {
  if (!imageInputEnabled.value || inputImages.value.length >= 4) return
  if (galleryImages.value.length === 0) {
    galleryStore.loadAll().catch(() => {})
  }
  galleryPickerOpen.value = true
}

const selectImageFromGallery = async (img) => {
  if (inputImages.value.length >= 4) return
  // 优先使用缩略图作为占位，异步加载完整 base64 替换
  const thumb = img.thumbnail_data || ''
  inputImages.value.push({ base64: thumb, thumb, name: img.name || 'gallery' })
  if (inputImages.value.length >= 4) galleryPickerOpen.value = false
  try {
    const fullBase64 = await apiClient.getGalleryImageBase64(img.id)
    if (fullBase64) {
      const idx = inputImages.value.findIndex(i => i.name === (img.name || 'gallery') && i.base64 === thumb)
      if (idx >= 0) inputImages.value[idx].base64 = fullBase64
    }
  } catch (e) {
    console.warn('加载图库完整图片失败，使用缩略图:', e)
  }
}

// ============ 发送消息 ============
const handleSend = () => {
  if (!chatStore.chatInput.trim()) return
  chatStore.sendChatMessage()
}

const handleSendOrStop = () => {
  if (chatStore.isAITyping || chatStore.isGeneratingImage) {
    chatStore.stopGeneration()
    return
  }
  handleSend()
}

// 新建对话
const handleNewChat = async () => {
  if (chatStore.isAITyping || chatStore.isGeneratingImage) return
  await chatStore.startNewConversation()
  nextTick(() => scrollToBottom())
}

// ============ 滚动监听 ============
watch(
  () => chatStore.chatMessages.length,
  () => { nextTick(() => scrollToBottom()) }
)

watch(
  () => {
    const messages = chatStore.chatMessages
    if (messages.length === 0) return ''
    const lastMsg = messages[messages.length - 1]
    // 同时监听 content 和 prompt，确保流式提示词也能触发滚动
    return lastMsg.content + (lastMsg.prompt || '')
  },
  () => { nextTick(() => scrollToBottom()) }
)

// 对话结束后自动保存
watch(
  () => chatStore.isAITyping,
  (newVal, oldVal) => {
    if (oldVal === true && newVal === false && chatStore.chatMessages.length > 0) {
      if (!chatStore.currentConversationId) {
        // 首次对话创建记录
        chatStore.createConversation(chatStore.chatMessages[0]?.content?.slice(0, 30) || '新对话', null)
          .then(() => chatStore.saveCurrentConversation())
      } else {
        chatStore.saveCurrentConversation()
      }
    }
  }
)

// ============ 初始化 ============
onMounted(() => {
  chatStore.loadConversations().catch(() => {})
  // 对话自己也要拿到 AI 配置列表：否则没打开过设置页时，「可调用」下拉是空的、
  // 也就无法把"显示中的模型"和"实际使用的配置"对齐
  configStore.loadAiConfigs().catch(e => console.warn('[Chat] 加载 AI 配置列表失败:', e))
  // 图库按需加载（打开选择器时再加载完整列表）
})
</script>

<style scoped>
.chat-card {
  display: flex;
  flex-direction: column;
  height: calc(105vh - 120px);
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.chat-card h2 {
  margin: 0 0 12px 0;
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--text-primary);
}

.profile-switch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-radius: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.profile-switch-bar label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.profile-select {
  flex: 1;
  padding: 6px 10px !important;
  font-size: 12px !important;
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border: none !important;
  border-radius: 6px !important;
  cursor: pointer;
  appearance: auto !important;
}

.chat-characters-select {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 0px;
  margin-bottom: 8px;
}

.chat-characters-select .select-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.chat-characters-select .select-header span {
  font-weight: 600;
  color: var(--text-primary);
}

.chat-characters-select .select-header small {
  color: var(--text-muted);
  font-size: 11px;
}

.character-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.character-chip {
  padding: 4px 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 2px solid transparent;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.character-chip:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.character-chip.active {
  background: var(--accent-color);
  color: var(--accent-text);
  border-color: var(--accent-color);
}

/* 配置自动切换提示条（一次性） */
.chat-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 193, 7, 0.14);
  border: 1px solid rgba(255, 193, 7, 0.45);
  color: #8a6100;
  font-size: 12px;
  line-height: 1.4;
}

.chat-notice-text {
  flex: 1;
}

.chat-notice-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
  margin-bottom: 12px;
}

.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: var(--bg-primary);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: 3px;
  transition: background 0.2s ease;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.chat-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 32px 16px;
}

.chat-empty p {
  margin: 8px 0;
}

.chat-message {
  display: flex;
  margin-bottom: 16px;
  align-items: flex-start;
}

.chat-message.user {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.chat-message.user .message-content {
  align-items: flex-end;
  margin-right: 8px;
  margin-left: 0;
}

.chat-message.user .message-text {
  text-align: left;
}

.chat-message.user .message-avatar {
  margin-left: 8px;
  margin-right: 0;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-avatar span {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.message-content {
  max-width: 70%;
  margin: 0 8px;
}

.character-name-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-weight: 500;
}

.chat-message.assistant .character-name-label {
  text-align: left;
}

.chat-message.user .user-name-label {
  text-align: right;
}

.message-text {
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}

.msg-dialogue {
  color: var(--text-primary);
  font-weight: 500;
}

.msg-action {
  color: #888;
  font-style: italic;
}

.chat-message.user .message-text {
  background: var(--accent-color);
  color: var(--accent-text);
  border-bottom-right-radius: 4px;
}

.chat-message.assistant .message-text {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.message-prompt {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  max-width: 100%;
}

.prompt-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  margin-bottom: 0;
}

.prompt-label:hover {
  color: var(--text-primary);
}

.prompt-toggle {
  font-size: 10px;
  transition: transform 0.2s ease;
}

.prompt-text {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.prompt-loading {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.loading-dots {
  font-size: 12px;
  color: var(--text-secondary);
  animation: pulse 1.5s ease-in-out infinite;
}

.loading-dots::after {
  content: '...';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.message-image {
  margin-top: 8px;
  border-radius: 8px;
  overflow: hidden;
  max-width: 50%;
}

.message-image img {
  max-width: 50%;
  height: auto;
  display: block;
  cursor: zoom-in;
}

.message-time {
  font-size: 11px;
  color: var(--text-muted);
}

.chat-message.assistant .message-time {
  text-align: left;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.chat-message.user .message-meta {
  justify-content: flex-end;
}

.chat-message.assistant .message-meta {
  justify-content: flex-start;
}

.response-time {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: var(--bg-surface);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.message-text.typing {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 10px 14px;
}

.typing-dot {
  animation: typing 1.4s infinite;
  font-size: 1.5rem;
  line-height: 0.5;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

.generating-text {
  margin-right: 8px;
  color: var(--accent-color);
  font-weight: 500;
}

@keyframes typing {
  0%, 60%, 100% {
    opacity: 0.3;
  }
  30% {
    opacity: 1;
  }
}

.chat-input-area {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0px 50px;
  position: relative;
  z-index: 1;
  flex-wrap: nowrap;
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 50px;
  position: relative;
  transition: background 0.15s ease;
}

.chat-input-row.drag-over {
  outline: 2px dashed var(--accent-color, #4a9eff);
  outline-offset: -2px;
  background: rgba(74, 158, 255, 0.08);
  border-radius: 8px;
}

.chat-input-row.drag-over.drag-forbidden {
  outline-color: #ef4444;
  cursor: not-allowed;
}

.chat-input-row textarea {
  flex: 1;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  resize: none;
  box-sizing: border-box;
  box-shadow: var(--input-shadow);
  border: none;
  min-height: 100px;
  max-height: 180px;
}

.chat-input-row textarea:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4), var(--input-shadow);
}

.chat-input-row textarea::-webkit-scrollbar {
  width: 6px;
}

.chat-input-row textarea::-webkit-scrollbar-track {
  background: var(--bg-primary);
  border-radius: 3px;
}

.chat-input-row textarea::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: 3px;
  transition: background 0.2s ease;
}

.chat-input-row textarea::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.send-btn {
  padding: 0;
  border-radius: 40px;
  background: var(--accent-color);
  color: var(--accent-text);
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: opacity 0.15s ease, background 0.15s ease;
  white-space: nowrap;
  height: 60px;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn.stop-mode {
  background: #f44336;
  animation: pulse-stop 1.5s ease-in-out infinite;
}

.send-btn.stop-mode:hover:not(:disabled) {
  background: #d32f2f;
  opacity: 1;
}

@keyframes pulse-stop {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.toggle-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.model-select {
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.model-select:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.model-select option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.model-placeholder {
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

.model-selector {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 8px;
}

.model-select-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.model-select-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* 有「使用中」的配置时给个绿色标识，和设置页的「使用中」对应 */
.model-select-btn.is-active-config {
  box-shadow: inset 0 0 0 1px rgba(76, 175, 80, 0.5);
  color: var(--text-primary);
  background: rgba(76, 175, 80, 0.12);
}

.model-select-btn svg {
  transition: transform 0.2s ease;
}

.model-dropdown-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 120px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg-surface);
  border-radius: 6px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-option {
  padding: 8px 12px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.model-option:hover {
  background: var(--bg-secondary);
}

.model-option.active {
  background: var(--accent-color);
  color: white;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.segment-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.segment-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.segment-btn.active {
  background: #4CAF50;
  color: white;
}

.segment-btn.thinking-btn.active {
  background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%);
}

.segment-btn svg {
  flex-shrink: 0;
}

.chat-actions button {
  padding: 10px 20px;
  border-radius: 9999px;
  background: var(--accent-color);
  color: var(--accent-text);
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: opacity 0.15s ease;
}

.chat-actions button:hover:not(:disabled) {
  opacity: 0.85;
}

.chat-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-chat-btn {
  padding: 4px 16px;
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.clear-chat-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.clear-chat-btn.btn-disabled,
.clear-chat-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.segment-btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.send-btn.generate-mode {
  background: #2196F3;
}

.chat-characters-select.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.chip-disabled {
  opacity: 0.5;
  cursor: not-allowed !important;
}

.single-image-msg .message-avatar {
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
}

.single-image-msg .message-image img {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
}

.generating-status {
  color: #2196F3;
  font-size: 13px;
}

/* ============ 新建对话图标按钮 ============ */
.new-chat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  margin-left: auto;
  border: none;
  border-radius: 6px;
  background: var(--accent-color);
  color: var(--accent-text);
  cursor: pointer;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.new-chat-icon:hover {
  opacity: 0.85;
}

/* ============ 角色 chip 功能指示器 ============ */
.chip-fn-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  font-size: 10px;
  color: #FFD700;
}

/* ============ 功能调用徽章 / 错误 ============ */
.function-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: #6366f1;
  border-radius: 8px;
  vertical-align: middle;
}

.function-error-text {
  margin-top: 6px;
  font-size: 12px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  padding: 6px 10px;
  border-radius: 6px;
}

/* ============ 消息中的图片 ============ */
.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.msg-thumb {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  cursor: zoom-in;
  background: var(--bg-surface);
}

/* ============ 图片输入区（内联） ============ */
.chat-image-input {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-surface);
  border-radius: 8px;
  margin: 0;
  transition: opacity 0.2s ease, background 0.15s ease;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.chat-image-input.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.chat-image-input.drag-over {
  outline: 2px dashed var(--accent-color, #4a9eff);
  outline-offset: -2px;
  background: rgba(74, 158, 255, 0.08);
  border-radius: 8px;
}

.chat-image-input.drag-over.drag-forbidden {
  outline-color: #ef4444;
  cursor: not-allowed;
}

.img-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.img-action-btn:hover:not(:disabled) {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--accent-color);
}

.img-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.image-input-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 2px;
  white-space: nowrap;
  flex-shrink: 0;
}

.image-thumbnails {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  align-items: center;
  overflow: hidden;
}

.img-thumb-item {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.img-thumb-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
  display: block;
}

.img-thumb-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-thumb-remove:hover {
  background: #ef4444;
}

/* ============ 最近对话记录列表 ============ */
.recent-conversations {
  flex-shrink: 0;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border-radius: 8px;
}

.recent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.recent-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.more-records-btn {
  padding: 2px 8px;
  border: none;
  background: transparent;
  color: var(--accent-color);
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
}

.more-records-btn:hover {
  background: var(--bg-secondary);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.recent-item {
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.recent-item:hover {
  background: var(--bg-secondary);
}

.recent-item.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.recent-item-title {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.recent-item.active .recent-item-meta {
  color: rgba(255, 255, 255, 0.8);
}

.recent-empty {
  text-align: center;
  padding: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

/* ============ 历史记录面板 / 图库选择器 ============ */
.empty-state {
  text-align: center;
  padding: 32px 16px;
  color: var(--text-muted);
}

.empty-state p {
  margin: 4px 0;
  font-size: 13px;
}

/* ============ 历史记录列表（参照打标管理） ============ */
.history-modal {
  display: flex;
  flex-direction: column;
}

.history-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-list-header,
.history-list-row {
  display: grid;
  grid-template-columns: 40px 1fr 80px 120px 120px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.history-list-header {
  background: var(--bg-surface);
  border-radius: 6px;
  color: var(--text-secondary);
  font-weight: 600;
}

.history-list-row {
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.history-list-row:hover {
  background: var(--bg-surface);
}

.history-list-row.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--accent-color);
}

.history-list-header .col-check,
.history-list-row .col-check {
  display: flex;
  justify-content: center;
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

.col-title {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text-primary);
}

.col-title:hover {
  color: var(--accent-color);
}

.col-count,
.col-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.col-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.btn-icon-sm {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icon-sm:hover {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-icon-sm.danger:hover {
  background: #ef4444;
  color: #fff;
}

.history-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

/* ============ 图库选择网格 ============ */
.gallery-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
}

.picker-item {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-surface);
  transition: all 0.15s ease;
  border: 2px solid transparent;
}

.picker-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
}

.picker-item img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  color: var(--text-muted);
  font-size: 12px;
}

.picker-name {
  padding: 4px 6px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
