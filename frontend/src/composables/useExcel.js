import * as XLSX from 'xlsx'
import { ref } from 'vue'
import { aoaToTable, inferHeaderRowIndex, tableToAoa } from '../utils/table'
import { deepCloneSafe } from '../utils/deepClone'

/**
 * Table 结构：
 * {
 *   headers: string[],
 *   rows: Array<Record<string, any>>,
 *   rowCount: number,
 *   colCount: number,
 * }
 */
export function useExcel() {
  const fileName = ref('')
  const workbookMeta = ref(null) // { sheetName, sheetNames }
  const sheetAoaMap = ref({}) // { [sheetName]: aoa }

  const originalTable = ref(null)
  const resultTable = ref(null)

  // 按工作表保存“原始/结果”，切换 sheet 不丢
  const sheetTables = ref({}) // { [sheetName]: { original: Table, result: Table|null } }

  function sheetScore(aoa) {
    const rows = Array.isArray(aoa) ? aoa : []
    const scan = rows.slice(0, 50)
    let nonEmptyCells = 0
    let nonEmptyRows = 0
    for (const r of scan) {
      const c = (r || []).filter((x) => String(x ?? '').trim() !== '').length
      if (c > 0) nonEmptyRows++
      nonEmptyCells += c
    }
    return nonEmptyCells + nonEmptyRows * 10
  }

  function persistCurrentSheet() {
    const cur = workbookMeta.value?.sheetName
    if (!cur) return
    if (!originalTable.value) return
    sheetTables.value[cur] = {
      original: deepCloneSafe(originalTable.value),
      result: resultTable.value ? deepCloneSafe(resultTable.value) : null,
    }
  }

  function ensureSheetTables(sheetName) {
    if (sheetTables.value?.[sheetName]) return
    const aoa = sheetAoaMap.value?.[sheetName]
    if (!aoa) return
    const headerRowIndex = inferHeaderRowIndex(aoa)
    const table = aoaToTable(aoa, { headerRowIndex })
    sheetTables.value[sheetName] = { original: deepCloneSafe(table), result: null }
  }

  function setActiveSheet(sheetName) {
    if (!sheetName) return
    // 先保存当前 sheet 的结果
    persistCurrentSheet()

    ensureSheetTables(sheetName)
    const entry = sheetTables.value?.[sheetName]
    if (!entry) return

    workbookMeta.value = { sheetName, sheetNames: workbookMeta.value?.sheetNames || [] }
    originalTable.value = deepCloneSafe(entry.original)
    resultTable.value = entry.result ? deepCloneSafe(entry.result) : deepCloneSafe(entry.original)
  }

  async function loadExcelFile(file, onProgress) {
    if (!file) return
    fileName.value = file.name || ''

    const ext = (file.name || '').toLowerCase()
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
      throw new Error('仅支持 .xlsx/.xls/.csv 文件')
    }

    onProgress?.(25)
    const buf = await file.arrayBuffer()

    onProgress?.(55)
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, dense: true })
    const sheetNames = wb.SheetNames || []
    workbookMeta.value = { sheetName: sheetNames?.[0] || '', sheetNames }

    // 读取全部工作表，支持多页 & 智能挑选最“像数据表”的那页
    const map = {}
    let bestName = sheetNames?.[0] || ''
    let bestScore = -Infinity
    for (let i = 0; i < sheetNames.length; i++) {
      const name = sheetNames[i]
      const ws = wb.Sheets[name]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      map[name] = aoa
      const s = sheetScore(aoa)
      if (s > bestScore) {
        bestScore = s
        bestName = name
      }
      onProgress?.(60 + Math.round(((i + 1) / Math.max(sheetNames.length, 1)) * 30))
    }
    sheetAoaMap.value = map
    sheetTables.value = {}

    onProgress?.(92)
    // 预先构建所有工作表的 original，避免后续“找不到”
    for (const name of sheetNames) ensureSheetTables(name)
    setActiveSheet(bestName)
    onProgress?.(100)
  }

  function setResultTable(next) {
    resultTable.value = next
    // 同步保存到当前 sheet
    const cur = workbookMeta.value?.sheetName
    if (cur && sheetTables.value?.[cur]) {
      sheetTables.value[cur].result = deepCloneSafe(next)
    }
  }

  function resetResult() {
    resultTable.value = originalTable.value ? deepCloneSafe(originalTable.value) : null
    const cur = workbookMeta.value?.sheetName
    if (cur && sheetTables.value?.[cur]) sheetTables.value[cur].result = resultTable.value ? deepCloneSafe(resultTable.value) : null
  }

  function exportResultAsXlsx() {
    // 导出全工作簿：每个工作表两张 sheet（原始 + 翻译/结果）
    persistCurrentSheet()
    const sheets = workbookMeta.value?.sheetNames || Object.keys(sheetTables.value || {})
    if (!sheets.length) return
    const wb = XLSX.utils.book_new()

    const safeName = (name) => {
      const s = String(name || 'Sheet')
      // Excel sheet 名称最长 31
      return s.length > 31 ? s.slice(0, 31) : s
    }
    const makeTranslatedName = (name) => {
      const base = String(name || 'Sheet')
      const suffix = '_翻译'
      const maxBase = 31 - suffix.length
      return safeName((base.length > maxBase ? base.slice(0, maxBase) : base) + suffix)
    }

    for (const name of sheets) {
      const entry = sheetTables.value?.[name]
      if (!entry?.original) continue
      const aoaOrig = tableToAoa(entry.original)
      const wsOrig = XLSX.utils.aoa_to_sheet(aoaOrig)
      XLSX.utils.book_append_sheet(wb, wsOrig, safeName(name))

      // 翻译页紧跟在原页之后（页2翻译页1，页4翻译页3...）
      const res = entry.result || entry.original
      const aoaRes = tableToAoa(res)
      const wsRes = XLSX.utils.aoa_to_sheet(aoaRes)
      XLSX.utils.book_append_sheet(wb, wsRes, makeTranslatedName(name))
    }

    const name = (fileName.value ? fileName.value.replace(/\.(xlsx|xls|csv)$/i, '') : '结果') + '_result.xlsx'
    XLSX.writeFile(wb, name)
  }

  return {
    fileName,
    workbookMeta,
    sheetAoaMap,
    sheetTables,
    setActiveSheet,
    originalTable,
    resultTable,
    loadExcelFile,
    setResultTable,
    resetResult,
    exportResultAsXlsx,
  }
}

