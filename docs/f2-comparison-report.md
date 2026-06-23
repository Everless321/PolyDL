# dyDownloader vs f2 (v0.0.1.8-pw3) 实现差异报告

> 对比日期：2026-02-11
> f2 仓库：Johnserf-Seed/f2
> f2 分支：v0.0.1.8-pw3（150 commits ahead of main）
> f2 基准提交：`1d9f3747610d09c0a32122f2ffefa2b4bc56f011`（fix: 修复 nickname_raw 未初始化错误 (#401, #413, #415)，2026-01-31 06:17:17 +0800）
> dyDownloader 分支：main (v0.2.1)

---

## 一、API Endpoints

**结论：100% 一致**

所有 33 个共有接口的 URL 完全相同。f2 额外有 5 个接口：
- `USER_ACTIVE_STATUS`
- `LIVE_CHAT_SEND`
- `LIVE_AUDIENCE_RANKING`
- `POST_DANMAKU_LIST`
- `POST_TIME_DANMAKU`

---

## 二、签名算法 (ABogus / XBogus)

**结论：算法层面无实质差异**

| 组件 | 结论 |
|------|------|
| XBogus | 完全一致（CHAR_TABLE、HEX_ARRAY、UA_KEY、MD5/RC4 逻辑均相同） |
| ABogus | 完全一致（SM3、CHARACTER 字符表、BIG_ARRAY、SORT_INDEX、salt、RC4、base64 均相同） |
| 默认 UA | TS 用 Chrome/131，Python 用 Chrome/130/122（仅默认值不同，调用方传入相同 UA 则输出一致） |
| big_array 状态 | TS 每次调用拷贝新数组（更安全），Python 实例属性可能跨调用累积状态（但标准路径每次创建新实例，行为一致） |

---

## 三、Model / Request 参数

### 3.1 版本号差异

| 字段 | TS | Python |
|------|-----|--------|
| `browser_version` | `131.0.0.0` | `130.0.0.0` |
| `engine_version` | `131.0.0.0` | `130.0.0.0` |

### 3.2 Token 生成策略

| 字段 | TS | Python |
|------|-----|--------|
| `msToken` | 留空，请求时注入 | 模型默认值中调用 `TokenManager.gen_real_msToken()` |
| `verifyFp` (BaseLiveModel2) | 空字符串 | 调用 `VerifyFpManager.gen_verify_fp()` |

### 3.3 BaseWebCast 类型差异 ⚠️

| 字段 | TS 类型 | Python 类型 |
|------|---------|-------------|
| `screen_width` | `number` (1920) | `str` ("1920") |
| `screen_height` | `number` (1080) | `str` ("1080") |
| `aid` | `number` (6383) | `str` ("6383") |
| `live_id` | `number` (1) | `str` ("1") |

### 3.4 Python 独有模型（TS 缺失）

`LiveChatSend`、`UserShortInfo`、`UserActiveStatus`、`UserLiveRank`、`PostDanmaku`、`PostTimeDanmaku`

---

## 四、Crawler 实现

### 4.1 HTTP Method 差异 🔴

| 接口 | TS | Python | 风险 |
|------|-----|--------|------|
| `fetch_user_collection` | GET | POST (JSON body) | 可能导致接口行为不同 |
| `fetch_friend_feed` | GET | POST (无 body) | 可能导致接口行为不同 |
| `fetch_query_user` | POST (JSON body) | GET | 完全相反 |
| `fetch_post_stats` | POST (无 body) | POST (form-encoded body) | body 处理不同 |

### 4.2 直播接口签名缺失 🔴

TS 的 4 个直播接口 (`fetchUserLive`, `fetchUserLive2`, `fetchLiveImFetch`, `fetchUserLiveStatus`) **不走签名**，直接用 `toQueryString` 拼接 URL。Python 对所有接口统一签名。

### 4.3 重试逻辑差异

| 维度 | TS | Python |
|------|-----|--------|
| GET 重试次数 | 3 | 5 |
| POST 重试 | 无重试 | 5 次 |
| 退避策略 | 指数退避 1s/2s/3s | 固定等待 10s |
| 错误返回 | 抛出最后一个 Error | 返回空 `{}`（吞掉异常） |

### 4.4 fetch_live_room_id Cookie 清除

Python 在获取直播间 room_id 时临时清除 Cookie 以避免 "invalid session"，TS 无此处理。

### 4.5 msToken 处理

| 维度 | TS | Python |
|------|-----|--------|
| 获取方式 | `ensureMsToken()` 先真实后 fake | 外部 `TokenManager` 管理 |
| 缓存 | 类级别缓存 + Promise 去重 | 外部管理 |
| 注入时机 | `model2Endpoint` 自动注入 | 构造参数 model 时注入 |

---

## 五、Handler 实现

### 5.1 分页通用差异 🔴

| 维度 | TS | Python |
|------|-----|--------|
| 请求间隔 | 无延迟 | `asyncio.sleep(5)` 默认 5 秒 |
| 动态分页大小 | 固定 pageCounts | `min(page_counts, max_counts - collected)` |
| maxCounts 默认 | `0` 表示无限 | `None` -> `float("inf")` |
| Crawler 生命周期 | 单实例复用 | 每次请求 `async with` 新建 |

### 5.2 fetchRelatedVideos 差异 🔴

| 维度 | TS | Python |
|------|-----|--------|
| filterGids 初始化 | 空字符串 | 包含原始 awemeId |
| URL 编码 | 无 | `quote(filterGids)` |
| 终止条件 | awemeIds 为空 | `has_more` 字段 |

### 5.3 fetchHomePostSearch 差异 🔴

| 维度 | TS | Python |
|------|-----|--------|
| search_id 追踪 | 不追踪 | 每页更新 `search_id` |
| keyword 编码 | 无 | `quote(keyword)` |
| 默认 page_counts | 10 | 20 |

### 5.4 fetchUserFollowing 差异 🔴

| 维度 | TS | Python |
|------|-----|--------|
| 分页字段 | 仅 `offset` | `logicmap` 根据 `source_type` 切换 offset/min_time/max_time |
| source_type 排序 | 不支持 | 3 种排序模式（最近/最早/综合） |

### 5.5 fetchFriendFeed 差异 🟡

| 维度 | TS | Python |
|------|-----|--------|
| 参数 | 仅 cursor | cursor + level + pull_type |
| level/pull_type 更新 | 不追踪 | 每页从响应中更新 |
| status_code 检查 | 无 | 检查 `!= 0` 则 break |

### 5.6 fetchUserFollower 差异 🟡

| 维度 | TS | Python |
|------|-----|--------|
| max_time 去重 | 不支持 | `max_time = follower.min_time` 避免重复 |

### 5.7 fetchUserProfile 差异 🟡

| 维度 | TS | Python |
|------|-----|--------|
| 输入验证 | 无 | `sec_user_id` 为空抛 ValueError |
| 广告用户检测 | 无 | `status_code == 5` 返回 None |
| 空响应检查 | 无 | `nickname is None` 抛 APIResponseError |

### 5.8 DY_LIVE_STATUS_MAPPING 🟡

- TS: `{ 2: '直播中', 4: '已关播' }`
- Python: `{ 1: '已关播', 2: '直播中', 4: '已关播' }` — 缺少状态码 1

### 5.9 fetchOneVideo

TS 有独特的 SharePage fallback 机制（无 Cookie 模式），Python 无此功能。这是 dyDownloader 的优势。

---

## 六、Filter 实现

### 6.1 JSONPath

**所有共有属性的 JSONPath 表达式完全一致**，无差异。

### 6.2 TS 缺失的属性

| 属性 | 涉及的 Filter |
|------|--------------|
| `authentication_token` | UserPostFilter, PostDetailFilter, HomePostSearchFilter |
| `video_id` (play_addr.uri) | UserPostFilter, PostDetailFilter, FriendFeedFilter, HomePostSearchFilter |
| `dynamic_cover` | UserPostFilter |
| `status_code` | UserProfileFilter |

### 6.3 Python 的 Bug

`UserFollowerFilter.can_share` JSONPath 为 `$.followersfollowers[*].aweme_control.can_share`（typo），永远返回 null。TS 版本 `$.followers[*]` 是正确的。

### 6.4 Python 独有 Filter（TS 缺失）

`LiveChatSendFilter`、`UserLiveRankingFilter`、`PostDanmakuFilter`、`PostTimeDanmakuFilter`、`UserActiveStatusFilter`、`UserShortInfoFilter`

---

## 七、Downloader 实现

### 7.1 下载引擎 🔴

| 维度 | TS | Python |
|------|-----|--------|
| HTTP 客户端 | `got` | `httpx` |
| 断点续传 | 不支持 | `.tmp` 文件 + Range header |
| 文件校验 | 无 | MD5 + ETag |
| 原子写入 | 无（直接写目标文件） | `.tmp` -> rename |
| 多 URL fallback | 无（取第一个 URL） | 遍历 URL 列表，失败尝试下一个 |
| 分级超时 | 单一 30s | connect:15s, read:60s, write:30s, pool:30s |
| 动态缓冲区 | 无 | 小文件 256KB、中文件 1MB、大文件 4MB |
| 优雅中断 | 不支持 | `SignalManager.is_shutdown_signaled()` |
| 默认并发数 | 3 | 10 |
| 连接池 | 无限制 | `max_connections=50` |

### 7.2 封面下载 fallback 🟡

- TS: 2 层 `animatedCover` (webp) -> `cover` (jpeg)
- Python: 3 层 `animated_cover` (gif) -> `dynamic_cover` (gif) -> `cover` (webp)

### 7.3 直播流 (m3u8) 🟡

- TS: 5 层画质 fallback 但只打印 ffmpeg 命令（不实际下载）
- Python: 1 层画质但有完整 m3u8 分片下载实现 + 直播状态回调

### 7.4 日期过滤

| 维度 | TS | Python |
|------|-----|--------|
| 预设关键字 | today/week/month/year | 不支持 |
| 分隔符 | `~` | `\|` |
| 结束日期 | 精确到零点 | +1天-1秒（包含当天） |
| 缺失 createTime | 保留 | 排除 |
| 日期范围校验 | 无 | end < start 返回 None |

---

## 八、Utils 工具函数

### 8.1 URL 解析

| 维度 | TS | Python |
|------|-----|--------|
| 图集 slides 模式 | 支持 `iesdouyin.com/share/slides/` | 不支持 |
| vid= 兜底模式 | 不支持 | 支持失效链接 `vid=` 参数 |
| 统一解析器 | `resolveDouyinUrl` 自动判别类型 | 无，需分别调用不同 Fetcher class |
| 本地解析 | `url-parser.ts` 纯正则（无 HTTP） | 无 |
| 代理支持 | 无 | 全链路代理 |
| 错误分类 | 统一 APIResponseError | 5 种细粒度异常映射 |

### 8.2 Token 生成

| 维度 | TS | Python |
|------|-----|--------|
| msToken 验证 | 100-200 字符（宽松） | 164 或 184（严格） |
| Fallback 机制 | `getMsToken()` 自动 real->fake | 无自动 fallback，调用方决定 |

### 8.3 VerifyFp 生成

算法完全一致。

---

## 修复优先级

### 🔴 Critical（影响功能正确性）

1. **分页无延迟** — 需添加请求间隔（默认 5s），防止触发限流
2. **4 个接口 HTTP Method 不一致** — collection/friend_feed/query_user/post_stats
3. **直播接口签名缺失** — 4 个直播接口未走签名流程
4. **fetchRelatedVideos** — filterGids 缺少原始 awemeId + URL 编码
5. **fetchHomePostSearch** — 未追踪 search_id + keyword 未编码
6. **fetchUserFollowing** — 缺少 source_type 排序支持
7. **下载引擎** — 缺断点续传、ETag 校验、多 URL fallback、原子写入

### 🟡 Medium（功能完整性）

8. **封面下载** — 缺少 dynamic_cover 中间层 fallback
9. **BaseWebCast 类型** — screen_width/height/aid/live_id 应为 string
10. **Filter 缺失属性** — authentication_token, video_id, dynamic_cover, status_code
11. **DY_LIVE_STATUS_MAPPING** — 缺少状态码 1
12. **fetchFriendFeed** — 缺少 level/pull_type 参数追踪
13. **fetchUserFollower** — 缺少 max_time 去重
14. **fetchUserProfile** — 缺少输入验证和广告用户检测
15. **fetch_live_room_id** — 缺少 Cookie 清除逻辑
16. **POST 请求无重试** — fetchPostJson 没有重试机制
17. **日期过滤结束日期** — 应包含当天整天

### 🟢 Low（架构差异，无功能影响）

18. **Crawler 生命周期** — 单实例 vs 每次新建（无功能影响）
19. **错误处理粒度** — 统一异常 vs 5 种细粒度（可后续优化）
20. **进度展示** — console.log vs Rich 进度条（UI 层面）
21. **版本号差异** — 131 vs 130（可配置化解决）

---

## dyDownloader 独有优势

- SharePage fallback（无 Cookie 模式获取视频信息）
- 统一 URL 解析器 `resolveDouyinUrl`
- 本地正则解析 `url-parser.ts`（无 HTTP 请求）
- 图集 slides URL 模式支持
- msToken 自动 fallback 机制
- 日期过滤预设关键字（today/week/month/year）
- 直播 5 层画质 fallback
