/**
 * 用户作品列表测试脚本
 *
 * 使用方法:
 *   npx tsx examples/test-user-posts.ts <用户链接> [数量]
 *
 * 示例:
 *   npx tsx examples/test-user-posts.ts "https://v.douyin.com/xxx"       # 获取全部作品
 *   npx tsx examples/test-user-posts.ts "https://v.douyin.com/xxx" 10    # 获取前10个
 */

import { getSecUserId } from '../src/utils/fetcher.js'
import { DouyinHandler } from '../src/handler/index.js'

const cookies = process.env.DOUYIN_COOKIE || ""
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log('用法: npx tsx examples/test-user-posts.ts <用户链接> [数量]')
    console.log('')
    console.log('示例:')
    console.log('  npx tsx examples/test-user-posts.ts "https://v.douyin.com/xxx"       # 获取全部')
    console.log('  npx tsx examples/test-user-posts.ts "https://v.douyin.com/xxx" 10    # 获取前10个')
    process.exit(1)
  }

  const [userUrl, countStr] = args
  // 默认 0 表示获取全部，传入数字则限制数量
  const maxCount = countStr ? parseInt(countStr, 10) : 0

  console.log('='.repeat(60))
  console.log('抖音用户作品列表测试')
  console.log('='.repeat(60))
  console.log('')

  try {
    console.log('1. 解析用户链接...')
    console.log(`   输入: ${userUrl}`)

    const secUserId = await getSecUserId(userUrl)
    console.log(`   sec_user_id: ${secUserId}`)
    console.log('')

    console.log(`2. 获取用户作品 ${maxCount > 0 ? `(最多 ${maxCount} 个)` : '(全部)'}...`)
    console.log('')

    const handler = new DouyinHandler({ cookie: cookies })
    let totalCount = 0

    for await (const postFilter of handler.fetchUserPostVideos(secUserId, { maxCounts: maxCount })) {
      const awemeIds = postFilter.awemeId || []
      const descs = postFilter.desc || []
      const createTimes = postFilter.createTime || []
      const diggCounts = postFilter.diggCount || []
      const commentCounts = postFilter.commentCount || []
      const shareCounts = postFilter.shareCount || []

      for (let i = 0; i < awemeIds.length; i++) {
        totalCount++
        console.log(`[${totalCount}] ${awemeIds[i]}`)
        console.log(`    描述: ${(descs[i] || '无描述').substring(0, 50)}${(descs[i]?.length || 0) > 50 ? '...' : ''}`)
        console.log(`    时间: ${createTimes[i]}`)
        console.log(`    点赞: ${diggCounts[i]} | 评论: ${commentCounts[i]} | 分享: ${shareCounts[i]}`)
        console.log('')

        if (maxCount > 0 && totalCount >= maxCount) break
      }

      if (maxCount > 0 && totalCount >= maxCount) break
    }

    console.log('-'.repeat(60))
    console.log(`✅ 共获取 ${totalCount} 个作品`)

  } catch (error) {
    console.error('')
    console.error('❌ 错误:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
