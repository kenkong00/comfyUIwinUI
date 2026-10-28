import { ref } from 'vue'

class LocalAuthService {
  constructor() {
    this.currentUser = ref(null)
    this.isAdmin = ref(false)
    this.isLocalMode = ref(false)
  }
  loadFromStorage() {}
  saveToStorage() {}
  isConfigured() { return false }
  async setupAdmin(username, password, email = '') { return { success: false, message: '已弃用，请使用数据库注册' } }
  async login(username, password) { return { success: false, message: '已弃用，请使用数据库登录' } }
  logout() {}
  async hashPassword(password) { return '' }
  getUserDisplayName() { return '' }
  getModeText() { return '☁️ 云端用户' }
}

export const localAuthService = new LocalAuthService()
export default localAuthService