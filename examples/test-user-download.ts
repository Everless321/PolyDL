/**
 * 用户作品下载测试脚本
 *
 * 使用方法:
 *   npx tsx examples/test-user-download.ts <用户链接> [数量]
 *
 * 示例:
 *   npx tsx examples/test-user-download.ts "https://www.douyin.com/user/xxx" 5
 */

import * as path from 'path'
import { getSecUserId } from '../src/utils/fetcher.js'
import { DouyinHandler } from '../src/handler/index.js'
import { DouyinDownloader } from '../src/downloader/index.js'

const cookies = process.env.DOUYIN_COOKIE || ""
async function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log('用法: npx tsx examples/test-user-download.ts <用户链接> [数量]')
    console.log('')
    console.log('示例:')
    console.log('  npx tsx examples/test-user-download.ts "https://www.douyin.com/user/xxx" 5')
    console.log('')
    console.log('设置 cookie:')
    console.log('  export DOUYIN_COOKIE="your_cookie_here"')
    process.exit(1)
  }

  if (!cookies) {
    console.error('请设置 DOUYIN_COOKIE 环境变量')
    process.exit(1)
  }

  const [userUrl, countStr] = args
  const maxCount = parseInt(countStr) || 5

  console.log('='.repeat(60))
  console.log('抖音用户作品下载测试')
  console.log('='.repeat(60))
  console.log('')

  try {
    console.log('1. 解析用户链接...')
    console.log(`   输入: ${userUrl}`)

    const secUserId = await getSecUserId(userUrl)
    console.log(`   sec_user_id: ${secUserId}`)
    console.log('')

    console.log('2. 初始化下载器...')
    const downloadPath = path.resolve('./downloads')
    console.log(`   保存路径: ${downloadPath}`)
    console.log(`   下载数量: ${maxCount}`)

    const handler = new DouyinHandler({ cookie: cookies })
    const downloader = new DouyinDownloader({
      cookie: cookies,
      downloadPath,
      naming: '{nickname}_{aweme_id}',
      folderize: true,
      cover: true,
      music: true,
      desc: true,
    })

    console.log('')
    console.log('3. 开始下载用户作品...')
    let count = 0

    for await (const postFilter of handler.fetchUserPostVideos(secUserId, { maxCounts: maxCount })) {
      // 使用 toAwemeDataList() 直接获取 AwemeData 数组
      const awemeList = postFilter.toAwemeDataList()

      for (const awemeData of awemeList) {
        count++
        console.log(`   [${count}/${maxCount}] 下载: ${awemeData.nickname} - ${awemeData.awemeId}`)

        await downloader.createDownloadTasks(awemeData, downloadPath)

        if (count >= maxCount) break
      }

      if (count >= maxCount) break
    }

    console.log('')
    console.log('-'.repeat(60))
    console.log(`✅ 下载完成! 共 ${count} 个作品`)

  } catch (error) {
    console.error('')
    console.error('❌ 错误:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
