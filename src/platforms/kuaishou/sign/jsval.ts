/**
 * JS 值语义（Number::toString / ToString / JSON.stringify / UTF-16 排序 / encodeURI）。
 *
 * 签名输入最终都拼成字符串再哈希，数字、键序、转义只要和浏览器差一个字符，签名就错。
 * `jsNumberToString` 与引擎自检过的 ECMAScript `Number::toString` 一致（含 -0 → "0"）。
 */

/** encodeURI 不转义的保留字符 */
export const ENCODE_URI_SAFE = ";,/?:@&=+$-_.!~*'()#"
/** encodeURIComponent 只保留这些 */
export const ENCODE_URI_COMPONENT_SAFE = "-_.!~*'()"

const JSON_ESCAPE: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

/** ECMAScript Number::toString（十进制）。超过 2^53 与浏览器同样丢精度。 */
export function jsNumberToString(value: number): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const x = Number(value)
  if (Number.isNaN(x)) return 'NaN'
  if (x === Infinity) return 'Infinity'
  if (x === -Infinity) return '-Infinity'
  // String(-0) 也是 "0"
  return x.toString()
}

/** ECMAScript ToString：`"" + value`。数组里的 null / undefined 变空串。 */
export function jsToString(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return jsNumberToString(value)
  if (Array.isArray(value)) {
    return value.map(v => (v == null ? '' : jsToString(v))).join(',')
  }
  return '[object Object]'
}

/** JSON.stringify 的字符串转义：只转义引号、反斜杠和控制字符，非 ASCII 原样保留。 */
export function jsQuoteString(text: string): string {
  let out = '"'
  for (const ch of text) {
    const esc = JSON_ESCAPE[ch]
    if (esc !== undefined) {
      out += esc
    } else if (ch < ' ') {
      const cp = ch.codePointAt(0) ?? 0
      out += `\\u${cp.toString(16).padStart(4, '0')}`
    } else {
      out += ch
    }
  }
  out += '"'
  return out
}

/**
 * JS `Array.prototype.sort` 默认序：按 UTF-16 码元比较，不是码点。
 * `"😀"` 的首个码元是 0xD83D，排在 `"\\uf000"` 之前。
 */
export function jsSorted(items: string[]): string[] {
  return items.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** 0 ~ 2^32-2 的规范十进制串（"0" 算，"00" / "01" / "-1" 不算）。 */
function isArrayIndex(key: string): boolean {
  if (!/^\d+$/.test(key)) return false
  if (key !== '0' && key.startsWith('0')) return false
  if (key.length > 10) return false
  const n = Number(key)
  return Number.isSafeInteger(n) && n < 4294967295
}

/** 自有属性枚举序：整数下标键按数值升序在前，其余按插入顺序。 */
export function jsOwnKeys(obj: Record<string, unknown>): string[] {
  const keys = Object.keys(obj).map(k => String(k))
  const idx = keys.filter(isArrayIndex).sort((a, b) => Number(a) - Number(b))
  const rest = keys.filter(k => !isArrayIndex(k))
  return idx.concat(rest)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON.stringify（无缩进）。数字走 Number::toString，非有限数出 null。 */
export function jsJsonStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return jsQuoteString(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return jsNumberToString(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(v => jsJsonStringify(v)).join(',')}]`
  }
  if (isPlainObject(value)) {
    const keys = jsOwnKeys(value)
    const parts = keys.map(k => `${jsQuoteString(k)}:${jsJsonStringify(value[k])}`)
    return `{${parts.join(',')}}`
  }
  return jsQuoteString(String(value))
}

/**
 * `urllib.parse.quote`：字母数字与 `_.-` 永不转义，safe 里的 ASCII 字节原样保留，其余按 UTF-8 百分号编码。
 */
export function percentEncode(text: string, safe: string): string {
  const safeBytes = new Set<number>()
  for (let i = 0; i < safe.length; i++) safeBytes.add(safe.charCodeAt(i) & 0xff)
  const bytes = Buffer.from(text, 'utf8')
  let out = ''
  for (const byte of bytes) {
    const unreserved =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      byte === 0x2d ||
      byte === 0x2e ||
      byte === 0x5f ||
      safeBytes.has(byte)
    if (unreserved) out += String.fromCharCode(byte)
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** JS encodeURI（比 encodeURIComponent 少转义保留字符）。 */
export function encodeUri(value: unknown): string {
  return percentEncode(jsToString(value), ENCODE_URI_SAFE)
}

/** JS encodeURIComponent。 */
export function encodeUriComponent(value: unknown): string {
  return percentEncode(jsToString(value), ENCODE_URI_COMPONENT_SAFE)
}

function isHexDigit(ch: string | undefined): boolean {
  if (!ch) return false
  return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

/** `urllib.parse.unquote`：百分号序列按 UTF-8 解码，`+` 不当作空格，非法 % 原样保留。 */
export function unquote(text: string): string {
  let out = ''
  const bytes: number[] = []
  const flush = () => {
    if (!bytes.length) return
    out += Buffer.from(bytes).toString('utf8')
    bytes.length = 0
  }
  for (let i = 0; i < text.length; ) {
    if (text[i] === '%' && isHexDigit(text[i + 1]) && isHexDigit(text[i + 2])) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 3
      continue
    }
    flush()
    const cp = text.codePointAt(i) ?? 0
    out += String.fromCodePoint(cp)
    i += cp > 0xffff ? 2 : 1
  }
  flush()
  return out
}
