# 抖音 Handler/Crawler 对齐 f2 修复跟踪

> 对标基准：`Johnserf-Seed/f2` 分支 `v0.0.1.8-pw3` @ `1d9f3747610d09c0a32122f2ffefa2b4bc56f011`
> 对照范围：仅 **api / crawler / handler** 层（不含 CLI）
> 创建日期：2026-07-08
> 用法：一个一个改，改完把 `[ ]` 勾成 `[x]`，并在「进度」列记录 commit / 备注。

---

## P0 — 高优先级（影响功能正确性 / 易触发风控）

| # | 状态 | 方法 | 问题 | 修复要点 | 进度 |
|---|---|---|---|---|---|
| 1 | [x] | `fetchUserLive` / `fetchUserLive2` / `fetchUserLiveStatus` / `fetchLiveImFetch` | 4 个直播接口**未走签名**，直接 `toQueryString` 拼 URL | 统一走 `model2Endpoint`（abogus/xbogus），与 f2 一致 | 2026-07-08 done：4 个改走 `model2Endpoint`；验证 xb/ab 均产出 X-Bogus/a_bogus+msToken。同时完成 #11：fetchUserLive2 临时清空 Cookie 防 invalid session（fetchGetJson 加 headers 覆盖参） |
| 2 | [x] | 所有分页生成器 | 分页**无请求间隔**，`pageCounts` 固定 | 加默认 `interval`（f2 默认 5s）；`pageCounts` 动态 `min(pageCounts, maxCounts-collected)` | 2026-07-08 done：抽 `paginate` helper，14 个生成器全接入；`PaginationOptions.interval`（单次）+ `HandlerConfig.pageInterval`（handler 级默认，`this.defaultInterval`）双层可配，默认 5000ms（0 关闭）；`minCursor` 时间范围终止已接入 7 个时间游标方法（post/like/collection/collects/collectsVideos/mix/music） |
| 3 | [ ] | `fetchRelatedVideos` | `filterGids` 未含原始 awemeId、无 URL 编码、终止条件用空判断 | 初始 `filterGids` 含 awemeId + `quote()` 编码 + 用 `has_more` 终止 | |
| 4 | [ ] | `fetchHomePostSearch` | 未追踪 `search_id`、keyword 未编码、默认页大小 10（f2 为 20） | 每页更新 `search_id`、`quote(keyword)`、默认 20 | |
| 5 | [ ] | `fetchUserFollowing` | 缺 `source_type` 三种排序、缺 `logicmap`(offset/min_time/max_time) 切换 | 按 `source_type` 切分页字段，支持最近/最早/综合 | |
| 6 | [x] | `fetchUserCollection` (crawler) | HTTP method 与 f2 不一致 | 核对 f2 collection 的 GET/POST 语义并对齐 | 2026-07-08 核实：已是 POST+JSON body，与 f2 一致，无需改（旧报告过时） |
| 6b | [x] | 大整数 id 精度 bug（filter roomId 读 number） | `room_id`(number) 超 JS 安全整数丢精度 | roomId 改读 `_str` 字段 | 2026-07-08 实测发现并修：UserProfileFilter/UserFollowing/UserFollower.roomId → `room_id_str`；UserLive2Filter.roomId → `id_str`。实测 profile.roomId 从 ...259000→...259062 精确 |
| 6a | [x] | filter `toDict`/`filterToList`（base.ts:80 / utils.ts:90） | **只遍历直接原型**，继承型子类 toList/toDict 输出残缺 | 改为沿原型链收集 getter，对齐 f2 `dir()`。影响 like/related/collection/mix/follower/comment_reply | 2026-07-08 done：新增 `collectGetterNames()` 沿原型链收集（子类覆写优先），toDict/filterToList 共用；验证空子类 UserLikeFilter 现能取全 34 个父类 getter |

## P1 — 中优先级（功能完整性）

| # | 状态 | 方法 | 问题 | 修复要点 | 进度 |
|---|---|---|---|---|---|
| 7 | [x] | `fetchUserProfile` | 缺输入校验、广告用户检测、空响应检查 | `secUserId` 空抛错；`status_code==5` 返回 null；`nickname` 缺失抛错 | 2026-07-08 done：加 `UserProfileFilter.statusCode`，返回类型改 `\| null` |
| 8 | [ ] | `fetchFriendFeedVideos` | 缺 `level`/`pull_type` 参数追踪、无 `status_code!=0` 检查 | 每页从响应更新 level/pull_type，status_code 非 0 则 break | |
| 9 | [ ] | `fetchUserFollower` | 缺 `max_time` 去重 | `max_time = follower.min_time` 避免重复 | |
| 10 | [ ] | `fetchPostStats` | body 处理与 f2 不同 | 对齐 form-encoded body 处理 | |
| 11 | [x] | `fetchUserLive2` (crawler) | 缺 f2 的临时清 Cookie 逻辑 | 获取 room_id 时临时清 Cookie 防 "invalid session" | 2026-07-08 done：随 #1 一起完成，传 cookie-less headers（不改 this.headers，无并发风险） |
| 12 | [ ] | `DY_LIVE_STATUS_MAPPING` | 缺状态码 `1` | 补 `{ 1: '已关播' }` | |
| 12a | [x] | `minCursor` 过度接入 | 接到了 7 个方法，f2 仅 `fetch_user_post_videos` 有 | 收窄到仅 post，或确认为有意扩展；另 TS 边界早停一页（取页前判断 vs f2 取页后） | 2026-07-08 done：从 like/collection/collects/collectsVideos/mix/music 移除，仅保留 `fetchUserPostVideos`；边界保留查 nextCursor（比 f2 查初始 0 更稳，非缺陷）；`PaginationOptions.minCursor` 补注释 |
| 12b | [x] | paginate 缺空页跳过 | f2 遇空页(has_more)跳过不计数/不 sleep，TS 会 yield 空页并 sleep | helper 加 `getItemCount===0 && hasMore` 时跳过 sleep 与计数 | 2026-07-08 done：helper 内 `itemCount===0 && hasMore` → `continue`，不计数不 sleep（yield 仍保留，与 f2 一致） |

## P2 — 缺失方法（f2 有，我们 handler 无）

对应的 Filter / Model 也需补齐。

| # | 状态 | f2 方法 | 功能 | 端点 | 进度 |
|---|---|---|---|---|---|
| 13 | [ ] | `fetch_user_feed_videos` | 首页推荐 feed | `TAB_FEED`（crawler 已有，仅缺 handler） | |
| 14 | [ ] | `fetch_user_active_status` | 用户活跃状态批量查询 | `USER_ACTIVE_STATUS` | |
| 15 | [ ] | `fetch_user_short_info` | 用户短信息批量查询 | （2026-01-30 新增） | |
| 16 | [ ] | `fetch_live_user_rank` | 直播观众排行榜 | `LIVE_AUDIENCE_RANKING` | |
| 17 | [ ] | `fetch_live_danmaku` | 直播弹幕流（WSS） | — | |
| 18 | [ ] | `fetch_live_chat_send` | 发送直播弹幕 | `LIVE_CHAT_SEND` | |
| 19 | [ ] | `fetch_post_danmaku` | 视频弹幕列表 | `POST_DANMAKU_LIST` | |
| 20 | [ ] | `fetch_post_time_danmaku` | 视频时间轴弹幕 | `POST_TIME_DANMAKU` | |

## P3 — Crawler 有、Handler 未封装（可选）

| # | 状态 | Crawler 方法 | 端点 | 备注 | 进度 |
|---|---|---|---|---|---|
| 21 | [ ] | `fetchFollowFeed` | `FOLLOW_FEED` | 关注 feed，需加 handler 生成器 | |
| 22 | [ ] | `fetchPostSearch` | `POST_SEARCH` | 综合作品搜索（f2 handler 亦无封装，按需） | |
| 23 | [ ] | `fetchPostLocate` | `LOCATE_POST` | 定位作品分页 | |

---

## 已对齐 / 无需改动

- `fetchOneVideo`（+ SharePage 无 Cookie 兜底，我们独有优势）
- `fetchUserPostVideos` / `fetchUserLikeVideos` / `fetchUserCollectsVideos` / `fetchUserMixVideos` / `fetchUserMusicCollection`（除通用分页差异 #2 外逻辑一致）
- `fetchUserCollects` / `fetchUserCollectionVideos`（同上）
- `fetchPostComment` / `fetchPostCommentReply`（同上）
- `fetchFollowingUserLive`
- `fetchSuggestWords`
- `fetchQueryUser`（已按 f2 对齐默认 GET）
- 签名算法 XBogus / ABogus（完全一致）
- API Endpoints URL（33 个共有接口 100% 一致）

> 详细差异背景见 `docs/f2-comparison-report.md`。
