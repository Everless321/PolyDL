# 快手 handler 方法名与抖音对齐

## 背景

命令行不再作为主线，上层直接调库。`KuaishouHandler` 之前的方法名（`fetchWork`、`fetchUserWorks`、`fetchComments`）和 `DouyinHandler` 不一致，文档没法用一张表讲清两个平台。喜欢、收藏、关注、粉丝、楼中楼等接口在 `KuaishouWebApi` 里已经有了，但 handler 没有包装。

## 改动

- `KuaishouHandler` 新增与 `DouyinHandler` 同名的方法：`fetchUserLikeVideos`、`fetchUserCollectionVideos`、`fetchRelatedVideos`、`fetchPostComment`、`fetchPostCommentReply`、`fetchUserFollowing`、`fetchUserFollower`。
- 快手独有的接口也包装进 handler：`fetchSearchUser`、`fetchUserPrivateVideos`、`fetchUserLiveReplays`。
- **不兼容**：`fetchOneVideo` 改为返回 `KuaishouWork`（原来返回原始 `VisionVideoDetail`）；`fetchUserPostVideos` 改为按页产出 `KuaishouWork[]`（原来产出原始 REST / GraphQL 页）。原始响应仍在 `KuaishouWork.raw`，原始 REST 分页仍可用 `fetchUserPostVideosRest`。
- `fetchWork`、`fetchUserWorks`、`fetchComments` 保留，作为新名字的别名。
- `fetchUserWorks`（命令行 `pdl user` 使用）现在和 `fetchUserPostVideos` 一样，REST 第一页失败时退回 GraphQL。之前它只走 REST。
- `KuaishouWebApi` 补上分页迭代器：`iterLikedList`、`iterCollectList`、`iterPrivateList`、`iterPlaybackList`、`iterSubComments`、`iterSearchUser`。
- 文档：`README.md` 的 API 参考加 `KuaishouHandler` 表；`src/platforms/kuaishou/README.md` 加两个平台的方法对照表。

## 签名差异

只保证方法名相同，参数按快手接口的实际能力定：

- 喜欢、关注、粉丝、私密：快手接口只认 Cookie，所以没有用户参数，只能查当前登录账号。实测给喜欢接口传别人的主页 Referer，返回结果和查自己一样。
- 收藏：`fetchUserCollectionVideos({ userId })` 可以查别人。实测能拿到对方收藏里其他作者的作品。
- 相关推荐：接口只有一页。

## 没有做

- 关注页作品流 `visionProfilePhotoList(page=follow)` 实测返回 `result=50` 和空列表，没有包装。
- 抖音的收藏夹、合集、音乐收藏、朋友作品、主页内搜索、搜索建议、作品统计，快手没有对应接口。

## 验证

- 单元测试：`tests/kuaishou-api.test.ts` 新增两组用例，覆盖全部新方法的请求路径、body 和输出。
- 真实网络：用登录 Cookie 逐个调用全部方法。私密作品和直播回放返回 0 条，原始接口也是空列表，属于账号本身没有数据。
