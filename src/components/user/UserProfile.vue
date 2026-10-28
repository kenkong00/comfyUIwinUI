<template>
  <div class="user-profile-page">
    <!-- 顶部：用户卡片 -->
    <div class="up-hero">
      <div class="up-avatar">
        <img v-if="isImageAvatar(displayAvatar)" :src="displayAvatar" alt="头像" />
        <span v-else>{{ displayAvatar }}</span>
      </div>
      <div class="up-meta">
        <div class="up-name">{{ user.username }}</div>
        <div class="up-sub">{{ user.email || '未绑定邮箱' }}</div>
        <div class="up-sub muted">注册于 {{ formatDate(user.created_at) }}</div>
      </div>
      <button class="btn-logout" @click="$emit('logout')">退出登录</button>
    </div>

    <!-- 双栏：头像 / 密码 -->
    <div class="up-grid">
      <section class="up-card">
        <h3>选择头像</h3>
        <p class="section-desc">从图库选择或上传自定义头像</p>
        <div class="avatar-actions">
          <button class="btn btn-sm" @click="openGalleryPicker">从图库选择</button>
          <ImageUploader
            mode="single"
            :crop-aspect="1"
            :force-crop="true"
            label="上传头像"
            @uploaded="onAvatarUploaded"
          />
        </div>
      </section>

      <section class="up-card">
        <h3>修改密码</h3>
        <div class="form-group">
          <label>旧密码</label>
          <input type="password" v-model="passwordForm.oldPassword" placeholder="输入当前密码" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>新密码</label>
            <input type="password" v-model="passwordForm.newPassword" placeholder="至少4位" />
          </div>
          <div class="form-group">
            <label>确认新密码</label>
            <input type="password" v-model="passwordForm.confirmPassword" placeholder="再次输入" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" @click="changePassword" :disabled="changingPassword">
            {{ changingPassword ? '修改中...' : '修改密码' }}
          </button>
        </div>
      </section>
    </div>

    <!-- 头像选择器（从图库挑选） -->
    <FloatingWindow v-model:open="galleryPickerOpen" title="从艺术图库选择头像" size="large">
      <div class="gallery-picker-grid" v-if="galleryImages.length > 0">
        <div
          v-for="img in galleryImages"
          :key="img.id"
          class="picker-item"
          @click="selectAvatarFromGallery(img)"
        >
          <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
          <div v-else class="thumb-placeholder">无图</div>
          <div class="picker-name">{{ img.name }}</div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>图库暂无图片，请先到艺术图库上传</p>
      </div>
      <template #footer>
        <button class="btn" @click="galleryPickerOpen = false">取消</button>
      </template>
    </FloatingWindow>

    <!-- 提示消息 -->
    <div v-if="message.text" :class="['toast', message.type]">
      {{ message.text }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '@/services/api'
import ImageUploader from '@/components/common/ImageUploader.vue'
import { useGalleryStore } from '@/stores/gallery'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const props = defineProps({
  user: { type: Object, default: null }
})
const emit = defineEmits(['logout', 'avatar-updated'])

const galleryStore = useGalleryStore()
const galleryPickerOpen = ref(false)
const galleryImages = computed(() => galleryStore.images)

const selectedAvatar = ref('')
const changingPassword = ref(false)
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const message = ref({ text: '', type: '' })

function isImageAvatar(val) {
  return typeof val === 'string' && val.startsWith('data:image/')
}

const displayAvatar = computed(() => {
  if (selectedAvatar.value) return selectedAvatar.value
  if (props.user && props.user.avatar_url) return props.user.avatar_url
  const name = props.user?.username || ''
  return name.charAt(0).toUpperCase()
})

const selectAvatar = async (av) => {
  selectedAvatar.value = av
  try {
    const res = await apiClient.updateProfile({ avatar_url: av })
    if (res.success) {
      showMessage('头像更新成功', 'success')
      emit('avatar-updated', av)
    } else {
      showMessage(res.error || '头像更新失败', 'error')
    }
  } catch (e) {
    showMessage('头像更新失败: ' + e.message, 'error')
  }
}

function openGalleryPicker() {
  if (galleryStore.images.length === 0) {
    galleryStore.loadAll()
  }
  galleryPickerOpen.value = true
}

async function selectAvatarFromGallery(img) {
  if (img.thumbnail_data) {
    selectedAvatar.value = img.thumbnail_data
    try {
      const res = await apiClient.updateProfile({ avatar_url: img.thumbnail_data })
      if (res.success) {
        showMessage('头像更新成功', 'success')
        emit('avatar-updated', img.thumbnail_data)
      } else {
        showMessage(res.error || '头像更新失败', 'error')
      }
    } catch (e) {
      showMessage('头像更新失败: ' + e.message, 'error')
    }
  }
  galleryPickerOpen.value = false
}

async function onAvatarUploaded(base64) {
  selectedAvatar.value = base64
  try {
    const res = await apiClient.updateProfile({ avatar_url: base64 })
    if (res.success) {
      showMessage('头像更新成功', 'success')
      emit('avatar-updated', base64)
    } else {
      showMessage(res.error || '头像更新失败', 'error')
    }
  } catch (e) {
    showMessage('头像更新失败: ' + e.message, 'error')
  }
  // 同时将裁切后的头像保存到文件库：
  //   优先保存到用户的可调用文件夹（is_callable=1）；
  //   若未设置任何可调用文件夹，则落到总库根目录（is_system=1 的分类，folder_id=null）。
  try {
    const thumb = await galleryStore.generateThumbnail(base64)
    let targetCategoryId = null
    let targetFolderId = null

    // 1. 查找可调用文件夹（取第一个）
    const allFolders = await apiClient.getFileLibraryFolders({ parent_id: 'all' })
    const callableFolder = (allFolders || []).find(f => f.is_callable === 1 || f.is_callable === true)
    if (callableFolder) {
      targetCategoryId = callableFolder.category_id
      targetFolderId = callableFolder.id
    } else {
      // 2. 没有可调用文件夹 → 使用总库根目录
      const categories = await apiClient.getFileLibraryCategories()
      const zongkuCat = (categories || []).find(c => c.is_system === 1 || c.is_system === true)
      targetCategoryId = zongkuCat ? zongkuCat.id : ((categories || [])[0] && categories[0].id) || null
      targetFolderId = null
    }

    if (targetCategoryId) {
      await apiClient.createFileLibraryFile({
        category_id: targetCategoryId,
        folder_id: targetFolderId,
        name: `头像_${Date.now()}`,
        file_type: 'image',
        image_base64: base64,
        thumbnail_base64: thumb,
        format: 'png',
        file_size: 0
      })
    } else {
      console.error('保存头像到文件库失败: 未找到目标分类')
    }
  } catch (e) {
    console.error('保存头像到文件库失败:', e)
  }
}

const changePassword = async () => {
  const { oldPassword, newPassword, confirmPassword } = passwordForm.value
  if (!oldPassword || !newPassword || !confirmPassword) {
    showMessage('请填写所有密码字段', 'error')
    return
  }
  if (newPassword !== confirmPassword) {
    showMessage('两次输入的新密码不一致', 'error')
    return
  }
  if (newPassword.length < 4) {
    showMessage('新密码至少4位', 'error')
    return
  }

  changingPassword.value = true
  try {
    const res = await apiClient.changePassword(oldPassword, newPassword)
    if (res.success) {
      showMessage('密码修改成功', 'success')
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    } else {
      showMessage(res.error || '密码修改失败', 'error')
    }
  } catch (e) {
    showMessage('密码修改失败: ' + e.message, 'error')
  } finally {
    changingPassword.value = false
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '未知'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const showMessage = (text, type) => {
  message.value = { text, type }
  setTimeout(() => { message.value = { text: '', type: '' } }, 3000)
}

watch(() => props.user, (val) => {
  if (val && val.avatar_url) {
    selectedAvatar.value = val.avatar_url
  }
}, { immediate: true })
</script>

<style scoped>
.user-profile-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 4px 2px;
}

/* ===== 顶部用户卡片 ===== */
.up-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(0,103,192,.10), rgba(123,47,247,.08));
  border: 1px solid var(--border-color);
}

.up-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 28px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
  overflow: hidden;
}

.up-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.up-meta {
  flex: 1;
  min-width: 0;
}

.up-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.up-sub {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.up-sub.muted { opacity: .8; }

.btn-logout {
  padding: 7px 16px;
  background: transparent;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  flex-shrink: 0;
  transition: all .15s ease;
}

.btn-logout:hover { background: #fef2f2; }

/* ===== 双栏卡片 ===== */
.up-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 14px;
  margin-top: 14px;
}

.up-card {
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface, #fff);
}

.up-card h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-desc {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.form-group { margin-bottom: 10px; }

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.form-actions { margin-top: 2px; }

.btn {
  padding: 7px 14px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  transition: all 0.15s ease;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn:hover:not(:disabled) { background: var(--bg-primary); }

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
  border-color: var(--accent-color);
}

.btn-primary:hover:not(:disabled) { opacity: 0.92; background: var(--accent-color); }

.btn-sm { padding: 6px 12px; font-size: 12px; }

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  z-index: 10000;
}

.toast.success { background: #d1fae5; color: #065f46; }
.toast.error { background: #fee2e2; color: #991b1b; }

/* 图库选择网格 */
.gallery-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  max-height: 50vh;
  overflow-y: auto;
}

.picker-item {
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
  transition: all 0.15s;
  border: 2px solid transparent;
}

.picker-item:hover { border-color: var(--accent-color); }

.picker-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  color: var(--text-muted);
  font-size: 13px;
}

.picker-name {
  padding: 4px 6px;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

@media (max-width: 680px) {
  .up-grid { grid-template-columns: 1fr; }
  .up-hero { flex-wrap: wrap; }
}
</style>
