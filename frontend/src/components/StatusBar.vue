<script setup>
const props = defineProps({
  status: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div class="statusbar">
    <div class="left">
      <span class="dot" :class="props.status.stage" />
      <span class="msg">{{ props.status.message }}</span>
    </div>
    <div class="right">
      <el-progress :percentage="props.status.percent" :stroke-width="10" :show-text="false" />
    </div>
  </div>
</template>

<style scoped>
.statusbar {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 260px;
}
.msg {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
}
.dot.loading,
.dot.processing {
  background: rgba(64, 158, 255, 0.9);
}
.dot.ready {
  background: rgba(103, 194, 58, 0.95);
}
.dot.idle {
  background: rgba(230, 162, 60, 0.9);
}
.right {
  width: 240px;
}
</style>

