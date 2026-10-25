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

const work = await handler.fetchWork('https://www.kuaishou.com/short-video/<photoId>')
await new KuaishouDownloader({
  cookie: process.env.KS_COOKIES,
  downloadPath: './downloads',
  mediaType: 'all', // all | video | image
  cover: true,
  desc: true,
}).downloadWork(work)

const works = []
for await (const page of handler.fetchUserWorks('<eid>', { maxCounts: 20 })) {
  works.push(...page)
}
exportWorksToJson(works, './downloads/kuaishou-works.json')
```

`KuaishouHandler` 还提供 `fetchUserProfile`、`searchWorks`、`fetchFeedHot`、`fetchComments`。原始 JSON 用 `KuaishouWebApi`（推荐流、详情、评论、资料、主页列表、搜索作品/用户、关系、喜欢、收藏、私密、回放）。

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
