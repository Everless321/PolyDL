/**
 * 示例：连接快手直播间弹幕
 *   房间页 eid → 本地 __NS_hxfalcon → WebSocket → 评论 / 礼物 / 点赞
 *
 * 运行：
 *   KS_COOKIES="<完整网页 Cookie，含 kwfv1>" npx tsx examples/kuaishou-live-danmaku.ts \
 *     "https://live.kuaishou.com/u/<eid>" [秒数]
 *
 * 直播弹幕可能需要 live.kuaishou.com 的有效登录态。Ctrl+C 停止。
 * 装了 polydl 后把 import 换成 `from 'polydl'`（本文件已经这样写）。
 */
import { KuaishouLiveClient, KuaishouLiveDanmaku, createLiveSigner, getLiveUserId } from 'polydl'
import type { DecodedLiveFrame } from 'polydl'

const COOKIE = process.env.KS_COOKIES || ''
const input = process.argv[2] || 'https://live.kuaishou.com/u/<eid>'
const durationArg = process.argv[3]
const duration = durationArg ? Number(durationArg) : undefined

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function userName(frame: DecodedLiveFrame): string {
  const user = frame.payload.user
  if (user && typeof user === 'object' && !Array.isArray(user) && !(user instanceof Uint8Array)) {
    const name = textOf(user.userName)
    if (name) return name
  }
  return '未知用户'
}

async function main() {
  if (!COOKIE) {
    console.error('请设置 KS_COOKIES（完整网页 Cookie，需含 kwfv1 与 kuaishou.server.web*_st）')
    process.exit(1)
  }
  if (durationArg && (!Number.isFinite(duration) || (duration ?? 0) <= 0)) {
    console.error('监听秒数必须是正数')
    process.exit(1)
  }

  const eid = getLiveUserId(input) || input.trim()
  const client = new KuaishouLiveClient({
    cookie: COOKIE,
    signer: createLiveSigner(),
  })
  const danmaku = new KuaishouLiveDanmaku({ eid, client })

  danmaku.on('comment', frame => {
    console.log(`💬 ${userName(frame)}: ${textOf(frame.payload.content)}`)
  })
  danmaku.on('gift', frame => {
    const giftId = textOf(frame.payload.giftId) || '?'
    const combo = textOf(frame.payload.comboCount) || '1'
    console.log(`🎁 ${userName(frame)} 送出礼物 ${giftId} x${combo}`)
  })
  danmaku.on('like', frame => {
    console.log(`👍 ${userName(frame)} 点赞`)
  })

  process.once('SIGINT', () => {
    console.log('\n正在停止...')
    danmaku.stop()
  })

  console.log(`直播间 ${eid}，开始接收弹幕（Ctrl+C 停止）...\n`)
  const stats = await danmaku.run(duration == null ? undefined : { duration })
  if (!danmaku.token) {
    console.error('没有拿到 WebSocket token。请确认正在直播，且 Cookie 对直播站有效。')
    process.exit(1)
  }
  console.log(
    `\n弹幕结束：评论 ${stats.comments}，点赞 ${stats.likes}，礼物 ${stats.gifts}，帧 ${stats.frames}`
  )
}

main().catch(error => {
  console.error('出错:', error instanceof Error ? error.message : error)
  process.exit(1)
})
