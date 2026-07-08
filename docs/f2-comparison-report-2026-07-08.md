# dyDownloader vs f2 (v0.0.1.8-pw3) 差异报告 · 复审版

> 复审日期：2026-07-08（基于当前真实代码，非旧报告推断）
> f2 基准：`Johnserf-Seed/f2` @ `1d9f3747610d09c0a32122f2ffefa2b4bc56f011`（分支 `v0.0.1.8-pw3`，自 2026-01-31 起未再更新）
> 本项目：main（v0.2.3）
> 方法：并行 4 路 agent 逐层核对 endpoints / crawler / model / handler / filter，均以当前 TS 代码为准
> 对比对象：旧报告 `f2-comparison-report.md`（2026-02-11）—— 本版标注了自那以来的变化

---

## 0. 自旧报告以来「已修 / 已变」速览

| 项 | 旧报告状态 | 当前状态 |
|---|---|---|
| `fetchUserProfile` 输入校验/广告用户/空响应 | 🟡 缺失 | ✅ 已补（空 secUserId 抛错、status_code===5 返回 null、nickname 缺失抛 APIResponseError） |
| 分页无请求间隔 | 🔴 | ✅ 已加 `paginate` helper（interval + 动态 size），双层可配 |
| `fetchUserCollection` HTTP method | 🔴 GET | ✅ 实为 POST+JSON body，已对齐（旧报告过时） |
| `fetchQueryUser` HTTP method | 🔴 POST | ✅ 默认 GET 已对齐（保留可选 POST 旁支） |
| `minCursor` 时间范围终止 | 🔴 未用 | ⚠️ 已接入，但**过度接入**（见 §4） |

---

## 1. Endpoints 层

**34 个共有端点 URL 逐字符一致，无 TS 独有端点。**

f2 独有、TS 缺失 **5 个**：
- `USER_ACTIVE_STATUS` = `/aweme/v1/web/im/user/active/status/`
- `LIVE_CHAT_SEND` = `/webcast/room/chat/`
- `LIVE_AUDIENCE_RANKING` = `/webcast/ranklist/audience/`
- `POST_DANMAKU_LIST` = `/aweme/v1/web/danmaku/list/`
- `POST_TIME_DANMAKU` = `/aweme/v1/web/danmaku/get_v2/`

---

## 2. Crawler 层（33 方法）

### 🔴 直播接口签名缺失（4 个）
仅 `fetchFollowingUserLive` 与 f2 一致走签名；以下 4 个**只用 `toQueryString` 裸拼、无 X/A-Bogus**：
| 方法 | 位置 | f2 |
|---|---|---|
| `fetchUserLive` | douyin.ts:302-306 | 走 model_2_endpoint 签名 |
| `fetchUserLive2` | douyin.ts:311-315 | 签名 + **临时清空 Cookie** 避免 invalid session |
| `fetchLiveImFetch` | douyin.ts:396-405 | 签名 |
| `fetchUserLiveStatus` | douyin.ts:410-414 | 签名 |

### 🔴 HTTP method 不一致
- `fetchFriendFeed`（douyin.ts:219-223）：TS 用 **GET**，f2 用 **POST 空体**（`_fetch_post_json`）。

### 🔴 重试策略（影响所有方法）
| 维度 | TS | f2 |
|---|---|---|
| GET 重试 | 3 次（douyin.ts:105） | 5 次 |
| POST 重试 | **无**（fetchPostJson 单次，douyin.ts:136-141） | 5 次 |
| 退避 | 指数 1s/2s | 常数 10s |
| 错误语义 | throw lastError | 返回 `{}`（静默） |

### 🟡 次要
- `fetchQueryUser` 多一条「传 secUserIds 走 POST json」旁支（douyin.ts:419-434），f2 恒 GET。
- `fetchPostSearch`（douyin.ts:338-347）TS 独有，此版本 f2 crawler 未暴露对应方法（仅有 model 与端点）。

### 缺失方法 6 个
`fetch_user_active_status` / `fetch_user_short_info` / `fetch_live_user_rank` / `fetch_live_chat_send` / `fetch_post_danmaku` / `fetch_post_time_danmaku`

### ✅ body 序列化已对齐
http.ts:87-93：字符串体原样发送（form）、对象体 `JSON.stringify`+`application/json`（json），与 f2 `data=`/`json=` 两形态对应。

---

## 3. Model / 参数层

### 🔴 BaseWebCast 4 字段类型不符
`screen_width`/`screen_height`/`aid`/`live_id`：TS 为 `number`（1920/1080/6383/1），f2 为 `str`。
- query-string 序列化后等价（`toQueryString` 会 `String()`），但与 f2 逐字节比对 / 若签名对类型敏感时是隐患。

### 🟡 版本号漂移
`browser_version`/`engine_version`：TS 硬编码 `131.0.0.0`（WebCast 为 Chrome/Edg 131），f2 fallback `130.0.0.0`（读 yaml 配置，真实值未知）。TS 更新，未必是坏事。

### 🟡 注入策略
`msToken`/`verifyFp`：f2 在模型默认值即生成，TS 留空由 crawler 请求时注入 —— **需确认 crawler 三处注入齐全**，否则发空值。

### 🟡 UserLiveStatusParams interface 不完整
interface 未声明 `channel`，实现却覆写 `channel:'test'`（request.ts:760）。运行无碍，类型不完整。

### 缺失 Model 6 个
`LiveChatSend` / `UserShortInfo` / `UserActiveStatus` / `UserLiveRank`（含 browser_version=134 覆写）/ `PostDanmaku` / `PostTimeDanmaku`。

### ✅ 已对齐
BaseRequest 27 字段、BaseLive/BaseLive2 全字段、28 个已实现 Model 字段与默认值。

---

## 4. Handler 层（22 实现 / 8 缺失）

### 🔴 逻辑不等价（抓取错误/漏抓/翻页失效）
| 方法 | 位置 | 差异 |
|---|---|---|
| `fetchHomePostSearch` | index.ts:544 | **无 `search_id` 续传**（抖音搜索翻页依赖它，缺失会导致第 2 页起错乱/重复）；keyword 未编码 |
| `fetchRelatedVideos` | index.ts:389 | filterGids 初始未含 `awemeId,`、未 `quote`、终止用空数组而非 `has_more`、size 硬编码 20 |
| `fetchUserFollowing` | index.ts:580 | 缺 `source_type` + `min_time/max_time` logicmap，只等价 source_type=4，无法按最近/最早排序翻页 |
| `fetchUserFollower` | index.ts:608 | 缺 `max_time=follower.min_time` 去重，可能重复/漏抓 |
| `fetchFriendFeedVideos` | index.ts:418 | 只传 cursor，丢失 `level/pull_type/refresh_type`；无 `status_code!=0` 中断 |

### ⚠️ 本轮新发现：minCursor 过度接入
上一步把 `minCursor` 时间终止接到了 **7 个方法**（post/like/collection/collects/collectsVideos/mix/music），但 **f2 仅 `fetch_user_post_videos` 一个有 min_cursor 逻辑**。
- 默认 `minCursor=0` 时无副作用；但语义上超出 f2。
- 且边界差一页：TS 在「取页前」判断，f2 在「取页并 yield 后」判断，TS 会早停一页。
- 建议：收窄到仅 `fetchUserPostVideos`，或明确这是本项目有意扩展。

### 🟡 通用 paginate 缺 has_aweme 空页跳过
f2 遇空页（无作品但 has_more）会跳过：不计数、不 sleep、继续翻页；TS 通用循环会 yield 空页并 sleep。

### 🟡 其它
- `DY_LIVE_STATUS_MAPPING` 缺状态码 `1`（types.ts:71），状态 1 落到「未知状态」。
- `fetchSuggestWords` 默认 count 8，f2 为 10。
- `fetchOneVideo` 缺 `nickname===null` 的 APIResponseError 校验。

### 缺失方法 8 个
`fetch_user_feed_videos`（'feed' 模式已在 ModeType 声明但 handler 无实现，半成品）/ `fetch_user_active_status` / `fetch_user_short_info` / `fetch_live_user_rank` / `fetch_live_danmaku`（WSS）/ `fetch_live_chat_send` / `fetch_post_danmaku` / `fetch_post_time_danmaku`。

---

## 5. Filter 层

### 🔴 本轮最重要新发现：toDict / filterToList 只查直接原型
- f2 `_to_dict`/`filter_to_list` 用 `dir()`，**遍历整条 MRO（含继承的 getter）**。
- TS `base.ts:80-81` toDict、`utils.ts:90-91` filterToList 用 `Object.getOwnPropertyNames(Object.getPrototypeOf(instance))`，**只取直接原型，不向上遍历**。

**后果**：所有靠继承拿属性的子类，`toList()/toDict()` 会丢父类 getter：
| 子类 | 丢失内容 |
|---|---|
| `UserLikeFilter`、`PostRelatedFilter` | 空子类，产出几乎全空（丢 UserPostFilter 全部 getter） |
| `UserCollectionFilter`、`UserMixFilter` | 自身只有 `maxCursor`，丢 UserPostFilter 绝大多数字段 |
| `UserFollowerFilter` | 丢 statusCode/statusMsg/hasMore/mixCount/offset/myselfUserId/maxTime/minTime |
| `PostCommentReplyFilter` | 空子类，丢 PostCommentFilter 全部字段 |

→ 需把 `filterToList`/`toDict` 改成沿原型链收集 getter，才能与 f2 `dir()` 语义对齐。**这是 filter 层最实质的偏差。**

### 🟡 缺失属性（7 处，集中在两字段）
| 属性 | Filter | JSONPath |
|---|---|---|
| authentication_token | UserPostFilter | `$.aweme_list[*].authentication_token` |
| video_id | UserPostFilter | `$.aweme_list[*].video.play_addr.uri` |
| authentication_token | PostDetailFilter | `$.aweme_detail.authentication_token` |
| video_id | PostDetailFilter | `$.aweme_detail.video.play_addr.uri` |
| video_id | FriendFeedFilter | `$.data[*].aweme.video.play_addr.uri` |
| authentication_token | HomePostSearchFilter | `$.aweme_list[*].authentication_token` |
| video_id | HomePostSearchFilter | `$.aweme_list[*].item.video.play_addr.uri` |

（这两字段主要服务于弹幕类接口，因弹幕类未实现，暂无消费方。）

### ✅ 亮点：TS 修对了 f2 的 bug
`UserFollowerFilter.can_share`：f2 是 `$.followersfollowers[*]...`（typo，永远 null），TS 用正确的 `$.followers[*]`（user.ts:319）。

### ✅ 已对齐
所有共有属性 JSONPath 逐一一致（除上述 typo）；`replaceT`、`timestamp2Str` 行为一致。

### 缺失 Filter 类 6 个
`LiveChatSendFilter` / `UserLiveRankingFilter` / `PostDanmakuFilter` / `PostTimeDanmakuFilter` / `UserActiveStatusFilter` / `UserShortInfoFilter`。

---

## 6. 综合待修优先级

### 🔴 P0（正确性 / 可用性）
1. **直播 4 接口补签名**（crawler）—— 否则直播相关基本失效
2. **filter `toDict/filterToList` 遍历原型链** —— 否则继承型子类 toList 输出残缺（影响 like/related/collection/mix/follower/comment_reply）
3. **`fetchHomePostSearch` search_id 续传 + keyword 编码**
4. **`fetchRelatedVideos` filterGids 修正**（含 awemeId + quote + has_more 终止）
5. **`fetchFriendFeed` 改 POST 空体**（crawler）+ handler 补 level/pull_type/status_code
6. **`fetchUserFollowing` source_type 排序 + logicmap**
7. **`fetchUserFollower` max_time 去重**

### 🟡 P1（完整性）
8. POST 重试补齐（当前零重试）；GET 重试 3→5、退避策略
9. `BaseWebCast` 4 字段类型 number→string
10. `minCursor` 收窄到仅 post（或确认为有意扩展）；paginate 补 has_aweme 空页跳过
11. `DY_LIVE_STATUS_MAPPING` 补状态码 1
12. filter 缺失属性 authentication_token / video_id
13. `fetchSuggestWords` 默认 count 8→10；`fetchOneVideo` nickname 校验

### 🟢 P2（新功能：缺失方法/端点/model/filter）
14. 8 个缺失 handler 方法（feed 半成品优先）+ 5 个端点 + 6 个 model + 6 个 filter 类
    - 批量：user_active_status / user_short_info
    - 弹幕：post_danmaku / post_time_danmaku / live_danmaku
    - 直播互动：live_chat_send / live_user_rank

---

## 7. dyDownloader 独有优势（保留）
- SharePage 无 Cookie 兜底、统一 URL 解析、本地正则解析、slides 图集、msToken 自动 fallback
- 修复了 f2 的 `followersfollowers` typo
- 分页 interval 双层可配（handler 级 + 单次级）
