# PolyDL

多平台短视频下载器（抖音 / 快手 ...）- Node.js/TypeScript 实现

抖音模块基于 [Johnserf-Seed/f2](https://github.com/Johnserf-Seed/f2) Python 项目重写的 Node.js 版本，并扩展为多平台架构。

快手模块的数据接口、`__NS_hxfalcon` / `__NS_sig3` 签名和直播弹幕移植自 [cv-cat/KuaiShou-Spider](https://github.com/cv-cat/KuaiShou-Spider)。签名在本地用纯 TypeScript 计算，不需要浏览器，也不需要远程签名服务（`RemoteSigner` 仍可按需注入）。向量对照见 `tests/fixtures/kuaishou/sign-vectors.json`。

## 功能特性

- 单个作品下载（视频/图集）
- 用户主页作品批量下载
- 支持下载封面、音乐、文案、歌词（音乐 / 歌词为抖音）
- 直播流下载（FLV/M3U8，抖音）
- 快手：搜索、推荐流、评论、作品列表 CSV/JSON 导出
- 快手直播弹幕（评论 / 礼物 / 点赞）
- 并发下载控制
- 自定义文件命名模板
- CLI 命令行工具（`download` / `user` 按链接分发平台，快手另有 `ks` 命令组）
- 完整的 TypeScript 类型支持

## 安装

```bash
# npm 安装
npm install polydl

# 全局安装 CLI
npm install -g polydl
```

开发模式：

```bash
git clone https://github.com/Everless321/PolyDL.git
cd PolyDL
npm install
npm run build
```

## CLI 使用

`download` 和 `user` 用链接域名选择平台。抖音可以不带 Cookie 下载单个作品；快手必须提供完整网页 Cookie。

```bash
# 抖音：下载单个作品（可不带 Cookie）
pdl download "https://v.douyin.com/xxx" -c "your_cookie" -o ./downloads

# 抖音：下载用户主页作品
pdl user "https://www.douyin.com/user/xxx" -c "your_cookie" -n 10

# 快手：下载单个作品。Cookie 也可用环境变量 KS_COOKIES
pdl download "https://www.kuaishou.com/short-video/<photoId>" \
  -c "$KS_COOKIES" -o ./downloads --media all --export csv

# 快手：用户主页（--media video|image|all，--export csv|json）
pdl user "https://www.kuaishou.com/profile/<eid>" -n 20 --cover --desc

# 快手专用命令
pdl ks search "美食" -n 20 --export json
pdl ks search "美食" --no-download --export csv
pdl ks hot -n 10
pdl ks comments "https://www.kuaishou.com/short-video/<photoId>" -n 50 -o ./comments.json
pdl ks live "https://live.kuaishou.com/u/<eid>" --duration 60

# 查看帮助
pdl --help
pdl download --help
pdl user --help
pdl ks --help
```

`ks` 的别名是 `kuaishou`（例如 `pdl kuaishou hot`）。

### 命令选项

| 选项 | 说明 |
|------|------|
| `-o, --output <path>` | 下载目录 (默认: ./downloads)。`ks comments` 里省略则把 JSON 打到标准输出；传目录时写入 `comments.json` |
| `-c, --cookie <cookie>` | Cookie。抖音单个作品可省略，用户主页必填。快手必填，未传 `-c` 时读取 `KS_COOKIES` |
| `-n, --number <count>` | 数量。`user` 默认 0（全部）；`ks search` / `ks hot` / `ks comments` 默认 20，0 表示尽量全部 |
| `--cover` | 下载封面 |
| `--music` | 下载音乐（仅抖音；快手会警告并忽略） |
| `--desc` | 下载文案。快手还会在作品目录写 `detail.txt` 和 `info.json` |
| `--media <all\|video\|image>` | 快手媒体类型，默认 `all`。抖音链接上会警告并忽略 |
| `--export <csv\|json>` | 快手在下载之外写出作品列表。抖音链接上会警告并忽略 |
| `--no-download` | `ks search` / `ks hot`：不下载媒体。配合 `--export` 只导出；都不传时把列表打到日志 |
| `--duration <seconds>` | `ks live` 监听秒数，省略则直到 Ctrl+C |
| `--device-os <os>` | 抖音设备指纹平台：`mac` / `windows`（默认跟随本机）。快手忽略 |
| `--device-seed <seed>` | 抖音设备指纹随机种子。快手忽略 |

快手 Cookie 必须是浏览器里 `www.kuaishou.com` 的**整段**请求头，至少包含 `kwfv1` 和 `kuaishou.server.web*_st`。库不会用二维码、短信或 kwf/kws 预言机去补这份 Cookie。

## 程序化调用

### 下载单个作品

```typescript
import { DouyinHandler, DouyinDownloader } from 'polydl'

const cookie = 'your_cookie'
const videoUrl = 'https://v.douyin.com/xxx'

// 获取作品详情（支持短链接和长链接）
const handler = new DouyinHandler({ cookie })
const postDetail = await handler.fetchOneVideo(videoUrl)

console.log('作品ID:', postDetail.awemeId)
console.log('作者:', postDetail.nickname)
console.log('描述:', postDetail.desc)

// 下载
const downloader = new DouyinDownloader({
  cookie,
  downloadPath: './downloads',
  naming: '{nickname}_{aweme_id}',
  cover: true,
  music: true,
  desc: true,
})

await downloader.createDownloadTasks(postDetail.toAwemeData(), './downloads')
```

### 批量下载用户作品

```typescript
import { getSecUserId, DouyinHandler, DouyinDownloader } from 'polydl'

const cookie = 'your_cookie'
const userUrl = 'https://www.douyin.com/user/xxx'

// 解析用户 ID
const secUserId = await getSecUserId(userUrl)

const handler = new DouyinHandler({ cookie })
const downloader = new DouyinDownloader({
  cookie,
  downloadPath: './downloads',
  naming: '{nickname}_{aweme_id}',
})

// 遍历用户作品
for await (const postFilter of handler.fetchUserPostVideos(secUserId, { maxCounts: 10 })) {
  const awemeList = postFilter.toAwemeDataList()

  for (const awemeData of awemeList) {
    await downloader.createDownloadTasks(awemeData, './downloads')
  }
}
```

### 获取用户资料

```typescript
import { getSecUserId, DouyinHandler } from 'polydl'

const handler = new DouyinHandler({ cookie: 'your_cookie' })
const secUserId = await getSecUserId('https://www.douyin.com/user/xxx')
const profile = await handler.fetchUserProfile(secUserId)

console.log(profile.nickname)
console.log(profile.followerCount)
console.log(profile.totalFavorited)
```

### 快手：作品、搜索与导出

Cookie 与 [KuaiShou-Spider](https://github.com/cv-cat/KuaiShou-Spider) 一样，从环境变量 `KS_COOKIES` 读取即可。不传 `signer` 时使用本地 `LocalSigner`。

```typescript
import {
  KuaishouHandler,
  KuaishouDownloader,
  exportWorksToCsv,
} from 'polydl'

const cookie = process.env.KS_COOKIES || ''
const handler = new KuaishouHandler({ cookie })

const work = await handler.fetchWork('https://www.kuaishou.com/short-video/<photoId>')
const downloader = new KuaishouDownloader({
  cookie,
  downloadPath: './downloads',
  mediaType: 'all', // all | video | image，对应 save_choice 的 media / media-video / media-image
  cover: true,
  desc: true,
})
await downloader.downloadWork(work)

const works = []
for await (const page of handler.fetchUserWorks('https://www.kuaishou.com/profile/<eid>', {
  maxCounts: 20,
})) {
  works.push(...page)
}
exportWorksToCsv(works, './downloads/kuaishou-works.csv')
```

`fetchUserProfile` 走 GraphQL `visionProfile`。搜索和推荐流：

```typescript
for await (const page of handler.searchWorks('美食', { maxCounts: 20 })) {
  console.log(page.map(item => item.workId))
}
for await (const page of handler.fetchFeedHot({ maxCounts: 10 })) {
  console.log(page.length)
}
for await (const page of handler.fetchComments('<photoId>', { maxCounts: 50 })) {
  console.log(page)
}
```

### 快手：直接调用 Web API

`KuaishouWebApi` 对齐 KuaiShou-Spider 的 www 数据接口：推荐流、作品详情、评论、当前用户资料、主页作品、搜索作品/用户、关注关系、喜欢、收藏、私密、直播回放。历史列表端点已 404，调用会直接拒绝。

```typescript
import { KuaishouWebApi } from 'polydl'

const api = new KuaishouWebApi({ cookie: process.env.KS_COOKIES || '' })
const detail = await api.getVideoDetail('https://www.kuaishou.com/short-video/<photoId>')
const hot = await api.getSomeFeedHot(10)
for await (const feeds of api.iterProfileFeed('<eid>', { maxCounts: 20 })) {
  console.log(feeds.length)
}
const users = await api.searchUser('昵称', '')
```

需要把签名交给外部服务时，传入可选的 `RemoteSigner`（默认不需要）：

```typescript
import { KuaishouHandler, RemoteSigner } from 'polydl'

const handler = new KuaishouHandler({
  cookie: process.env.KS_COOKIES || '',
  signer: new RemoteSigner({ endpoint: 'https://example.com/kuaishou/sign', token: '...' }),
})
```

### 快手：直播弹幕

```typescript
import { KuaishouLiveClient, KuaishouLiveDanmaku, createLiveSigner } from 'polydl'

const client = new KuaishouLiveClient({
  cookie: process.env.KS_COOKIES || '',
  signer: createLiveSigner(), // 直播站 __NS_hxfalcon，SDK 版本与 www 不同
})
const danmaku = new KuaishouLiveDanmaku({
  eid: '<eid>',
  client,
})
danmaku.on('comment', frame => console.log(frame.payload.content))
danmaku.on('gift', frame => console.log(frame.payload.giftId))
danmaku.on('like', frame => console.log(frame.payload.user))
const stats = await danmaku.run({ duration: 60 })
console.log(stats)
```

更完整的脚本见 `examples/kuaishou-user-posts.ts` 和 `examples/kuaishou-live-danmaku.ts`。

## 下载配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `cookie` | string | - | Cookie (必需) |
| `downloadPath` | string | `'./downloads'` | 下载目录 |
| `maxConcurrency` | number | `3` | 最大并发数 |
| `timeout` | number | `30000` | 超时时间 (ms) |
| `retries` | number | `3` | 重试次数 |
| `naming` | string | `'{create}_{desc}'` | 文件命名模板 |
| `folderize` | boolean | `false` | 按作品分文件夹 |
| `music` | boolean | `false` | 下载音乐 |
| `cover` | boolean | `false` | 下载封面 |
| `desc` | boolean | `false` | 下载文案 |
| `lyric` | boolean | `false` | 下载歌词 |
| `device` | DeviceProfile | 全局配置 | 该实例专用的设备指纹，见「设备指纹」 |

### 命名模板变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `{create}` | 创建时间 | `2024-01-15_12-30-00` |
| `{nickname}` | 作者昵称 | `小白兔奶糖ovo` |
| `{aweme_id}` | 作品 ID | `7597330590627487921` |
| `{desc}` | 作品描述 (截断) | `今天天气真好` |
| `{caption}` | 标题 | `标题文字` |
| `{uid}` | 用户 ID | `123456789` |

### 下载文件类型

| 类型 | 后缀 | 说明 |
|------|------|------|
| 视频 | `.mp4` | 普通视频作品 |
| 图集 | `.webp` | 图文作品的图片 |
| 封面 | `.webp` / `.jpeg` | 动态封面/静态封面 |
| 音乐 | `.mp3` | 背景音乐 |
| 文案 | `.txt` | 作品描述 |
| 歌词 | `.lrc` | 音乐歌词 |

## 设备指纹（DeviceProfile）

UA、Client Hints（`Sec-Ch-Ua*`）、请求参数（`browser_*` / `os_*` / `screen_*`）、A-Bogus 窗口指纹
都从同一份 `DeviceProfile` 派生，保证一次会话内**自洽且稳定**，不同用户之间**互不相同**。

不做任何配置时，进程启动会按本机平台随机生成一份 profile（近期 Chrome 版本 + 常见分辨率），
同一进程内保持不变。

```typescript
import { setConfig, createDeviceProfile } from 'polydl'

// 生成一份可复现的设备指纹并持久化（推荐把 seed 存起来）
const device = createDeviceProfile({
  os: 'mac',              // 'mac' | 'windows'，默认按 process.platform
  browser: 'chrome',      // 'chrome' | 'edge'，默认 chrome
  screen: { width: 1512, height: 982 },
  cpuCores: 10,
  deviceMemory: 8,        // navigator.deviceMemory 上限为 8
  seed: 'your-machine-id' // 同一 seed 得到完全相同的 profile
})

setConfig({ cookie, device })
```

**为什么要让 Cookie 与指纹同源**：Cookie 是在某个浏览器环境里登录拿到的。
如果登录环境是 Mac Chrome、而请求自报 Windows Edge，两者不一致极易被风控识别。
把登录窗口和后续 API 请求用同一份 `DeviceProfile`（同一 UA）即可避免。

按实例覆盖（多账号一账号一指纹）：

```typescript
new DouyinHandler({ cookie: cookieA, device: deviceA })
new DouyinDownloader({ cookie: cookieA, device: deviceA })
```

派生函数：`userAgentOf` / `clientHintsOf` / `webRequestParamsOf` / `webcastParamsOf`，
以及从 UA 反推 profile 的 `deviceFromUserAgent`。

> 旧用法 `setConfig({ userAgent })` 仍然可用：内部会反推成 `DeviceProfile`，
> Client Hints 与请求参数随之变成对应的平台与版本。
> `DEFAULT_USER_AGENT` 与 `generateBrowserFingerprint` 已废弃。
>
> `LATEST_CHROME_MAJOR` 需随 Chrome 发版更新（当前 154，核实于 2026-09-18）。

## API 参考

### DouyinHandler

| 方法 | 说明 |
|------|------|
| `fetchUserProfile(secUserId)` | 获取用户资料 |
| `fetchOneVideo(urlOrAwemeId)` | 获取单个作品详情 (支持链接或ID) |
| `fetchUserPostVideos(secUserId, options)` | 获取用户作品列表 (生成器) |
| `fetchUserLikeVideos(secUserId, options)` | 获取用户喜欢列表 (生成器) |
| `fetchUserCollectionVideos(options)` | 获取用户收藏 (生成器) |
| `fetchUserCollects(options)` | 获取用户收藏夹列表 (生成器) |
| `fetchUserCollectsVideos(collectsId, options)` | 获取收藏夹作品 (生成器) |
| `fetchUserMixVideos(mixId, options)` | 获取合集作品 (生成器) |
| `fetchUserMusicCollection(options)` | 获取用户音乐收藏 (生成器) |
| `fetchRelatedVideos(awemeId, options)` | 获取相关推荐作品 (生成器) |
| `fetchFriendFeedVideos(options)` | 获取朋友作品 (生成器) |
| `fetchPostComment(awemeId, options)` | 获取作品评论 (生成器) |
| `fetchPostCommentReply(itemId, commentId, options)` | 获取评论回复 (生成器) |
| `fetchUserFollowing(secUserId, userId, options)` | 获取关注列表 (生成器) |
| `fetchUserFollower(userId, secUserId, options)` | 获取粉丝列表 (生成器) |
| `fetchUserLiveVideos(webRid, roomIdStr)` | 获取用户直播信息 |
| `fetchUserLiveVideos2(roomId)` | 获取用户直播信息2 |
| `fetchUserLiveStatus(userIds)` | 获取用户直播状态 |
| `fetchFollowingUserLive()` | 获取关注用户直播列表 |
| `fetchHomePostSearch(keyword, fromUser, options)` | 主页作品搜索 (生成器) |
| `fetchSuggestWords(query, count)` | 搜索建议词 |
| `fetchQueryUser(secUserIds)` | 查询用户 |
| `fetchPostStats(itemId, awemeType, playDelta)` | 获取作品统计 |

### DouyinDownloader

| 方法 | 说明 |
|------|------|
| `createDownloadTasks(awemeData, path)` | 创建作品下载任务 |
| `createMusicDownloadTasks(musicData, path)` | 创建音乐下载任务 |
| `createStreamTasks(webcastData, path)` | 创建直播流下载任务 |

### 工具函数

| 函数 | 说明 |
|------|------|
| `getAwemeId(url)` | 从链接解析作品 ID |
| `getSecUserId(url)` | 从链接解析用户 ID |
| `getMixId(url)` | 从链接解析合集 ID |
| `getWebcastId(url)` | 从链接解析直播间 ID |
| `getRoomId(url)` | 从链接解析房间 ID |
| `resolveDouyinUrl(url)` | 统一解析链接 (自动识别类型) |
| `getAllAwemeId(urls)` | 批量解析作品 ID |
| `getAllSecUserId(urls)` | 批量解析用户 ID |

## 获取 Cookie

抖音：

1. 打开浏览器访问 [抖音网页版](https://www.douyin.com/)
2. 登录账号
3. 打开开发者工具 (F12)
4. 切换到 Network 标签
5. 刷新页面，找到任意请求
6. 复制请求头中的 Cookie 值

快手：同样从 [快手网页版](https://www.kuaishou.com/) 已登录请求里复制**整段** Cookie，确认里面有 `kwfv1` 和 `kuaishou.server.web*_st`，再用 `-c` 或 `KS_COOKIES` 传入。直播弹幕有时还要求这份 Cookie 对 `live.kuaishou.com` 有效。

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck

# 代码格式化
npm run format

# 运行测试
npm run test
```

## 注意事项

- 请遵守抖音的使用条款
- 本项目仅供学习交流使用
- 请勿用于商业用途
- Cookie 请妥善保管，不要泄露

## License

MIT
