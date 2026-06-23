export { getXBogus, type XBogusResult } from './xbogus.js'
export { getABogus, generateBrowserFingerprint, type ABogusResult, type ABogusOptions } from './abogus.js'

import { getConfig } from '../config/index.js'

export function generateFakeMsToken(length: number = 128): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function fetchRealMsToken(): Promise<string> {
  const config = getConfig()
  const msTokenConfig = config.msToken

  const payload = {
    magic: msTokenConfig.magic,
    version: msTokenConfig.version,
    dataType: msTokenConfig.dataType,
    strData: msTokenConfig.strData,
    ulr: msTokenConfig.ulr,
    tspFromClient: Date.now(),
  }

  const response = await fetch(msTokenConfig.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': config.userAgent,
    },
    body: JSON.stringify(payload),
  })

  const cookies: string[] = response.headers.getSetCookie?.() || []

  for (const cookie of cookies) {
    if (cookie.startsWith('msToken=')) {
      const msToken = cookie.split(';')[0].split('=')[1]
      // 服务器返回的 msToken 长度可能有变化，放宽验证范围
      // 实测返回 183，Python f2 检查 [164, 184]
      if (msToken.length >= 100 && msToken.length <= 200) {
        return msToken
      }
    }
  }

  // fallback: 使用 get('set-cookie') 方式
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) {
    const match = /msToken=([^;]+)/.exec(setCookie)
    if (match) {
      const msToken = match[1]
      if (msToken.length >= 100 && msToken.length <= 200) {
        return msToken
      }
    }
  }

  return generateFakeMsToken()
}

// 为了向后兼容，保留同步版本（使用 fake token）
export function generateMsToken(length: number = 128): string {
  return generateFakeMsToken(length)
}
