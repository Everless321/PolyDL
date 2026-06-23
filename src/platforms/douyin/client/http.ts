import { getConfig } from '../config/index.js'
import {
  APIConnectionError,
  APITimeoutError,
  APIResponseError,
  APIUnauthorizedError,
} from '../errors/index.js'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string | Record<string, unknown>
  timeout?: number
  followRedirects?: boolean
}

export interface HttpResponse<T = unknown> {
  status: number
  headers: Headers
  data: T
  url: string
  cookies: Map<string, string>
}

function parseCookies(headers: Headers): Map<string, string> {
  const cookies = new Map<string, string>()

  const setCookieArray: string[] = headers.getSetCookie?.() || []

  if (setCookieArray.length > 0) {
    for (const cookieStr of setCookieArray) {
      const parts = cookieStr.split(';')[0].trim()
      const [name, ...valueParts] = parts.split('=')
      if (name && valueParts.length > 0) {
        cookies.set(name.trim(), valueParts.join('=').trim())
      }
    }
    return cookies
  }

  // fallback: 使用 get('set-cookie') 方式
  const setCookie = headers.get('set-cookie')
  if (!setCookie) return cookies

  const cookieStrings = setCookie.split(/,(?=\s*\w+=)/)
  for (const cookieStr of cookieStrings) {
    const parts = cookieStr.split(';')[0].trim()
    const [name, ...valueParts] = parts.split('=')
    if (name && valueParts.length > 0) {
      cookies.set(name.trim(), valueParts.join('=').trim())
    }
  }
  return cookies
}

export async function request<T = unknown>(
  url: string,
  options: RequestOptions = {}
): Promise<HttpResponse<T>> {
  const config = getConfig()
  const { method = 'GET', headers = {}, body, timeout = config.timeout, followRedirects = true } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'User-Agent': config.userAgent,
      'Referer': config.referer,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'https://www.douyin.com',
      'Sec-Ch-Ua': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
    signal: controller.signal,
    redirect: followRedirects ? 'follow' : 'manual',
  }

  if (body) {
    if (typeof body === 'string') {
      fetchOptions.body = body
    } else {
      fetchOptions.body = JSON.stringify(body)
      ;(fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json; charset=utf-8'
    }
  }

  try {
    const response = await fetch(url, fetchOptions)
    clearTimeout(timeoutId)

    const cookies = parseCookies(response.headers)
    const contentType = response.headers.get('content-type') || ''
    let data: T

    if (contentType.includes('application/json')) {
      data = (await response.json()) as T
    } else {
      data = (await response.text()) as T
    }

    return {
      status: response.status,
      headers: response.headers,
      data,
      url: response.url,
      cookies,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new APITimeoutError(`请求超时: ${url}`)
      }
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        throw new APIConnectionError(`网络连接失败: ${url}`)
      }
      if (error.message.includes('ENOTFOUND')) {
        throw new APIConnectionError(`DNS解析失败: ${url}`)
      }
      throw new APIResponseError(`请求失败: ${error.message}`)
    }
    throw new APIResponseError(`未知错误: ${url}`)
  }
}

export async function get<T = unknown>(
  url: string,
  options: Omit<RequestOptions, 'method'> = {}
): Promise<HttpResponse<T>> {
  return request<T>(url, { ...options, method: 'GET' })
}

export async function post<T = unknown>(
  url: string,
  body?: string | Record<string, unknown>,
  options: Omit<RequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return request<T>(url, { ...options, method: 'POST', body })
}

export function checkResponseStatus(response: HttpResponse, allowedStatuses: number[] = [200]): void {
  if (!allowedStatuses.includes(response.status)) {
    if (response.status === 401 || response.status === 403) {
      throw new APIUnauthorizedError(`未授权访问: ${response.url}`)
    }
    throw new APIResponseError(`状态码错误 ${response.status}: ${response.url}`)
  }
}
