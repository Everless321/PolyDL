#!/usr/bin/env node

import { createRequire } from 'node:module'
import * as path from 'path'
import { Command } from 'commander'
import consola from 'consola'
import { setConfig } from '../platforms/douyin/config/index.js'
import { createDeviceProfile, type DeviceOS } from '../platforms/douyin/device/index.js'
import { getAwemeId, getSecUserId, fetchFromSharePage } from '../platforms/douyin/utils/fetcher.js'
import { DouyinHandler } from '../platforms/douyin/handler/index.js'
import { DouyinDownloader } from '../platforms/douyin/downloader/index.js'
import { PostDetailFilter } from '../platforms/douyin/filter/index.js'
import type { AwemeData } from '../platforms/douyin/downloader/types.js'
import {
  douyinOnlyIgnoredMessage,
  formatKuaishouError,
  isKuaishouCliError,
  kuaishouOnlyIgnoredMessage,
  resolveCliPlatform,
  runKuaishouComments,
  runKuaishouDownload,
  runKuaishouHot,
  runKuaishouLive,
  runKuaishouSearch,
  runKuaishouUser,
} from './kuaishou.js'

const program = new Command()

program.name('pdl').description('多平台短视频下载器（抖音 / 快手 ...）').version(readCliVersion())

function readCliVersion(): string {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require('../../package.json') as { version?: string }
    if (typeof pkg.version === 'string' && pkg.version) return pkg.version
  } catch {
    // 相对路径在某些打包形态下会失效，退回当前发布版本
  }
  return '0.5.3'
}

function exitWithError(prefix: string, error: unknown): never {
  if (isKuaishouCliError(error)) {
    consola.error(formatKuaishouError(error))
  } else {
    consola.error(prefix, error instanceof Error ? error.message : error)
  }
  process.exit(1)
}

interface DeviceOptions {
  deviceOs?: string
  deviceSeed?: string
}

interface SharedDownloadOptions extends DeviceOptions {
  output: string
  cookie?: string
  cover?: boolean
  music?: boolean
  desc?: boolean
  media?: string
  export?: string
}

/** 把 --device-os / --device-seed 转成 DeviceProfile；都没传则沿用默认（按本机平台随机） */
function resolveDevice(options: DeviceOptions) {
  if (!options.deviceOs && !options.deviceSeed) return undefined
  if (options.deviceOs && options.deviceOs !== 'mac' && options.deviceOs !== 'windows') {
    throw new Error(`--device-os 只支持 mac 或 windows，收到: ${options.deviceOs}`)
  }
  return createDeviceProfile({
    os: options.deviceOs as DeviceOS | undefined,
    seed: options.deviceSeed,
  })
}

function warnIf(message: string | undefined): void {
  if (message) consola.warn(message)
}

program
  .command('download <url>')
  .alias('d')
  .description('下载单个作品（抖音可免登录，快手需要 Cookie）')
  .option('-o, --output <path>', '下载目录', './downloads')
  .option('-c, --cookie <cookie>', 'Cookie（抖音可省略；快手必填，也可用环境变量 KS_COOKIES）')
  .option('--cover', '下载封面')
  .option('--music', '下载音乐')
  .option('--desc', '下载文案')
  .option('--media <type>', '快手媒体: all | video | image（默认 all；抖音忽略）')
  .option('--export <format>', '快手同时导出作品列表: csv | json（抖音忽略）')
  .option('--device-os <os>', '设备指纹平台: mac | windows（默认跟随本机）')
  .option('--device-seed <seed>', '设备指纹随机种子，同一 seed 复现同一台设备')
  .action(async (url: string, options: SharedDownloadOptions) => {
    try {
      // 只有快手链接走快手。未识别的链接保持原来的抖音解析。
      if (resolveCliPlatform(url) === 'kuaishou') {
        warnIf(
          douyinOnlyIgnoredMessage({
            music: options.music,
            deviceOs: options.deviceOs,
            deviceSeed: options.deviceSeed,
          })
        )
        await runKuaishouDownload(url, {
          output: options.output,
          cookie: options.cookie,
          cover: options.cover,
          desc: options.desc,
          media: options.media,
          exportAs: options.export,
        })
        return
      }
      warnIf(kuaishouOnlyIgnoredMessage({ media: options.media, exportAs: options.export }))

      setConfig({
        downloadPath: options.output,
        cookie: options.cookie || '',
        device: resolveDevice(options),
      })

      consola.start('解析链接...')
      const awemeId = await getAwemeId(url)
      consola.info(`作品ID: ${awemeId}`)

      consola.start('获取作品详情...')

      let awemeData: AwemeData
      let nickname = '未知'

      if (options.cookie) {
        // 有 cookie，使用 API
        const handler = new DouyinHandler({ cookie: options.cookie })
        const postDetail = await handler.fetchOneVideo(awemeId)
        if (postDetail instanceof PostDetailFilter) {
          nickname = postDetail.nickname || '未知'
          awemeData = postDetail.toAwemeData()
        } else {
          // SharePageDetail
          nickname = postDetail.author.nickname
          awemeData = {
            awemeId: postDetail.awemeId,
            awemeType: postDetail.images ? 68 : 0,
            secUserId: postDetail.author.secUid,
            nickname: postDetail.author.nickname,
            uid: postDetail.author.uid,
            desc: postDetail.desc,
            createTime: new Date(postDetail.createTime * 1000)
              .toISOString()
              .slice(0, 19)
              .replace('T', '_')
              .replace(/:/g, '-'),
            videoPlayAddr: postDetail.video?.playAddr,
            images: postDetail.images?.map(img => img.urlList[0]),
            cover: postDetail.video?.cover?.[0],
            musicPlayUrl: postDetail.music?.playUrl,
          }
        }
      } else {
        // 无 cookie，使用移动端分享页面
        consola.info('使用免登录模式获取视频信息...')
        const shareDetail = await fetchFromSharePage(awemeId)
        if (!shareDetail) {
          throw new Error('无法获取视频信息')
        }
        nickname = shareDetail.author.nickname
        awemeData = {
          awemeId: shareDetail.awemeId,
          awemeType: shareDetail.images ? 68 : 0,
          secUserId: shareDetail.author.secUid,
          nickname: shareDetail.author.nickname,
          uid: shareDetail.author.uid,
          desc: shareDetail.desc,
          createTime: new Date(shareDetail.createTime * 1000)
            .toISOString()
            .slice(0, 19)
            .replace('T', '_')
            .replace(/:/g, '-'),
          videoPlayAddr: shareDetail.video?.playAddr,
          images: shareDetail.images?.map(img => img.urlList[0]),
          cover: shareDetail.video?.cover?.[0],
          musicPlayUrl: shareDetail.music?.playUrl,
        }
      }

      consola.info(`作者: ${nickname}`)
      consola.info(`描述: ${(awemeData.desc || '').substring(0, 50)}...`)

      consola.start('开始下载...')
      const downloadPath = path.resolve(options.output)

      const downloader = new DouyinDownloader({
        cookie: options.cookie || '',
        downloadPath,
        naming: '{nickname}_{aweme_id}',
        folderize: false,
        cover: options.cover || false,
        music: options.music || false,
        desc: options.desc || false,
      })

      await downloader.createDownloadTasks(awemeData, downloadPath)
      consola.success('下载完成!')
    } catch (error) {
      exitWithError('下载出错:', error)
    }
  })

program
  .command('user <url>')
  .alias('u')
  .description('下载用户主页作品（按链接识别抖音 / 快手）')
  .option('-o, --output <path>', '下载目录', './downloads')
  .option('-n, --number <count>', '下载数量 (0 表示全部)', '0')
  .option('-c, --cookie <cookie>', 'Cookie（抖音必填；快手也可用环境变量 KS_COOKIES）')
  .option('--cover', '下载封面')
  .option('--music', '下载音乐')
  .option('--desc', '下载文案')
  .option('--media <type>', '快手媒体: all | video | image（默认 all；抖音忽略）')
  .option('--export <format>', '快手同时导出作品列表: csv | json（抖音忽略）')
  .option('--device-os <os>', '设备指纹平台: mac | windows（默认跟随本机）')
  .option('--device-seed <seed>', '设备指纹随机种子，同一 seed 复现同一台设备')
  .action(
    async (
      url: string,
      options: SharedDownloadOptions & {
        number: string
      }
    ) => {
      try {
        if (resolveCliPlatform(url) === 'kuaishou') {
          warnIf(
            douyinOnlyIgnoredMessage({
              music: options.music,
              deviceOs: options.deviceOs,
              deviceSeed: options.deviceSeed,
            })
          )
          await runKuaishouUser(url, {
            output: options.output,
            number: options.number,
            cookie: options.cookie,
            cover: options.cover,
            desc: options.desc,
            media: options.media,
            exportAs: options.export,
          })
          return
        }
        warnIf(kuaishouOnlyIgnoredMessage({ media: options.media, exportAs: options.export }))

        if (!options.cookie) {
          consola.error('请提供 cookie 参数: --cookie <cookie>')
          process.exit(1)
        }

        setConfig({
          downloadPath: options.output,
          cookie: options.cookie,
          device: resolveDevice(options),
        })

        const maxCount = parseInt(options.number) || 0

        consola.start('解析用户链接...')
        const secUserId = await getSecUserId(url)
        consola.info(`用户ID: ${secUserId}`)

        const handler = new DouyinHandler({ cookie: options.cookie })
        const downloadPath = path.resolve(options.output)

        const downloader = new DouyinDownloader({
          cookie: options.cookie,
          downloadPath,
          naming: '{nickname}_{aweme_id}',
          folderize: false,
          cover: options.cover || false,
          music: options.music || false,
          desc: options.desc || false,
        })

        consola.start('开始下载用户作品...')
        let count = 0

        for await (const postFilter of handler.fetchUserPostVideos(secUserId, {
          maxCounts: maxCount,
        })) {
          const awemeList = postFilter.toAwemeDataList()

          for (const awemeData of awemeList) {
            count++
            consola.info(`[${count}] 下载: ${awemeData.awemeId}`)

            await downloader.createDownloadTasks(awemeData, downloadPath)

            if (maxCount > 0 && count >= maxCount) break
          }

          if (maxCount > 0 && count >= maxCount) break
        }

        consola.success(`下载完成! 共 ${count} 个作品`)
      } catch (error) {
        exitWithError('下载出错:', error)
      }
    }
  )

interface KuaishouFetchOptions {
  output: string
  number: string
  cookie?: string
  export?: string
  download?: boolean
  cover?: boolean
  desc?: boolean
  media?: string
}

function fetchOptions(options: KuaishouFetchOptions) {
  return {
    output: options.output,
    number: options.number,
    cookie: options.cookie,
    exportAs: options.export,
    download: options.download,
    cover: options.cover,
    desc: options.desc,
    media: options.media,
  }
}

const ks = program.command('ks').alias('kuaishou').description('快手：搜索、推荐流、评论、直播弹幕')

ks.command('search <keyword>')
  .description('搜索作品并下载（--no-download 时只列出或导出）')
  .option('-o, --output <path>', '下载 / 导出目录', './downloads')
  .option('-n, --number <count>', '数量，0 表示尽量全部', '20')
  .option('-c, --cookie <cookie>', 'Cookie，也可设环境变量 KS_COOKIES')
  .option('--media <type>', '媒体: all | video | image（默认 all）')
  .option('--export <format>', '导出作品列表: csv | json')
  .option('--no-download', '不下载媒体；可配合 --export 只写出列表')
  .option('--cover', '下载封面')
  .option('--desc', '下载文案')
  .action(async (keyword: string, options: KuaishouFetchOptions) => {
    try {
      await runKuaishouSearch(keyword, fetchOptions(options))
    } catch (error) {
      exitWithError('搜索出错:', error)
    }
  })

ks.command('hot')
  .description('下载推荐流作品')
  .option('-o, --output <path>', '下载 / 导出目录', './downloads')
  .option('-n, --number <count>', '数量，0 表示尽量全部', '20')
  .option('-c, --cookie <cookie>', 'Cookie，也可设环境变量 KS_COOKIES')
  .option('--media <type>', '媒体: all | video | image（默认 all）')
  .option('--export <format>', '导出作品列表: csv | json')
  .option('--no-download', '不下载媒体；可配合 --export 只写出列表')
  .option('--cover', '下载封面')
  .option('--desc', '下载文案')
  .action(async (options: KuaishouFetchOptions) => {
    try {
      await runKuaishouHot(fetchOptions(options))
    } catch (error) {
      exitWithError('推荐流出错:', error)
    }
  })

ks.command('comments <urlOrId>')
  .description('拉取作品评论，输出 JSON（-o 写文件，否则打到标准输出）')
  .option('-n, --number <count>', '数量，0 表示尽量全部', '20')
  .option('-o, --output <path>', 'JSON 文件或目录；省略则打印到标准输出')
  .option('-c, --cookie <cookie>', 'Cookie，也可设环境变量 KS_COOKIES')
  .action(
    async (urlOrId: string, options: { number: string; output?: string; cookie?: string }) => {
      try {
        await runKuaishouComments(urlOrId, options)
      } catch (error) {
        exitWithError('评论出错:', error)
      }
    }
  )

ks.command('live <urlOrEid>')
  .description('连接直播间弹幕，打印评论 / 礼物 / 点赞')
  .option('-c, --cookie <cookie>', 'Cookie，也可设环境变量 KS_COOKIES')
  .option('--duration <seconds>', '监听秒数，省略则一直收到 Ctrl+C')
  .action(async (urlOrEid: string, options: { cookie?: string; duration?: string }) => {
    try {
      await runKuaishouLive(urlOrEid, options, {
        onSession(session) {
          let stopping = false
          process.once('SIGINT', () => {
            if (stopping) process.exit(130)
            stopping = true
            consola.info('正在停止弹幕监听...')
            session.stop()
          })
        },
      })
    } catch (error) {
      exitWithError('直播出错:', error)
    }
  })

program.parse()
