/**
 * 获取收藏作品的所有作者 ID
 *
 * 使用方法:
 *   npx tsx examples/collect-author-ids.ts           # 获取全部
 *   npx tsx examples/collect-author-ids.ts 50        # 最多取50个作品
 *   npx tsx examples/collect-author-ids.ts 100 > authors.txt
 */

import { DouyinHandler } from '../src/handler/index.js'
import { setConfig } from '../src/config/index.js'

const cookie = process.env.DOUYIN_COOKIE || ''

if (!cookie) {
  console.error('请设置环境变量 DOUYIN_COOKIE')
  process.exit(1)
}

setConfig({ encryption: 'ab' })

async function collectAuthorIds(maxWorks: number): Promise<string[]> {
  const handler = new DouyinHandler({ cookie })
  const authorSet = new Set<string>()
  let totalWorks = 0

  for await (const filter of handler.fetchUserCollectionVideos({ maxCounts: maxWorks })) {
    const secUserIds = filter.secUserId || []
    const awemeIds = filter.awemeId || []

    for (let i = 0; i < awemeIds.length; i++) {
      totalWorks++
      const id = secUserIds[i]
      if (id) authorSet.add(id)
      if (maxWorks > 0 && totalWorks >= maxWorks) break
    }

    process.stderr.write(`已处理 ${totalWorks} 个作品 / ${authorSet.size} 个不重复作者\n`)

    if (maxWorks > 0 && totalWorks >= maxWorks) break
  }

  return [...authorSet]
}

async function main() {
  const maxWorks = process.argv[2] ? parseInt(process.argv[2], 10) : 0
  process.stderr.write(
    `开始获取收藏作品${maxWorks > 0 ? `（最多 ${maxWorks} 个）` : '（全部）'}...\n`
  )

  const authorIds = await collectAuthorIds(maxWorks)

  process.stderr.write(`\n完成，共 ${authorIds.length} 个不重复作者\n`)

  // stdout 输出纯 ID 列表，方便重定向到文件
  for (const id of authorIds) {
    console.log(id)
  }
}

main().catch(err => {
  console.error('错误:', err instanceof Error ? err.message : err)
  process.exit(1)
})
