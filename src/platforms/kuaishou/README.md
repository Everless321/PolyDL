# 快手平台（kuaishou）

数据接口、`__NS_hxfalcon` / `__NS_sig3` 和直播弹幕移植自 [KuaiShou-Spider](https://github.com/cv-cat/KuaiShou-Spider)。签名在 `sign/` 里用纯 TypeScript 计算，`LocalSigner` 是默认实现，不需要浏览器或远程签名服务。`RemoteSigner` 仍然可以注入。

签名结果与 Python 参考实现逐条对照，向量在 `tests/fixtures/kuaishou/sign-vectors.json`，测试在 `tests/kuaishou-sign.test.ts`。

## 通道

| 通道      | 端点                | 签名                                      | 登录                |
| --------- | ------------------- | ----------------------------------------- | ------------------- |
| GraphQL   | `/graphql`          | 不需要                                    | 需要登录态          |
| 签名 REST | `/rest/v/*`         | 本地 `__NS_hxfalcon`（`caver=2`）         | 需要登录态          |
| 直播站    | `live.kuaishou.com` | 本地 `__NS_hxfalcon`，SDK 版本与 www 不同 | 建议带直播站 Cookie |

两条路都要**完整网页 Cookie**，至少包含 `kwfv1` 和 `kuaishou.server.web*_st`。请求头里的 `kww` 直接取 Cookie 中的 `kwfv1`，不会在本地重新生成。

## 默认用法

```ts
import { KuaishouHandler, KuaishouDownloader, exportWorksToJson } from 'polydl'

const handler = new KuaishouHandler({ cookie: process.env.KS_COOKIES })

const work = await handler.fetchOneVideo('https://www.kuaishou.com/short-video/<photoId>')
await new KuaishouDownloader({
  cookie: process.env.KS_COOKIES,
  downloadPath: './downloads',
  mediaType: 'all', // all | video | image
  cover: true,
  desc: true,
}).downloadWork(work)

const works = []
for await (const page of handler.fetchUserPostVideos('<eid 或主页链接>', { maxCounts: 20 })) {
  works.push(...page)
}
exportWorksToJson(works, './downloads/kuaishou-works.json')
```

原始 JSON 用 `KuaishouWebApi`。

## 与抖音对应的方法

`KuaishouHandler` 的方法名与 `DouyinHandler` 一致。参数和返回值用快手自己的类型：作品是 `KuaishouWork`，评论和用户是接口原始对象。两边都接受 `{ maxCounts }`，所以 `handler.fetchUserPostVideos(id, { maxCounts: 20 })` 这种调用在两个平台写法相同。抖音的 `maxCursor`、`pageCounts`、`interval` 快手不支持；`pcursor` 只有 `fetchUserPostVideos` 认，其他列表方法都从第一页开始。

| 功能         | DouyinHandler                           | KuaishouHandler                          | 快手每页产出     | 说明                             |
| ------------ | --------------------------------------- | ---------------------------------------- | ---------------- | -------------------------------- |
| 单个作品     | `fetchOneVideo(url)`                    | `fetchOneVideo(url)`                     | `KuaishouWork`   | 返回单个对象，不分页             |
| 用户资料     | `fetchUserProfile(secUserId)`           | `fetchUserProfile(eidOrUrl)`             | `VisionProfile`  | 返回单个对象，不分页             |
| 用户主页作品 | `fetchUserPostVideos(secUserId, opts)`  | `fetchUserPostVideos(eidOrUrl, opts)`    | `KuaishouWork[]` | REST 第一页失败时退回 GraphQL    |
| 喜欢         | `fetchUserLikeVideos(secUserId, opts)`  | `fetchUserLikeVideos(opts)`              | `KuaishouWork[]` | 只能查当前登录账号               |
| 收藏         | `fetchUserCollectionVideos(opts)`       | `fetchUserCollectionVideos({ userId? })` | `KuaishouWork[]` | 不传 `userId` 查自己；传了查别人 |
| 相关推荐     | `fetchRelatedVideos(awemeId, opts)`     | `fetchRelatedVideos(photoIdOrUrl, opts)` | `KuaishouWork[]` | 接口只有一页                     |
| 评论         | `fetchPostComment(awemeId, opts)`       | `fetchPostComment(photoIdOrUrl, opts)`   | 评论原始对象     |                                  |
| 评论回复     | `fetchPostCommentReply(itemId, cid)`    | `fetchPostCommentReply(photoId, rootId)` | 评论原始对象     | `rootId` 是评论的 `commentId`    |
| 关注列表     | `fetchUserFollowing(secUserId, userId)` | `fetchUserFollowing(opts)`               | 用户原始对象     | 只能查当前登录账号               |
| 粉丝列表     | `fetchUserFollower(userId, secUserId)`  | `fetchUserFollower(opts)`                | 用户原始对象     | 只能查当前登录账号               |
| 搜索作品     | —                                       | `searchWorks(keyword, opts)`             | `KuaishouWork[]` | 快手独有                         |
| 推荐流       | —                                       | `fetchFeedHot(opts)`                     | `KuaishouWork[]` | 快手独有                         |
| 搜索用户     | —                                       | `fetchSearchUser(keyword, opts)`         | 用户原始对象     | 快手独有                         |
| 私密作品     | —                                       | `fetchUserPrivateVideos(opts)`           | `KuaishouWork[]` | 快手独有，只能查当前登录账号     |
| 直播回放     | —                                       | `fetchUserLiveReplays(eidOrUrl, opts)`   | 回放原始对象     | 快手独有                         |

快手没有对应接口的抖音方法：`fetchUserCollects` / `fetchUserCollectsVideos`（收藏夹）、`fetchUserMixVideos`（合集）、`fetchUserMusicCollection`、`fetchFriendFeedVideos`、`fetchHomePostSearch`（在某个用户主页内搜索）、`fetchSuggestWords`、`fetchQueryUser`、`fetchPostStats`。抖音的直播方法在快手这边是 `KuaishouLiveClient` / `KuaishouLiveDanmaku`，见下文。

旧名字 `fetchWork`、`fetchUserWorks`、`fetchComments` 仍然可用，分别等于 `fetchOneVideo`、`fetchUserPostVideos`、`fetchPostComment`。

作品字段经 `normalizeWork` 收成 `KuaishouWork`。列表导出是 CSV（UTF-8 BOM，列与 Python `save_to_xlsx` 一致）或 JSON，不依赖 xlsx 库。

## 可选的远程签名

```ts
import { KuaishouHandler, RemoteSigner } from 'polydl'

const handler = new KuaishouHandler({
  cookie: userLoginCookie,
  signer: new RemoteSigner({ endpoint: 'https://example.com/kuaishou/sign', token: '...' }),
})
```

`/sign` 约定不变：`POST { method, path, body? }` → `{ hxfalcon }`。不传 `signer` 时不会访问该服务。

## 直播弹幕

```ts
import { KuaishouLiveClient, KuaishouLiveDanmaku, createLiveSigner } from 'polydl'

const client = new KuaishouLiveClient({
  cookie: process.env.KS_COOKIES,
  signer: createLiveSigner(),
})
const danmaku = new KuaishouLiveDanmaku({ eid: '<eid>', client })
danmaku.on('comment', frame => console.log(frame.payload.content))
await danmaku.run({ duration: 30 })
```

`createLiveSigner()` 使用直播站参数（`site: 'live'`，独立计数器）。房间需在播；拿不到 WebSocket token 时，优先检查直播站 Cookie 和风控。

## 命令行

`pdl download` / `pdl user` 会按链接分发到本模块。快手专用命令在 `pdl ks`（别名 `kuaishou`）：`search`、`hot`、`comments`、`live`。Cookie 用 `-c` 或 `KS_COOKIES`。

## 刻意没有移植

- 二维码登录、短信登录
- 创作者中心的发布 / 上传（`__NS_sig3` 算法本身已移植并通过向量测试，但没有接到发布流程）
- 滑块验证码求解
- gdfp 指纹上报
- 用 kwf/kws 的 Node 预言机引导 Cookie。调用方必须自己提供含 `kwfv1` 的完整网页 Cookie

## 已知限制

- `result=400002`（或 GraphQL 的 captcha URL）抛 `KuaishouRiskError`，只带验证页地址，不解题
- `result=109` 或文案 `No Login` 抛 `KuaishouLoginError`
- 直播弹幕依赖房间在播，并且 Cookie 往往要对 `live.kuaishou.com` 有效；风控时 `websocketinfo` 不下发 token
- 推荐流合同可能随网页改版变化
- 观看历史接口已 404，`getHistoryList` 直接拒绝，不会发请求
- 关注页作品流 `visionProfilePhotoList(page=follow)` 实测返回 `result=50` 和空列表，所以 handler 没有包装它
- 列表接口不返回评论数和分享数，`commentCount` / `shareCount` 为 0；详情接口的点赞数是取整后的值
