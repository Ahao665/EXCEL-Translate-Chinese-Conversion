import axios from 'axios'
import { franc } from 'franc-min'

const LS_KEY = 'excel_tool_translation_cache_v1'

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache))
  } catch {
    // ignore
  }
}

function normKey(text, from, to) {
  return `${from}->${to}::${String(text ?? '')}`
}

export function isProbablyEnglish(s) {
  const str = String(s ?? '')
  if (!str) return false
  const letters = (str.match(/[A-Za-z]/g) || []).length
  const total = str.length
  return total > 0 && letters / total > 0.55
}

export function guessLangSimple(s) {
  const str = String(s ?? '')
  if (!str.trim()) return 'unknown'
  if (/[\u4E00-\u9FFF]/.test(str)) return 'zh'
  if (/[\u3040-\u30FF]/.test(str)) return 'ja'
  if (/[\uAC00-\uD7AF]/.test(str)) return 'ko'
  if (/[\u0400-\u04FF]/.test(str)) return 'ru'
  if (isProbablyEnglish(str)) return 'en'
  // 默认：拉丁字母为主的按英语处理
  if (/[A-Za-z]/.test(str)) return 'en'
  return 'unknown'
}

// franc-min 识别结果（ISO639-3）到我们语言码
const FRANC_TO_LANG = {
  eng: 'en',
  cmn: 'zh',
  zho: 'zh',
  jpn: 'ja',
  kor: 'ko',
  fra: 'fr',
  fre: 'fr',
  deu: 'de',
  ger: 'de',
  spa: 'es',
  por: 'pt',
  ita: 'it',
  rus: 'ru',
  arb: 'ar',
  ara: 'ar',
  hin: 'hi',
}

export function detectLangAuto(texts) {
  // texts: string[]
  const sample = (Array.isArray(texts) ? texts : []).filter(Boolean).slice(0, 80)
  if (!sample.length) return 'en'
  // franc 对短文本不太准，拼接后识别更稳
  const joined = sample.map((s) => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean).join('. ')
  const code3 = franc(joined, { minLength: 10 })
  const mapped = FRANC_TO_LANG[code3]
  if (mapped) return mapped

  // 回退：对每条投票（+简单规则兜底）
  const votes = {}
  for (const s of sample) {
    const c = franc(String(s), { minLength: 8 })
    const m = FRANC_TO_LANG[c] || guessLangSimple(s)
    votes[m] = (votes[m] || 0) + 1
  }
  const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0]
  return winner && winner !== 'unknown' ? winner : 'en'
}

export function detectLangForText(text) {
  const s = String(text ?? '').trim()
  if (!s) return 'unknown'
  // 先用简单规则快速判断 CJK/拉丁等
  const simple = guessLangSimple(s)
  // 对中文/日文/韩文/俄文这类字符明显的，直接返回
  if (simple !== 'en' && simple !== 'unknown') return simple

  // franc 对太短的文本不准
  const code3 = franc(s, { minLength: 8 })
  const mapped = FRANC_TO_LANG[code3]
  return mapped || simple
}

// 统一语言码（MyMemory / LibreTranslate）
export const LANGS = [
  { code: 'auto', label: '自动识别' },
  { code: 'en', label: '英语' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'it', label: '意大利语' },
  { code: 'ru', label: '俄语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'hi', label: '印地语' },
]

function toMyMemoryCode(code) {
  if (code === 'zh') return 'zh-CN'
  return code
}

async function translateMyMemory(q, from, to) {
  const url = 'https://api.mymemory.translated.net/get'
  const { data } = await axios.get(url, {
    params: { q, langpair: `${toMyMemoryCode(from)}|${toMyMemoryCode(to)}` },
    timeout: 15000,
  })
  const out = data?.responseData?.translatedText
  if (!out) throw new Error('MyMemory 无结果')
  return out
}

async function translateLibre(q, from, to) {
  // 使用公共实例（可能偶尔不稳定，作为降级）
  const url = 'https://libretranslate.de/translate'
  const { data } = await axios.post(
    url,
    { q, source: from === 'zh-CN' ? 'zh' : from, target: to === 'zh-CN' ? 'zh' : to, format: 'text' },
    { timeout: 20000, headers: { 'Content-Type': 'application/json' } },
  )
  const out = data?.translatedText
  if (!out) throw new Error('LibreTranslate 无结果')
  return out
}

export async function translateBatch({
  texts,
  from = 'en',
  to = 'zh',
  onProgress,
  batchSize = 50,
}) {
  const cache = loadCache()
  const uniq = Array.from(new Set(texts.map((t) => String(t ?? '')).filter((t) => t.trim() !== '')))

  const translated = {}
  const stats = {
    total: uniq.length,
    cached: 0,
    apiOk: 0,
    apiFail: 0,
    changed: 0,
    unchanged: 0,
    lastError: null,
  }
  let done = 0

  for (let i = 0; i < uniq.length; i++) {
    const t = uniq[i]
    const k = normKey(t, from, to)
    if (cache[k]) {
      translated[t] = cache[k]
      if (translated[t] !== t) stats.changed++
      else stats.unchanged++
      stats.cached++
      done++
      onProgress?.(done, uniq.length)
      continue
    }

    // 单条请求更稳（免费 API 对批量支持不一致）
    let out = null
    let lastErr = null
    for (let tryN = 0; tryN < 3; tryN++) {
      try {
        out = await translateMyMemory(t, from, to)
        break
      } catch (e) {
        lastErr = e
        await wait(300 * (tryN + 1))
      }
    }

    if (!out) {
      try {
        out = await translateLibre(t, from, to)
      } catch (e) {
        lastErr = e
      }
    }

    if (!out) {
      stats.apiFail++
      stats.lastError = lastErr
    } else {
      stats.apiOk++
    }

    translated[t] = out ?? t
    if (translated[t] !== t) stats.changed++
    else stats.unchanged++
    cache[k] = translated[t]
    saveCache(cache)
    done++
    onProgress?.(done, uniq.length)

    // 避免触发限流
    if (batchSize && done % batchSize === 0) {
      await wait(800)
    }
  }

  return { map: translated, stats }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

