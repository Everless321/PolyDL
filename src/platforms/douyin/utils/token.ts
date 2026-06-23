import { post } from '../client/http.js'
import { getMsTokenConfig, getTtwidConfig, getWebidConfig, getUserAgent } from '../config/index.js'
import { APIResponseError } from '../errors/index.js'
import { genRandomStr, getTimestamp } from './common.js'

export async function genRealMsToken(): Promise<string> {
  const config = getMsTokenConfig()
  const userAgent = getUserAgent()

  const payload = JSON.stringify({
    magic: config.magic,
    version: config.version,
    dataType: config.dataType,
    strData: config.strData,
    ulr: config.ulr,
    tspFromClient: getTimestamp(),
  })

  const response = await post<unknown>(config.url, payload, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': userAgent,
    },
  })

  const msToken = response.cookies.get('msToken')
  // 服务器返回的 msToken 长度可能有变化，放宽验证范围
  // 实测返回 183，Python f2 检查 [164, 184]
  if (!msToken || msToken.length < 100 || msToken.length > 200) {
    throw new APIResponseError('msToken 内容不符合要求')
  }

  return msToken
}

export function genFalseMsToken(): string {
  return genRandomStr(182) + '=='
}

export async function genTtwid(): Promise<string> {
  const config = getTtwidConfig()
  const userAgent = getUserAgent()

  const response = await post<unknown>(config.url, config.data, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': userAgent,
    },
  })

  const ttwid = response.cookies.get('ttwid')
  if (!ttwid) {
    throw new APIResponseError('ttwid: 检查没有通过, 请更新配置')
  }

  return ttwid
}

export async function genWebid(): Promise<string> {
  const config = getWebidConfig()
  const userAgent = getUserAgent()

  const body = JSON.stringify({
    app_id: config.body.app_id,
    referer: config.body.referer,
    url: config.body.url,
    user_agent: config.body.user_agent,
    user_unique_id: '',
  })

  const response = await post<{ web_id?: string }>(config.url, body, {
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': userAgent,
      Referer: 'https://www.douyin.com/',
    },
  })

  const webid = response.data.web_id
  if (!webid) {
    throw new APIResponseError('webid 内容不符合要求')
  }

  return webid
}

export async function getMsToken(): Promise<string> {
  try {
    return await genRealMsToken()
  } catch {
    return genFalseMsToken()
  }
}
