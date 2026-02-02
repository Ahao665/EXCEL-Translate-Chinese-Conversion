<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  table: { type: Object, default: null },
  height: { type: [String, Number], default: '100%' },
})

const pageSize = ref(50)
const page = ref(1)

const pagedRows = computed(() => {
  if (!props.table) return []
  const start = (page.value - 1) * pageSize.value
  return props.table.rows.slice(start, start + pageSize.value)
})
</script>

<template>
  <div class="table-wrap" v-if="props.table">
    <div class="table-toolbar">
      <div class="tl">
        <span class="hint">行：{{ props.table.rowCount }} 列：{{ props.table.colCount }}</span>
      </div>
      <div class="tr">
        <el-select v-model="pageSize" size="small" style="width: 110px">
          <el-option :value="20" label="20 / 页" />
          <el-option :value="50" label="50 / 页" />
          <el-option :value="100" label="100 / 页" />
        </el-select>
      </div>
    </div>

    <el-table
      :data="pagedRows"
      border
      stripe
      :height="props.height"
      style="width: 100%"
    >
      <el-table-column
        v-for="h in props.table.headers"
        :key="h"
        :prop="h"
        :label="h"
        min-width="140"
        show-overflow-tooltip
        sortable
      />
    </el-table>

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
.table-wrap {
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}
.pager {
  display: flex;
  justify-content: flex-end;
}
.empty {
  height: 100%;
  display: grid;
  place-items: center;
}
</style>

