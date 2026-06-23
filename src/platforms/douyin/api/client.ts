import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { getConfig } from '../config/index.js'

const BASE_URL = 'https://www.douyin.com'

let client: AxiosInstance | null = null

export function getClient(): AxiosInstance {
  if (client) return client

  const config = getConfig()

  client = axios.create({
    baseURL: BASE_URL,
    timeout: config.timeout,
    headers: {
      'User-Agent': config.userAgent,
      Cookie: config.cookie,
      Referer: 'https://www.douyin.com/',
    },
  })

  client.interceptors.request.use(requestConfig => {
    // TODO: 添加签名算法
    return requestConfig
  })

  client.interceptors.response.use(
    response => response,
    error => {
      // TODO: 错误处理与重试逻辑
      return Promise.reject(error)
    }
  )

  return client
}

export function resetClient(): void {
  client = null
}

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await getClient().request<T>(config)
  return response.data
}
