<script setup>
import DataTable from '../components/DataTable.vue'
import DataCards from '../components/DataCards.vue'

const props = defineProps({
  activePane: { type: String, default: 'original' }, // result | original | summary
  activeView: { type: String, default: 'table' },
  original: { type: Object, default: null },
  result: { type: Object, default: null },
  summary: { type: Object, default: null },
})

const emit = defineEmits(['update:activePane'])
</script>

<template>
  <div class="preview">
    <el-tabs
      class="tabs"
      type="border-card"
      :model-value="props.activePane"
      @update:model-value="(v) => emit('update:activePane', v)"
    >
      <el-tab-pane label="处理结果" name="result">
        <div v-if="props.result" class="pane">
          <DataTable v-if="props.activeView === 'table'" :table="props.result" height="520" />
          <DataCards v-else :table="props.result" />
        </div>
        <div v-else class="empty"><el-empty description="暂无结果，请先上传并处理" /></div>
      </el-tab-pane>

      <el-tab-pane label="原始数据" name="original">
        <div v-if="props.original" class="pane">
          <DataTable v-if="props.activeView === 'table'" :table="props.original" height="520" />
          <DataCards v-else :table="props.original" />
        </div>
        <div v-else class="empty"><el-empty description="请先上传 Excel" /></div>
      </el-tab-pane>

      <el-tab-pane label="智能摘要" name="summary">
        <div v-if="props.summary" class="summary">
          <el-alert :title="props.summary.summaryText" type="success" show-icon :closable="false" />

          <div class="sum-grid">
            <el-card shadow="never" class="sum-card">
              <template #header>数据概览</template>
              <div class="sum-row">行数：{{ props.summary.rowCount }}</div>
              <div class="sum-row">列数：{{ props.summary.colCount }}</div>
              <div class="sum-row">关键列：{{ props.summary.keyColumns.join('、') || '—' }}</div>
            </el-card>

            <el-card shadow="never" class="sum-card">
              <template #header>异常提示</template>
              <div v-if="props.summary.anomaly.issues.length">
                <div class="sum-row" v-for="(x, i) in props.summary.anomaly.issues" :key="i">{{ x }}</div>
              </div>
              <div v-else class="sum-row">未发现明显异常</div>
            </el-card>
          </div>
        </div>
        <div v-else class="empty"><el-empty description="请先上传 Excel 以生成摘要" /></div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.preview {
  flex: 1;
  overflow: hidden;
}
.tabs {
  height: 100%;
}
.pane {
  height: 560px;
}
.empty {
  height: 560px;
  display: grid;
  place-items: center;
}
.summary {
  padding: 12px;
}
.sum-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.sum-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.sum-row {
  padding: 6px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}
</style>

