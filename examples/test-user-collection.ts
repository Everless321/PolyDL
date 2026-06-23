/**
 * 用户收藏作品测试脚本
 *
 * 使用方法:
 *   npx tsx examples/test-user-collection.ts [数量]
 *
 * 示例:
 *   npx tsx examples/test-user-collection.ts         # 获取全部收藏
 *   npx tsx examples/test-user-collection.ts 20      # 获取前20个
 *
 * 注意: 收藏列表为私人数据，需要提供自己账号的 Cookie
 */

import { DouyinHandler } from '../src/handler/index.js'
import { setConfig } from '../src/config/index.js'

const cookie = process.env.DOUYIN_COOKIE || ''

if (!cookie) {
  console.error('请设置环境变量 DOUYIN_COOKIE')
  console.error('   export DOUYIN_COOKIE="你的cookie"')
  process.exit(1)
}

setConfig({ encryption: 'ab' })

async function main() {
  const args = process.argv.slice(2)
  const maxCount = args[0] ? parseInt(args[0], 10) : 0

  console.log('='.repeat(60))
  console.log('抖音用户收藏作品测试')
  console.log('='.repeat(60))
  console.log(maxCount > 0 ? `获取前 ${maxCount} 个收藏` : '获取全部收藏')
  console.log('')

  const handler = new DouyinHandler({ cookie })
  let totalCount = 0

  try {
    for await (const filter of handler.fetchUserCollectionVideos({ maxCounts: maxCount })) {
      const awemeIds = filter.awemeId || []
      const descs = filter.desc || []
      const createTimes = filter.createTime

      for (let i = 0; i < awemeIds.length; i++) {
        totalCount++
        const createTime = Array.isArray(createTimes) ? createTimes[i] : createTimes
        const desc = descs[i] || '无描述'
        console.log(`[${totalCount}] ${awemeIds[i]}`)
        console.log(`    描述: ${desc.substring(0, 50)}${desc.length > 50 ? '...' : ''}`)
        console.log(`    时间: ${createTime || '未知'}`)
        console.log('')

        if (maxCount > 0 && totalCount >= maxCount) break
      }

      if (maxCount > 0 && totalCount >= maxCount) break
    }

    console.log('-'.repeat(60))
    console.log(`共获取 ${totalCount} 个收藏作品`)
  } catch (error) {
    console.error('获取失败:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
