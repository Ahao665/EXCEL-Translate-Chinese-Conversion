<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  table: { type: Object, default: null },
})

const pageSize = ref(20)
const page = ref(1)

const pagedRows = computed(() => {
  if (!props.table) return []
  const start = (page.value - 1) * pageSize.value
  return props.table.rows.slice(start, start + pageSize.value)
})

const showKeys = computed(() => {
  if (!props.table) return []
  return props.table.headers.slice(0, 6)
})
</script>

<template>
  <div v-if="props.table" class="cards">
    <div class="cards-toolbar">
      <span class="hint">每条记录以卡片展示（最多显示前 6 列）</span>
      <el-select v-model="pageSize" size="small" style="width: 110px">
        <el-option :value="10" label="10 / 页" />
        <el-option :value="20" label="20 / 页" />
        <el-option :value="40" label="40 / 页" />
      </el-select>
    </div>

    <div class="grid">
      <el-card v-for="(row, idx) in pagedRows" :key="idx" shadow="never" class="card">
        <template #header>
          <div class="card-hd">
            <span>记录 #{{ (page - 1) * pageSize + idx + 1 }}</span>
          </div>
        </template>
        <div class="kv" v-for="k in showKeys" :key="k">
          <div class="k">{{ k }}</div>
          <div class="v">{{ row?.[k] }}</div>
        </div>
      </el-card>
    </div>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        layout="prev, pager, next"
        :total="props.table.rowCount"
        small
      />
    </div>
  </div>

  <div v-else class="empty">
    <el-empty description="请先上传 Excel 文件" />
  </div>
</template>

<style scoped>
.cards {
  padding: 12px;
}
.cards-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.card-hd {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}
.kv {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}
.kv:last-child {
  border-bottom: 0;
}
.k {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}
.v {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.empty {
  height: 100%;
  display: grid;
  place-items: center;
}
</style>

