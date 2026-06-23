/**
 * 批量取消收藏
 *
 * 使用方法:
 *   npx tsx examples/uncollect-all.ts          # 取消全部收藏
 *   npx tsx examples/uncollect-all.ts 50       # 只取消前50个
 */

import { DouyinHandler } from '../src/handler/index.js'
import { setConfig } from '../src/config/index.js'

const cookie = process.env.DOUYIN_COOKIE || ''

if (!cookie) {
  console.error('请设置环境变量 DOUYIN_COOKIE')
  process.exit(1)
}

setConfig({ encryption: 'ab' })

const DELAY_MS = 500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function uncollectAwemeOnce(awemeId: string): Promise<{ ok: boolean; reason?: string }> {
  const url =
    'https://www-hj.douyin.com/aweme/v1/web/aweme/collect/?device_platform=webapp&aid=6383&channel=channel_pc_web&pc_client_type=1&version_code=170400&version_name=17.4.0&cookie_enabled=true&screen_width=1512&screen_height=982&browser_language=zh-CN&browser_platform=MacIntel&browser_name=Chrome&browser_version=146.0.0.0&browser_online=true&engine_name=Blink&engine_version=146.0.0.0&os_name=Mac+OS&os_version=10.15.7&cpu_core_num=12&device_memory=8&platform=PC&downlink=10&effective_type=4g&round_trip_time=200'

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookie,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      Referer: 'https://www.douyin.com/',
      Origin: 'https://www.douyin.com',
    },
    body: `action=0&aweme_id=${awemeId}&aweme_type=0`,
  })

  if (!resp.ok) return { ok: false, reason: `HTTP ${resp.status}` }

  const data = (await resp.json()) as Record<string, unknown>
  if (data.status_code === 0) return { ok: true }
  return { ok: false, reason: `status_code=${data.status_code} msg=${data.status_msg ?? ''}` }
}

const MAX_RETRIES = 10

async function uncollectAweme(awemeId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await uncollectAwemeOnce(awemeId)
      if (res.ok) return true
      throw new Error(res.reason || 'unknown')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt >= MAX_RETRIES) {
        console.error(`  give up ${awemeId} after ${MAX_RETRIES} attempts: ${msg}`)
        return false
      }
      const backoff = Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5))
      console.warn(`  retry #${attempt}/${MAX_RETRIES} ${awemeId}: ${msg} (wait ${backoff}ms)`)
      await sleep(backoff)
    }
  }
  return false
}

async function main() {
  const maxCount = process.argv[2] ? parseInt(process.argv[2], 10) : 0
  const handler = new DouyinHandler({ cookie })

  let fetched = 0
  let succeeded = 0
  let failed = 0
  const failedIds: string[] = []

  console.log(`开始批量取消收藏${maxCount > 0 ? `（最多 ${maxCount} 个）` : '（全部）'}...`)
  console.log('')

  for await (const filter of handler.fetchUserCollectionVideos()) {
    const awemeIds = filter.awemeId || []

    for (const awemeId of awemeIds) {
      fetched++
      const ok = await uncollectAweme(awemeId)
      if (ok) {
        succeeded++
        console.log(`[${fetched}] ok ${awemeId}`)
      } else {
        failed++
        failedIds.push(awemeId)
        console.error(`[${fetched}] FAIL ${awemeId}`)
      }

      await sleep(DELAY_MS)

      if (maxCount > 0 && fetched >= maxCount) break
    }

    if (maxCount > 0 && fetched >= maxCount) break
  }

  console.log('')
  console.log(`完成：成功 ${succeeded} 个，失败 ${failed} 个，共处理 ${fetched} 个`)
  if (failedIds.length > 0) {
    console.log(`失败的 awemeId: ${failedIds.join(', ')}`)
  }
}

main().catch(err => {
  console.error('错误:', err instanceof Error ? err.message : err)
  process.exit(1)
})
