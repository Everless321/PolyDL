/**
 * 用户信息解析测试脚本
 *
 * 使用方法:
 *   npx tsx examples/test-user-profile.ts <用户链接>
 *
 * 示例:
 *   npx tsx examples/test-user-profile.ts "https://www.douyin.com/user/MS4wLjABAAAAxxx"
 *   npx tsx examples/test-user-profile.ts "https://v.douyin.com/xxx"
 */

import { getSecUserId } from '../src/utils/fetcher.js'
import { DouyinHandler } from '../src/handler/index.js'

const cookies = process.env.DOUYIN_COOKIE || ""
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log('用法: npx tsx examples/test-user-profile.ts <用户链接>')
    console.log('')
    console.log('示例:')
    console.log('  npx tsx examples/test-user-profile.ts "https://www.douyin.com/user/MS4wLjABAAAAxxx"')
    console.log('  npx tsx examples/test-user-profile.ts "https://v.douyin.com/xxx"')
    process.exit(1)
  }

  const [userUrl] = args

  console.log('='.repeat(50))
  console.log('抖音用户信息解析测试')
  console.log('='.repeat(50))
  console.log('')

  try {
    console.log('1. 解析用户链接...')
    console.log(`   输入: ${userUrl}`)

    const secUserId = await getSecUserId(userUrl)
    console.log(`   sec_user_id: ${secUserId}`)
    console.log('')

    console.log('2. 获取用户资料...')
    const handler = new DouyinHandler({ cookie: cookies })
    const profile = await handler.fetchUserProfile(secUserId)
    console.log('')

    console.log('3. 用户信息:')
    console.log('-'.repeat(50))
    console.log(`   昵称: ${profile.nickname}`)
    console.log(`   抖音号: ${profile.uniqueId || profile.shortId || 'N/A'}`)
    console.log(`   UID: ${profile.uid}`)
    console.log(`   sec_user_id: ${profile.secUserId}`)
    console.log(`   签名: ${profile.signature || '无'}`)
    console.log(`   地区: ${profile.ipLocation || 'N/A'}`)
    console.log(`   城市: ${profile.city || 'N/A'}`)
    console.log('-'.repeat(50))
    console.log(`   作品数: ${profile.awemeCount}`)
    console.log(`   粉丝数: ${profile.followerCount}`)
    console.log(`   关注数: ${profile.followingCount}`)
    console.log(`   喜欢数: ${profile.favoritingCount}`)
    console.log(`   获赞数: ${profile.totalFavorited}`)
    console.log(`   合集数: ${profile.mixCount}`)
    console.log('-'.repeat(50))
    console.log(`   头像: ${profile.avatarUrl}`)
    console.log(`   直播状态: ${profile.liveStatus === 1 ? '直播中' : '未直播'}`)
    console.log(`   直播间ID: ${profile.roomId || 'N/A'}`)
    console.log('-'.repeat(50))
    console.log('')
    console.log('✅ 测试完成!')

  } catch (error) {
    console.error('')
    console.error('❌ 错误:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
