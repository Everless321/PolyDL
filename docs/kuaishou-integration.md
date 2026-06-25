# 快手（Kuaishou）接入设计

> 状态：平台骨架 + graphql 路径 + 签名 REST 路径（经远程签名服务）已实现并实测跑通。
> 代码：`src/platforms/kuaishou/`。本文档为设计与运维说明，敏感逆向细节不在此（也不入公开仓库）。

## 1. 背景

PolyDL 多平台架构下，快手作为继抖音之后的第二个平台接入。与抖音（f2 对标、ABogus/XBogus 纯 TS 移植）不同，快手的反爬签名无法在库内复现，需采用集中式浏览器签名服务。

## 2. 快手 web 的两套数据接口

| 通道 | 端点 | 签名 | 登录 | 库内实现 |
|------|------|------|------|----------|
| GraphQL | `/graphql` | 不需要 | 需要登录态 | `KuaishouHandler`（默认路径，零依赖）|
| 签名 REST | `/rest/v/*` | 需 `__NS_hxfalcon` | 需要登录态 | `fetchUserPostVideosRest`（经签名服务）|

关键 operation / 端点：

- 资料：graphql `visionProfile` ／ REST `/rest/v/profile/get`
- 用户作品列表：graphql `visionProfilePhotoList` ／ REST `/rest/v/profile/feed`（pcursor 翻页到 `no_more`）
- 单作品：graphql `visionVideoDetail`（含 HEVC/多码率）
- 其它签名 REST：`/rest/v/search/{user,feed}`、`/rest/v/feed/{hot,liked}`、`/rest/v/collect/list`、`/rest/v/profile/{user/v2,private/list}`

> **两条路都需要有效登录 Cookie**（含 `kuaishou.server.web*_st`）。登录态失效时：REST 返回 `result:109`、graphql 返回 `No Login`。
> 作品总数取 `ownerCount.photo_public`（`photo` 字段常为 null）。

## 3. 签名 `__NS_hxfalcon` 的本质与结论

- 由快手前端的 falcon 安全引擎产出，是 **fiber 式 JSVMP（自定义字节码虚拟机）**，并重度依赖真实浏览器环境（canvas/screen/navigator 等指纹）。
- 经实测，三条移植路线中两条不可行：
  1. **纯 TS 重写**：JSVMP，工作量与脆性都不可接受。✗
  2. **库内调用页面签名函数**：vite 生产包闭包封死，无可调用入口。✗
  3. **Node 补环境跑原版引擎**：引擎是自卫式多 chunk VMP，非自包含、依赖私有运行时与加载器，直接加载失败。✗（成本极高、收益不确定）
- **可行且已验证**：浏览器执行签名。并且发现一个关键性质——

### 签名与登录解耦（实测）

`__NS_hxfalcon` 只要被服务端接受即可（**可由匿名浏览器产出**），登录由请求时携带的 Cookie 提供。实测：浏览器（设备 A）签名 + 用户 Cookie（设备 B、含登录态）→ `/rest/v/profile/feed` 返回 `result:1` 与真实作品数据。

➡️ 因此**一个共享浏览器即可为所有用户产出签名**，各调用方带自己的登录 Cookie。

## 4. 架构：方案 C —— 集中式签名服务

```
┌─────────────┐   POST /sign {method,path,body}   ┌──────────────────────────┐
│  调用方/库   │ ────────────────────────────────▶ │  dym 签名服务（常驻浏览器）│
│ RemoteSigner│ ◀──────────────────────────────── │  返回 { hxfalcon }        │
└─────┬───────┘            { hxfalcon }            └──────────────────────────┘
      │ 用 hxfalcon 拼 URL + 带【用户登录 Cookie】发 /rest/v/*
      ▼
   快手服务端 → result:1 + 数据
```

- **dym 侧**：常驻一个无头浏览器（已加载快手 JS），对外开 `POST /sign`，全局复用（浏览器是一次性成本）。
- **库侧**：内置 `RemoteSigner` 指向该服务，**零浏览器依赖**；不传 signer 时退回 graphql 路径。

### `/sign` 服务契约

```
POST <endpoint>
Headers: Content-Type: application/json[, Authorization: Bearer <token>]
Body:    { "method": "GET"|"POST", "path": "/rest/v/...", "body"?: "<原始body字符串>" }
200:     { "hxfalcon": "<__NS_hxfalcon 值>" }
```

> 运维提醒：匿名浏览器产出的签名可被服务端接受；但若要驱动分页**取数**，浏览器侧需登录态——可用一个共享快手账号的登录浏览器抓取公开主页数据。

## 5. 库使用示例

```ts
import { KuaishouHandler, RemoteSigner } from 'polydl'

// 经 dym 签名服务（推荐，方案 C）
const signer = new RemoteSigner({ endpoint: 'https://dym.example.com/kuaishou/sign', token: '...' })
const ks = new KuaishouHandler({ cookie: userLoginCookie, signer })

for await (const page of ks.fetchUserPostVideosRest('3xus99i7auh2ri2')) {
  // page.result === 1
  // page.feeds[].photo: id / caption / duration / likeCount / photoUrl / photoH265Url / manifestH265
}

// 或：默认 graphql 路径（不传 signer，登录态有效即可）
const ks2 = new KuaishouHandler({ cookie: userLoginCookie })
for await (const page of ks2.fetchUserPostVideos('3xus99i7auh2ri2')) { /* ... */ }
```

## 6. 注意事项

- 安全 Cookie（kwscode/kwssectoken 等）约 6 分钟轮换；登录态失效需更新 Cookie。
- 媒体文件（`photoUrl`/`photoH265Url`）是 CDN 直链，**下载不走签名**，下载引擎直连即可——签名只在「列表/资料 API」这条低频流上。
- 签名服务只接 API 签名请求（低频），不接媒体下载（高频走 CDN），两者解耦，不会因下载并发高而压垮签名服务。

## 7. 现状与待办

- [x] 平台骨架 `src/platforms/kuaishou/`，注册进 `registry.ts`
- [x] graphql 路径（profile / 主页列表 / 单作品）
- [x] 签名 REST 客户端 + `RemoteSigner` + `fetchUserPostVideosRest`（实测 result:1 真实数据）
- [x] 单元测试（`rest.test.ts`）、README、本设计文档
- [ ] dym 侧实现 `/sign` 浏览器签名服务
- [ ] 快手下载器接线 + CLI 按 `findPlatform(url)` 分发
