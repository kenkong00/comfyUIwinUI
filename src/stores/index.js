import { createPinia } from 'pinia'

export const pinia = createPinia()

export { useConfigStore } from './config'
export { useCharacterStore } from './character'
export { useGenerationStore } from './generation'
export { useChatStore } from './chat'
