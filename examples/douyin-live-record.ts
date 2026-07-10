/**
 * 示例：直播录制完整链路（给 dym 参考）
 *   用户主页 → 开播判断 → 取推流地址 → ffmpeg 录制
 *
 * 运行（需系统已装 ffmpeg）：
 *   DOUYIN_COOKIE="<cookie>" npx tsx examples/douyin-live-record.ts "https://v.douyin.com/xxxxx/" [秒数]
 *
 * dym 侧参考：装了 polydl 后把 import 换成 `from 'polydl'`。
 *
 * 关键点：
 *   1. room_id 必须用 string（roomIdStr / 修复后的 roomId），number 会丢精度
 *   2. flv 档位: FULL_HD1(蓝光) > HD1(超清) > SD2(高清) > SD1(标清) —— 注意 SD2 比 SD1 清晰
 *   3. flv CDN 建议带 Referer: https://live.douyin.com/
 */
import { spawn } from 'node:child_process'
import { DouyinHandler, getSecUserId } from 'polydl'

const COOKIE = process.env.DOUYIN_COOKIE || ''
const url = process.argv[2] || 'https://v.douyin.com/bGrUCIldHDk/'
const durationSec = Number(process.argv[3] || 15)

// 画质优先级：从高到低（真实清晰度顺序，不是字面顺序）
const QUALITY_ORDER = ['FULL_HD1', 'HD1', 'SD2', 'SD1']

async function main() {
  const secUserId = await getSecUserId(url)
  const handler = new DouyinHandler({ cookie: COOKIE, pageInterval: 0 })

  // 1) 取 uid + 精确 room_id
  const profile = await handler.fetchUserProfile(secUserId)
  if (!profile?.uid) throw new Error('拿不到 uid')

  // 2) 开播判断（liveStatus === 1 表示在播），roomIdStr 是精确字符串
  const status = await handler.fetchUserLiveStatus(String(profile.uid))
  console.log('liveStatus:', status.liveStatus, '| room_id:', status.roomIdStr)
  if (status.liveStatus !== 1 || !status.roomIdStr) {
    console.log('当前未开播，退出')
    return
  }

  // 3) 取直播间信息 + 推流地址
  const live = await handler.fetchUserLiveVideos2(status.roomIdStr)
  console.log('标题:', live.liveTitle, '| webRid:', live.webRid)
  const flv = live.flvPullUrl || {}
  const key = QUALITY_ORDER.find(k => flv[k]) || Object.keys(flv)[0]
  const streamUrl = flv[key]
  if (!streamUrl) throw new Error('无可用推流地址')
  console.log('选用画质:', key)
  console.log('推流地址:', streamUrl)

  // 4) ffmpeg 录制（-c copy 直接转储，不转码）
  const outFile = `./live_${status.roomIdStr}.flv`
  console.log(`录制 ${durationSec}s → ${outFile}`)
  await record(streamUrl, outFile, durationSec)
  console.log('✅ 录制完成:', outFile)
}

function record(streamUrl: string, outFile: string, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-y',
        '-headers',
        'Referer: https://live.douyin.com/\r\n',
        '-i',
        streamUrl,
        '-t',
        String(seconds),
        '-c',
        'copy',
        outFile,
      ],
      { stdio: 'inherit' }
    )
    ff.on('error', reject)
    ff.on('close', code => (code === 0 ? resolve() : reject(new Error('ffmpeg 退出码 ' + code))))
  })
}

main().catch(e => {
  console.error('出错:', e?.message || e)
  process.exit(1)
})
