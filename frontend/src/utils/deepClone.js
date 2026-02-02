import { isProxy, toRaw } from 'vue'

function isPlainObject(x) {
  if (!x || typeof x !== 'object') return false
  const proto = Object.getPrototypeOf(x)
  return proto === Object.prototype || proto === null
}

/**
 * 把 Vue 深层 Proxy 全部转成普通对象/数组，避免 structuredClone 报错。
 * 也能处理循环引用（用 WeakMap）。
 */
export function deepDeproxy(value, seen = new WeakMap()) {
  const v = isProxy(value) ? toRaw(value) : value
  if (v == null) return v

  const t = typeof v
  if (t !== 'object') return v

  if (seen.has(v)) return seen.get(v)

  // Date/RegExp/Map/Set 等让 structuredClone 自己处理，直接返回即可
  if (v instanceof Date || v instanceof RegExp || v instanceof Map || v instanceof Set) return v

  if (Array.isArray(v)) {
    const out = []
    seen.set(v, out)
    for (const item of v) out.push(deepDeproxy(item, seen))
    return out
  }

  if (isPlainObject(v)) {
    const out = {}
    seen.set(v, out)
    for (const [k, val] of Object.entries(v)) out[k] = deepDeproxy(val, seen)
    return out
  }

  // 其他对象（比如 File/Blob/DOM 等）直接返回，避免破坏结构
  return v
}

export function deepCloneSafe(value) {
  return structuredClone(deepDeproxy(value))
}

