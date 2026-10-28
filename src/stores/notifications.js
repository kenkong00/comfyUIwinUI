// src/stores/notifications.js
// 全局通知中心：生图失败、工作流未搭建、连接异常等都会进入这里，
// 右下角"通知"图标点开即可看到，避免"操作出错却没有任何反馈"。
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

let nid = 1

export const useNotifications = defineStore('notifications', () => {
  const list = ref([]) // { id, level, title, body, time, read }

  const unread = computed(() => list.value.filter((n) => !n.read).length)
  const errors = computed(() => list.value.filter((n) => n.level === 'error'))

  function push(level, title, body) {
    list.value.unshift({
      id: nid++,
      level: level || 'info',
      title: title || '',
      body: body || '',
      time: new Date().toLocaleTimeString(),
      read: false,
    })
    if (list.value.length > 60) list.value.length = 60
  }
  function info(t, b) { push('info', t, b) }
  function success(t, b) { push('success', t, b) }
  function warn(t, b) { push('warn', t, b) }
  function error(t, b) { push('error', t, b) }
  function markAllRead() { list.value.forEach((n) => { n.read = true }) }
  function clear() { list.value = [] }

  return { list, unread, errors, push, info, success, warn, error, markAllRead, clear }
})
