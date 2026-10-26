/**
 * 示例：解析快手用户主页 → 拉取资料 + 主页作品分页
 *
 * 运行：
 *   KS_COOKIES="<完整网页 Cookie，含 kwfv1>" npx tsx examples/kuaishou-user-posts.ts \
 *     "https://www.kuaishou.com/profile/<eid>"
 *
 * 设置 KS_DOWNLOAD=1 时，会把拉到的作品下载到 ./downloads。
 * 装了 polydl 后，把下面 import 换成 `from 'polydl'` 即可（本文件已经这样写）。
 */
import { KuaishouDownloader, KuaishouHandler, type KuaishouWork } from 'polydl'

const COOKIE = process.env.KS_COOKIES || ''
const url = process.argv[2] || 'https://www.kuaishou.com/profile/3xexample'

async function main() {
  if (!COOKIE) {
    console.error('请设置 KS_COOKIES（完整网页 Cookie，需含 kwfv1 与 kuaishou.server.web*_st）')
    process.exit(1)
  }

  const handler = new KuaishouHandler({ cookie: COOKIE })

  // 1) 用户资料。eid、主页链接、直播主页链接都可以
  const profile = await handler.fetchUserProfile(url)
  const info = profile.userProfile
  console.log(
    `昵称: ${info.profile.user_name} | 作品: ${info.ownerCount.photo_public ?? info.ownerCount.photo ?? 0} | 粉丝: ${info.ownerCount.fan ?? 0}`
  )

  // 2) 主页作品分页（AsyncGenerator，每次 yield 一页归一化作品）
  const collected: KuaishouWork[] = []
  let n = 0
  for await (const page of handler.fetchUserPostVideos(url, { maxCounts: 20 })) {
    for (const work of page) {
      collected.push(work)
      console.log(
        `#${++n}  ${work.workType}  ${work.workId}  ${work.title.replace(/\n/g, ' ').slice(0, 40)}`
      )
    }
  }
  console.log(`共 ${n} 条作品`)

  if (process.env.KS_DOWNLOAD === '1' && collected.length > 0) {
    const downloader = new KuaishouDownloader({
      cookie: COOKIE,
      downloadPath: './downloads',
      mediaType: 'all',
      cover: true,
      desc: true,
    })
    await downloader.downloadWorks(collected, './downloads')
    console.log('已下载到 ./downloads')
  }
}

main().catch(error => {
  console.error('出错:', error instanceof Error ? error.message : error)
  process.exit(1)
})
