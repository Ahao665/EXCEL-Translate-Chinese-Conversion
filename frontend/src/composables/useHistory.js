import { computed, reactive } from 'vue'
import { deepCloneSafe } from '../utils/deepClone'

function nowTime() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function useHistory({ getCurrent, applySnapshot }) {
  const history = reactive({
    items: [],
    activeId: null,
    pointer: -1,
  })

  function pushSnapshot(label) {
    const snap = {
      id: uid(),
      label,
      time: nowTime(),
      payload: deepCloneSafe(getCurrent()),
    }

    // 如果在中间撤销过，再 push 要截断未来分支
    if (history.pointer < history.items.length - 1) {
      history.items.splice(history.pointer + 1)
    }

    history.items.push(snap)
    history.pointer = history.items.length - 1
    history.activeId = snap.id
  }

  function setActiveSnapshot(id) {
    const idx = history.items.findIndex((x) => x.id === id)
    if (idx < 0) return
    history.pointer = idx
    history.activeId = id
    applySnapshot(deepCloneSafe(history.items[idx].payload))
  }

  function undo() {
    if (history.pointer <= 0) return
    history.pointer -= 1
    const snap = history.items[history.pointer]
    history.activeId = snap.id
    applySnapshot(deepCloneSafe(snap.payload))
  }

  function redo() {
    if (history.pointer >= history.items.length - 1) return
    history.pointer += 1
    const snap = history.items[history.pointer]
    history.activeId = snap.id
    applySnapshot(deepCloneSafe(snap.payload))
  }

  return {
    history,
    canUndo: computed(() => history.pointer > 0),
    canRedo: computed(() => history.pointer < history.items.length - 1),
    pushSnapshot,
    setActiveSnapshot,
    undo,
    redo,
  }
}

