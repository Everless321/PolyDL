/**
 * 示例：解析用户主页 → 拉取资料 + 主页作品分页
 *
 * 运行：
 *   DOUYIN_COOKIE="<你的cookie>" npx tsx examples/douyin-user-posts.ts "https://v.douyin.com/xxxxx/"
 *
 * dym 侧参考：装了 polydl 后，把下面 import 换成 `from 'polydl'` 即可。
 */
import { DouyinHandler, getSecUserId } from 'polydl'

const COOKIE = process.env.DOUYIN_COOKIE || ''
const url = process.argv[2] || 'https://v.douyin.com/bGrUCIldHDk/'

async function main() {
  // 1) 短链/主页链接 → sec_user_id（自动跟随重定向解析）
  const secUserId = await getSecUserId(url)
  console.log('sec_user_id:', secUserId)

  const handler = new DouyinHandler({
    cookie: COOKIE,
    pageInterval: 0, // 分页间隔(ms)，默认 5000 防风控；此处演示设 0 关闭
  })

  // 2) 用户资料。注意：广告用户返回 null，登录失效会抛错
  const profile = await handler.fetchUserProfile(secUserId)
  if (!profile) {
    console.log('该用户为广告用户或无效，跳过')
    return
  }
  console.log(
    `昵称: ${profile.nickname} | 抖音号: ${profile.uniqueId} | 作品: ${profile.awemeCount} | 粉丝: ${profile.followerCount}`
  )

  // 3) 主页作品分页（AsyncGenerator，每次 yield 一页 Filter）
  let n = 0
  for await (const page of handler.fetchUserPostVideos(secUserId, {
    pageCounts: 20,
    maxCounts: 20,
    interval: 0,
  })) {
    const ids = page.awemeId || []
    const descs = page.desc || []
    for (let i = 0; i < ids.length; i++) {
      console.log(
        `#${++n}  ${ids[i]}  ${String(descs[i] ?? '')
          .replace(/\n/g, ' ')
          .slice(0, 40)}`
      )
    }
  }
  console.log(`共 ${n} 条作品`)
}

main().catch(e => {
  console.error('出错:', e?.message || e)
  process.exit(1)
})
