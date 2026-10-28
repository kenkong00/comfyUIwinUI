// 主后端地址：开发环境走 vite 同源代理 /server（见 vite.config.js），
// 使局域网设备访问时请求仍指向本机 3007，而不是设备自身的 localhost。
const API_BASE = '/server';

class ApiClient {
  constructor() {
    this.token = null;
    this.user = null;
    this._loadFromStorage();
  }

  _loadFromStorage() {
    try {
      const saved = localStorage.getItem('local_auth');
      if (saved) {
        const data = JSON.parse(saved);
        this.token = data.token;
        this.user = data.user;
      }
    } catch { /* ignore */ }
  }

  _saveToStorage() {
    if (this.token && this.user) {
      localStorage.setItem('local_auth', JSON.stringify({
        token: this.token,
        user: this.user
      }));
    } else {
      localStorage.removeItem('local_auth');
    }
  }

  get headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  async request(method, path, body = null) {
    const url = `${API_BASE}${path}`;
    const options = {
      method,
      headers: this.headers
    };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    
    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok && !data.success) {
      // token 过期，自动清除
      if (res.status === 401) {
        this.logout();
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error(data.error || '请求失败');
    }
    return data;
  }

  // ============================================
  // 认证相关
  // ============================================

  async register(username, email, password) {
    const res = await this.request('POST', '/api/auth/register', { username, email, password });
    if (res.success) {
      this.token = res.data.token;
      this.user = res.data.user;
      this._saveToStorage();
    }
    return res;
  }

  async login(username, password) {
    const res = await this.request('POST', '/api/auth/login', { username, password });
    if (res.success) {
      this.token = res.data.token;
      this.user = res.data.user;
      this._saveToStorage();
    }
    return res;
  }

  async verifyToken() {
    if (!this.token) return { success: false };
    try {
      const res = await this.request('POST', '/api/auth/verify');
      if (res.success) {
        this.user = res.data.user;
        this._saveToStorage();
      }
      return res;
    } catch {
      return { success: false };
    }
  }

  async logout() {
    try {
      await this.request('POST', '/api/auth/logout');
    } catch { /* ignore */ }
    this.token = null;
    this.user = null;
    this._saveToStorage();
  }

  isLoggedIn() {
    return !!this.token && !!this.user;
  }

  getUser() {
    return this.user;
  }

  // ============================================
  // 会员账户 / 配额
  // ============================================
  async getAccount() {
    const res = await this.request('GET', '/api/account/me');
    if (res.success) this.user = { ...(this.user || {}), ...res.data.user, membership: res.data.membership };
    return res;
  }

  async updateMembership(tier) {
    return this.request('POST', '/api/account/membership', { tier });
  }

  async getAccountUsage() {
    return this.request('GET', '/api/account/usage');
  }

  async checkQuota(type = 'generation') {
    return this.request('GET', `/api/account/check?type=${encodeURIComponent(type)}`);
  }

  // ============================================
  // 用户管理
  // ============================================

  async getCurrentUser() {
    const res = await this.request('GET', '/api/user/me');
    if (res.success && res.data) {
      this.user = { ...this.user, ...res.data };
      this._saveToStorage();
    }
    return res;
  }

  async updateProfile(data) {
    const res = await this.request('PUT', '/api/user/profile', data);
    if (res.success && res.data) {
      this.user = { ...this.user, ...res.data };
      this._saveToStorage();
    }
    return res;
  }

  async changePassword(oldPassword, newPassword) {
    const res = await this.request('POST', '/api/user/change-password', { oldPassword, newPassword });
    return res;
  }

  // ============================================
  // 角色管理
  // ============================================

  async getCharacters() {
    const res = await this.request('GET', '/api/characters');
    return res.success ? res.data : [];
  }

  async getCharacterById(id) {
    const res = await this.request('GET', `/api/characters/${id}`);
    return res.success ? res.data : null;
  }

  async createCharacter(characterData) {
    const res = await this.request('POST', '/api/characters', characterData);
    return res.success ? res.data : null;
  }

  async updateCharacter(id, updates) {
    const res = await this.request('PUT', `/api/characters/${id}`, updates);
    return res.success ? res.data : null;
  }

  async deleteCharacter(id) {
    const res = await this.request('DELETE', `/api/characters/${id}`);
    return res.success;
  }

  async importCharacters(characters) {
    const res = await this.request('POST', '/api/characters/import', { characters });
    return res;
  }

  async exportAllCharacters() {
    const res = await this.request('GET', '/api/characters/export/all');
    return res.success ? res.data : [];
  }

  // ============================================
  // 配置管理
  // ============================================

  async getConfigs(type) {
    const url = type ? `/api/configs?type=${type}` : '/api/configs';
    const res = await this.request('GET', url);
    return res.success ? res.data : {};
  }

  async saveConfig(configType, configData) {
    const res = await this.request('POST', '/api/configs', { config_type: configType, config_data: configData });
    return res;
  }

  // ============================================
  // 对话管理
  // ============================================

  async getConversations() {
    const res = await this.request('GET', '/api/conversations');
    return res.success ? res.data : [];
  }

  async getConversationById(id) {
    const res = await this.request('GET', `/api/conversations/${id}`);
    return res.success ? res.data : null;
  }

  async createConversation(data) {
    const res = await this.request('POST', '/api/conversations', data);
    return res.success ? res.data : null;
  }

  async updateConversation(id, data) {
    const res = await this.request('PUT', `/api/conversations/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteConversation(id) {
    const res = await this.request('DELETE', `/api/conversations/${id}`);
    return res.success;
  }

  // ============================================
  // 对话分类管理
  // ============================================

  async getConversationCategories() {
    const res = await this.request('GET', '/api/conversation-categories');
    return res.success ? res.data : [];
  }

  async createConversationCategory(data) {
    const res = await this.request('POST', '/api/conversation-categories', data);
    return res.success ? res.data : null;
  }

  async updateConversationCategory(id, data) {
    const res = await this.request('PUT', `/api/conversation-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteConversationCategory(id) {
    const res = await this.request('DELETE', `/api/conversation-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 图片管理
  // ============================================

  async getImages(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `/api/images?${qs}` : '/api/images';
    const res = await this.request('GET', url);
    return res.success ? res.data : { images: [], pagination: {} };
  }

  async saveImage(imageData) {
    const res = await this.request('POST', '/api/images', imageData);
    return res.success ? res.data : null;
  }

  async deleteImage(id) {
    const res = await this.request('DELETE', `/api/images/${id}`);
    return res.success;
  }

  // ============================================
  // Workflow 分类管理
  // ============================================

  async getWorkflowCategories() {
    const res = await this.request('GET', '/api/workflow-categories');
    return res.success ? res.data : [];
  }

  async createWorkflowCategory(data) {
    const res = await this.request('POST', '/api/workflow-categories', data);
    return res.success ? res.data : null;
  }

  async updateWorkflowCategory(id, data) {
    const res = await this.request('PUT', `/api/workflow-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteWorkflowCategory(id) {
    const res = await this.request('DELETE', `/api/workflow-categories/${id}`);
    return res.success;
  }

  // ============================================
  // Workflow API 管理
  // ============================================

  async getWorkflowAPIs(categoryId) {
    const url = categoryId ? `/api/workflow-apis?category_id=${categoryId}` : '/api/workflow-apis';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getWorkflowAPIById(id) {
    const res = await this.request('GET', `/api/workflow-apis/${id}`);
    return res.success ? res.data : null;
  }

  async createWorkflowAPI(data) {
    const res = await this.request('POST', '/api/workflow-apis', data);
    return res.success ? res.data : null;
  }

  async updateWorkflowAPI(id, data) {
    const res = await this.request('PUT', `/api/workflow-apis/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteWorkflowAPI(id) {
    const res = await this.request('DELETE', `/api/workflow-apis/${id}`);
    return res.success;
  }

  async batchDeleteWorkflowAPIs(ids) {
    const res = await this.request('POST', '/api/workflow-apis/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeWorkflowAPIs(ids, categoryId) {
    const res = await this.request('POST', '/api/workflow-apis/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  // ============================================
  // 分镜JSON分类管理
  // ============================================

  async getStoryboardCategories() {
    const res = await this.request('GET', '/api/storyboard-categories');
    return res.success ? res.data : [];
  }

  async createStoryboardCategory(data) {
    const res = await this.request('POST', '/api/storyboard-categories', data);
    return res.success ? res.data : null;
  }

  async updateStoryboardCategory(id, data) {
    const res = await this.request('PUT', `/api/storyboard-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteStoryboardCategory(id) {
    const res = await this.request('DELETE', `/api/storyboard-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 分镜JSON文件管理
  // ============================================

  async getStoryboardJsons(categoryId) {
    const url = categoryId !== undefined && categoryId !== 'all' ? `/api/storyboard-jsons?category_id=${categoryId}` : '/api/storyboard-jsons';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getStoryboardJsonById(id) {
    const res = await this.request('GET', `/api/storyboard-jsons/${id}`);
    return res.success ? res.data : null;
  }

  async createStoryboardJson(data) {
    const res = await this.request('POST', '/api/storyboard-jsons', data);
    return res.success ? res.data : null;
  }

  async updateStoryboardJson(id, data) {
    const res = await this.request('PUT', `/api/storyboard-jsons/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteStoryboardJson(id) {
    const res = await this.request('DELETE', `/api/storyboard-jsons/${id}`);
    return res.success;
  }

  async batchDeleteStoryboardJsons(ids) {
    const res = await this.request('POST', '/api/storyboard-jsons/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeStoryboardJsons(ids, categoryId) {
    const res = await this.request('POST', '/api/storyboard-jsons/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  async batchValidateStoryboardJsons(ids) {
    const res = await this.request('POST', '/api/storyboard-jsons/batch-validate', { ids });
    return res.success ? res.data : [];
  }

  // ============================================
  // 生成任务管理
  // ============================================

  async getGenerationTasks(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.category_id) params.append('category_id', filters.category_id);
    if (filters.reviewed !== undefined) params.append('reviewed', filters.reviewed);
    const qs = params.toString();
    const url = qs ? `/api/generation-tasks?${qs}` : '/api/generation-tasks';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getGenerationTaskById(id) {
    const res = await this.request('GET', `/api/generation-tasks/${id}`);
    return res.success ? res.data : null;
  }

  async createGenerationTask(data) {
    const res = await this.request('POST', '/api/generation-tasks', data);
    return res.success ? res.data : null;
  }

  async updateGenerationTask(id, data) {
    const res = await this.request('PUT', `/api/generation-tasks/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteGenerationTask(id) {
    const res = await this.request('DELETE', `/api/generation-tasks/${id}`);
    return res.success;
  }

  async reviewGenerationTask(id) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/review`);
    return res.success ? res.data : null;
  }

  async unreviewGenerationTask(id) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/unreview`);
    return res.success ? res.data : null;
  }

  async completeGenerationTask(id) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/complete`);
    return res.success ? res.data : null;
  }

  // 批量任务完成后保存生成结果到文件库（总库下以任务名为文件夹名）
  async saveTaskResultsToLibrary(id, results, comfyuiUrl) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/save-to-library`, { results, comfyuiUrl });
    return res.success ? res.data : null;
  }

  // 注册已保存到用户目录的文件到文件库（不复制文件，仅创建DB记录）
  async registerTaskResultsToLibrary(id, results) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/register-to-library`, { results });
    return res.success ? res.data : null;
  }

  // 浏览器直传生成结果到文件库（首选链路）：前端拉图转 base64，服务端落盘+登记
  async uploadTaskResultsToLibrary(id, results) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/upload-to-library`, { results });
    return res.success ? res : null;
  }

  async updateGenerationTaskProgress(id, data) {
    const res = await this.request('POST', `/api/generation-tasks/${id}/progress`, data);
    return res.success ? res.data : null;
  }

  async batchDeleteGenerationTasks(ids) {
    const res = await this.request('POST', '/api/generation-tasks/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeGenerationTasks(ids, categoryId) {
    const res = await this.request('POST', '/api/generation-tasks/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  async batchReviewGenerationTasks(ids) {
    const res = await this.request('POST', '/api/generation-tasks/batch-review', { ids });
    return res.success;
  }

  async batchSortGenerationTasks(items) {
    const res = await this.request('POST', '/api/generation-tasks/batch-sort', { items });
    return res.success;
  }

  // ============================================
  // 任务分类管理
  // ============================================

  async getTaskCategories(categoryType) {
    const qs = categoryType ? `?category_type=${encodeURIComponent(categoryType)}` : '';
    const res = await this.request('GET', `/api/task-categories${qs}`);
    return res.success ? res.data : [];
  }

  async createTaskCategory(data) {
    const res = await this.request('POST', '/api/task-categories', data);
    return res.success ? res.data : null;
  }

  async updateTaskCategory(id, data) {
    const res = await this.request('PUT', `/api/task-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteTaskCategory(id) {
    const res = await this.request('DELETE', `/api/task-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 功能库分类管理
  // ============================================

  async getFunctionCategories() {
    const res = await this.request('GET', '/api/function-categories');
    return res.success ? res.data : [];
  }

  async createFunctionCategory(data) {
    const res = await this.request('POST', '/api/function-categories', data);
    return res.success ? res.data : null;
  }

  async updateFunctionCategory(id, data) {
    const res = await this.request('PUT', `/api/function-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFunctionCategory(id) {
    const res = await this.request('DELETE', `/api/function-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 功能库管理
  // ============================================

  async getFunctions(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category_id) params.append('category_id', filters.category_id);
    const qs = params.toString();
    const url = qs ? `/api/functions?${qs}` : '/api/functions';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getFunctionById(id) {
    const res = await this.request('GET', `/api/functions/${id}`);
    return res.success ? res.data : null;
  }

  async createFunction(data) {
    const res = await this.request('POST', '/api/functions', data);
    return res.success ? res.data : null;
  }

  async updateFunction(id, data) {
    const res = await this.request('PUT', `/api/functions/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFunction(id) {
    const res = await this.request('DELETE', `/api/functions/${id}`);
    return res.success;
  }

  async batchDeleteFunctions(ids) {
    const res = await this.request('POST', '/api/functions/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeFunctions(ids, categoryId) {
    const res = await this.request('POST', '/api/functions/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  // 批量测试 ComfyUI 连通性（configs: [{id, name, url}]）
  async batchTestConnection(configs) {
    const res = await this.request('POST', '/api/functions/batch-test-connection', { configs });
    return res.success ? res.data : [];
  }

  // ============================================
  // AI 配置分类管理
  // ============================================

  async getAiConfigCategories() {
    const res = await this.request('GET', '/api/ai-config-categories');
    return res.success ? res.data : [];
  }

  async createAiConfigCategory(data) {
    const res = await this.request('POST', '/api/ai-config-categories', data);
    return res.success ? res.data : null;
  }

  async updateAiConfigCategory(id, data) {
    const res = await this.request('PUT', `/api/ai-config-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteAiConfigCategory(id) {
    const res = await this.request('DELETE', `/api/ai-config-categories/${id}`);
    return res.success;
  }

  // ============================================
  // AI 配置管理（多配置列表）
  // ============================================

  async getAiConfigs(categoryId) {
    const url = categoryId ? `/api/ai-configs?category_id=${categoryId}` : '/api/ai-configs';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getActiveAiConfig() {
    const res = await this.request('GET', '/api/ai-configs/active');
    return res.success ? res.data : null;
  }

  // 获取所有标记为"可调用"的 AI 配置列表（用于批量推理等服务商选择）
  async getActiveAiConfigs() {
    const list = await this.getAiConfigs();
    if (!Array.isArray(list)) return [];
    return list.filter(c => c && c.is_callable);
  }

  async getAiConfigById(id) {
    const res = await this.request('GET', `/api/ai-configs/${id}`);
    return res.success ? res.data : null;
  }

  async createAiConfig(data) {
    const res = await this.request('POST', '/api/ai-configs', data);
    return res.success ? res.data : null;
  }

  async updateAiConfig(id, data) {
    const res = await this.request('PUT', `/api/ai-configs/${id}`, data);
    return res.success ? res.data : null;
  }

  async setActiveAiConfig(id) {
    const res = await this.request('POST', `/api/ai-configs/${id}/active`);
    return res.success ? res.data : null;
  }

  async deleteAiConfig(id) {
    const res = await this.request('DELETE', `/api/ai-configs/${id}`);
    return res.success;
  }

  async batchDeleteAiConfigs(ids) {
    const res = await this.request('POST', '/api/ai-configs/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeAiConfigs(ids, categoryId) {
    const res = await this.request('POST', '/api/ai-configs/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  async batchSetAiConfigCallable(ids, isCallable) {
    const res = await this.request('POST', '/api/ai-configs/batch-callable', { ids, is_callable: isCallable });
    return res.success;
  }

  // ============================================
  // ComfyUI 配置分类管理
  // ============================================

  async getComfyuiConfigCategories() {
    const res = await this.request('GET', '/api/comfyui-config-categories');
    return res.success ? res.data : [];
  }

  async createComfyuiConfigCategory(data) {
    const res = await this.request('POST', '/api/comfyui-config-categories', data);
    return res.success ? res.data : null;
  }

  async updateComfyuiConfigCategory(id, data) {
    const res = await this.request('PUT', `/api/comfyui-config-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteComfyuiConfigCategory(id) {
    const res = await this.request('DELETE', `/api/comfyui-config-categories/${id}`);
    return res.success;
  }

  // ============================================
  // ComfyUI 配置管理（多配置列表）
  // ============================================

  async getComfyuiConfigs(categoryId) {
    const url = categoryId ? `/api/comfyui-configs?category_id=${categoryId}` : '/api/comfyui-configs';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getActiveComfyuiConfig() {
    const res = await this.request('GET', '/api/comfyui-configs/active');
    return res.success ? res.data : null;
  }

  // 已激活 ComfyUI 配置的连通状态（后端服务端代理探测，规避 CORS）
  async getComfyActiveStatus() {
    const res = await this.request('GET', '/api/comfyui-configs/active-status');
    return res.success ? res : { success: false, connected: false, error: res.error || '检测失败' };
  }

  async getActiveComfyuiConfigs() {
    const res = await this.request('GET', '/api/comfyui-configs/active-list');
    return res.success ? res.data : [];
  }

  async getComfyuiConfigById(id) {
    const res = await this.request('GET', `/api/comfyui-configs/${id}`);
    return res.success ? res.data : null;
  }

  async createComfyuiConfig(data) {
    const res = await this.request('POST', '/api/comfyui-configs', data);
    return res.success ? res.data : null;
  }

  async updateComfyuiConfig(id, data) {
    const res = await this.request('PUT', `/api/comfyui-configs/${id}`, data);
    return res.success ? res.data : null;
  }

  async setActiveComfyuiConfig(id) {
    const res = await this.request('POST', `/api/comfyui-configs/${id}/active`);
    return res.success ? res.data : null;
  }

  async toggleActiveComfyuiConfig(id) {
    const res = await this.request('POST', `/api/comfyui-configs/${id}/toggle-active`);
    return res.success ? res.data : null;
  }

  async deleteComfyuiConfig(id) {
    const res = await this.request('DELETE', `/api/comfyui-configs/${id}`);
    return res.success;
  }

  async batchDeleteComfyuiConfigs(ids) {
    const res = await this.request('POST', '/api/comfyui-configs/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeComfyuiConfigs(ids, categoryId) {
    const res = await this.request('POST', '/api/comfyui-configs/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  // 测试 ComfyUI 连通性（走后端代理，避免 CORS）
  async testComfyuiConnection(url) {
    const res = await this.request('POST', '/api/comfyui/test-connection', { url });
    return res;
  }

  // ============================================
  // 文件库分类管理（硬盘分区）
  // ============================================

  async getFileLibraryCategories() {
    const res = await this.request('GET', '/api/file-library-categories');
    return res.success ? res.data : [];
  }

  async createFileLibraryCategory(data) {
    const res = await this.request('POST', '/api/file-library-categories', data);
    return res.success ? res.data : null;
  }

  async updateFileLibraryCategory(id, data) {
    const res = await this.request('PUT', `/api/file-library-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFileLibraryCategory(id) {
    const res = await this.request('DELETE', `/api/file-library-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 文件库文件夹管理
  // ============================================

  async getFileLibraryFolders(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `/api/file-library-folders?${qs}` : '/api/file-library-folders';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async createFileLibraryFolder(data) {
    const res = await this.request('POST', '/api/file-library-folders', data);
    return res.success ? res.data : null;
  }

  async updateFileLibraryFolder(id, data) {
    const res = await this.request('PUT', `/api/file-library-folders/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFileLibraryFolder(id) {
    const res = await this.request('DELETE', `/api/file-library-folders/${id}`);
    return res.success;
  }

  // ============================================
  // 文件库文件管理
  // ============================================

  async getFileLibraryFiles(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = qs ? `/api/file-library-files?${qs}` : '/api/file-library-files';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getFileLibraryFileById(id) {
    const res = await this.request('GET', `/api/file-library-files/${id}`);
    return res.success ? res.data : null;
  }

  // 单文件缩略图（dataURL 字符串），配合列表 light 模式按需加载
  async getFileLibraryThumbnail(id) {
    const res = await this.request('GET', `/api/file-library-files/${id}/thumb`);
    return res.success ? res.data : null;
  }

  async getFileLibraryFileBlobUrl(id) {
    const resp = await fetch(`${API_BASE}/api/file-library-files/${id}/file`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }

  async getFileLibraryFileBase64(id) {
    const resp = await fetch(`${API_BASE}/api/file-library-files/${id}/file`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async getGalleryImageBlobUrl(id) {
    const resp = await fetch(`${API_BASE}/api/gallery-images/${id}/file`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }

  async getFolderPath(id) {
    const res = await this.request('GET', `/api/file-library-files/folder-path/${id}`);
    return res.success ? res.data : [];
  }

  async createFileLibraryFile(data) {
    const res = await this.request('POST', '/api/file-library-files', data);
    return res.success ? res.data : null;
  }

  async updateFileLibraryFile(id, data) {
    const res = await this.request('PUT', `/api/file-library-files/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFileLibraryFile(id) {
    const res = await this.request('DELETE', `/api/file-library-files/${id}`);
    return res.success;
  }

  async batchDeleteFileLibraryFiles(ids) {
    const res = await this.request('POST', '/api/file-library-files/batch-delete', { ids });
    return res.success;
  }

  async batchMoveFileLibraryFiles(ids, categoryId, folderId) {
    const res = await this.request('POST', '/api/file-library-files/batch-move', { ids, category_id: categoryId, folder_id: folderId });
    return res.success;
  }

  // 查询可调用文件夹中指定类型的文件
  async getCallableFiles(fileType) {
    const url = fileType ? `/api/file-library-files/callable?file_type=${fileType}` : '/api/file-library-files/callable';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  // ============================================
  // 文件库标签管理
  // ============================================

  async getFileLibraryTags() {
    const res = await this.request('GET', '/api/file-library-tags');
    return res.success ? res.data : [];
  }

  async createFileLibraryTag(data) {
    const res = await this.request('POST', '/api/file-library-tags', data);
    return res.success ? res.data : null;
  }

  async updateFileLibraryTag(id, data) {
    const res = await this.request('PUT', `/api/file-library-tags/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFileLibraryTag(id) {
    const res = await this.request('DELETE', `/api/file-library-tags/${id}`);
    return res.success;
  }

  async batchDeleteFileLibraryTags(ids) {
    const res = await this.request('POST', '/api/file-library-tags/batch-delete', { ids });
    return res.success;
  }

  async tagFile(fileId, tagId) {
    const res = await this.request('POST', '/api/file-library-tags/tag-file', { file_id: fileId, tag_id: tagId });
    return res.success;
  }

  async batchTagFiles(fileIds, tagId) {
    const res = await this.request('POST', '/api/file-library-tags/batch-tag', { file_ids: fileIds, tag_id: tagId });
    return res.success;
  }

  async untagFile(fileId, tagId) {
    const res = await this.request('POST', '/api/file-library-tags/untag-file', { file_id: fileId, tag_id: tagId });
    return res.success;
  }

  // ============================================
  // 文件库回收站
  // ============================================

  async getRecycleBin() {
    const res = await this.request('GET', '/api/file-library-recycle');
    return res.success ? res.data : [];
  }

  // 还原接口返回 { restored, renamed }：renamed 是因重名被自动编号的项，UI 要提示用户
  async restoreFiles(ids) {
    const res = await this.request('POST', '/api/file-library-recycle/restore-files', { ids });
    return res.success ? (res.data || {}) : null;
  }

  async restoreFolders(ids) {
    const res = await this.request('POST', '/api/file-library-recycle/restore-folders', { ids });
    return res.success ? (res.data || {}) : null;
  }

  async restoreAll() {
    const res = await this.request('POST', '/api/file-library-recycle/restore-all');
    return res.success ? (res.data || {}) : null;
  }

  async purgeFiles(ids) {
    const res = await this.request('POST', '/api/file-library-recycle/purge-files', { ids });
    return res.success;
  }

  async purgeFolders(ids) {
    const res = await this.request('POST', '/api/file-library-recycle/purge-folders', { ids });
    return res.success;
  }

  async emptyRecycleBin() {
    const res = await this.request('POST', '/api/file-library-recycle/empty');
    return res.success;
  }

  // ============================================
  // 文件库文件夹批量操作
  // ============================================

  async batchDeleteFileLibraryFolders(ids) {
    const res = await this.request('POST', '/api/file-library-folders/batch-delete', { ids });
    return res.success;
  }

  async batchMoveFileLibraryFolders(ids, categoryId, parentId) {
    const res = await this.request('POST', '/api/file-library-folders/batch-move', { ids, category_id: categoryId, parent_id: parentId });
    return res.success;
  }

  async copyFileLibraryFolder(id, parentId, categoryId) {
    const res = await this.request('POST', '/api/file-library-folders/copy', { id, parent_id: parentId, category_id: categoryId });
    return res.success ? res.data : null;
  }

  async copyFileLibraryFiles(ids, folderId) {
    const res = await this.request('POST', '/api/file-library-files/copy', { ids, folder_id: folderId });
    return res.success ? res.data : null;
  }

  // ============================================
  // 文件库标签分类
  // ============================================

  async getFileLibraryTagCategories() {
    const res = await this.request('GET', '/api/file-library-tag-categories');
    return res.success ? res.data : [];
  }

  async createFileLibraryTagCategory(name) {
    const res = await this.request('POST', '/api/file-library-tag-categories', { name });
    return res.success ? res.data : null;
  }

  async updateFileLibraryTagCategory(id, data) {
    const res = await this.request('PUT', `/api/file-library-tag-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteFileLibraryTagCategory(id) {
    const res = await this.request('DELETE', `/api/file-library-tag-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 提示词分类管理
  // ============================================

  async getPromptCategories() {
    const res = await this.request('GET', '/api/prompt-categories');
    return res.success ? res.data : [];
  }

  async createPromptCategory(data) {
    const res = await this.request('POST', '/api/prompt-categories', data);
    return res.success ? res.data : null;
  }

  async updatePromptCategory(id, data) {
    const res = await this.request('PUT', `/api/prompt-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deletePromptCategory(id) {
    const res = await this.request('DELETE', `/api/prompt-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 提示词管理
  // ============================================

  async getPrompts(categoryId) {
    const url = categoryId ? `/api/prompts?category_id=${categoryId}` : '/api/prompts';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getPromptById(id) {
    const res = await this.request('GET', `/api/prompts/${id}`);
    return res.success ? res.data : null;
  }

  async createPrompt(data) {
    const res = await this.request('POST', '/api/prompts', data);
    return res.success ? res.data : null;
  }

  async updatePrompt(id, data) {
    const res = await this.request('PUT', `/api/prompts/${id}`, data);
    return res.success ? res.data : null;
  }

  async deletePrompt(id) {
    const res = await this.request('DELETE', `/api/prompts/${id}`);
    return res.success;
  }

  async batchDeletePrompts(ids) {
    const res = await this.request('POST', '/api/prompts/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizePrompts(ids, categoryId) {
    const res = await this.request('POST', '/api/prompts/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  async batchImportPrompts(items, categoryId) {
    const res = await this.request('POST', '/api/prompts/batch-import', { items, category_id: categoryId });
    return res.success ? res.data : null;
  }

  // ============================================
  // 规则分类管理
  // ============================================

  async getRuleCategories() {
    const res = await this.request('GET', '/api/rule-categories');
    return res.success ? res.data : [];
  }

  async createRuleCategory(data) {
    const res = await this.request('POST', '/api/rule-categories', data);
    return res.success ? res.data : null;
  }

  async updateRuleCategory(id, data) {
    const res = await this.request('PUT', `/api/rule-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteRuleCategory(id) {
    const res = await this.request('DELETE', `/api/rule-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 规则管理
  // ============================================

  async getRules(categoryId, type) {
    let url = '/api/rules';
    const params = [];
    if (categoryId !== undefined && categoryId !== 'all') params.push(`category_id=${categoryId}`);
    if (type) params.push(`type=${type}`);
    if (params.length) url += '?' + params.join('&');
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getRuleById(id) {
    const res = await this.request('GET', `/api/rules/${id}`);
    return res.success ? res.data : null;
  }

  async createRule(data) {
    const res = await this.request('POST', '/api/rules', data);
    return res.success ? res.data : null;
  }

  async updateRule(id, data) {
    const res = await this.request('PUT', `/api/rules/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteRule(id) {
    const res = await this.request('DELETE', `/api/rules/${id}`);
    return res.success;
  }

  async batchDeleteRules(ids) {
    const res = await this.request('POST', '/api/rules/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeRules(ids, categoryId) {
    const res = await this.request('POST', '/api/rules/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  async batchImportRules(data) {
    const res = await this.request('POST', '/api/rules/batch-import', data);
    return res.success ? res.data : null;
  }

  // ============================================
  // 团队管理
  // ============================================

  async getTeams() {
    const res = await this.request('GET', '/api/teams');
    return res.success ? res.data : [];
  }

  async getTeamById(id) {
    const res = await this.request('GET', `/api/teams/${id}`);
    return res.success ? res.data : null;
  }

  async createTeam(data) {
    const res = await this.request('POST', '/api/teams', data);
    return res.success ? res.data : null;
  }

  async updateTeam(id, data) {
    const res = await this.request('PUT', `/api/teams/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteTeam(id) {
    const res = await this.request('DELETE', `/api/teams/${id}`);
    return res.success;
  }

  // ============================================
  // 批量生成任务管理
  // ============================================

  async getBatchJobs() {
    const res = await this.request('GET', '/api/batch-jobs');
    return res.success ? res.data : [];
  }

  async getBatchJobById(id) {
    const res = await this.request('GET', `/api/batch-jobs/${id}`);
    return res.success ? res.data : null;
  }

  async createBatchJob(data) {
    const res = await this.request('POST', '/api/batch-jobs', data);
    return res.success ? res.data : null;
  }

  async updateBatchJob(id, data) {
    const res = await this.request('PUT', `/api/batch-jobs/${id}`, data);
    return res.success;
  }

  async deleteBatchJob(id) {
    const res = await this.request('DELETE', `/api/batch-jobs/${id}`);
    return res.success;
  }

  // ============================================
  // 艺术图库分类管理
  // ============================================

  async getGalleryCategories() {
    const res = await this.request('GET', '/api/gallery-categories');
    return res.success ? res.data : [];
  }

  async createGalleryCategory(data) {
    const res = await this.request('POST', '/api/gallery-categories', data);
    return res.success ? res.data : null;
  }

  async updateGalleryCategory(id, data) {
    const res = await this.request('PUT', `/api/gallery-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteGalleryCategory(id) {
    const res = await this.request('DELETE', `/api/gallery-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 艺术图库图片管理
  // ============================================

  async getGalleryImages(categoryId) {
    const url = categoryId !== undefined && categoryId !== 'all'
      ? `/api/gallery-images?category_id=${categoryId}`
      : '/api/gallery-images';
    const res = await this.request('GET', url);
    return res.success ? res.data : [];
  }

  async getGalleryImageById(id) {
    const res = await this.request('GET', `/api/gallery-images/${id}`);
    return res.success ? res.data : null;
  }

  async getGalleryImageBlobUrl(id) {
    const resp = await fetch(`${API_BASE}/api/gallery-images/${id}/file`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }

  // 获取图库大图的 base64 dataURL（用于 ComfyUI 上传等需要完整图片的场景）
  async getGalleryImageBase64(id) {
    const resp = await fetch(`${API_BASE}/api/gallery-images/${id}/file`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async createGalleryImage(data) {
    const res = await this.request('POST', '/api/gallery-images', data);
    return res.success ? res.data : null;
  }

  async updateGalleryImage(id, data) {
    const res = await this.request('PUT', `/api/gallery-images/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteGalleryImage(id) {
    const res = await this.request('DELETE', `/api/gallery-images/${id}`);
    return res.success;
  }

  async batchDeleteGalleryImages(ids) {
    const res = await this.request('POST', '/api/gallery-images/batch-delete', { ids });
    return res.success;
  }

  async batchCategorizeGalleryImages(ids, categoryId) {
    const res = await this.request('POST', '/api/gallery-images/batch-category', { ids, category_id: categoryId });
    return res.success;
  }

  // ============================================
  // 角色分类管理
  // ============================================

  async getCharacterCategories() {
    const res = await this.request('GET', '/api/character-categories');
    return res.success ? res.data : [];
  }

  async createCharacterCategory(data) {
    const res = await this.request('POST', '/api/character-categories', data);
    return res.success ? res.data : null;
  }

  async updateCharacterCategory(id, data) {
    const res = await this.request('PUT', `/api/character-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteCharacterCategory(id) {
    const res = await this.request('DELETE', `/api/character-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 团队分类管理
  // ============================================

  async getTeamCategories() {
    const res = await this.request('GET', '/api/team-categories');
    return res.success ? res.data : [];
  }

  async createTeamCategory(data) {
    const res = await this.request('POST', '/api/team-categories', data);
    return res.success ? res.data : null;
  }

  async updateTeamCategory(id, data) {
    const res = await this.request('PUT', `/api/team-categories/${id}`, data);
    return res.success ? res.data : null;
  }

  async deleteTeamCategory(id) {
    const res = await this.request('DELETE', `/api/team-categories/${id}`);
    return res.success;
  }

  // ============================================
  // 健康检查
  // ============================================

  async healthCheck() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ============================================
  // 插件系统
  // ============================================

  // 插件通用请求出口：插件自己注册的后端路由（/api/p/<id>/...）走这里，
  // 自动带上登录态，插件不用自己拼 fetch / 管 token。
  async requestRaw(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...this.headers, ...(options.headers || {}) }
    });
    return res.json();
  }

  // 已发现的全部插件清单（含 enabled 状态）。后端未起时抛错，由 pluginRegistry 回退本地清单
  async getPlugins() {
    const res = await this.request('GET', '/api/plugins');
    return res.success ? res.data : [];
  }

  // 启用 / 禁用（写状态文件；后端路由挂载需重启 api-server 才生效）
  async setPluginEnabled(id, enabled) {
    const res = await this.request('POST', `/api/plugins/${encodeURIComponent(id)}/enabled`, { enabled });
    return res.success ? res.data : null;
  }

  // 安装：传 { name, url } 由后端从 url 下载 zip 解压到 plugins/ 目录
  async installPlugin(payload) {
    const res = await this.request('POST', '/api/plugins/install', payload);
    return res.success ? res.data : null;
  }

  async uninstallPlugin(id) {
    const res = await this.request('DELETE', `/api/plugins/${encodeURIComponent(id)}`);
    return res.success ? res.data : null;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
