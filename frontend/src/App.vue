<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import FileDropZone from './components/FileDropZone.vue'
import StatusBar from './components/StatusBar.vue'
import DataTable from './components/DataTable.vue'
import { useExcel } from './composables/useExcel'
import { cloneTable } from './utils/table'
import { detectLangForText, translateBatch } from './utils/translator'

const {
  fileName,
  workbookMeta,
  sheetTables,
  loadExcelFile,
  exportResultAsXlsx,
} = useExcel()

const status = ref({ stage: 'idle', message: '等待上传 Excel 文件', percent: 0 })
const activeMainTab = ref('original') // original | result
const originalPage = ref(1)
const resultPage = ref(1)
const translatingAll = ref(false)

const sheetNames = computed(() => workbookMeta.value?.sheetNames || [])
const originalSheetName = computed(() => sheetNames.value[originalPage.value - 1] || '')
const resultSheetName = computed(() => sheetNames.value[resultPage.value - 1] || '')

const originalTable = computed(() => {
  const name = originalSheetName.value
  return name ? sheetTables.value?.[name]?.original || null : null
})
const resultTable = computed(() => {
  const name = resultSheetName.value
  return name ? sheetTables.value?.[name]?.result || null : null
})

async function onFilePicked(file) {
  status.value = { stage: 'loading', message: '正在读取 Excel…', percent: 15 }
  await loadExcelFile(file, (p) => (status.value = { stage: 'loading', message: '正在解析 Excel…', percent: p }))
  originalPage.value = 1
  resultPage.value = 1
  activeMainTab.value = 'original'
  status.value = { stage: 'ready', message: '已导入，可开始翻译全部', percent: 100 }
}

function labelForPage(i) {
  const name = sheetNames.value[i - 1]
  return name ? `第 ${i} 页（${name}）` : `第 ${i} 页`
}

function isTranslatable(v) {
  return typeof v === 'string' && v.trim() !== ''
}

function extractEnglishSegments(s) {
  const segRegex = /[A-Za-z][A-Za-z0-9&/'().,_-]*(?:[ ]+[A-Za-z0-9&/'().,_-]+)*/g
  return String(s).match(segRegex) || []
}

async function translateAll() {
  if (translatingAll.value) return
  const names = sheetNames.value
  if (!names.length) {
    ElMessage.warning('请先上传 Excel 文件')
    return
  }

  translatingAll.value = true
  status.value = { stage: 'processing', message: '正在准备翻译全部工作簿…', percent: 5 }
  try {
    const byLang = {} // { lang: Set<string> }
    const englishSegs = new Set()

    for (const sheet of names) {
      const t = sheetTables.value?.[sheet]?.original
      if (!t) continue
      // 先处理表头（列名）
      for (const h of t.headers) {
        if (!isTranslatable(h)) continue
        const s = h.trim()
        for (const seg of extractEnglishSegments(s)) {
          const x = seg.trim()
          if (x.length >= 2) englishSegs.add(x)
        }
        const lang = detectLangForText(s)
        if (!byLang[lang]) byLang[lang] = new Set()
        byLang[lang].add(s)
      }
      // 再处理每个单元格
      for (const row of t.rows) {
        for (const h of t.headers) {
          const v = row?.[h]
          if (!isTranslatable(v)) continue
          const s = v.trim()
          for (const seg of extractEnglishSegments(s)) {
            const x = seg.trim()
            if (x.length >= 2) englishSegs.add(x)
          }
          const lang = detectLangForText(s)
          if (!byLang[lang]) byLang[lang] = new Set()
          byLang[lang].add(s)
        }
      }
    }

    const target = 'zh'
    delete byLang.zh
    delete byLang.unknown

    const tasks = []
    if (englishSegs.size) tasks.push({ from: 'en', texts: Array.from(englishSegs) })
    if (byLang.en?.size) tasks.push({ from: 'en', texts: Array.from(byLang.en) })
    for (const [from, set] of Object.entries(byLang)) {
      if (from === 'en') continue
      tasks.push({ from, texts: Array.from(set) })
    }

    const total = tasks.reduce((a, t) => a + t.texts.length, 0)
    let doneBase = 0
    const mapsByFrom = {} // { from: { text: translated } }

    for (const task of tasks) {
      const { from, texts } = task
      if (!texts.length) continue
      const { map } = await translateBatch({
        texts,
        from,
        to: target,
        onProgress: (d) => {
          const done = doneBase + d
          const pct = total ? Math.min(99, Math.round((done / total) * 95)) : 10
          status.value = { stage: 'processing', message: `正在翻译全部：${done}/${total}`, percent: pct }
        },
        batchSize: 80,
      })
      mapsByFrom[from] = map
      doneBase += texts.length
    }

    let changedSheets = 0
    for (const sheet of names) {
      const orig = sheetTables.value?.[sheet]?.original
      if (!orig) continue
      const next = cloneTable(orig)
      let changedCells = 0
      // 先翻译列名（表头）
      for (let i = 0; i < next.headers.length; i++) {
        const oldKey = next.headers[i]
        if (!isTranslatable(oldKey)) continue
        const rawH = oldKey.trim()
        let outH = rawH

        const enMap = mapsByFrom.en || {}
        const segsH = extractEnglishSegments(rawH)
        if (segsH.length) {
          for (const seg of segsH) {
            const rep = enMap[seg.trim()]
            if (rep && rep !== seg) outH = outH.split(seg).join(rep)
          }
        }

        const langH = detectLangForText(rawH)
        const wholeH = mapsByFrom[langH]?.[rawH]
        if (wholeH && wholeH !== rawH) outH = wholeH

        if (outH !== rawH) {
          const newKey = outH
          next.headers[i] = newKey
          // 需要同步更新每行的键
          for (const row of next.rows) {
            if (Object.prototype.hasOwnProperty.call(row, oldKey)) {
              row[newKey] = row[oldKey]
              delete row[oldKey]
            }
          }
          changedCells++
        }
      }
      // 再翻译单元格内容
      for (const row of next.rows) {
        for (const h of next.headers) {
          const v = row?.[h]
          if (!isTranslatable(v)) continue
          const raw = v.trim()
          let out = raw

          const enMap = mapsByFrom.en || {}
          const segs = extractEnglishSegments(raw)
          if (segs.length) {
            for (const seg of segs) {
              const rep = enMap[seg.trim()]
              if (rep && rep !== seg) out = out.split(seg).join(rep)
            }
          }

          const lang = detectLangForText(raw)
          const whole = mapsByFrom[lang]?.[raw]
          if (whole && whole !== raw) out = whole

          if (out !== raw) {
            row[h] = out
            changedCells++
          }
        }
      }
      sheetTables.value[sheet].result = next
      if (changedCells > 0) changedSheets++
    }

    // 二次检测：如果翻译后仍残留英文片段，再集中尝试一次英文→中文
    const remainingSegs = new Set()
    for (const sheet of names) {
      const res = sheetTables.value?.[sheet]?.result
      if (!res) continue
      // 列名中的残留英文
      for (const h of res.headers) {
        if (!isTranslatable(h)) continue
        const text = h.trim()
        if (/[\u4E00-\u9FFF]/.test(text)) continue
        for (const seg of extractEnglishSegments(text)) {
          const t = seg.trim()
          if (t.length >= 2) remainingSegs.add(t)
        }
      }
      // 单元格中的残留英文
      for (const row of res.rows) {
        for (const h of res.headers) {
          const v = row?.[h]
          if (!isTranslatable(v)) continue
          const text = v.trim()
          // 已经包含中文的就略过
          if (/[\u4E00-\u9FFF]/.test(text)) continue
          for (const seg of extractEnglishSegments(text)) {
            const t = seg.trim()
            if (t.length >= 2) remainingSegs.add(t)
          }
        }
      }
    }

    if (remainingSegs.size) {
      const { map } = await translateBatch({
        texts: Array.from(remainingSegs),
        from: 'en',
        to: target,
        onProgress: () => {},
        batchSize: 80,
      })

      for (const sheet of names) {
        const res = sheetTables.value?.[sheet]?.result
        if (!res) continue
        // 列名的二次替换
        for (let i = 0; i < res.headers.length; i++) {
          const rawH = res.headers[i]
          if (!isTranslatable(rawH)) continue
          if (!/[A-Za-z]/.test(rawH)) continue
          let outH = rawH
          const segsH = extractEnglishSegments(rawH)
          for (const seg of segsH) {
            const rep = map[seg.trim()]
            if (rep && rep !== seg) outH = outH.split(seg).join(rep)
          }
          if (outH !== rawH) {
            const newKey = outH
            res.headers[i] = newKey
            for (const row of res.rows) {
              if (Object.prototype.hasOwnProperty.call(row, rawH)) {
                row[newKey] = row[rawH]
                delete row[rawH]
              }
            }
          }
        }
        // 单元格的二次替换
        for (const row of res.rows) {
          for (const h of res.headers) {
            const v = row?.[h]
            if (!isTranslatable(v)) continue
            const raw = v.trim()
            if (!/[A-Za-z]/.test(raw)) continue
            let out = raw
            const segs = extractEnglishSegments(raw)
            for (const seg of segs) {
              const rep = map[seg.trim()]
              if (rep && rep !== seg) out = out.split(seg).join(rep)
            }
            if (out !== raw) row[h] = out
          }
        }
      }
    }

    status.value = { stage: 'ready', message: `翻译完成：生成 ${changedSheets}/${names.length} 页结果`, percent: 100 }
    activeMainTab.value = 'result'
    resultPage.value = 1
    ElMessage.success('翻译全部完成（结果页已生成，导出会按页插入翻译页）')
  } catch (e) {
    console.error(e)
    status.value = { stage: 'idle', message: `翻译失败：${e?.message || String(e)}`, percent: 0 }
    ElMessage.error(`翻译失败：${e?.message || String(e)}`)
  } finally {
    translatingAll.value = false
  }
}
</script>

<template>
  <div class="app-shell simple">
    <aside class="left-nav">
      <div class="brand">
        <div class="brand-title">Excel 全表翻译</div>
        <div class="brand-sub">上传后一键翻译全部工作簿（自动识别每个单元格语言）</div>
      </div>

      <div class="left-actions">
        <FileDropZone @file="onFilePicked" />

        <div v-if="fileName" class="file-meta">
          <div class="meta-row">
            <span class="meta-label">文件</span>
            <span class="meta-value">{{ fileName }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">页数</span>
            <span class="meta-value">{{ sheetNames.length }}</span>
          </div>
        </div>

        <el-divider />

        <el-button type="primary" :disabled="!sheetNames.length || translatingAll" @click="translateAll">
          翻译全部（自动识别）
        </el-button>
        <el-button :disabled="!sheetNames.length" @click="exportResultAsXlsx()">导出（原页+翻译页交错）</el-button>

        <div class="hint">
          导出规则：第2页为第1页翻译，第4页为第3页翻译……翻译页紧跟在对应原页后面。
        </div>
      </div>
    </aside>

    <main class="center">
      <div class="topbar">
        <el-tabs v-model="activeMainTab" class="main-tabs">
          <el-tab-pane label="原始数据" name="original" />
          <el-tab-pane label="处理结果（翻译后）" name="result" />
        </el-tabs>
        <div class="topbar-right">
          <el-button type="primary" :disabled="!sheetNames.length" @click="exportResultAsXlsx()">导出 Excel</el-button>
        </div>
      </div>

      <div class="main-body">
        <div v-if="activeMainTab === 'original'" class="pane">
          <div class="pane-toolbar">
            <el-select v-model="originalPage" size="small" style="width: 280px" :disabled="!sheetNames.length">
              <el-option v-for="i in sheetNames.length" :key="'o'+i" :label="labelForPage(i)" :value="i" />
            </el-select>
          </div>
          <DataTable :table="originalTable" height="540" />
        </div>

        <div v-else class="pane">
          <div class="pane-toolbar">
            <el-select v-model="resultPage" size="small" style="width: 280px" :disabled="!sheetNames.length">
              <el-option v-for="i in sheetNames.length" :key="'r'+i" :label="labelForPage(i)" :value="i" />
            </el-select>
            <el-tag v-if="sheetNames.length && !resultTable" type="warning" style="margin-left: 10px">
              该页尚未生成翻译结果（请先点“翻译全部”）
            </el-tag>
          </div>
          <DataTable :table="resultTable" height="540" />
        </div>
      </div>

      <StatusBar :status="status" />
    </main>

  </div>
</template>
