<template>
  <div class="mb-wrap">
    <!-- 当前套餐概览 -->
    <section class="mb-hero">
      <div class="mb-hero-icon ico" v-html="icon('star')"></div>
      <div class="mb-hero-meta">
        <div class="mb-hero-tier">
          {{ session.tierLabel }}
          <span class="mb-badge" :class="'tier-' + session.tier">{{ session.tierLabel }}</span>
        </div>
        <div class="mb-hero-price">{{ membership?.price || '¥0' }} · 当前套餐</div>
        <div class="mb-hero-tip">不同会员登录后，只能查看和管理自己的目录内容（已按账号隔离）</div>
      </div>
      <button class="mb-refresh" @click="refresh" title="刷新用量">↻ 刷新</button>
    </section>

    <!-- 配额用量 -->
    <section class="mb-section">
      <h3 class="mb-h3">配额用量</h3>
      <div class="mb-bars">
        <div class="mb-bar" v-for="q in quotas" :key="q.key">
          <div class="mb-bar-head">
            <span>{{ q.label }}</span>
            <span class="mb-bar-num">{{ q.usedText }} / {{ q.limitText }}</span>
          </div>
          <div class="mb-track">
            <div class="mb-fill" :class="{ full: q.pct >= 100 }" :style="{ width: Math.min(100, q.pct) + '%' }"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 套餐对比 -->
    <section class="mb-section">
      <h3 class="mb-h3">升级 / 切换套餐</h3>
      <p class="mb-note">（演示环境无支付，点击即可切换体验不同会员的配额与目录权限）</p>
      <div class="mb-cards">
        <div class="mb-card" v-for="t in tierList" :key="t.key" :class="{ active: t.key === session.tier }">
          <div class="mb-card-name">{{ t.label }}</div>
          <div class="mb-card-price">{{ t.price }}</div>
          <ul class="mb-card-feats">
            <li>存储 不限</li>
            <li>每月批量任务 {{ t.monthlyGenerations }} 次</li>
            <li>并发任务 {{ t.concurrentTasks }}</li>
            <li>工作流上限 {{ t.maxWorkflows }}</li>
          </ul>
          <button
            class="mb-card-btn"
            :disabled="t.key === session.tier"
            @click="switchTier(t.key)"
          >{{ t.key === session.tier ? '当前套餐' : '切换为' + t.label }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSession } from '@/shell/session'
import api from '@/services/api'
import { icon } from '@/shell/icons'
import { useToast } from '@/shell/toast'

const session = useSession()
const toast = useToast()
const membership = computed(() => session.membership)

function fmtBytes(n) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return (i === 0 ? v : v.toFixed(1)) + ' ' + u[i]
}

const tierList = computed(() => {
  const t = membership.value?.tiers || { free: { key: 'free', label: '免费版', price: '¥0', storageBytes: 1073741824, monthlyGenerations: 50, concurrentTasks: 1, maxWorkflows: 3 } }
  return Object.values(t)
})

const quotas = computed(() => {
  const m = membership.value
  if (!m) return []
  const u = m.usage, q = m.quota
  const gb = (b) => (b / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  return [
    // limit <= 0 表示不设上限
    { key: 'storage', label: '存储空间', used: u.storageBytes, limit: q.storageBytes, usedText: gb(u.storageBytes), limitText: q.storageBytes > 0 ? gb(q.storageBytes) : '无限', pct: q.storageBytes > 0 ? (u.storageBytes / q.storageBytes) * 100 : 0 },
    { key: 'gen', label: '本月批量任务', used: u.monthlyGenerations, limit: q.monthlyGenerations, usedText: u.monthlyGenerations, limitText: q.monthlyGenerations, pct: (u.monthlyGenerations / q.monthlyGenerations) * 100 },
    { key: 'concurrent', label: '并发任务', used: u.concurrentTasks, limit: q.concurrentTasks, usedText: u.concurrentTasks, limitText: q.concurrentTasks, pct: (u.concurrentTasks / q.concurrentTasks) * 100 },
    { key: 'wf', label: '工作流数量', used: u.workflowCount, limit: q.maxWorkflows, usedText: u.workflowCount, limitText: q.maxWorkflows, pct: (u.workflowCount / q.maxWorkflows) * 100 },
  ]
})

async function refresh() {
  await session.loadMembership()
  toast.show('已刷新配额用量')
}

async function switchTier(tier) {
  const res = await api.updateMembership(tier)
  if (res.success) {
    session.setMembership(res.data.membership)
    toast.show('已切换为 ' + res.data.membership.tierLabel)
  } else {
    toast.show(res.error || '切换失败')
  }
}

onMounted(() => { if (!session.membership) session.loadMembership() })
</script>

<style scoped>
.mb-wrap { padding: 18px 22px; height: 100%; overflow: auto; }
.mb-hero { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 10px; background: rgba(0,120,212,.08); border: 1px solid rgba(0,120,212,.18); }
.mb-hero-icon { width: 46px; height: 46px; color: var(--accent, #0078d4); }
.mb-hero-meta { flex: 1; }
.mb-hero-tier { font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.mb-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; color: #fff; background: #888; }
.mb-badge.tier-free { background: #8a8a8a; }
.mb-badge.tier-standard { background: #0078d4; }
.mb-badge.tier-pro { background: #b4502a; }
.mb-hero-price { font-size: 12.5px; color: #666; margin-top: 2px; }
.mb-hero-tip { font-size: 11.5px; color: #888; margin-top: 6px; }
.mb-refresh { align-self: flex-start; border: 1px solid #ccc; background: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12.5px; }
.mb-refresh:hover { background: #f3f3f3; }
.mb-section { margin-top: 22px; }
.mb-h3 { font-size: 14px; margin: 0 0 12px; }
.mb-note { font-size: 11.5px; color: #888; margin: -6px 0 12px; }
.mb-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
.mb-bar-head { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; }
.mb-bar-num { color: #777; }
.mb-track { height: 8px; border-radius: 5px; background: #e6e6e6; overflow: hidden; }
.mb-fill { height: 100%; background: var(--accent, #0078d4); border-radius: 5px; transition: width .3s; }
.mb-fill.full { background: #d83b01; }
.mb-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.mb-card { border: 1px solid #e0e0e0; border-radius: 10px; padding: 16px; background: #fff; display: flex; flex-direction: column; }
.mb-card.active { border-color: var(--accent, #0078d4); box-shadow: 0 0 0 2px rgba(0,120,212,.15); }
.mb-card-name { font-size: 15px; font-weight: 600; }
.mb-card-price { font-size: 13px; color: #d83b01; margin: 4px 0 10px; font-weight: 600; }
.mb-card-feats { list-style: none; padding: 0; margin: 0 0 12px; font-size: 12.5px; color: #555; flex: 1; }
.mb-card-feats li { padding: 3px 0; border-bottom: 1px dashed #eee; }
.mb-card-btn { border: 1px solid var(--accent, #0078d4); background: var(--accent, #0078d4); color: #fff; border-radius: 6px; padding: 8px; cursor: pointer; font-size: 12.5px; }
.mb-card-btn:disabled { background: #e8e8e8; border-color: #ddd; color: #999; cursor: default; }
.mb-card-btn:not(:disabled):hover { filter: brightness(1.05); }
</style>
