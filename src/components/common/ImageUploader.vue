<template>
  <div class="image-uploader">
    <!-- 触发按钮（使用父组件的 .btn 样式） -->
    <button type="button" class="btn btn-sm" @click="onClick">
      {{ label }}
    </button>
    <input
      type="file"
      ref="fileInput"
      :multiple="mode === 'batch'"
      accept="image/*"
      @change="handleFileSelect"
      style="display: none"
    />

    <!-- 选择上传方式对话框（仅 single 模式且非强制裁切） -->
    <div v-if="showChoice" class="iu-overlay" @click.self="cancelChoice">
      <div class="iu-modal">
        <h3>选择上传方式</h3>
        <p class="iu-hint">请选择图片的上传方式：</p>
        <div class="iu-choices">
          <button class="iu-choice" @click="chooseWhole">
            <span class="iu-choice-icon">⬜</span>
            <span class="iu-choice-title">整张上传</span>
            <span class="iu-choice-desc">保留原图，不裁切</span>
          </button>
          <button class="iu-choice" @click="chooseCrop">
            <span class="iu-choice-icon">✂️</span>
            <span class="iu-choice-title">裁切上传</span>
            <span class="iu-choice-desc">按比例裁切后上传</span>
          </button>
        </div>
        <div class="iu-actions">
          <button class="btn btn-sm" @click="cancelChoice">取消</button>
        </div>
      </div>
    </div>

    <!-- 共用裁切组件 -->
    <ImageCropper
      :visible="showCropper"
      :image-src="pendingBase64"
      :aspect="cropAspect"
      @confirm="onCropConfirm"
      @cancel="onCropCancel"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ImageCropper from './ImageCropper.vue'

const props = defineProps({
  mode: { type: String, default: 'single' }, // 'single' | 'batch'
  cropAspect: { type: Number, default: null },
  label: { type: String, default: '上传图片' },
  accept: { type: String, default: 'image/*' },
  forceCrop: { type: Boolean, default: false }
})

const emit = defineEmits(['uploaded'])

const fileInput = ref(null)
const showChoice = ref(false)
const showCropper = ref(false)
const pendingBase64 = ref('')

function onClick() {
  fileInput.value.value = ''
  fileInput.value.click()
}

async function handleFileSelect(e) {
  const files = Array.from(e.target.files || [])
  if (files.length === 0) return

  if (props.mode === 'batch') {
    const results = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const b64 = await fileToBase64(f)
      results.push({ base64: b64, name: f.name, file: f })
    }
    emit('uploaded', results)
  } else {
    const f = files[0]
    if (!f.type.startsWith('image/')) return
    pendingBase64.value = await fileToBase64(f)
    if (props.forceCrop) {
      showCropper.value = true
    } else {
      showChoice.value = true
    }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function cancelChoice() {
  showChoice.value = false
  pendingBase64.value = ''
}

function chooseWhole() {
  showChoice.value = false
  emit('uploaded', pendingBase64.value)
  pendingBase64.value = ''
}

function chooseCrop() {
  showChoice.value = false
  showCropper.value = true
}

function onCropConfirm(base64) {
  showCropper.value = false
  emit('uploaded', base64)
  pendingBase64.value = ''
}

function onCropCancel() {
  showCropper.value = false
  pendingBase64.value = ''
}
</script>

<style scoped>
.image-uploader {
  display: inline-block;
}

/* 按钮样式（与 TaskManager 标准一致，无悬停效果） */
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

.iu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 5vh 5vw;
}

.iu-modal {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.iu-modal h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.iu-hint {
  color: var(--text-secondary);
  margin-bottom: 16px;
  font-size: 13px;
}

.iu-choices {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.iu-choice {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border: none;
  border-radius: 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
  box-shadow: var(--input-shadow);
}

.iu-choice:hover {
  box-shadow: var(--card-shadow);
}

.iu-choice-icon {
  font-size: 28px;
}

.iu-choice-title {
  font-weight: 600;
  font-size: 14px;
}

.iu-choice-desc {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.iu-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
