import * as os from 'os'

const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g

export function genRandomStr(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function getTimestamp(): number {
  return Date.now()
}

export function extractValidUrls(input: string): string | null
export function extractValidUrls(input: string[]): string[]
export function extractValidUrls(input: string | string[]): string | string[] | null {
  if (typeof input === 'string') {
    const matches = input.match(URL_REGEX)
    return matches ? matches[0] : null
  }

  const result: string[] = []
  for (const item of input) {
    const matches = item.match(URL_REGEX)
    if (matches) {
      result.push(...matches)
    }
  }
  return result
}

export function splitFilename(filename: string, limits: Record<string, number>): string {
  const platform = os.platform()
  let limit: number

  switch (platform) {
    case 'win32':
    case 'cygwin':
      limit = limits['win32'] || 200
      break
    case 'darwin':
      limit = limits['darwin'] || 200
      break
    default:
      limit = limits['linux'] || 200
  }

  if (filename.length <= limit) {
    return filename
  }

  // eslint-disable-next-line no-control-regex -- 需移除文件名中的控制字符
  const safeFilename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  return safeFilename.slice(0, limit)
}

export function toBase36(num: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
  let result = ''
  while (num > 0) {
    result = chars[num % 36] + result
    num = Math.floor(num / 36)
  }
  return result || '0'
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
