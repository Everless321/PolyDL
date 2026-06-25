# 快手平台（kuaishou）

快手 web 有两套数据接口，本模块都支持：

| 通道 | 端点 | 签名 | 登录 | 用途 |
|------|------|------|------|------|
| GraphQL | `/graphql` | 不需要 | 需要登录态 | 轻量默认（`KuaishouHandler` 默认路径）|
| 签名 REST | `/rest/v/*` | 需 `__NS_hxfalcon` | 需要登录态 | 网页 App 自身通道，更稳（`fetchUserPostVideosRest`）|

> **两条路都需要有效登录 Cookie**（含 `kuaishou.server.web*_st`）。签名不是数据门槛，登录才是——`__NS_hxfalcon` 只是让 `/rest/v/*` 请求被服务端接受。

## 签名与登录解耦（已实测验证）

`__NS_hxfalcon` 由快手前端的 falcon 引擎（fiber-JSVMP）生成，**无法纯 TS 重写**，依赖真实浏览器环境（canvas/screen/navigator 指纹）。

但关键事实：**签名与登录是解耦的**——

- 签名只需被服务端接受，可由**任意（甚至匿名）浏览器**产出；
- 登录由**请求时携带的 Cookie** 提供。

因此**一个共享的浏览器签名器可服务所有用户**，各自带自己的登录 Cookie。这对服务端（dym）很友好：一个常驻热浏览器签名，登录态随请求注入。

## 库的定位：签名器靠注入，库不内置浏览器

库只定义 `KuaishouSigner` 接口 + 签名 REST 客户端，**不依赖 Playwright/Chromium**：

```ts
import { KuaishouHandler, type KuaishouSigner } from 'polydl'

// dym 侧实现：常驻无头浏览器，产出 __NS_hxfalcon
const signer: KuaishouSigner = {
  async sign({ method, path, body }) {
    // 在已加载快手 JS 的页面里，让 app 的签名 axios 处理该请求，
    // 截获其 URL 上的 __NS_hxfalcon 返回。详见 dym 侧实现。
    return hxfalcon
  },
}

const ks = new KuaishouHandler({ cookie: userLoginCookie, signer })
for await (const page of ks.fetchUserPostVideosRest('3xxxxxx')) {
  // page.result===1，page.feeds[].photo 含 photoUrl / manifestH265（视频地址）
}
```

不传 `signer` 时，`KuaishouHandler` 退回 graphql 路径（零依赖，登录态有效即可用）。

## 方案 C：dym 跑一个浏览器签名服务，全局复用（推荐）

falcon 引擎在页面里完全闭包封死、在 Node 又是自卫式多 chunk VMP——**无法在库内（纯 Node 或调用页面全局）产签名**。因此采用集中式签名服务：

- **dym 侧**：常驻一个无头浏览器（已加载快手 JS），对外开 `POST /sign`：
  ```
  请求: { method, path, body? }
  响应: { hxfalcon: "<__NS_hxfalcon 值>" }
  ```
  浏览器是一次性成本、全局复用；签名与登录解耦（签名用匿名浏览器即可，登录由调用方 Cookie 提供）。
- **库侧 / 其他用户**：用内置 `RemoteSigner` 指向该服务，零浏览器依赖：

```ts
import { KuaishouHandler, RemoteSigner } from 'polydl'

const signer = new RemoteSigner({ endpoint: 'https://dym.example.com/kuaishou/sign', token: '...' })
const ks = new KuaishouHandler({ cookie: userLoginCookie, signer })
for await (const page of ks.fetchUserPostVideosRest('3xxxxxx')) { /* 真实作品数据 */ }
```

## 注意

- `kwscode`/`kwssectoken` 等安全 Cookie 约 6 分钟轮换；登录态失效时 REST 返回 `result:109`、graphql 返回 `No Login` —— 需更新 Cookie。
- 作品总数取 `visionProfile.userProfile.ownerCount.photo_public`（`photo` 字段常为 null）。
