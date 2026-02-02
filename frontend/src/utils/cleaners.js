import { fixGarbleString } from './garbleMap'
import { cloneTable } from './table'

function mapCells(table, mapper) {
  const next = cloneTable(table)
  if (!next) return next
  next.rows = next.rows.map((row) => {
    const out = { ...row }
    for (const h of next.headers) {
      out[h] = mapper(out[h], h)
    }
    return out
  })
  return next
}

export function cleanGarble(table) {
  return mapCells(table, (v) => {
    if (v == null) return v
    if (typeof v === 'string') return fixGarbleString(v)
    return v
  })
}

export function trimCells(table) {
  return mapCells(table, (v) => {
    if (typeof v !== 'string') return v
    return v.trim()
  })
}

export function normalizeBooleans(table) {
  const trueSet = new Set(['true', 'TRUE', 'True', '是', 'YES', 'Yes', '1'])
  const falseSet = new Set(['false', 'FALSE', 'False', '否', 'NO', 'No', '0'])
  return mapCells(table, (v) => {
    if (v == null) return v
    if (typeof v === 'boolean') return v ? '是' : '否'
    if (typeof v === 'number') {
      if (v === 1) return '是'
      if (v === 0) return '否'
      return v
    }
    if (typeof v === 'string') {
      const s = v.trim()
      if (trueSet.has(s)) return '是'
      if (falseSet.has(s)) return '否'
      return v
    }
    return v
  })
}

export function removeEmptyRowsAndCols(table) {
  const t = cloneTable(table)
  if (!t) return t

  const isEmpty = (v) => {
    if (v == null) return true
    if (typeof v === 'string') return v.trim() === ''
    return false
  }

  // 过滤空行
  t.rows = t.rows.filter((row) => t.headers.some((h) => !isEmpty(row?.[h])))

  // 过滤空列
  const keepHeaders = t.headers.filter((h) => t.rows.some((row) => !isEmpty(row?.[h])))
  t.headers = keepHeaders
  t.rows = t.rows.map((row) => {
    const out = {}
    for (const h of keepHeaders) out[h] = row?.[h] ?? ''
    return out
  })

  t.rowCount = t.rows.length
  t.colCount = t.headers.length
  return t
}

export function detectAnomalies(table, { maxSample = 200 } = {}) {
  if (!table) return { columns: [], issues: [] }

  const issues = []
  const columns = table.headers.map((h) => ({ key: h, emptyRate: 0, mixedType: false }))

  const rows = table.rows.slice(0, maxSample)
  for (const col of columns) {
    let empty = 0
    let hasNumber = false
    let hasText = false
    for (const row of rows) {
      const v = row?.[col.key]
      if (v == null || (typeof v === 'string' && v.trim() === '')) {
        empty++
        continue
      }
      if (typeof v === 'number') hasNumber = true
      else if (typeof v === 'string') {
        const s = v.trim()
        if (s === '') empty++
        else if (!Number.isNaN(Number(s)) && /[0-9]/.test(s)) hasNumber = true
        else hasText = true
      } else {
        hasText = true
      }
    }
    col.emptyRate = rows.length ? empty / rows.length : 0
    col.mixedType = hasNumber && hasText
    if (col.emptyRate > 0.6) issues.push(`列「${col.key}」空值较多（约 ${(col.emptyRate * 100).toFixed(0)}%）`)
    if (col.mixedType) issues.push(`列「${col.key}」可能存在格式不一致（数值/文本混用）`)
  }

  return { columns, issues }
}

