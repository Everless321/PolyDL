# PolyDL

多平台短视频下载器（抖音 / 快手 ...）- Node.js/TypeScript 实现

抖音模块基于 [Johnserf-Seed/f2](https://github.com/Johnserf-Seed/f2) Python 项目重写的 Node.js 版本，并扩展为多平台架构。

## 功能特性

- 单个作品下载（视频/图集）
- 用户主页作品批量下载
- 支持下载封面、音乐、文案、歌词
- 直播流下载（FLV/M3U8）
- 并发下载控制
- 自定义文件命名模板
- CLI 命令行工具
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

```bash
# 下载单个作品
pdl download "https://v.douyin.com/xxx" -c "your_cookie" -o ./downloads

# 下载用户主页作品
pdl user "https://www.douyin.com/user/xxx" -c "your_cookie" -n 10

# 查看帮助
pdl --help
pdl download --help
pdl user --help
```

### 命令选项

| 选项 | 说明 |
|------|------|
| `-o, --output <path>` | 下载目录 (默认: ./downloads) |
| `-c, --cookie <cookie>` | Cookie (必需) |
| `-n, --number <count>` | 下载数量，0表示全部 (仅 user 命令) |
| `--cover` | 下载封面 |
| `--music` | 下载音乐 |
| `--desc` | 下载文案 |

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

1. 打开浏览器访问 [抖音网页版](https://www.douyin.com/)
2. 登录账号
3. 打开开发者工具 (F12)
4. 切换到 Network 标签
5. 刷新页面，找到任意请求
6. 复制请求头中的 Cookie 值

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
