import { detectAnomalies } from './cleaners'

function guessType(values) {
  let nNum = 0
  let nDate = 0
  let nText = 0
  for (const v of values) {
    if (v == null || (typeof v === 'string' && v.trim() === '')) continue
    if (v instanceof Date) nDate++
    else if (typeof v === 'number') nNum++
    else if (typeof v === 'string') {
      const s = v.trim()
      if (!Number.isNaN(Number(s)) && /[0-9]/.test(s)) nNum++
      else if (!Number.isNaN(Date.parse(s)) && /[-/年月日]/.test(s)) nDate++
      else nText++
    } else nText++
  }
  if (nNum >= nText && nNum >= nDate) return 'number'
  if (nDate >= nText && nDate >= nNum) return 'date'
  return 'text'
}

export function buildSummary(table) {
  const rowCount = table?.rows?.length ?? 0
  const colCount = table?.headers?.length ?? 0
  const sample = table.rows.slice(0, 300)

  const columns = table.headers.map((h) => {
    const vals = sample.map((r) => r?.[h])
    const uniq = new Set(vals.map((x) => String(x ?? '').trim())).size
    const uniqRate = vals.length ? uniq / vals.length : 0
    const type = guessType(vals)
    return { key: h, uniqRate, type }
  })

  // 关键列识别
  const keyWords = ['名称', 'name', 'ID', '编号', '金额', 'amount', '价格', 'price', '日期', 'date', '时间', 'time']
  const keywordHits = columns
    .filter((c) => keyWords.some((k) => c.key.toLowerCase().includes(String(k).toLowerCase())))
    .map((c) => c.key)

  const idLike = columns.filter((c) => c.uniqRate > 0.85).map((c) => c.key)
  const numericCols = columns.filter((c) => c.type === 'number').map((c) => c.key)
  const dateCols = columns.filter((c) => c.type === 'date').map((c) => c.key)

  // 数值统计
  const numericStats = numericCols.slice(0, 8).map((k) => {
    const nums = sample
      .map((r) => r?.[k])
      .map((v) => (typeof v === 'number' ? v : Number(String(v ?? '').trim())))
      .filter((x) => Number.isFinite(x))
    if (!nums.length) return { key: k, sum: null, avg: null, min: null, max: null }
    const sum = nums.reduce((a, b) => a + b, 0)
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    return { key: k, sum, avg: sum / nums.length, min, max }
  })

  // 日期范围
  const dateRanges = dateCols.slice(0, 6).map((k) => {
    const ds = sample
      .map((r) => r?.[k])
      .map((v) => (v instanceof Date ? v : new Date(String(v ?? ''))))
      .filter((d) => !Number.isNaN(d.getTime()))
    if (!ds.length) return { key: k, start: null, end: null }
    ds.sort((a, b) => a.getTime() - b.getTime())
    return { key: k, start: ds[0], end: ds[ds.length - 1] }
  })

  const anomaly = detectAnomalies(table)

  // 自然语言摘要
  const keySet = Array.from(new Set([...keywordHits, ...idLike])).slice(0, 6)
  const summaryText = [
    `共 ${rowCount} 行、${colCount} 列数据。`,
    keySet.length ? `识别到关键列：${keySet.join('、')}。` : '',
    numericCols.length ? `数值列 ${numericCols.length} 个（示例：${numericCols.slice(0, 3).join('、')}）。` : '',
    dateCols.length ? `日期列 ${dateCols.length} 个（示例：${dateCols.slice(0, 3).join('、')}）。` : '',
    anomaly.issues.length ? `检测到潜在问题：${anomaly.issues.slice(0, 3).join('；')}。` : '',
  ]
    .filter(Boolean)
    .join('')

  return {
    rowCount,
    colCount,
    keyColumns: keySet,
    numericCols,
    dateCols,
    numericStats,
    dateRanges,
    anomaly,
    summaryText,
  }
}

