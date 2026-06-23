/**
 * 下载测试脚本
 *
 * 使用方法:
 *   npx tsx examples/test-download.ts <作品链接>
 *
 * 示例:
 *   npx tsx examples/test-download.ts "https://v.douyin.com/xxx"
 */

import * as path from 'path'
import { getAwemeId } from '../src/utils/fetcher.js'
import { DouyinHandler } from '../src/handler/index.js'
import { DouyinDownloader } from '../src/downloader/index.js'

const cookies = process.env.DOUYIN_COOKIE || ''

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log('用法: npx tsx examples/test-download.ts <作品链接>')
    console.log('')
    console.log('示例:')
    console.log('  npx tsx examples/test-download.ts "https://v.douyin.com/xxx"')
    console.log('')
    console.log('设置 cookie:')
    console.log('  export DOUYIN_COOKIE="your_cookie_here"')
    process.exit(1)
  }

  if (!cookies) {
    console.error('请设置 DOUYIN_COOKIE 环境变量')
    process.exit(1)
  }

  const [videoUrl] = args

  console.log('='.repeat(60))
  console.log('抖音作品下载测试')
  console.log('='.repeat(60))
  console.log('')

  try {
    console.log('1. 解析作品链接...')
    console.log(`   输入: ${videoUrl}`)

    const awemeId = await getAwemeId(videoUrl)
    console.log(`   aweme_id: ${awemeId}`)
    console.log('')

    console.log('2. 获取作品详情...')
    const handler = new DouyinHandler({ cookie: cookies })
    const postDetail = await handler.fetchOneVideo(awemeId)

    console.log(`   作品类型: ${postDetail.awemeType}`)
    console.log(`   作者: ${postDetail.nickname}`)
    console.log(`   描述: ${(postDetail.desc || '').substring(0, 50)}...`)
    console.log(`   创建时间: ${postDetail.createTime}`)
    console.log('')

    console.log('3. 开始下载...')
    const downloadPath = path.resolve('./downloads')
    console.log(`   保存路径: ${downloadPath}`)

    const downloader = new DouyinDownloader({
      cookie: cookies,
      downloadPath,
      naming: '{nickname}_{aweme_id}',
      folderize: false,
      cover: true,
      music: true,
      desc: true,
    })

    // 直接使用 toAwemeData() 转换
    await downloader.createDownloadTasks(postDetail.toAwemeData(), downloadPath)

    console.log('')
    console.log('-'.repeat(60))
    console.log('✅ 下载完成!')

  } catch (error) {
    console.error('')
    console.error('❌ 错误:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
