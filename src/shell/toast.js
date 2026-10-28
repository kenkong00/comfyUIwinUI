// src/shell/toast.js
import { defineStore } from 'pinia'

export const useToast = defineStore('toast', {
  state: () => ({ list: [] }),
  actions: {
    show(msg, type = 'info', timeout = 2600) {
      const id = Date.now() + Math.random()
      this.list.push({ id, msg, type })
      setTimeout(() => this.remove(id), timeout)
    },
    remove(id) {
      this.list = this.list.filter((t) => t.id !== id)
    },
  },
})
