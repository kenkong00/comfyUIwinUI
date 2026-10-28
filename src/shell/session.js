// src/shell/session.js
// 当前登录用户的轻量 store，供窗口内的组件读取 user / 会员信息。
import { defineStore } from 'pinia'
import api from '@/services/api'

export const useSession = defineStore('session', {
  state: () => ({
    user: null,
    loggedIn: false,
    membership: null, // { tier, tierLabel, price, quota, usage, tiers }
  }),
  getters: {
    tier: (s) => s.membership?.tier || s.user?.membership_tier || 'free',
    tierLabel: (s) => s.membership?.tierLabel || '免费版',
  },
  actions: {
    setUser(u) {
      this.user = u
      this.loggedIn = !!u
      if (u && u.membership) this.membership = u.membership
    },
    async loadMembership() {
      try {
        const res = await api.getAccount()
        if (res.success) this.membership = res.data.membership
      } catch (e) { /* 忽略：会员信息非关键 */ }
    },
    setMembership(m) {
      this.membership = m
    },
    clear() {
      this.user = null
      this.loggedIn = false
      this.membership = null
    },
  },
})
