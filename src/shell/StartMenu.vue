<template>
  <div v-if="wm.startMenuOpen" class="start-backdrop" @click="wm.toggleStart()">
    <div class="start-menu" @click.stop>
      <div class="sm-search" @click="wm.toggleSearch()">
        <span v-html="icon('search')" /> <span class="sm-search-ph">搜索应用、文件和设置</span>
      </div>

      <div class="sm-section">
        <div class="sm-head">已固定</div>
        <div class="sm-grid">
          <button v-for="a in pinnedStart" :key="a" class="sm-tile" @click="open(a)" :title="appName(a)">
            <span class="sm-tile-ico" v-html="appIcon(a)" />
            <span class="sm-tile-label">{{ appName(a) }}</span>
          </button>
        </div>
      </div>

      <div class="sm-section">
        <div class="sm-head">最近添加</div>
        <div class="sm-recent">
          <button v-for="a in recentApps" :key="a" class="sm-rec" @click="open(a)">
            <span class="sm-rec-ico" v-html="appIcon(a)" />
            <span>{{ appName(a) }}</span>
          </button>
        </div>
      </div>

      <div class="sm-bottom">
        <button class="sm-user" @click="openProfile">
          <span class="sm-avatar" v-if="avatarText">{{ avatarText }}</span>
          <img v-else :src="avatarUrl" class="sm-avatar-img" />
          <span class="sm-user-meta">
            <span class="sm-user-name">{{ userName }}</span>
            <span class="sm-tier" :class="'tier-' + session.tier">{{ session.tierLabel }}</span>
          </span>
        </button>
        <button class="sm-power" title="电源" @click="$emit('power')">
          <span v-html="icon('power')" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useWm } from '@/shell/wm'
import { useSession } from '@/shell/session'
import { PINNED_START, ALL_APPS, getApp, PLUGIN_APPS, registryVersion } from '@/shell/apps'
import { icon } from '@/shell/icons'

const wm = useWm()
const session = useSession()
const emit = defineEmits(['power'])

// 插件可以在清单里声明 pin:1 来"固定到开始菜单"，注册进来后自动出现
const pinnedStart = computed(() => {
  void registryVersion.value
  const extra = Object.keys(PLUGIN_APPS).filter((id) => Number(PLUGIN_APPS[id]?.pin || 0) > 0)
  return [...new Set([...PINNED_START, ...extra])]
})
const recentApps = computed(() => {
  void registryVersion.value
  const extra = Object.keys(PLUGIN_APPS)
  return [...new Set([...ALL_APPS, ...extra])].slice(2, 8)
})

function appName(a) { return getApp(a)?.name || a }
function appIcon(a) { return icon(getApp(a)?.icon || 'file') }
function open(a) { wm.open(a) }

const userName = computed(() => session.user?.username || '用户')
const avatarUrl = computed(() => session.user?.avatar_url || '')
const avatarText = computed(() => {
  if (avatarUrl.value) return ''
  const n = session.user?.username || ''
  return n ? n.charAt(0).toUpperCase() : '?'
})
function openProfile() { wm.open('profile') }
</script>

<style scoped>
.start-backdrop {
  position: fixed; inset: 0; z-index: 9500;
}
.start-menu {
  position: absolute; left: 12px; bottom: 56px; width: 620px; max-width: 94vw; height: 660px; max-height: 82vh;
  background: var(--sm-bg, rgba(245,245,247,.86));
  backdrop-filter: blur(50px) saturate(1.8); -webkit-backdrop-filter: blur(50px) saturate(1.8);
  border: 1px solid var(--border-color, #dadada); border-radius: 12px;
  box-shadow: 0 30px 70px rgba(0,0,0,.38); padding: 22px 24px; display: flex; flex-direction: column;
}
[data-theme='dark'] .start-menu { --sm-bg: rgba(34,34,38,.9); border-color: #3a3a3e; }
.sm-search {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;
  background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e0e0e0); cursor: text;
  color: var(--text-muted, #888); margin-bottom: 16px; flex-shrink: 0;
}
[data-theme='dark'] .sm-search { background: #2c2c30; }
.sm-search :deep(svg) { width: 18px; height: 18px; }
.sm-search-ph { font-size: 13px; }
.sm-section { margin-bottom: 14px; }
.sm-head { font-size: 12px; color: var(--text-secondary, #666); font-weight: 600; margin: 4px 2px 10px; }
.sm-grid {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;
}
.sm-tile {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px;
  border: none; background: transparent; border-radius: 8px; cursor: pointer; color: var(--text-primary, #1f2937);
}
.sm-tile:hover { background: rgba(128,128,128,.18); }
.sm-tile-ico { width: 32px; height: 32px; }
.sm-tile-ico :deep(svg) { width: 32px; height: 32px; }
.sm-tile-label { font-size: 11.5px; text-align: center; line-height: 1.3; }
.sm-recent { display: flex; flex-wrap: wrap; gap: 4px; }
.sm-rec {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: none; background: transparent;
  border-radius: 6px; cursor: pointer; color: var(--text-primary, #1f2937); font-size: 13px;
}
.sm-rec:hover { background: rgba(128,128,128,.18); }
.sm-rec-ico { width: 22px; height: 22px; }
.sm-rec-ico :deep(svg) { width: 22px; height: 22px; }
.sm-bottom {
  margin-top: auto; display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid var(--border-color, #e2e2e2); padding-top: 12px; flex-shrink: 0;
}
.sm-user { display: flex; align-items: center; gap: 10px; border: none; background: transparent; cursor: pointer; padding: 6px 10px; border-radius: 8px; color: var(--text-primary, #1f2937); }
.sm-user:hover { background: rgba(128,128,128,.18); }
.sm-avatar, .sm-avatar-img { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; overflow: hidden; }
.sm-avatar-img { object-fit: cover; }
.sm-user-meta { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.sm-user-name { font-size: 13px; }
.sm-tier { font-size: 10.5px; padding: 1px 7px; border-radius: 9px; color: #fff; background: #8a8a8a; align-self: flex-start; }
.sm-tier.tier-free { background: #8a8a8a; }
.sm-tier.tier-standard { background: #0078d4; }
.sm-tier.tier-pro { background: #b4502a; }
.sm-power {
  width: 40px; height: 40px; border: none; background: transparent; border-radius: 8px; cursor: pointer;
  color: var(--text-primary, #1f2937); display: flex; align-items: center; justify-content: center;
}
.sm-power:hover { background: rgba(220,38,38,.16); color: #e11; }
.sm-power :deep(svg) { width: 22px; height: 22px; }
</style>
