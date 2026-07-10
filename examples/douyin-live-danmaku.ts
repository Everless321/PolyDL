/**
 * 示例：实时拉取直播弹幕（给 dym 参考）
 *   用户主页 → 开播判断 → WSS 弹幕流 → 结构化事件
 *
 * 运行：
 *   DOUYIN_COOKIE="<cookie>" npx tsx examples/douyin-live-danmaku.ts "https://v.douyin.com/xxxxx/"
 *
 * dym 侧参考：装了 polydl 后把 import 换成 `from 'polydl'`。
 *
 * 事件类型（DanmakuEvent 判别联合）：
 *   chat        聊天弹幕      { user, content }
 *   gift        礼物          { user, giftName, comboCount, totalCount }
 *   like        点赞          { user, count, total }
 *   member      进场          { user, memberCount }
 *   social      关注/分享     { user, followCount }
 *   roomUserSeq 在线观众       { total, totalUser }
 *   roomStats   房间统计       { displayLong, total }
 *   control     控制(status=3 结束) { status }
 *   raw         未映射类型透传  { method, payload }
 */
import { DouyinHandler, getSecUserId } from 'polydl'

const COOKIE = process.env.DOUYIN_COOKIE || ''
const url = process.argv[2] || 'https://v.douyin.com/BHV_7UDG1Ik/'

async function main() {
  const secUserId = await getSecUserId(url)
  const handler = new DouyinHandler({ cookie: COOKIE, pageInterval: 0 })

  // 开播判断：拿精确 room_id
  const profile = await handler.fetchUserProfile(secUserId)
  const status = await handler.fetchUserLiveStatus(String(profile?.uid))
  if (status.liveStatus !== 1 || !status.roomIdStr) {
    console.log('当前未开播')
    return
  }
  console.log('直播间:', status.roomIdStr, '开始接收弹幕（Ctrl+C 停止）...\n')

  // 可选：AbortController 用于主动停止；关播(control status=3)或断线会自动结束
  const controller = new AbortController()
  process.on('SIGINT', () => controller.abort())

  for await (const ev of handler.fetchLiveDanmaku(status.roomIdStr, {
    signal: controller.signal,
  })) {
    switch (ev.type) {
      case 'chat':
        console.log(`💬 ${ev.user.nickname}: ${ev.content}`)
        break
      case 'gift':
        console.log(`🎁 ${ev.user.nickname} 送出 ${ev.giftName ?? ev.giftId} x${ev.comboCount}`)
        break
      case 'like':
        console.log(`👍 ${ev.user.nickname} 点赞 +${ev.count}（总 ${ev.total}）`)
        break
      case 'member':
        console.log(`🚪 ${ev.user.nickname} 进入直播间`)
        break
      case 'social':
        console.log(`➕ ${ev.user.nickname} 关注了主播`)
        break
      case 'roomStats':
        console.log(`📊 ${ev.displayLong ?? ev.total}`)
        break
      case 'control':
        if (ev.status === 3) console.log('⏹ 直播已结束')
        break
      // raw / roomUserSeq 略
    }
  }
  console.log('\n弹幕流结束')
}

main().catch(e => {
  console.error('出错:', e?.message || e)
  process.exit(1)
})
