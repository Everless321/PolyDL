# 快手（Kuaishou）接入设计

> 状态：www 数据接口、本地 `__NS_hxfalcon` / `__NS_sig3`、作品下载与 CSV/JSON 导出、直播弹幕，以及 CLI 分发已经接上。
> 代码：`src/platforms/kuaishou/`。签名与 Python 参考实现的对照向量在 `tests/fixtures/kuaishou/sign-vectors.json`。

## 1. 背景

PolyDL 多平台架构下，快手是继抖音之后的第二个平台。抖音签名来自 [f2](https://github.com/Johnserf-Seed/f2) 的纯 TypeScript 移植。快手这边对应的上游是 [KuaiShou-Spider](https://github.com/cv-cat/KuaiShou-Spider)：`__NS_hxfalcon` 和 `__NS_sig3` 已在该项目里纯算实现，本仓库按同一算法移植，并用向量做了逐字节对照（`tests/kuaishou-sign.test.ts`）。

因此不再依赖常驻浏览器。`RemoteSigner` 只作为可选注入保留。

## 2. 快手 web 的数据接口

| 通道 | 端点 | 签名 | 登录 | 库内实现 |
|------|------|------|------|----------|
| GraphQL | `/graphql` | 不需要 | 需要登录态 | 资料、评论，以及 REST 失败时的作品列表回退 |
| 签名 REST | `/rest/v/*` | 本地 `__NS_hxfalcon` | 需要登录态 | `KuaishouWebApi` / `KuaishouRestClient` |
| 直播站 | `live.kuaishou.com` | 本地 `__NS_hxfalcon`（直播 SDK 版本） | 建议直播站 Cookie | `KuaishouLiveClient`、`KuaishouLiveDanmaku` |

`KuaishouWebApi` 覆盖的能力：

- 推荐流：`getFeedHot` / `iterFeedHot`
- 作品详情：`getVideoDetail` / `getWorkInfo`（GraphQL `visionVideoDetail`，`page=detail`）
- 评论：`commentListQuery`（`iterCommentsGql`）以及 REST 评论
- 当前用户资料与主页作品：`getProfile`、`getProfileFeed` / `iterProfileFeed`
- 搜索作品 / 用户：`searchFeed`、`searchUser`
- 关系、喜欢、收藏、私密：`getRelation`、`getLikedList`、`getCollectList`、`getPrivateList`
- 直播回放：`getPlaybackList`（不签名）

`KuaishouHandler` 在这些接口之上包了一层，方法名与 `DouyinHandler` 对齐：`fetchOneVideo`、`fetchUserPostVideos`、`fetchUserLikeVideos`、`fetchUserCollectionVideos`、`fetchPostComment` 等，作品输出 `normalizeWork` 之后的 `KuaishouWork`。完整对照见 [快手模块文档](../src/platforms/kuaishou/README.md#与抖音对应的方法)。

作品总数仍取 `visionProfile.userProfile.ownerCount.photo_public`（`photo` 字段经常是 null）。

> 登录态失效：REST `result=109` 或文案 `No Login` → `KuaishouLoginError`。风控 `result=400002`（GraphQL 则是 `errors` + `data.captcha.url`）→ `KuaishouRiskError`。

## 3. 签名

`sign/` 是纯 TypeScript，没有浏览器、没有远程进程：

- `__NS_hxfalcon`：`HxFalconSigner` / `generateHxfalcon`。www 用默认 SDK 版本；直播用 `site: 'live'`（`SDK_VERSION_LIVE`），空 body 的键保留。
- `__NS_sig3`：`Sig3Signer`。查询串和 body 参与签名，产物为 56 个 hex。创作者发布流程没有接到 Handler，算法本身有向量测试。
- `LocalSigner` 实现 `KuaishouSigner`，`KuaishouRestClient` 在未传入 signer 时使用它。计数器跟实例走，和浏览器里一个引擎跨请求递增的方式一致。
- `kww` 请求头等于 Cookie 里的 `kwfv1`（`KwwProvider`），不重新计算。

`RemoteSigner` 仍可用，契约不变：

```
POST <endpoint>
Headers: Content-Type: application/json[, Authorization: Bearer <token>]
Body:    { "method": "GET"|"POST", "path": "/rest/v/...", "body"?: "<原始 body>" }
200:     { "hxfalcon": "<__NS_hxfalcon>" }
```

媒体 CDN 直链不签名。签名只出现在列表、资料、搜索和直播握手这类接口上。

## 4. 下载、导出与 CLI

`KuaishouDownloader` 的 `mediaType` 对应 KuaiShou-Spider 的 `save_choice`：

| CLI `--media` | `mediaType` | Python `save_choice` |
|---------------|-------------|----------------------|
| `all`（默认） | `all` | `media`（视频和图文都下） |
| `video` | `video` | `media-video` |
| `image` | `image` | `media-image` |

`--export csv|json` 对应 `excel` 那一支，只是不引入 xlsx：CSV 带 UTF-8 BOM，列序与 `save_to_xlsx` 相同；JSON 保留 `raw`。`all` 在 CLI 里的含义是「下载 + 可选导出」，由 `--export` 决定要不要写表，而不是一个单独的 `all` 枚举值。

命令行：

- `pdl download <url>`、`pdl user <url>` 调用 `findPlatform`。快手用 `KuaishouHandler` + `KuaishouDownloader`；其他链接保持原来的抖音路径。
- 快手 Cookie：`-c`，否则环境变量 `KS_COOKIES`（与上游 `.env.example` 相同）。
- `pdl ks`（别名 `kuaishou`）：`search`、`hot`、`comments`、`live`。
- `--music`、`--device-os`、`--device-seed` 在快手上警告后忽略。`--media`、`--export` 在抖音上警告后忽略。

`ks live` 使用 `KuaishouLiveClient` + `createLiveSigner()` + `KuaishouLiveDanmaku`，把 `comment` / `gift` / `like` 打到日志。

## 5. 库使用示例

```ts
import { KuaishouHandler, KuaishouWebApi, KuaishouDownloader } from 'polydl'

const cookie = process.env.KS_COOKIES || ''
const handler = new KuaishouHandler({ cookie })
const api = new KuaishouWebApi({ cookie })

const detail = await api.getVideoDetail('<photoId 或作品链接>')
for await (const page of handler.fetchUserPostVideos('<eid 或主页链接>', { maxCounts: 20 })) {
  await new KuaishouDownloader({ cookie, mediaType: 'video', cover: true }).downloadWorks(page)
}
```

直播：

```ts
import { KuaishouLiveClient, KuaishouLiveDanmaku, createLiveSigner } from 'polydl'

const danmaku = new KuaishouLiveDanmaku({
  eid: '<eid>',
  client: new KuaishouLiveClient({ cookie, signer: createLiveSigner() }),
})
await danmaku.run({ duration: 60 })
```

## 6. 刻意没有移植

这些能力留在上游 Python 项目里，本仓库不实现：

- 二维码登录、短信验证码登录
- 创作者中心发布 / 上传（视频与 1～31 张图集）
- 滑块验证码求解（只把验证页 URL 放进 `KuaishouRiskError`）
- gdfp 指纹上报
- kwf/kws 的 Node 预言机，以及用它引导 `kwfv1`。用户必须自己提供完整网页 Cookie，其中要有 `kwfv1`

`getHistoryList` 对应的端点已 404，与上游一样禁止发包。

## 7. 已知限制

- 风控 `400002` 只会变成 `KuaishouRiskError`，调用方自行决定要不要打开 `captchaUrl`
- 直播弹幕可能需要对 `live.kuaishou.com` 有效的 Cookie；无 token 或 `result` 表示风控时不会建立 WebSocket
- 推荐流可能因线上合同变化失败，失败信息来自接口本身，不猜测字段
- 安全 Cookie（`kwscode` / `kwssectoken`）大约 6 分钟轮换；过期后更新整段 Cookie

## 8. 现状与待办

- [x] 平台骨架 `src/platforms/kuaishou/`，注册进 `registry.ts`
- [x] GraphQL：资料、主页列表、单作品、评论
- [x] 签名 REST 客户端；默认 `LocalSigner`，`RemoteSigner` 可选
- [x] `__NS_hxfalcon` / `__NS_sig3` 纯 TypeScript 实现，与 `tests/fixtures/kuaishou/sign-vectors.json` 逐条一致
- [x] `KuaishouWebApi`：推荐流、详情、评论、资料、主页、搜索、关系、喜欢、收藏、私密、回放
- [x] `normalizeWork`、CSV/JSON 导出、`KuaishouDownloader`
- [x] 直播只读接口与弹幕（`createLiveSigner` + `KuaishouLiveDanmaku`）
- [x] CLI：`findPlatform` 分发 `download` / `user`，以及 `ks search|hot|comments|live`
- [x] 单元测试（签名、作品、REST、API、直播、CLI 分发与 Cookie）
- [ ] 抖音之外的其它平台仍只有注册位，没有命令行实现

第 6 节列出的登录、发布、验证码和 Cookie 引导不在待办里，不会补进本模块。
