export const garbleReplacements = [
  // 常见 UTF-8/Windows-1252 误解码
  ['â€œ', '“'],
  ['â€', '”'],
  ['â€˜', '‘'],
  ['â€™', '’'],
  ['â€“', '–'],
  ['â€”', '—'],
  ['â€¦', '…'],
  ['Â ', ' '],
  ['Â', ''],
  ['Ã—', '×'],
  ['Ã·', '÷'],
  ['â’', '−'],
  // 破折号/空格类
  ['\u00A0', ' '], // nbsp
]

export function fixGarbleString(input) {
  let s = String(input ?? '')
  for (const [from, to] of garbleReplacements) {
    if (s.includes(from)) s = s.split(from).join(to)
  }
  return s
}

