<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { cleanGarble, normalizeBooleans, removeEmptyRowsAndCols, trimCells } from '../utils/cleaners'
import { cloneTable } from '../utils/table'
import { detectLangAuto, LANGS, translateBatch } from '../utils/translator'

const props = defineProps({
  original: { type: Object, default: null },
  result: { type: Object, default: null },
  summary: { type: Object, default: null },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['apply'])

const viewMode = ref('result') // result / original
const baseTable = computed(() => (viewMode.value === 'original' ? props.original : props.result))

const settings = reactive({
  garble: true,
  trim: true,
  normalizeBool: true,
  dropEmpty: true,
})

const translating = ref(false)
const translateProgress = reactive({ done: 0, total: 0 })
const translateColumns = ref([])
const translateFrom = ref('auto')
const translateTo = ref('zh')
const translateEnglishSegmentsOnly = ref(true)

const availableColumns = computed(() => baseTable.value?.headers ?? [])
const allSelected = computed(() => {
  const all = availableColumns.value
  return all.length > 0 && translateColumns.value.length === all.length
})

function selectAllTranslateCols() {
  translateColumns.value = [...availableColumns.value]
}

function clearTranslateCols() {
  translateColumns.value = []
}

function ensureBase() {
  const t = baseTable.value
  if (!t) {
    ElMessage.warning('请先上传 Excel 文件')
    return null
  }
  return t
}

function applyCleaning() {
  const t0 = ensureBase()
  if (!t0) return
  let t = cloneTable(t0)
  if (settings.garble) t = cleanGarble(t)
  if (settings.trim) t = trimCells(t)
  if (settings.normalizeBool) t = normalizeBooleans(t)
  if (settings.dropEmpty) t = removeEmptyRowsAndCols(t)
  emit('apply', 'Excel 整理（乱码/空白/布尔/空行列）', t)
}

function resetToOriginal() {
  const t0 = props.original
  if (!t0) return
  emit('apply', '重置为原始数据', cloneTable(t0))
}

async function applyTranslate() {
  const t0 = ensureBase()
  if (!t0) return
  const cols = translateColumns.value?.length ? translateColumns.value : []
  if (!cols.length) {
    ElMessage.warning('请选择要翻译的列')
    return
  }

  translating.value = true
  translateProgress.done = 0
  translateProgress.total = 0
  try {
    const next = cloneTable(t0)

    // 先提取唯一文本 / 或仅提取英文片段（中英混杂更友好）
    const texts = []
    const segRegex = /[A-Za-z][A-Za-z0-9&/'().,_-]*(?:[ ]+[A-Za-z0-9&/'().,_-]+)*/g
    const shouldTranslateSegmentsOnly = () => {
      const f = translateFrom.value
      // 只有当“源语言=自动/英语”时，片段模式才更合理
      return translateEnglishSegmentsOnly.value && (f === 'auto' || f === 'en')
    }

    for (const row of next.rows) {
      for (const c of cols) {
        const v = row?.[c]
        if (v == null) continue
        if (typeof v !== 'string') continue
        const s = v.trim()
        if (!s) continue
        if (shouldTranslateSegmentsOnly()) {
          const segs = s.match(segRegex) || []
          for (const seg of segs) {
            const t = seg.trim()
            if (t.length >= 2) texts.push(t)
          }
        } else {
          texts.push(s)
        }
      }
    }

    let from = translateFrom.value
    let to = translateTo.value
    if (to === 'auto') to = 'zh'
    if (from === 'auto') {
      from = detectLangAuto(texts)
      if (to === from) to = from === 'zh' ? 'en' : 'zh'
    }

    const { map, stats } = await translateBatch({
      texts,
      from,
      to,
      onProgress: (d, total) => {
        translateProgress.done = d
        translateProgress.total = total
      },
      batchSize: 80,
    })

    if (stats.total > 0 && stats.changed === 0) {
      // 没有任何变化：大概率是 API 返回原文 / 或被限流 / 或 CORS
      ElMessage.warning('翻译未产生任何变化（可能是接口限流/CORS/返回原文）。请稍后重试或更换目标语言。')
      return
    }

    let changedCells = 0
    for (const row of next.rows) {
      for (const c of cols) {
        const v = row?.[c]
        if (typeof v === 'string' && v.trim()) {
          const raw = v.trim()
          if (shouldTranslateSegmentsOnly()) {
            let out = raw
            const segs = raw.match(segRegex) || []
            for (const seg of segs) {
              const rep = map[seg.trim()]
              if (rep && rep !== seg) out = out.split(seg).join(rep)
            }
            if (out !== raw) {
              row[c] = out
              changedCells++
            }
          } else {
            const rep = map[raw]
            if (rep && rep !== raw) {
              row[c] = rep
              changedCells++
            }
          }
        }
      }
    }

    emit('apply', `翻译（${from}→${to}）`, next)
    ElMessage.success(`翻译完成：更新 ${changedCells} 个单元格`)
  } catch (e) {
    console.error('translate failed:', e)
    ElMessage.error(`翻译失败：${e?.message || String(e)}`)
  } finally {
    translating.value = false
  }
}
</script>

<template>
  <div class="panel" :class="{ compact: props.compact }">
    <div class="panel-hd">
      <div class="title">操作面板</div>
      <div class="sub">选择功能并执行，结果会同步到中间预览</div>
    </div>

    <div class="panel-body">
      <el-card shadow="never" class="card">
        <template #header>数据源</template>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button label="result">当前结果</el-radio-button>
          <el-radio-button label="original">原始数据</el-radio-button>
        </el-radio-group>
      </el-card>

      <el-card shadow="never" class="card">
        <template #header>功能1：Excel 整理</template>
        <el-checkbox v-model="settings.garble">自动处理乱码</el-checkbox>
        <el-checkbox v-model="settings.trim">去除首尾空格</el-checkbox>
        <el-checkbox v-model="settings.normalizeBool">布尔值标准化（是/否）</el-checkbox>
        <el-checkbox v-model="settings.dropEmpty">删除完全空白行/列</el-checkbox>
        <div class="btns">
          <el-button type="primary" :disabled="!baseTable" @click="applyCleaning">执行整理</el-button>
          <el-button :disabled="!props.original" @click="resetToOriginal">重置</el-button>
        </div>
      </el-card>

      <el-card shadow="never" class="card">
        <template #header>摘要（概览）</template>
        <div v-if="props.summary" class="sum">
          <div class="sum-row">行：{{ props.summary.rowCount }} 列：{{ props.summary.colCount }}</div>
          <div class="sum-row">关键列：{{ props.summary.keyColumns.join('、') || '—' }}</div>
        </div>
        <div v-else class="hint">上传后自动生成（中间“智能摘要”也可查看）。</div>
      </el-card>

      <el-card shadow="never" class="card">
        <template #header>功能3：多语言翻译（免费 API）</template>
        <div class="row-actions">
          <el-button size="small" :disabled="!baseTable || translating || allSelected" @click="selectAllTranslateCols">
            全选
          </el-button>
          <el-button size="small" :disabled="!baseTable || translating || translateColumns.length === 0" @click="clearTranslateCols">
            取消全选
          </el-button>
        </div>
        <el-checkbox v-model="translateEnglishSegmentsOnly" :disabled="translating" style="margin-bottom: 8px">
          中英混杂时仅翻译英文片段
        </el-checkbox>
        <el-select
          v-model="translateColumns"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择要翻译的列"
          style="width: 100%"
          :disabled="!baseTable || translating"
        >
          <el-option v-for="c in availableColumns" :key="c" :label="c" :value="c" />
        </el-select>

        <div style="height: 10px" />

        <div class="lang-row">
          <el-select v-model="translateFrom" style="width: 100%" size="small" :disabled="translating">
            <el-option v-for="l in LANGS" :key="'from_' + l.code" :label="'源语言：' + l.label" :value="l.code" />
          </el-select>
          <el-select v-model="translateTo" style="width: 100%" size="small" :disabled="translating">
            <el-option v-for="l in LANGS.filter(x=>x.code!=='auto')" :key="'to_' + l.code" :label="'目标语言：' + l.label" :value="l.code" />
          </el-select>
        </div>

        <div class="hint">
          优化：去重后翻译并缓存到 localStorage；MyMemory 失败会自动降级 LibreTranslate。
        </div>

        <div v-if="translating" class="prog">
          <el-progress
            :percentage="translateProgress.total ? Math.round((translateProgress.done / translateProgress.total) * 100) : 0"
          />
          <div class="hint">翻译进度：{{ translateProgress.done }}/{{ translateProgress.total }}</div>
        </div>

        <div class="btns">
          <el-button type="primary" :disabled="!baseTable || translating" @click="applyTranslate">开始翻译</el-button>
        </div>
      </el-card>

      <!-- 右侧说明类卡片先移除，保留高频功能：清洗 + 翻译 -->
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
}
.panel.compact .panel-hd {
  display: none;
}
.panel.compact .panel-body {
  padding: 0;
  overflow: visible;
}
.panel-hd {
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent);
}
.title {
  font-size: 14px;
  font-weight: 800;
}
.sub {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
}
.panel-body {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.sum-row {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  padding: 5px 0;
}
.prog {
  margin-top: 10px;
}
.lang-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.row-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
</style>

