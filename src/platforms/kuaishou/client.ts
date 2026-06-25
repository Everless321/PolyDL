/**
 * 快手 GraphQL 客户端 —— 无签名，仅需 Cookie
 */
import type { KuaishouConfig, GraphqlResponse } from './types.js'

const GRAPHQL_ENDPOINT = 'https://www.kuaishou.com/graphql'

const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  Origin: 'https://www.kuaishou.com',
  Referer: 'https://www.kuaishou.com/',
}

export class KuaishouClient {
  private cookie: string
  private headers: Record<string, string>

  constructor(config: KuaishouConfig = {}) {
    this.cookie = config.cookie || ''
    this.headers = { ...DEFAULT_HEADERS, ...config.headers }
  }

  /**
   * 发起一次 GraphQL 查询，返回 data[operationName]
   */
  async query<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    if (!query) {
      throw new Error(`快手 operation "${operationName}" 的 query 尚未回填，见 graphql.ts`)
    }

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        ...this.headers,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ operationName, query, variables }),
    })

    if (!response.ok) {
      throw new Error(`快手 GraphQL 请求失败: HTTP ${response.status}`)
    }

    const json = (await response.json()) as GraphqlResponse<T>

    if (json.errors?.length) {
      throw new Error(`快手 GraphQL 错误: ${json.errors.map(e => e.message).join('; ')}`)
    }

    const data = json.data?.[operationName]
    if (data === undefined) {
      throw new Error(`快手 GraphQL 返回缺少 ${operationName} 字段（可能 Cookie 失效或被风控）`)
    }

    return data
  }
}
