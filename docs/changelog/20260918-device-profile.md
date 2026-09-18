# 统一、稳定、可配置的浏览器设备指纹（发布 0.5.0）

## 背景

抖音模块的请求指纹此前是**写死的常量**且**互不自洽**：

- `config` 里的默认 UA 是 Windows Edge 131（一年多前的版本），全球所有调用方共用一条；
- `client/http.ts` 的 `Sec-Ch-Ua*` 硬编码 Windows Edge 131，调用方 `setConfig({ userAgent })`
  换成 Mac Chrome 后，UA 说 Mac、Client Hints 仍说 Windows；
- `model/request.ts` 的 `browser_platform / browser_name / os_name / screen_* / cpu_core_num / device_memory`
  全是常量，与 UA 不联动；`getBaseWebCastParams()` 里还内嵌了第二份 Windows Edge UA；
- A-Bogus 的窗口指纹每次签名都 `Math.random()` 重新生成，同一会话内每个请求自报的窗口尺寸都不一样，
  而 query 里的 `screen_width` 永远 1920——真实浏览器恰好相反；
- `DouyinCrawler` 在构造时快照 UA，构造后再 `setConfig` 不生效；
- webid 注册用的 UA 固化在 schema 默认值里，`setConfig({ userAgent })` 之后仍是旧 UA。

后果：Cookie 在某个环境登录（例如 dYm 的 Electron 登录窗是 Mac Chrome），接口请求却自报另一台机器；
并且所有调用方共享同一组设备参数，极易被聚类。

## 改动

### 新增 `src/platforms/douyin/device/profile.ts`

`DeviceProfile` 成为设备指纹的单一事实来源，UA / Client Hints / 请求参数 / A-Bogus 窗口指纹全部由它派生。

- `createDeviceProfile(opts?)`：随机生成一份自洽 profile。默认按 `process.platform` 选平台，
  Chrome 大版本从 `[LATEST_CHROME_MAJOR - 2, LATEST_CHROME_MAJOR]` 抽，分辨率 / CPU 核心数 / 内存从常见取值抽；
  传 `seed` 时用 xorshift32 确定性 PRNG（无新依赖），同 seed 复现同一台设备。
- `deviceFromUserAgent(ua)`：从 UA 反推 profile，兼容旧的 `setConfig({ userAgent })`。
  **UA 原样保留**（不按模板重建），避免调用方传入的非常规 UA 被改写。
- 派生：`userAgentOf` / `clientHintsOf` / `webRequestParamsOf` / `webcastParamsOf`。
- `windowFingerprint` 在创建时生成一次后固定，且 `innerWidth ≤ screenWidth`、`availHeight ≤ screenHeight`，
  最后一段的 platform 与 os 一致。

### 逐文件

| 文件 | 改动 |
|---|---|
| `config/index.ts` | 新增 `device` 字段与 `getDevice()`；`getUserAgent()` 改由 device 派生；`setConfig` 支持 `device`，传 `userAgent` 时反推 profile；`config.userAgent` / `config.device` 始终与当前 device 一致 |
| `client/http.ts` | 请求头的 UA、`Accept-Language`、`Sec-Ch-Ua*` 改为从 device 派生 |
| `model/request.ts` | `getBaseRequestParams` / `getBaseLiveParams` / `getBaseWebCastParams` 的设备类字段改为 `webRequestParamsOf` / `webcastParamsOf`，删掉内嵌的 Windows Edge UA |
| `algorithm/abogus.ts` | `generateBrowserFingerprint` 迁到 device 模块；`getABogus` 兜底 UA / 指纹改取当前 device |
| `algorithm/xbogus.ts` | 兜底 UA 改为 `getUserAgent()` |
| `algorithm/index.ts` | `fetchRealMsToken` 的 UA 改为 `getUserAgent()` |
| `utils/sign.ts` | 删掉内部的 `generateBrowserFingerprint('Win32')`，统一用 `getDevice().windowFingerprint`；三个签名函数新增可选 `fingerprint` 参数 |
| `crawler/douyin.ts` | 不再构造时快照 UA，改 `private get profile()`；`DouyinCrawlerConfig` 新增 `device?`；实例级 device 时把 UA + Client Hints 合进请求头 |
| `downloader/douyin.ts` | 下载请求头补 `Accept` / `Accept-Language` / `Sec-Ch-Ua*` / `Sec-Fetch-*`，HEAD 与 stream 共用；`DownloadConfig` 新增 `device?` |
| `handler/*` | `HandlerConfig` 新增 `device?` 并透传给内部 `DouyinCrawler` |
| `utils/token.ts` | 三个 token 请求补 Client Hints；`genWebid` 的 `user_agent` 改为当前 device 的 UA |
| `live/danmaku.ts`、`live/webcast-signature.ts` | 改用 `getUserAgent()`；WSS 头补 `Origin: https://live.douyin.com` |
| `utils/fetcher.ts` | 分享页的 iPhone UA **保留**（移动端兜底路径），加注释说明 |
| `cli/index.ts` | 新增 `--device-os mac\|windows`、`--device-seed <str>` |

## 与原始方案的偏差

- **`LATEST_CHROME_MAJOR = 154`**（方案里写的 142）。通过 Chrome Version History API
  （`versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions`）核实，
  2026-09-18 的 Windows Stable 是 `154.0.8037.44`。
- **`timezone` 默认 `Asia/Hong_Kong`**（方案里写 `Asia/Shanghai`）。这是 webcast 的 `tz_name`
  原有取值，与 f2 一致；改成 Shanghai 属于无关的行为漂移，保留原值并开放为可配置项。
- **`DEFAULT_USER_AGENT` 保留为常量**（仍是旧的 Windows Edge 131 字符串）并标记废弃，
  没有按方案改成「随机 profile 的 UA」——一个名为 DEFAULT_ 的导出每次取值不同更容易踩坑。
- **`DeviceProfile` 持有 `userAgent` 字段**，`userAgentOf(p)` 返回该字段而非按模板重建。
  这样 `deviceFromUserAgent` 能原样保留调用方传入的 UA，`setConfig({ userAgent })` 的行为零漂移。
- `DeviceProfile` 用 zod schema 定义（`z.infer` 出类型），`setConfig({ device })` 时在边界校验。

## 兼容性

| 旧用法 | 新行为 |
|---|---|
| 什么都不配 | 进程启动随机一份 profile（按真实 `process.platform`），同一进程内稳定 |
| `setConfig({ userAgent })` | 继续生效：反推 profile，Client Hints / 请求参数随之变为对应平台与版本 |
| `setConfig({ device })` | 新推荐用法 |
| `getConfig().userAgent` | 仍然可读，始终等于当前 device 的 UA |
| `DEFAULT_USER_AGENT` | 保留导出，已废弃 |
| `generateBrowserFingerprint()` | 保留导出（从 device 模块），已废弃，行为不变（仍随机） |
| `getABogus(params, body, opts)` | 签名不变，兜底值变为 device 派生 |
| `DouyinCrawler` 构造后再 `setConfig` | 之前不生效，现在生效（修 bug） |

语义上属于 **minor**：新增字段、默认 UA 从常量变随机。

## 测试

`tests/device.test.ts`，14 个用例全绿：

- **自洽性**：随机 / 显式 profile 的 UA、Client Hints、请求参数、窗口指纹互相对应；
  mac 的 `os_version` 参数用点号而 UA 用下划线；webcast 的 `browser_version` 是去掉 `Mozilla/` 的整条 UA；
  大版本落在 `[LATEST-2, LATEST]`。
- **稳定性**：同 seed 深等、不同 seed 不等；连续 50 次 `signWithABogus` 用到的 fingerprint 相同
  （`vi.doMock` 抓 `getABogus` 参数）。
- **反推**：Mac Chrome / Windows Edge 两条 UA。
- **请求头快照**：mock `fetch`，断言 `user-agent` / `sec-ch-ua` / `sec-ch-ua-platform`
  与 URL 里的 `browser_platform` / `browser_version` / `os_name` / `screen_width` / `cpu_core_num`
  全部对应同一 profile；换 device 后三处同时变。
- **实例覆盖**：两个 `DouyinCrawler` 各带不同 device 并发请求，互不串台。
- **下载头**：本地 http server 收到的 HEAD/GET 都带 `sec-ch-ua*` 与 `Sec-Fetch-Dest: video`。
- **兼容**：`setConfig({ userAgent: 旧 Windows Edge 131 })` 后请求参数仍是 `Win32 / Edge / 131.0.0.0 / Windows`。

## 维护提醒

Chrome 每发一次稳定版，更新 `device/profile.ts` 的 `LATEST_CHROME_MAJOR`。

## 待办（dYm 侧，本仓库不含）

- [ ] 首次启动生成并持久化 profile（`seed: <machineId>`，screen / cpu / memory 取本机真实值）
- [ ] `initDouyinHandler()` 里 `setConfig({ encryption: 'ab', device: profile })`
- [ ] `src/main/utils/user-agent.ts` 的 `CHROME_UA` 改为 `userAgentOf(profile)`，登录窗口 / 静默刷新 / 页内签名统一
- [ ] 「重新登录」时重生成 profile（换 seed），Cookie 与指纹同生同灭
- [ ] `live/recorder.ts` 的 ffmpeg `-headers` 补 `User-Agent`
