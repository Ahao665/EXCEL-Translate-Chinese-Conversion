<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['file'])
const inputRef = ref(null)
const dragging = ref(false)

function validate(file) {
  const name = (file?.name || '').toLowerCase()
  const ok = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')
  if (!ok) ElMessage.error('请上传 .xlsx/.xls/.csv 文件')
  return ok
}

function pick(e) {
  const file = e?.target?.files?.[0]
  if (!file) return
  if (!validate(file)) return
  emit('file', file)
  e.target.value = ''
}

function openPicker() {
  inputRef.value?.click?.()
}

function onDrop(e) {
  dragging.value = false
  const file = e?.dataTransfer?.files?.[0]
  if (!file) return
  if (!validate(file)) return
  emit('file', file)
}
</script>

<template>
  <div
    class="drop-zone"
    :class="{ dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="dz-title">上传 Excel</div>
    <div class="dz-sub">拖拽文件到此处，或点击选择</div>
    <el-button type="primary" plain @click="openPicker">选择文件</el-button>
    <input ref="inputRef" type="file" accept=".xlsx,.xls,.csv" class="dz-input" @change="pick" />
  </div>
</template>

<style scoped>
.drop-zone {
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  text-align: left;
}
.drop-zone.dragging {
  border-color: rgba(64, 158, 255, 0.75);
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.15);
}
.dz-title {
  font-weight: 700;
  font-size: 13px;
}
.dz-sub {
  margin: 6px 0 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}
.dz-input {
  display: none;
}
</style>

