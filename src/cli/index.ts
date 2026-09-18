#!/usr/bin/env node

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

const program = new Command()

program.name('pdl').description('多平台短视频下载器（抖音 / 快手 ...）').version('0.5.0')

interface DeviceOptions {
  deviceOs?: string
  deviceSeed?: string
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

program
  .command('download <url>')
  .alias('d')
  .description('下载单个视频或图集（无需 Cookie）')
  .option('-o, --output <path>', '下载目录', './downloads')
  .option('-c, --cookie <cookie>', 'Cookie（可选，不提供时使用免登录模式）')
  .option('--cover', '下载封面')
  .option('--music', '下载音乐')
  .option('--desc', '下载文案')
  .option('--device-os <os>', '设备指纹平台: mac | windows（默认跟随本机）')
  .option('--device-seed <seed>', '设备指纹随机种子，同一 seed 复现同一台设备')
  .action(
    async (
      url: string,
      options: {
        output: string
        cookie?: string
        cover?: boolean
        music?: boolean
        desc?: boolean
      } & DeviceOptions
    ) => {
      try {
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
        consola.error('下载出错:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    }
  )

program
  .command('user <url>')
  .alias('u')
  .description('下载用户主页作品')
  .option('-o, --output <path>', '下载目录', './downloads')
  .option('-n, --number <count>', '下载数量 (0 表示全部)', '0')
  .option('-c, --cookie <cookie>', 'Cookie')
  .option('--cover', '下载封面')
  .option('--music', '下载音乐')
  .option('--desc', '下载文案')
  .option('--device-os <os>', '设备指纹平台: mac | windows（默认跟随本机）')
  .option('--device-seed <seed>', '设备指纹随机种子，同一 seed 复现同一台设备')
  .action(
    async (
      url: string,
      options: {
        output: string
        number: string
        cookie?: string
        cover?: boolean
        music?: boolean
        desc?: boolean
      } & DeviceOptions
    ) => {
      try {
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
        consola.error('下载出错:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    }
  )

program.parse()
