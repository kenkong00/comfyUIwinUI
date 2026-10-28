<template>
  <div class="function-editor-form">
    <!-- 功能头部：名称 + ComfyUI配置选择 -->
    <div class="function-header">
      <div class="form-group function-name-group">
        <label>功能名称</label>
        <input
          type="text"
          v-model="config.functionName"
          placeholder="例如：文生图-人像写真"
        />
      </div>
      <div v-if="!isTextEditTab" class="form-group comfyui-select-group">
        <label>ComfyUI 配置（单选）</label>
        <select v-model="config.comfyuiConfigId">
          <option :value="null">使用主激活配置</option>
          <option
            v-for="cfg in activeComfyuiConfigs"
            :key="cfg.id"
            :value="cfg.id"
          >{{ cfg.name }}</option>
        </select>
      </div>
    </div>

    <!-- 工作流单选筛选（文字编辑功能只调大模型、不出图，不需要工作流） -->
    <div v-if="!isTextEditTab" class="form-group">
      <label>选择工作流（单选）</label>
      <FileSelector
        v-model="config.selectedWorkflowId"
        file-type="workflow"
        mode="single"
        placeholder="未选择工作流（将使用默认）"
      />
    </div>

    <!-- API 配置（批量推理 / 文字编辑 tab 显示，紧跟 ComfyUI 配置之后） -->
    <div v-if="isBatchInferenceTab || isTextEditTab" class="form-group">
      <label>API 配置（单选）</label>
      <select v-model="config.apiConfigId">
        <option :value="null" disabled>请选择 API 配置</option>
        <option
          v-for="cfg in activeAiConfigs"
          :key="cfg.id"
          :value="cfg.id"
        >{{ cfg.name }}（{{ cfg.provider }} / {{ cfg.model }}）</option>
      </select>
      <small class="hint-text">{{ isTextEditTab ? '选择可调用的 AI 服务商配置，用于扩写 / 续写文字' : '选择可调用的 AI 服务商配置，用于推理批量提示词' }}</small>
    </div>

    <!-- 文字编辑：生成参数（温度 / 最大输出字数 / 上下文长度） -->
    <div v-if="isTextEditTab" class="form-group">
      <label>
        生成参数
        <button type="button" class="toggle-link" @click="config.showTextParams = !config.showTextParams">
          {{ config.showTextParams ? '收起' : '展开' }}
        </button>
      </label>
      <div v-if="config.showTextParams" class="video-params-panel">
        <p class="params-hint">留空则沿用该 API 配置自身的默认值。</p>
        <div class="params-grid">
          <div class="param-row">
            <label>温度 temperature</label>
            <input type="number" step="0.1" min="0" max="2" v-model.number="config.textParams.temperature" placeholder="如 0.8" />
            <span class="param-hint-text">越大越发散</span>
          </div>
          <div class="param-row">
            <label>最大输出 token</label>
            <input type="number" step="64" min="16" v-model.number="config.textParams.maxTokens" placeholder="如 1024" />
            <span class="param-hint-text">续写长度上限</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 插入提示词规则（仅批量推理 tab 显示，可拖拽提示词规则文件，决定 AI 出批量提示词的规则） -->
    <div v-if="isBatchInferenceTab" class="form-group">
      <label>插入提示词规则</label>
      <FileSelector
        v-model="config.promptRuleFileIds"
        file-type="rule"
        mode="multiple"
        placeholder="未选择提示词规则文件"
      />
      <small class="hint-text">拖入提示词规则文件，要求 AI 按规则生成批量提示词，生成结果将转换为 JSON 分镜</small>
    </div>

    <!-- 图片节点 ID 配置（仅在图像编辑/图生视频 tab 自动出现，无需开关） -->
    <!-- 输入图片（仅在图像编辑/图生视频 tab 显示，4个固定槽位） -->
    <div v-if="needsImageTab" class="form-group">
      <label>输入图片<span class="hint-text">（图1/图2/图3/图4 固定位置，可拖入图片）</span></label>
      <div class="image-slots">
        <div
          v-for="i in 4"
          :key="i"
          :class="['image-slot', { 'slot-drag-over': slotDragOver[i - 1] }]"
          @dragover.prevent="onSlotDragOver($event, i - 1)"
          @dragleave.prevent="onSlotDragLeave(i - 1)"
          @drop.prevent="onSlotDrop($event, i - 1)"
        >
          <template v-if="config.inputImages[i - 1]">
            <img :src="config.inputImages[i - 1].preview" :alt="`图${i}`" class="slot-img" />
            <span class="slot-label">图{{ i }}</span>
            <button type="button" class="slot-remove" @click="removeInputImage(i - 1)" title="移除">×</button>
          </template>
          <template v-else>
            <div class="slot-empty">
              <span class="slot-label empty">图{{ i }}</span>
              <button type="button" class="btn btn-sm" @click="openInputGalleryPickerFor(i - 1)">图库选择</button>
              <button type="button" class="btn btn-sm" @click="triggerInputUploadFor(i - 1)">上传</button>
            </div>
          </template>
        </div>
      </div>
      <input
        type="file"
        ref="inputImageInput"
        accept="image/*"
        @change="handleInputUpload"
        style="display: none"
      />
    </div>

    <!-- 图片节点 ID 配置（仅在图像编辑/图生视频 tab 自动显示，4个对应图片1-4） -->
    <div v-if="needsImageTab" class="form-group">
      <label>
        图片节点 ID 配置
        <button type="button" class="toggle-link" @click="config.showImageNodeIds = !config.showImageNodeIds">
          {{ config.showImageNodeIds ? '收起' : '展开' }}
        </button>
      </label>
      <div v-if="config.showImageNodeIds" class="video-params-panel">
        <p class="params-hint">填写工作流中对应 LoadImage 节点的 ID（留空则不传入该图片）。节点 ID 因工作流而异，请根据实际填写。</p>
        <div class="params-grid">
          <div class="param-row" v-for="i in 4" :key="i">
            <label>图{{ i }} 节点 ID</label>
            <input type="text" v-model="config.imageNodeIds[i - 1]" :placeholder="`如 ${defaultImageNodeHints[i - 1]}`" />
            <span class="param-hint-text">对应输入图片 {{ i }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 插入提示词（chip 多选，仅非分镜生成 tab 显示） -->
    <div v-if="!isStoryboardTab" class="form-group">
      <label>插入提示词（可选，将拼接到提示词前面）</label>
      <FileSelector
        v-model="config.insertedPromptIds"
        file-type="prompt"
        :accept-types="['rule']"
        mode="multiple"
        placeholder="未插入提示词"
      />
    </div>

    <!-- Json分镜提示词文件（仅分镜生成 tab 显示：提示词来源） -->
    <div v-if="isStoryboardTab" class="form-group">
      <label>Json分镜提示词文件（单选）</label>
      <FileSelector
        v-model="config.storyboardFileId"
        file-type="storyboard"
        :accept-types="['json']"
        mode="single"
        placeholder="未选择 Json分镜 文件"
      />
      <small class="hint-text">生成时调用此文件中的分镜提示词（在文件库把对应文件夹"设为可调用"后才会出现在这里；右键 Json分镜 文件生成时，将优先使用所右键的文件）</small>
    </div>

    <!-- 提示词输入框（分镜生成 tab 由 Json分镜 文件提供，不显示） -->
    <div v-if="!isStoryboardTab" class="form-group">
      <label>提示词</label>
      <textarea
        v-model="config.promptText"
        :placeholder="isTextEditTab ? '例如：你是一个小说续写助手，请根据上下文续写 200 字左右，保持文风一致…' : '输入提示词...'"
        rows="3"
      ></textarea>
    </div>
    <div v-else class="form-group">
      <p class="storyboard-note">分镜生成：提示词取自上方选择的「Json分镜提示词文件」，无需在此输入。右侧"测试"将直接读取该文件中的分镜逐条出图。</p>
    </div>

    <!-- 图片参数配置（宽高节点，除文字编辑外均显示） -->
    <div v-if="!isTextEditTab" class="form-group">
      <label>
        图片参数配置
        <button type="button" class="toggle-link" @click="config.showImageParams = !config.showImageParams">
          {{ config.showImageParams ? '收起' : '展开' }}
        </button>
      </label>
      <div v-if="config.showImageParams" class="video-params-panel">
        <p class="params-hint">填写工作流中对应参数的节点 ID（留空则不影响工作流）。节点 ID 因工作流而异，请根据实际填写。</p>
        <!-- 尺寸快捷选择按钮 -->
        <div class="size-shortcuts">
          <span class="size-shortcut-label">快捷尺寸：</span>
          <button
            v-for="sz in presetSizes"
            :key="sz.label"
            type="button"
            class="size-btn"
            :class="{ active: isSizeActive(sz.w, sz.h) }"
            @click="applySize(sz.w, sz.h)"
            :title="`${sz.w} × ${sz.h}`"
          >{{ sz.label }}</button>
          <button type="button" class="size-btn reverse-btn" @click="reverseSize" title="反转宽高">⇄ 反转</button>
        </div>
        <div class="params-grid">
          <div class="param-row">
            <label>宽度节点 ID</label>
            <input type="text" v-model="config.imageParams.widthNodeId" placeholder="如 292" />
            <input type="number" v-model.number="config.imageParams.width" min="64" max="2048" step="64" placeholder="数值" />
          </div>
          <div class="param-row">
            <label>高度节点 ID</label>
            <input type="text" v-model="config.imageParams.heightNodeId" placeholder="如 293" />
            <input type="number" v-model.number="config.imageParams.height" min="64" max="2048" step="64" placeholder="数值" />
          </div>
        </div>
      </div>
    </div>

    <!-- 视频参数配置（仅视频 tab 显示） -->
    <div v-if="isVideoTab" class="form-group">
      <label>
        视频参数配置
        <button type="button" class="toggle-link" @click="config.showVideoParams = !config.showVideoParams">
          {{ config.showVideoParams ? '收起' : '展开' }}
        </button>
      </label>
      <div v-if="config.showVideoParams" class="video-params-panel">
        <p class="params-hint">填写工作流中对应参数的节点 ID（如 292），程序会自动设置该节点的参数值。节点 ID 因工作流而异，请根据实际填写。</p>
        <div class="params-grid">
          <div class="param-row">
            <label>提示词节点 ID</label>
            <input type="text" v-model="config.videoParams.promptNodeId" placeholder="如 352" />
            <span class="param-hint-text">设置该节点的 text 输入</span>
          </div>
          <div class="param-row">
            <label>宽度节点 ID</label>
            <input type="text" v-model="config.videoParams.widthNodeId" placeholder="如 292" />
            <input type="number" v-model.number="config.videoParams.width" min="64" max="2048" step="64" />
          </div>
          <div class="param-row">
            <label>高度节点 ID</label>
            <input type="text" v-model="config.videoParams.heightNodeId" placeholder="如 293" />
            <input type="number" v-model.number="config.videoParams.height" min="64" max="2048" step="64" />
          </div>
          <div class="param-row">
            <label>视频长度节点 ID</label>
            <input type="text" v-model="config.videoParams.lengthNodeId" placeholder="如 291" />
            <input type="number" v-model.number="config.videoParams.length" min="1" max="500" step="1" />
          </div>
          <div class="param-row">
            <label>帧率节点 ID</label>
            <input type="text" v-model="config.videoParams.fpsNodeId" placeholder="如 285" />
            <input type="number" v-model.number="config.videoParams.fps" min="1" max="60" step="1" />
          </div>
          <div class="param-row toggle-row">
            <label>文生视频开关节点 ID</label>
            <input type="text" v-model="config.videoParams.t2vNodeId" placeholder="如 290" />
            <label class="switch-mini">
              <input type="checkbox" v-model="config.videoParams.textToVideo" />
              <span class="switch-slider"></span>
              <span class="switch-label">{{ config.videoParams.textToVideo ? '开启' : '关闭' }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入图片图库选择器 -->
    <FloatingWindow v-model:open="showInputGalleryPicker" title="从图库选择输入图片" size="large">
      <div class="picker-filter">
        <select v-model="inputPickerCategory" class="filter-select">
          <option value="all">全部分类</option>
          <option v-for="cat in galleryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
        <input type="text" v-model="inputPickerSearch" placeholder="搜索图片..." class="filter-search" />
      </div>
      <div class="picker-grid" v-if="filteredGalleryImages.length > 0">
        <div
          v-for="img in filteredGalleryImages"
          :key="img.id"
          class="picker-item"
          @click="selectInputFromGallery(img)"
        >
          <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
          <div v-else class="thumb-placeholder">无图</div>
          <div class="picker-item-name" :title="img.name">{{ img.name }}</div>
        </div>
      </div>
      <div v-else class="empty-hint">图库暂无图片</div>
      <template #footer>
        <button class="btn" @click="showInputGalleryPicker = false">取消</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useGalleryStore } from '@/stores/gallery'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import { apiClient } from '@/services/api'
import FileSelector from '@/components/common/FileSelector.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const props = defineProps({
  // 配置对象（reactive，直接修改其属性以双向绑定）
  config: {
    type: Object,
    required: true
  },
  // 功能类型：text2img / img2img / text2video / img2video
  tabId: {
    type: String,
    required: true
  }
})

const galleryStore = useGalleryStore()
const fileLibraryStore = useFileLibraryStore()

// ============ 图片槽位拖拽接收 ============
const slotDragOver = reactive([false, false, false, false])

function onSlotDragOver(e, slotIdx) {
  const types = Array.from(e.dataTransfer.types)
  // 接受内部图片文件或外部图片文件
  if (types.includes('application/x-rfp-type-image') || types.includes('Files')) {
    e.dataTransfer.dropEffect = 'move'
    slotDragOver[slotIdx] = true
  } else {
    e.dataTransfer.dropEffect = 'none'
  }
}

function onSlotDragLeave(slotIdx) {
  slotDragOver[slotIdx] = false
}

async function onSlotDrop(e, slotIdx) {
  slotDragOver[slotIdx] = false
  // 内部文件库图片
  const json = e.dataTransfer.getData('application/x-rfp-file')
  if (json) {
    try {
      const item = JSON.parse(json)
      if (item._kind === 'file' && item.file_type === 'image') {
        try {
          // 获取完整文件信息
          const full = await fileLibraryStore.getFileById(item.id)
          const thumb = full?.thumbnail_data || ''
          // 先用缩略图占位显示
          if (thumb) {
            setInputImageAt(slotIdx, thumb, null)
          }
          // 获取原图 blob URL，转为 base64 后保存到图库（以获得可持久化的 galleryId）
          try {
            const blobUrl = await apiClient.getFileLibraryFileBlobUrl(item.id)
            if (blobUrl) {
              const resp = await fetch(blobUrl)
              const blob = await resp.blob()
              URL.revokeObjectURL(blobUrl)
              const base64 = await blobToBase64(blob)
              if (base64) {
                // 保存到图库，获取 galleryId 作为 fileId（与上传/图库选择保持一致）
                const fileName = (item.name || 'dragged_image').replace(/\.[^.]+$/, '')
                const mime = blob.type || 'image/png'
                const format = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
                const fileObj = new File([blob], `${fileName}.${format}`, { type: mime })
                await saveToGallery(fileObj, base64, slotIdx)
                // saveToGallery 会设置 slot.fileId = galleryId，再更新预览
                const slot = props.config.inputImages[slotIdx]
                if (slot) {
                  slot.base64 = base64
                  slot.preview = base64
                }
              }
            }
          } catch (err) {
            console.warn('获取原图 blob 失败，保持缩略图:', err)
          }
          return
        } catch (err) {
          console.error('从文件库拖入图片失败:', err)
        }
      }
    } catch (err) {
      console.error('[FunctionEditor] 解析拖拽数据失败:', err)
    }
  }
  // 外部图片文件
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]
    if (file.type.startsWith('image/')) {
      try {
        const base64 = await galleryStore.fileToBase64(file)
        setInputImageAt(slotIdx, base64, null)
        saveToGallery(file, base64, slotIdx)
      } catch (err) {
        console.error('拖入图片失败:', err)
      }
    }
  }
}

// Blob 转 base64 辅助函数
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// 激活的 ComfyUI 配置列表
const activeComfyuiConfigs = ref([])
async function loadActiveComfyuiConfigs() {
  try {
    const list = await apiClient.getActiveComfyuiConfigs()
    activeComfyuiConfigs.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载激活 ComfyUI 配置列表失败:', e)
    activeComfyuiConfigs.value = []
  }
}

const isVideoTab = computed(() => props.tabId === 'text2video' || props.tabId === 'img2video')
// 需要图片输入的 tab：仅图像编辑/图生视频自动出现"需要图片输入"区块，无需开关
const needsImageTab = computed(() => props.tabId === 'img2img' || props.tabId === 'img2video')
// 批量推理 tab：调用 AI 服务商推理批量提示词，转换为 JSON 分镜后批量出图
const isBatchInferenceTab = computed(() => props.tabId === 'batch-inference')
// 文字编辑 tab：只调大模型改写/续写文字，不出图
const isTextEditTab = computed(() => props.tabId === 'text-edit')
// 分镜生成 tab：提示词来自选中的 Json分镜 文件，无需直接输入提示词
const isStoryboardTab = computed(() => props.tabId === 'storyboard')

// 可调用的 AI 配置列表（用于批量推理的服务商选择）
const activeAiConfigs = ref([])
async function loadActiveAiConfigs() {
  try {
    const list = await apiClient.getActiveAiConfigs()
    activeAiConfigs.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载可调用 AI 配置列表失败:', e)
    activeAiConfigs.value = []
  }
}

// 确保配置对象包含新字段（needsImage / imageNodeIds / showImageNodeIds / apiConfigId / promptRuleFileIds）
function ensureConfigFields() {
  const c = props.config
  if (c.needsImage === undefined) {
    // 默认根据 tabId 初始化：img2img / img2video 默认需要图片
    c.needsImage = (props.tabId === 'img2img' || props.tabId === 'img2video')
  }
  if (!Array.isArray(c.inputImages) || c.inputImages.length < 4) {
    const old = Array.isArray(c.inputImages) ? c.inputImages.slice() : []
    c.inputImages = [old[0] || null, old[1] || null, old[2] || null, old[3] || null]
  }
  if (!Array.isArray(c.imageNodeIds) || c.imageNodeIds.length < 4) {
    const old = Array.isArray(c.imageNodeIds) ? c.imageNodeIds.slice() : []
    c.imageNodeIds = [old[0] || '', old[1] || '', old[2] || '', old[3] || '']
  }
  if (c.showImageNodeIds === undefined) c.showImageNodeIds = true
  if (!c.imageParams || typeof c.imageParams !== 'object') {
    c.imageParams = { showImageParams: false, widthNodeId: '', width: null, heightNodeId: '', height: null }
  }
  if (!c.videoParams || typeof c.videoParams !== 'object') {
    c.videoParams = { showVideoParams: false, promptNodeId: '', widthNodeId: '', width: null, heightNodeId: '', height: null, lengthNodeId: '', length: null, fpsNodeId: '', fps: null, t2vNodeId: '', textToVideo: false }
  }
  // 批量推理专用字段：API 配置 ID + 提示词规则文件 ID 列表
  if (c.apiConfigId === undefined) c.apiConfigId = null
  if (!Array.isArray(c.promptRuleFileIds)) c.promptRuleFileIds = []
  // 分镜生成：Json分镜 提示词文件 id
  if (c.storyboardFileId === undefined) c.storyboardFileId = null
  // 文字编辑专用字段：生成参数（温度 / 最大输出 token）
  if (!c.textParams || typeof c.textParams !== 'object') {
    c.textParams = { temperature: null, maxTokens: null }
  }
  if (c.showTextParams === undefined) c.showTextParams = false
}

// 默认图片节点 ID 提示（仅作为 placeholder 占位，不自动填入）
const defaultImageNodeHints = ['63', '64', '61', '']

// 预设尺寸快捷选项
const presetSizes = [
  { label: '512×512', w: 512, h: 512 },
  { label: '768×1024', w: 768, h: 1024 },
  { label: '720×1280', w: 720, h: 1280 },
  { label: '832×1152', w: 832, h: 1152 },
  { label: '1024×1536', w: 1024, h: 1536 },
  { label: '1080×1920', w: 1080, h: 1920 }
]

function isSizeActive(w, h) {
  return Number(props.config.imageParams.width) === w && Number(props.config.imageParams.height) === h
}

// 点击尺寸快捷按钮：自动填入宽高数值（不改变节点 ID）
function applySize(w, h) {
  props.config.imageParams.width = w
  props.config.imageParams.height = h
}

// 反转宽高
function reverseSize() {
  const w = props.config.imageParams.width
  const h = props.config.imageParams.height
  props.config.imageParams.width = h
  props.config.imageParams.height = w
}

// 输入图片图库选择器
const showInputGalleryPicker = ref(false)
const inputPickerCategory = ref('all')
const pendingImageSlot = ref(0)
const inputPickerSearch = ref('')
const inputImageInput = ref(null)

const filteredGalleryImages = computed(() => {
  let list = galleryStore.images
  if (inputPickerCategory.value !== 'all') {
    list = list.filter(img => img.category_id === inputPickerCategory.value)
  }
  if (inputPickerSearch.value.trim()) {
    const q = inputPickerSearch.value.trim().toLowerCase()
    list = list.filter(img => (img.name || '').toLowerCase().includes(q))
  }
  return list
})

function openInputGalleryPickerFor(slotIdx) {
  pendingImageSlot.value = slotIdx
  showInputGalleryPicker.value = true
}

async function selectInputFromGallery(img) {
  try {
    let base64 = ''
    const fileId = img.id || null
    if (fileId) {
      base64 = await apiClient.getGalleryImageBase64(fileId)
    }
    if (!base64) {
      base64 = img.thumbnail_data || ''
    }
    if (base64) {
      setInputImageAt(pendingImageSlot.value, base64, fileId)
    } else {
      console.warn('图库图片无可用数据')
    }
  } catch (e) {
    console.error('选择图库图片失败:', e)
  }
  showInputGalleryPicker.value = false
}

function setInputImageAt(slotIdx, base64, fileId = null) {
  props.config.inputImages[slotIdx] = { base64, preview: base64, fileId }
}

function removeInputImage(slotIdx) {
  props.config.inputImages[slotIdx] = null
}

function triggerInputUploadFor(slotIdx) {
  pendingImageSlot.value = slotIdx
  inputImageInput.value && inputImageInput.value.click()
}

async function handleInputUpload(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const base64 = await galleryStore.fileToBase64(file)
    setInputImageAt(pendingImageSlot.value, base64, null)
    saveToGallery(file, base64, pendingImageSlot.value)
  } catch (err) {
    console.error('上传输入图片失败:', err)
  }
  e.target.value = ''
}

async function saveToGallery(file, base64, slotIdx) {
  try {
    const thumb = await galleryStore.generateThumbnail(base64)
    const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const created = await galleryStore.createImage({
      name: file.name.replace(/\.[^.]+$/, ''),
      image_base64: base64,
      thumbnail_base64: thumb,
      category_id: 0,
      format,
      file_size: file.size
    })
    if (created && created.id && slotIdx !== undefined && slotIdx !== null) {
      const slot = props.config.inputImages[slotIdx]
      if (slot) slot.fileId = created.id
    }
  } catch (e) {
    console.warn('保存到图库失败:', e)
  }
}

// 监听 tabId 变化，同步 needsImage 默认值（仅在 img2img/img2video tab 自动开启"需要图片输入"区块）
watch(() => props.tabId, (newTab) => {
  props.config.needsImage = (newTab === 'img2img' || newTab === 'img2video')
})

onMounted(async () => {
  ensureConfigFields()
  try {
    await Promise.all([
      galleryStore.loadAll(),
      loadActiveComfyuiConfigs(),
      loadActiveAiConfigs()
    ])
  } catch (e) {
    console.error('加载 FunctionEditor 数据失败:', e)
  }
})
</script>

<style scoped>
.function-editor-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.function-header {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.function-name-group {
  flex: 1;
  min-width: 200px;
}

.comfyui-select-group {
  flex: 1;
  min-width: 200px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select,
.form-group textarea {
  padding: 7px 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}

.hint-text {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 400;
}

.toggle-link {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.storyboard-note {
  margin: 0;
  padding: 10px 12px;
  background: rgba(74, 158, 255, 0.08);
  border: 1px solid var(--accent-color, #4a9eff);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
}

.toggle-link:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

/* 输入图片槽位 */
.image-slots {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.image-slot {
  width: 110px;
  height: 110px;
  border: 1px dashed var(--border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.image-slot.slot-drag-over {
  border-color: var(--accent-color, #4a9eff);
  border-style: solid;
  background: rgba(74, 158, 255, 0.12);
}

.slot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.slot-label {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  border-radius: 3px;
}

.slot-label.empty {
  background: transparent;
  color: var(--text-secondary);
}

.slot-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.slot-remove:hover {
  background: #ef4444;
}

.slot-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
}

.slot-empty .btn {
  padding: 2px 8px;
  font-size: 11px;
}

/* 参数面板 */
.video-params-panel {
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}

.params-hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.params-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-row {
  display: grid;
  grid-template-columns: 110px 90px 1fr;
  align-items: center;
  gap: 8px;
}

.param-row label {
  font-size: 12px;
  font-weight: 500;
  margin: 0;
}

.param-row input[type="text"],
.param-row input[type="number"] {
  padding: 4px 6px;
  font-size: 12px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.param-hint-text {
  font-size: 11px;
  color: var(--text-secondary);
}

.toggle-row .switch-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  margin: 0;
}

.switch-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  margin: 0 0 0 auto;
}

.switch-mini input[type="checkbox"] {
  margin: 0;
}

.switch-slider {
  width: 28px;
  height: 16px;
  background: var(--bg-tertiary, rgba(128, 128, 128, 0.3));
  border-radius: 8px;
  position: relative;
  transition: background 0.2s;
}

.switch-mini input:checked + .switch-slider {
  background: var(--accent-color);
}

.switch-slider::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.switch-mini input:checked + .switch-slider::after {
  transform: translateX(12px);
}

.switch-label {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 尺寸快捷选择 */
.size-shortcuts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.size-shortcut-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.size-btn {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}

.size-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.size-btn.active {
  background: var(--accent-color);
  color: var(--accent-text, #fff);
  border-color: var(--accent-color);
}

.size-btn.reverse-btn {
  margin-left: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.size-btn.reverse-btn:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.picker-filter {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}

.filter-select,
.filter-search {
  padding: 6px 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 12px;
}

.filter-search {
  flex: 1;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}

.picker-item {
  cursor: pointer;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-surface);
  transition: all 0.15s;
}

.picker-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
}

.picker-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  width: 100%;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
}

.picker-item-name {
  padding: 4px 6px;
  font-size: 11px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.btn {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-sizing: border-box;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 11px;
  height: 24px;
}
</style>
