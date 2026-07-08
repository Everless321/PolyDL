# 抖音 Handler/Crawler 逐方法对照 f2

> 对标基准：`Johnserf-Seed/f2` 分支 `v0.0.1.8-pw3` @ `1d9f3747610d09c0a32122f2ffefa2b4bc56f011`
> 对照范围：仅 **api / crawler / handler** 层（不含 CLI）
> 生成日期：2026-07-08

f2 handler(v0.0.1.8-pw3 @ `1d9f374`) 的数据获取方法逐个对照。按「已实现且对齐」「已实现但有行为差异」「完全缺失」「crawler 有但 handler 未封装」四类。

## 一、逐方法对照表（Handler 层）

| f2 方法 | 我们的方法 | 状态 | 说明 |
|---|---|---|---|
| `fetch_user_profile` | `fetchUserProfile` | ✅ 已对齐 | 已补输入校验、广告用户检测(`status_code==5`→null)、空响应(`nickname===null`)抛错 |
| `fetch_one_video` | `fetchOneVideo` | ✅ + 增强 | 我们多了无 Cookie 的 SharePage 兜底（`fetchOneVideoFromSharePage`），f2 无 |
| `fetch_user_post_videos` | `fetchUserPostVideos` | ⚠️ 分页差异 | 见下方「通用分页差异」 |
| `fetch_user_like_videos` | `fetchUserLikeVideos` | ⚠️ 分页差异 | 同上 |
| `fetch_user_collection_videos` | `fetchUserCollectionVideos` | 🔴 差异 | crawler 层 HTTP method 与 f2 不一致（我们 GET vs POST）+ 分页 |
| `fetch_user_collects` | `fetchUserCollects` | ⚠️ 分页差异 | |
| `fetch_user_collects_videos` | `fetchUserCollectsVideos` | ⚠️ 分页差异 | |
| `fetch_user_mix_videos` | `fetchUserMixVideos` | ⚠️ 分页差异 | |
| `fetch_user_music_collection` | `fetchUserMusicCollection` | ⚠️ 分页差异 | |
| `fetch_related_videos` | `fetchRelatedVideos` | 🔴 差异 | `filterGids` 未含原始 awemeId、无 URL 编码、终止条件用空判断而非 `has_more` |
| `fetch_friend_feed_videos` | `fetchFriendFeedVideos` | 🟡 差异 | 缺 `level`/`pull_type` 参数追踪、无 `status_code!=0` 检查 |
| `fetch_user_live_videos` | `fetchUserLiveVideos` | 🔴 差异 | 直播接口未走签名（直接 `toQueryString` 拼 URL） |
| `fetch_user_live_videos_by_room_id` | `fetchUserLiveVideos2` | 🔴 差异 | 同上无签名；且缺 f2 的临时清 Cookie 逻辑 |
| `fetch_user_live_status` | `fetchUserLiveStatus` | 🔴 差异 | 无签名 |
| `fetch_live_im` | `fetchLiveImFetch` | 🔴 差异 | 无签名 |
| `fetch_user_following_lives` | `fetchFollowingUserLive` | ✅ 基本对齐 | |
| `fetch_user_following` | `fetchUserFollowing` | 🔴 差异 | 缺 `source_type` 三种排序、缺 `logicmap`(offset/min_time/max_time) 切换 |
| `fetch_user_follower` | `fetchUserFollower` | 🟡 差异 | 缺 `max_time` 去重 |
| `fetch_query_user` | `fetchQueryUser` | 🟡 已修 | 已按 f2 对齐默认 GET（旧 POST 语义保留） |
| `fetch_post_stats` | `fetchPostStats` | 🟡 差异 | body 处理方式与 f2 略不同（form-encoded） |
| `fetch_post_comment` | `fetchPostComment` | ⚠️ 分页差异 | |
| `fetch_post_comment_reply` | `fetchPostCommentReply` | ⚠️ 分页差异 | |
| `fetch_home_post_search` | `fetchHomePostSearch` | 🔴 差异 | 未追踪 `search_id`、keyword 未编码、默认页大小 10 vs 20 |
| `fetch_suggest_word` | `fetchSuggestWords` | ✅ 基本对齐 | |

> **通用分页差异（🔴，影响所有生成器方法）**：我们的分页**无请求间隔**，f2 默认 `asyncio.sleep(5)`；我们固定 `pageCounts`，f2 动态 `min(page_counts, max_counts-collected)`。这是最容易触发风控的点。

## 二、f2 有、我们 handler 完全缺失的方法（8 个）

| f2 方法 | 功能 | 对应端点 |
|---|---|---|
| `fetch_user_active_status` | 用户活跃状态批量查询 | `USER_ACTIVE_STATUS` |
| `fetch_user_short_info` | 用户短信息批量查询 | （2026-01-30 新增） |
| `fetch_user_feed_videos` | 首页推荐 feed | `TAB_FEED`（crawler 有，handler 无） |
| `fetch_live_user_rank` | 直播观众排行榜 | `LIVE_AUDIENCE_RANKING` |
| `fetch_live_danmaku` | 直播弹幕流（WSS） | — |
| `fetch_live_chat_send` | 发送直播弹幕 | `LIVE_CHAT_SEND` |
| `fetch_post_danmaku` | 视频弹幕列表 | `POST_DANMAKU_LIST` |
| `fetch_post_time_danmaku` | 视频时间轴弹幕 | `POST_TIME_DANMAKU` |

这 8 个里，前两个是 f2 在建立基准前一天（2026-01-30）新加的批量查询接口，其余是直播弹幕/排行榜相关。对应的 Filter/Model 我们也缺（`UserShortInfoFilter`、`UserActiveStatusFilter`、`UserLiveRankingFilter`、`PostDanmakuFilter`、`PostTimeDanmakuFilter`、`LiveChatSendFilter`）。

## 三、Crawler 有、但 Handler 未封装（4 个）

这些底层请求写了，但没有对外的 handler 生成器/方法：

| Crawler 方法 | 端点 | 备注 |
|---|---|---|
| `fetchPostFeed` | `TAB_FEED` | 推荐 feed，f2 有 handler 封装我们没有 |
| `fetchFollowFeed` | `FOLLOW_FEED` | 关注 feed |
| `fetchPostSearch` | `POST_SEARCH` | 综合作品搜索（f2 handler 也无此封装） |
| `fetchPostLocate` | `LOCATE_POST` | 定位作品分页 |

## 小结

- **Handler 数据方法：f2 约 32 个 → 我们实现了 24 个，对齐/可用，缺 8 个**（主要是直播弹幕类 + 2 个新批量查询接口）。
- **真正会导致「跑不通/被风控」的高优先级差异（🔴）**：直播 4 接口无签名、分页无间隔、`fetchRelatedVideos`/`fetchHomePostSearch` 分页逻辑、`fetchUserFollowing` 排序、collection 的 HTTP method。
- 其余多为完整性差异（🟡），不影响主流程。

修复优先级建议：**① 直播接口补签名**（否则直播相关基本失效）→ **② 分页加请求间隔**（防封）→ **③ `fetchRelatedVideos`/`fetchHomePostSearch` 分页修正**。缺失的弹幕类 8 个方法属于新功能，可按需再排。
