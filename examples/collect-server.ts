/**
 * 收藏暂存服务
 *
 * Surge 拦截到收藏请求后，把视频信息 POST 到这里暂存；dym 再来拉取消费。
 * 用 token 标识身份，不同 token 各自一条队列。
 *
 * 启动：
 *   COLLECT_TOKENS=mytoken npx tsx examples/collect-server.ts
 *   COLLECT_TOKENS=alice,bob PORT=3000 npx tsx examples/collect-server.ts
 *   # 不设 COLLECT_TOKENS 则接受任意非空 token（仅用于本地调试）
 *
 * 接口：
 *   POST /collect          上报视频   header: X-Collect-Token; body: {aweme_id, action?, aweme_type?}
 *   GET  /pull?token=xxx   拉取并清空（dym 消费用）
 *   GET  /list?token=xxx   仅查看不清空
 */

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 3000)
const ALLOWED = (process.env.COLLECT_TOKENS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE_FILE = join(__dirname, '..', 'data', 'collect-store.json')

interface CollectRecord {
  aweme_id: string
  action: number
  aweme_type: number
  ts: number
}
type Queues = { [token: string]: CollectRecord[] }

function loadStore(): Queues {
  if (!existsSync(STORE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(STORE_FILE, 'utf8')) as Queues
  } catch {
    return {}
  }
}

function saveStore(data: Queues): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true })
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2))
}

function tokenAllowed(token: string | undefined): token is string {
  if (!token) return false
  if (ALLOWED.length === 0) return true // 调试模式：接受任意 token
  return ALLOWED.includes(token)
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: import('node:http').ServerResponse, code: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // POST /collect —— Surge 上报
  if (req.method === 'POST' && url.pathname === '/collect') {
    const token = (req.headers['x-collect-token'] as string) || url.searchParams.get('token') || ''
    if (!tokenAllowed(token)) return json(res, 401, { ok: false, error: 'invalid token' })

    let payload: { aweme_id?: string; action?: number; aweme_type?: number }
    try {
      payload = JSON.parse((await readBody(req)) || '{}')
    } catch {
      return json(res, 400, { ok: false, error: 'invalid json' })
    }

    const awemeId = String(payload.aweme_id || '').trim()
    if (!awemeId) return json(res, 400, { ok: false, error: 'missing aweme_id' })

    const store = loadStore()
    const queue = store[token] || []

    // 去重：同一 aweme_id 在未消费队列里只留一条
    const without = queue.filter(r => r.aweme_id !== awemeId)
    const next = [
      ...without,
      {
        aweme_id: awemeId,
        action: Number(payload.action ?? 1),
        aweme_type: Number(payload.aweme_type ?? 0),
        ts: Date.now(),
      },
    ]
    saveStore({ ...store, [token]: next })

    console.log(
      `[collect] token=${token} aweme_id=${awemeId} action=${payload.action} (queue=${next.length})`
    )
    return json(res, 200, { ok: true, stored: next.length })
  }

  // GET /pull —— dym 拉取并清空
  if (req.method === 'GET' && url.pathname === '/pull') {
    const token = url.searchParams.get('token') || ''
    if (!tokenAllowed(token)) return json(res, 401, { ok: false, error: 'invalid token' })

    const store = loadStore()
    const items = store[token] || []
    saveStore({ ...store, [token]: [] })

    console.log(`[pull] token=${token} -> ${items.length} items`)
    return json(res, 200, { ok: true, items })
  }

  // GET /list —— 仅查看
  if (req.method === 'GET' && url.pathname === '/list') {
    const token = url.searchParams.get('token') || ''
    if (!tokenAllowed(token)) return json(res, 401, { ok: false, error: 'invalid token' })

    const store = loadStore()
    return json(res, 200, { ok: true, items: store[token] || [] })
  }

  json(res, 404, { ok: false, error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`收藏暂存服务启动: http://0.0.0.0:${PORT}`)
  console.log(
    ALLOWED.length
      ? `允许的 token: ${ALLOWED.join(', ')}`
      : '⚠️  未设置 COLLECT_TOKENS，接受任意 token（仅调试）'
  )
})
