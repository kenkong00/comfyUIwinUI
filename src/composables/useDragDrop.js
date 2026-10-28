import { ref } from 'vue'

const isDragging = ref(false)
const dragPayload = ref(null)

export function useDragSource() {
  function startDrag(e, item) {
    isDragging.value = true
    dragPayload.value = { kind: item._kind, data: item }
    const json = JSON.stringify(item)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', json)
    if (item._kind === 'file') {
      e.dataTransfer.setData(`application/x-rfp-type-${item.file_type}`, '1')
    } else {
      e.dataTransfer.setData('application/x-rfp-folder', '1')
    }
    e.dataTransfer.setData('application/x-rfp-file', json)
  }

  function endDrag() {
    isDragging.value = false
    dragPayload.value = null
  }

  return { startDrag, endDrag, isDragging, dragPayload }
}

export function useDropTarget(acceptFn, onDrop) {
  const isOver = ref(false)
  const isAcceptable = ref(false)

  function onDragOver(e) {
    const types = Array.from(e.dataTransfer.types)
    const acceptable = acceptFn(types)
    if (acceptable) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      isAcceptable.value = true
    } else {
      e.dataTransfer.dropEffect = 'none'
      isAcceptable.value = false
    }
    isOver.value = true
  }

  function onDragLeave() {
    isOver.value = false
    isAcceptable.value = false
  }

  function onDropEvent(e) {
    e.preventDefault()
    isOver.value = false
    isAcceptable.value = false
    const json = e.dataTransfer.getData('application/x-rfp-file')
    if (json) {
      try {
        const data = JSON.parse(json)
        onDrop(data, e)
      } catch (err) {
        console.error('[useDropTarget] parse payload failed:', err)
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDrop(null, e)
    }
  }

  return { isOver, isAcceptable, onDragOver, onDragLeave, onDropEvent }
}
