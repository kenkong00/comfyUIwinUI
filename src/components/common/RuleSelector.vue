<template>
  <div class="rule-selector" :class="{ disabled }">
    <div class="selected-area">
      <div class="selected-chips" v-if="selectedRules.length > 0">
        <div
          v-for="rule in selectedRules"
          :key="rule.id"
          class="chip"
        >
          <span class="chip-name">{{ rule.name }}</span>
          <button
            v-if="!disabled"
            type="button"
            class="chip-remove"
            @click.stop="removeRule(rule.id)"
            title="移除"
          >×</button>
        </div>
      </div>
      <span v-else class="empty-hint">{{ placeholder || '未选择规则' }}</span>

      <button
        v-if="!disabled"
        type="button"
        class="add-btn"
        @click.stop="showPicker = !showPicker"
      >
        {{ showPicker ? '收起' : '+ 添加规则' }}
      </button>
    </div>

    <div v-if="showPicker && !disabled" class="picker-panel" @click.stop>
      <div class="picker-header">
        <span class="picker-title">选择规则</span>
        <button type="button" class="picker-close" @click="showPicker = false">×</button>
      </div>

      <div class="picker-search">
        <input
          type="text"
          v-model="searchQuery"
          placeholder="搜索规则名称或内容..."
          class="search-input"
        />
      </div>

      <div class="category-tabs">
        <div
          v-for="cat in rulesStore.allCategories"
          :key="cat.id"
          :class="['cat-tab', { active: activeCategory === cat.id }]"
          @click="activeCategory = cat.id"
        >
          {{ cat.name }}
          <span class="cat-count">{{ getCatCount(cat.id) }}</span>
        </div>
      </div>

      <div class="rule-list" v-if="filteredRules.length > 0">
        <label
          v-for="rule in filteredRules"
          :key="rule.id"
          class="rule-item"
          :class="{ checked: isSelected(rule.id) }"
        >
          <input
            type="checkbox"
            :checked="isSelected(rule.id)"
            @change="toggleRule(rule.id)"
          />
          <div class="rule-info">
            <div class="rule-name">{{ rule.name || '未命名规则' }}</div>
          </div>
        </label>
      </div>
      <div v-else class="picker-empty">
        <p>暂无规则</p>
        <small>请先在"规则管理"中创建</small>
      </div>

      <div class="picker-footer">
        <span class="selected-count">已选 {{ modelValue.length }} 条</span>
        <button type="button" class="confirm-btn" @click="showPicker = false">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRulesStore } from '@/stores/rules'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const rulesStore = useRulesStore()

const showPicker = ref(false)
const activeCategory = ref('all')
const searchQuery = ref('')

const selectedRules = computed(() => {
  if (!props.modelValue || props.modelValue.length === 0) return []
  return props.modelValue
    .map(id => rulesStore.getRuleById(id))
    .filter(Boolean)
})

const filteredRules = computed(() => {
  let list = rulesStore.rulesByCategory(activeCategory.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.content || '').toLowerCase().includes(q)
    )
  }
  return list
})

function getCatCount(catId) {
  return rulesStore.getCategoryCount(catId)
}

function isSelected(ruleId) {
  return props.modelValue.includes(ruleId)
}

function toggleRule(ruleId) {
  const current = [...props.modelValue]
  const idx = current.indexOf(ruleId)
  if (idx > -1) {
    current.splice(idx, 1)
  } else {
    current.push(ruleId)
  }
  emit('update:modelValue', current)
}

function removeRule(ruleId) {
  const current = props.modelValue.filter(id => id !== ruleId)
  emit('update:modelValue', current)
}
</script>

<style scoped>
.rule-selector {
  position: relative;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-surface, #fff);
  padding: 8px;
  transition: border-color 0.15s ease;
}

.rule-selector.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.rule-selector:focus-within {
  border-color: var(--accent-color, #4a9eff);
}

.selected-area {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.empty-hint {
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
  line-height: 28px;
  flex: 1;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.chip-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  background: transparent !important;
  border: none !important;
  color: inherit !important;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 !important;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.15s ease;
  box-shadow: none !important;
}

.chip-remove:hover {
  background: rgba(255, 255, 255, 0.25);
}

.add-btn {
  padding: 4px 12px !important;
  background: var(--bg-secondary, #f3f4f6) !important;
  color: var(--text-primary, #374151) !important;
  border: 1px dashed var(--border-color, #d1d5db) !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  box-shadow: none !important;
}

.add-btn:hover {
  border-color: var(--accent-color, #4a9eff) !important;
  color: var(--accent-color, #4a9eff) !important;
}

.picker-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}

.picker-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #374151);
}

.picker-close {
  width: 24px;
  height: 24px;
  background: transparent !important;
  border: none !important;
  color: var(--text-secondary, #6b7280) !important;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  padding: 0 !important;
  box-shadow: none !important;
}

.picker-close:hover {
  background: var(--bg-secondary, #f3f4f6) !important;
}

.picker-search {
  padding: 8px 14px;
  flex-shrink: 0;
}

.search-input {
  padding: 8px 12px !important;
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  color: var(--text-primary) !important;
  font-size: 13px !important;
  width: 200px !important;
  box-shadow: none !important;
  box-sizing: border-box !important;
}

.search-input:focus {
  border-color: var(--accent-color, #4a9eff) !important;
}

.category-tabs {
  display: flex;
  gap: 4px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  flex-wrap: wrap;
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.cat-tab {
  padding: 4px 10px;
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-secondary, #6b7280);
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cat-tab:hover {
  color: var(--text-primary, #374151);
}

.cat-tab.active {
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
}

.cat-count {
  font-size: 10px;
  opacity: 0.8;
}

.rule-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
}

.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.rule-item:hover {
  background: var(--bg-secondary, #f3f4f6);
}

.rule-item.checked {
  background: rgba(74, 158, 255, 0.08);
}

.rule-item input[type="checkbox"] {
  margin-top: 2px;
  cursor: pointer;
  flex-shrink: 0;
}

.rule-info {
  flex: 1;
  min-width: 0;
}

.rule-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #374151);
}

.picker-empty {
  padding: 32px 14px;
  text-align: center;
  color: var(--text-secondary, #9ca3af);
}

.picker-empty p {
  font-size: 14px;
  margin: 0 0 4px 0;
}

.picker-empty small {
  font-size: 12px;
}

.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}

.selected-count {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.confirm-btn {
  padding: 6px 16px !important;
  background: var(--accent-color, #4a9eff) !important;
  color: var(--accent-text, #fff) !important;
  border: none !important;
  border-radius: 6px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  cursor: pointer;
  box-shadow: none !important;
}

.confirm-btn:hover {
  opacity: 0.85;
}
</style>
