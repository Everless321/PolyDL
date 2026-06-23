const DOUYIN_DOMAIN = 'https://www.douyin.com'
const IESDOUYIN_DOMAIN = 'https://www.iesdouyin.com'
const LIVE_DOMAIN = 'https://live.douyin.com'
const LIVE_DOMAIN2 = 'https://webcast.amemv.com'
const WEBCAST_WSS_DOMAIN = 'wss://webcast5-ws-web-hl.douyin.com'

export const ENDPOINTS = {
  // 域名
  DOUYIN_DOMAIN,
  IESDOUYIN_DOMAIN,
  LIVE_DOMAIN,
  LIVE_DOMAIN2,
  WEBCAST_WSS_DOMAIN,

  // 直播弹幕 WSS
  LIVE_IM_WSS: `${WEBCAST_WSS_DOMAIN}/webcast/im/push/v2/`,

  // 首页 Feed
  TAB_FEED: `${DOUYIN_DOMAIN}/aweme/v1/web/tab/feed/`,

  // 用户短信息
  USER_SHORT_INFO: `${DOUYIN_DOMAIN}/aweme/v1/web/im/user/info/`,

  // 用户详细信息
  USER_DETAIL: `${DOUYIN_DOMAIN}/aweme/v1/web/user/profile/other/`,

  // 作品基本
  BASE_AWEME: `${DOUYIN_DOMAIN}/aweme/v1/web/aweme/`,

  // 用户作品
  USER_POST: `${DOUYIN_DOMAIN}/aweme/v1/web/aweme/post/`,

  // Live 作品
  SLIDES_AWEME: `${IESDOUYIN_DOMAIN}/web/api/v2/aweme/slidesinfo/`,

  // 定位作品
  LOCATE_POST: `${DOUYIN_DOMAIN}/aweme/v1/web/locate/post/`,

  // 搜索作品
  POST_SEARCH: `${DOUYIN_DOMAIN}/aweme/v1/web/general/search/single/`,

  // 主页作品搜索
  HOME_POST_SEARCH: `${DOUYIN_DOMAIN}/aweme/v1/web/home/search/item/`,

  // 作品详情
  POST_DETAIL: `${DOUYIN_DOMAIN}/aweme/v1/web/aweme/detail/`,

  // 用户喜欢 A
  USER_FAVORITE_A: `${DOUYIN_DOMAIN}/aweme/v1/web/aweme/favorite/`,

  // 用户喜欢 B
  USER_FAVORITE_B: `${IESDOUYIN_DOMAIN}/web/api/v2/aweme/like/`,

  // 关注用户
  USER_FOLLOWING: `${DOUYIN_DOMAIN}/aweme/v1/web/user/following/list/`,

  // 粉丝用户
  USER_FOLLOWER: `${DOUYIN_DOMAIN}/aweme/v1/web/user/follower/list/`,

  // 合集作品
  MIX_AWEME: `${DOUYIN_DOMAIN}/aweme/v1/web/mix/aweme/`,

  // 用户历史
  USER_HISTORY: `${DOUYIN_DOMAIN}/aweme/v1/web/history/read/`,

  // 用户收藏
  USER_COLLECTION: `${DOUYIN_DOMAIN}/aweme/v1/web/aweme/listcollection/`,

  // 用户收藏夹
  USER_COLLECTS: `${DOUYIN_DOMAIN}/aweme/v1/web/collects/list/`,

  // 用户收藏夹作品
  USER_COLLECTS_VIDEO: `${DOUYIN_DOMAIN}/aweme/v1/web/collects/video/list/`,

  // 用户音乐收藏
  USER_MUSIC_COLLECTION: `${DOUYIN_DOMAIN}/aweme/v1/web/music/listcollection/`,

  // 首页朋友作品
  FRIEND_FEED: `${DOUYIN_DOMAIN}/aweme/v1/web/familiar/feed/`,

  // 关注用户作品
  FOLLOW_FEED: `${DOUYIN_DOMAIN}/aweme/v1/web/follow/feed/`,

  // 相关推荐
  POST_RELATED: `${DOUYIN_DOMAIN}/aweme/v1/web/aweme/related/`,

  // 关注用户列表直播
  FOLLOW_USER_LIVE: `${DOUYIN_DOMAIN}/webcast/web/feed/follow/`,

  // 直播信息
  LIVE_INFO: `${LIVE_DOMAIN}/webcast/room/web/enter/`,

  // 直播信息 2
  LIVE_INFO_ROOM_ID: `${LIVE_DOMAIN2}/webcast/room/reflow/info/`,

  // 直播用户信息
  LIVE_USER_INFO: `${LIVE_DOMAIN}/webcast/user/me/`,

  // 直播弹幕初始化
  LIVE_IM_FETCH: `${LIVE_DOMAIN}/webcast/im/fetch/`,

  // 用户直播状态
  USER_LIVE_STATUS: `${LIVE_DOMAIN}/webcast/distribution/check_user_live_status/`,

  // 推荐搜索词
  SUGGEST_WORDS: `${DOUYIN_DOMAIN}/aweme/v1/web/api/suggest_words/`,

  // 作品评论
  POST_COMMENT: `${DOUYIN_DOMAIN}/aweme/v1/web/comment/list/`,

  // 评论回复
  POST_COMMENT_REPLY: `${DOUYIN_DOMAIN}/aweme/v1/web/comment/list/reply/`,

  // 回复评论
  POST_COMMENT_PUBLISH: `${DOUYIN_DOMAIN}/aweme/v1/web/comment/publish`,

  // 删除评论
  POST_COMMENT_DELETE: `${DOUYIN_DOMAIN}/aweme/v1/web/comment/delete/`,

  // 点赞评论
  POST_COMMENT_DIGG: `${DOUYIN_DOMAIN}/aweme/v1/web/comment/digg`,

  // 查询用户
  QUERY_USER: `${DOUYIN_DOMAIN}/aweme/v1/web/query/user/`,

  // 作品状态
  POST_STATS: `${DOUYIN_DOMAIN}/aweme/v2/web/aweme/stats/`,
} as const

export type EndpointKey = keyof typeof ENDPOINTS
