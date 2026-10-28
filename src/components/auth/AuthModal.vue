<template>
  <FloatingWindow v-model:open="openProxy" :title="isLoginMode ? '登录' : '注册'" size="default">
      <!-- 模式切换标签 -->
      <div class="mode-tabs">
        <button 
          :class="['tab-btn', { active: isLoginMode }]" 
          @click="switchToLogin"
        >
          🔑 登录
        </button>
        <button 
          :class="['tab-btn', { active: !isLoginMode }]" 
          @click="switchToRegister"
        >
          📝 注册
        </button>
      </div>

      <div class="auth-content">
        <div class="auth-header">
          <h2>{{ isLoginMode ? '欢迎回来' : '创建账号' }}</h2>
          <p class="subtitle">{{ isLoginMode ? '登录以访问您的数据' : '注册新账户，数据保存在本地数据库' }}</p>
        </div>

        <form @submit.prevent="handleSubmit" class="auth-form">
          <div class="form-group" v-if="!isLoginMode">
            <label for="username">用户名</label>
            <input id="username" v-model="username" type="text" required placeholder="输入用户名" autocomplete="username" />
          </div>

          <div class="form-group">
            <label for="account">邮箱 / 用户名</label>
            <input id="account" v-model="account" type="text" required placeholder="邮箱或用户名" :autocomplete="isLoginMode ? 'username' : 'email'" autofocus />
          </div>

          <div class="form-group">
            <label for="password">密码</label>
            <div class="password-input">
              <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" required :minlength="isLoginMode ? undefined : 4" placeholder="输入密码" :autocomplete="isLoginMode ? 'current-password' : 'new-password'" />
              <button type="button" class="toggle-password" @click="showPassword = !showPassword" tabindex="-1">
                {{ showPassword ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>

          <div class="form-group" v-if="!isLoginMode">
            <label for="confirm-password">确认密码</label>
            <input id="confirm-password" v-model="confirmPassword" type="password" required placeholder="再次输入密码" autocomplete="new-password" />
          </div>

          <div class="error-message" v-if="error">⚠️ {{ error }}</div>
          <div class="success-message" v-if="successMessage">✅ {{ successMessage }}</div>

          <button type="submit" class="submit-btn" :disabled="isLoading || !apiServerReady">
            <span v-if="isLoading" class="loading-spinner"></span>
            <template v-else-if="!apiServerReady">⏳ 等待服务器...</template>
            <template v-else>{{ isLoginMode ? '登 录' : '注 册' }}</template>
          </button>
        </form>

        <p class="switch-mode">
          <a href="#" @click.prevent="toggleMode">
            {{ isLoginMode ? '还没有账号？立即注册 →' : '已有账号？去登录 →' }}
          </a>
        </p>

        <div class="info-box">
          <strong>💡 本地数据库模式：</strong>
          <ul>
            <li>数据保存在 SQLite 本地数据库中</li>
            <li>支持多用户，每个用户数据独立隔离</li>
            <li>包含角色、配置、聊天记录、图片等完整功能</li>
          </ul>
        </div>
      </div>

  </FloatingWindow>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { apiClient } from '@/services/api';
import FloatingWindow from '@/components/common/FloatingWindow.vue';

const props = defineProps({
  isVisible: Boolean
});

const emit = defineEmits(['close', 'authenticated']);

// FloatingWindow open 代理：关闭时触发父级 close（保持原 isVisible 始终为 true 的行为）
const openProxy = computed({
  get: () => props.isVisible,
  set: (v) => { if (!v) emit('close') }
});

const isLoginMode = ref(true);
const username = ref('');
const account = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const isLoading = ref(false);
const error = ref('');
const successMessage = ref('');
const apiServerReady = ref(false);

let healthCheckTimer = null;

onMounted(() => {
  checkApiServer();
  healthCheckTimer = setInterval(checkApiServer, 3000);
});

onUnmounted(() => {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
});

async function checkApiServer() {
  apiServerReady.value = await apiClient.healthCheck();
}

function switchToLogin() {
  isLoginMode.value = true;
  clearMessages();
}

function switchToRegister() {
  isLoginMode.value = false;
  clearMessages();
}

function toggleMode() {
  isLoginMode.value = !isLoginMode.value;
  clearMessages();
}

function clearMessages() {
  error.value = '';
  successMessage.value = '';
}

async function handleSubmit() {
  isLoading.value = true;
  clearMessages();

  if (!isLoginMode.value) {
    // 注册模式验证
    if (!username.value.trim()) {
      error.value = '请输入用户名';
      isLoading.value = false;
      return;
    }
    if (password.value.length < 4) {
      error.value = '密码至少需要4位';
      isLoading.value = false;
      return;
    }
    if (password.value !== confirmPassword.value) {
      error.value = '两次输入的密码不一致';
      isLoading.value = false;
      return;
    }

    try {
      const result = await apiClient.register(username.value.trim(), account.value.trim(), password.value);
      
      if (result.success) {
        successMessage.value = '注册成功！正在进入...';
        emit('authenticated', result.data.user);
        setTimeout(() => emit('close'), 800);
      } else {
        error.value = result.error || '注册失败';
      }
    } catch (e) {
      error.value = e.message || '注册失败，请检查网络连接';
    }
  } else {
    // 登录模式
    try {
      const result = await apiClient.login(account.value.trim(), password.value);
      
      if (result.success) {
        successMessage.value = '登录成功！正在加载...';
        emit('authenticated', result.data.user);
        setTimeout(() => emit('close'), 500);
      } else {
        error.value = result.error || '登录失败';
      }
    } catch (e) {
      error.value = e.message || '登录失败，请检查网络连接';
    }
  }

  isLoading.value = false;
}
</script>

<style scoped>
.mode-tabs {
  display: flex; gap: 8px;
  margin-bottom: 24px;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 10px;
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none; border-radius: 8px;
  background: transparent;
  font-size: 14px; font-weight: 500;
  color: #6b7280; cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: white;
  color: #3b82f6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-btn:hover:not(.active) { color: #374151; }

.auth-content { min-height: 280px; }

.auth-header { text-align: center; margin-bottom: 20px; }
.auth-header h2 {
  margin: 0 0 8px 0;
  font-size: 22px; color: #1f2937; font-weight: 600;
}
.subtitle { margin: 0; color: #6b7280; font-size: 14px; }

.auth-form { display: flex; flex-direction: column; gap: 14px; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label {
  font-size: 13px; font-weight: 500; color: #374151;
}
.form-group input {
  padding: 10px 12px;
  border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 14px; transition: all 0.2s;
}
.form-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.password-input { position: relative; }
.password-input input { width: 100%; padding-right: 40px; }

.toggle-password {
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  font-size: 18px; padding: 4px; line-height: 1;
}

.info-box {
  background: #eff6ff; border: 1px solid #bfdbfe;
  padding: 12px; border-radius: 8px;
  font-size: 13px; color: #1e40af; margin-top: 16px;
}
.info-box ul { margin: 8px 0 0 0; padding-left: 20px; }
.info-box li { margin: 4px 0; }

.error-message {
  background-color: #fef2f2; color: #dc2626;
  padding: 10px 12px; border-radius: 8px;
  font-size: 13px; border: 1px solid #fecaca;
}

.success-message {
  background-color: #f0fdf4; color: #16a34a;
  padding: 10px 12px; border-radius: 8px;
  font-size: 13px; border: 1px solid #bbf7d0;
}

.submit-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white; border: none; border-radius: 8px;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 4px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

.loading-spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.switch-mode {
  text-align: center; margin-top: 16px;
  color: #6b7280; font-size: 14px;
}

.switch-mode a {
  color: #3b82f6; text-decoration: none; font-weight: 600;
}
.switch-mode a:hover { text-decoration: underline; }
</style>
