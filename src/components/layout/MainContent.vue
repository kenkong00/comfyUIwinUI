<template>
  <div class="main-content-wrapper">
    <div class="nav-content" v-show="activeNav">
      <SettingsPanel v-show="activeNav === 'settings' || activeNav === 'comfyui' || activeNav === 'storyboard-parser'" :initialTab="activeNav === 'comfyui' ? 'comfyui' : activeNav === 'storyboard-parser' ? 'parser' : ''" @navigate="$emit('navigate', $event)" />
      <FileLibrary v-show="activeNav === 'gallery'" @navigate="$emit('navigate', $event)" />
      <TagManager v-show="activeNav === 'tag'" />
      <CharacterPanel v-show="activeNav === 'character'" />
      <SingleGenerate v-show="activeNav === 'single'" />
      <TaskLibrary v-show="activeNav === 'task' || activeNav === 'task-running' || activeNav === 'task-done'" :initialFilter="activeNav === 'task-running' ? 'running' : activeNav === 'task-done' ? 'done' : ''" @navigate="$emit('navigate', $event)" />
      <UIView v-show="activeNav === 'ui'" />
      <ChatPanel v-show="activeNav === 'chat'" @navigate="$emit('navigate', $event)" />
      <ConversationHistory v-show="activeNav === 'history'" @navigate="$emit('navigate', $event)" />
      <UserProfile
        v-show="activeNav === 'profile'"
        :user="user"
        @logout="$emit('logout')"
        @avatar-updated="$emit('avatar-updated', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import CharacterPanel from '@/components/character/CharacterPanel.vue'
import SingleGenerate from '@/components/generation/SingleGenerate.vue'
import FileLibrary from '@/components/gallery/FileLibrary.vue'
import TaskLibrary from '@/components/generation/TaskLibrary.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import ConversationHistory from '@/components/chat/ConversationHistory.vue'
import TagManager from '@/components/generation/TagManager.vue'
import UserProfile from '@/components/user/UserProfile.vue'
import UIView from '@/components/ui/UIView.vue'

const props = defineProps({
  activeNav: {
    type: String,
    default: ''
  },
  user: {
    type: Object,
    default: null
  }
})

defineEmits(['logout', 'avatar-updated', 'navigate'])
</script>

<style scoped>
.main-content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 8px 10px;
  overflow-x: hidden;
  overflow-y: auto;
  position: relative;
  background: var(--bg-primary);
  min-width: 0;
}

.nav-content {
  background: var(--bg-primary);
  border-radius: 0;
  box-shadow: none;
  min-height: 0;
  overflow: auto;
  flex: 1;
}
</style>
