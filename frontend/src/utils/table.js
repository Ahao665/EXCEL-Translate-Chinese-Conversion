import { deepCloneSafe } from './deepClone'

function normalizeHeader(h, idx, used) {
  let s = String(h ?? '').trim()
  if (!s) s = `列${idx + 1}`
  let out = s
  let n = 2
  while (used.has(out)) {
    out = `${s}_${n++}`
  }
  used.add(out)
  return out
}

function isEmptyCell(v) {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  return false
}

export function inferHeaderRowIndex(aoa, { maxScanRows = 12 } = {}) {
  const rows = Array.isArray(aoa) ? aoa : []
  const scan = Math.min(rows.length, maxScanRows)
  let best = { idx: 0, score: -Infinity }

  for (let i = 0; i < scan; i++) {
    const r = rows[i] || []
    const nonEmpty = r.filter((x) => !isEmptyCell(x)).length
    if (nonEmpty < 2) continue

    const texts = r
      .filter((x) => !isEmptyCell(x))
      .map((x) => String(x).trim())
      .filter((s) => s.length > 0)
    const uniq = new Set(texts).size
    const uniqRate = texts.length ? uniq / texts.length : 0

    // “封面/标题行”通常非空少、或者只有 1-2 个合并标题
    // “表头行”通常非空多、且重复率低
    const score = nonEmpty * 5 + uniqRate * 10 - (texts.length <= 2 ? 6 : 0)
    if (score > best.score) best = { idx: i, score }
  }

  return best.idx
}

export function aoaToTable(aoa, { headerRowIndex } = {}) {
  const safeAoa = Array.isArray(aoa) ? aoa : []
  const hIdx = Number.isFinite(headerRowIndex) ? headerRowIndex : 0
  const headerRow = (safeAoa[hIdx] || []).map((x) => String(x ?? '').trim())
  const used = new Set()
  const headers = headerRow.map((h, idx) => normalizeHeader(h, idx, used))

  const rows = []
  for (let r = hIdx + 1; r < safeAoa.length; r++) {
    const rowArr = safeAoa[r] || []
    const obj = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = rowArr[c] ?? ''
    }
    rows.push(obj)
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    colCount: headers.length,
  }
}

export function tableToAoa(table) {
  if (!table) return [[]]
  const aoa = [table.headers]
  for (const row of table.rows) {
    aoa.push(table.headers.map((h) => row?.[h] ?? ''))
  }
  return aoa
}

export function cloneTable(table) {
  if (!table) return null
  return deepCloneSafe(table)
}

