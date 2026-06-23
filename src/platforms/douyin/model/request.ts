export interface BaseRequestParams {
  device_platform: string
  aid: string
  channel: string
  pc_client_type: number
  publish_video_strategy_type: number
  pc_libra_divert: string
  version_code: string
  version_name: string
  cookie_enabled: string
  screen_width: number
  screen_height: number
  browser_language: string
  browser_platform: string
  browser_name: string
  browser_version: string
  browser_online: string
  engine_name: string
  engine_version: string
  os_name: string
  os_version: string
  cpu_core_num: number
  device_memory: number
  platform: string
  downlink: number
  effective_type: string
  round_trip_time: number
  msToken: string
}

export interface BaseLiveParams {
  aid: string
  app_name: string
  live_id: number
  device_platform: string
  language: string
  cookie_enabled: string
  screen_width: number
  screen_height: number
  browser_language: string
  browser_platform: string
  browser_name: string
  browser_version: string
  enter_source: string
  is_need_double_stream: string
  insert_task_id: string
  live_reason: string
}

export interface BaseLiveParams2 {
  verifyFp: string
  type_id: string
  live_id: string
  sec_user_id: string
  version_code: string
  app_id: string
  msToken: string
}

export interface BaseWebCastParams {
  app_name: string
  version_code: string
  device_platform: string
  cookie_enabled: string
  screen_width: number
  screen_height: number
  browser_language: string
  browser_platform: string
  browser_name: string
  browser_version: string
  browser_online: string
  tz_name: string
  host: string
  aid: number
  live_id: number
  did_rule: number
  endpoint: string
  support_wrds: number
  identity: string
  need_persist_msg_count: number
  insert_task_id: string
  live_reason: string
}

function getBaseRequestParams(): BaseRequestParams {
  return {
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    pc_client_type: 1,
    publish_video_strategy_type: 2,
    pc_libra_divert: 'Windows',
    version_code: '290100',
    version_name: '29.1.0',
    cookie_enabled: 'true',
    screen_width: 1920,
    screen_height: 1080,
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Edge',
    browser_version: '131.0.0.0',
    browser_online: 'true',
    engine_name: 'Blink',
    engine_version: '131.0.0.0',
    os_name: 'Windows',
    os_version: '10',
    cpu_core_num: 12,
    device_memory: 8,
    platform: 'PC',
    downlink: 10,
    effective_type: '4g',
    round_trip_time: 100,
    msToken: '',  // 由 DouyinCrawler 在请求时注入真实 msToken
  }
}

function getBaseLiveParams(): BaseLiveParams {
  return {
    aid: '6383',
    app_name: 'douyin_web',
    live_id: 1,
    device_platform: 'web',
    language: 'zh-CN',
    cookie_enabled: 'true',
    screen_width: 1920,
    screen_height: 1080,
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Edge',
    browser_version: '131.0.0.0',
    enter_source: '',
    is_need_double_stream: 'false',
    insert_task_id: '',
    live_reason: '',
  }
}

function getBaseLiveParams2(): BaseLiveParams2 {
  return {
    verifyFp: '',
    type_id: '0',
    live_id: '1',
    sec_user_id: '',
    version_code: '99.99.99',
    app_id: '1128',
    msToken: '',
  }
}

function getBaseWebCastParams(): BaseWebCastParams {
  return {
    app_name: 'douyin_web',
    version_code: '180800',
    device_platform: 'web',
    cookie_enabled: 'true',
    screen_width: 1920,
    screen_height: 1080,
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Mozilla',
    browser_version: encodeURIComponent(
      '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
    ),
    browser_online: 'true',
    tz_name: 'Asia/Hong_Kong',
    host: 'https://live.douyin.com',
    aid: 6383,
    live_id: 1,
    did_rule: 3,
    endpoint: 'live_pc',
    support_wrds: 1,
    identity: 'audience',
    need_persist_msg_count: 15,
    insert_task_id: '',
    live_reason: '',
  }
}

// 用户信息
export interface UserProfileParams extends BaseRequestParams {
  sec_user_id: string
}

export function createUserProfileParams(secUserId: string): UserProfileParams {
  return { ...getBaseRequestParams(), sec_user_id: secUserId }
}

// 用户作品
export interface UserPostParams extends BaseRequestParams {
  max_cursor: number
  count: number
  sec_user_id: string
}

export function createUserPostParams(
  secUserId: string,
  maxCursor: number = 0,
  count: number = 18
): UserPostParams {
  return { ...getBaseRequestParams(), sec_user_id: secUserId, max_cursor: maxCursor, count }
}

// 用户喜欢
export interface UserLikeParams extends BaseRequestParams {
  max_cursor: number
  count: number
  sec_user_id: string
}

export function createUserLikeParams(
  secUserId: string,
  maxCursor: number = 0,
  count: number = 18
): UserLikeParams {
  return { ...getBaseRequestParams(), sec_user_id: secUserId, max_cursor: maxCursor, count }
}

// 用户收藏
export interface UserCollectionParams extends BaseRequestParams {
  cursor: number
  count: number
}

export function createUserCollectionParams(
  cursor: number = 0,
  count: number = 18
): UserCollectionParams {
  return { ...getBaseRequestParams(), cursor, count }
}

// 用户收藏夹
export interface UserCollectsParams extends BaseRequestParams {
  cursor: number
  count: number
}

export function createUserCollectsParams(
  cursor: number = 0,
  count: number = 18
): UserCollectsParams {
  return { ...getBaseRequestParams(), cursor, count }
}

// 用户收藏夹作品
export interface UserCollectsVideoParams extends BaseRequestParams {
  cursor: number
  count: number
  collects_id: string
}

export function createUserCollectsVideoParams(
  collectsId: string,
  cursor: number = 0,
  count: number = 18
): UserCollectsVideoParams {
  return { ...getBaseRequestParams(), collects_id: collectsId, cursor, count }
}

// 用户音乐收藏
export interface UserMusicCollectionParams extends BaseRequestParams {
  cursor: number
  count: number
}

export function createUserMusicCollectionParams(
  cursor: number = 0,
  count: number = 18
): UserMusicCollectionParams {
  return { ...getBaseRequestParams(), cursor, count }
}

// 合集作品
export interface UserMixParams extends BaseRequestParams {
  cursor: number
  count: number
  mix_id: string
}

export function createUserMixParams(
  mixId: string,
  cursor: number = 0,
  count: number = 18
): UserMixParams {
  return { ...getBaseRequestParams(), mix_id: mixId, cursor, count }
}

// 朋友作品
export interface FriendFeedParams extends BaseRequestParams {
  cursor: number
  level: number
  aweme_ids: string
  room_ids: string
  pull_type: number
  refresh_type: number
  address_book_access: number
  gps_access: number
  recent_gids: string
}

export function createFriendFeedParams(cursor: number = 0): FriendFeedParams {
  return {
    ...getBaseRequestParams(),
    cursor,
    level: 1,
    aweme_ids: '',
    room_ids: '',
    pull_type: 0,
    refresh_type: 0,
    address_book_access: 2,
    gps_access: 2,
    recent_gids: '',
  }
}

// 首页Feed
export interface PostFeedParams extends BaseRequestParams {
  count: number
  tag_id: string
  share_aweme_id: string
  live_insert_type: string
  refresh_index: number
  video_type_select: number
  aweme_pc_rec_raw_data: string
  globalwid: string
  pull_type: string
  min_window: string
  free_right: string
  ug_source: string
  creative_id: string
}

export function createPostFeedParams(count: number = 10): PostFeedParams {
  return {
    ...getBaseRequestParams(),
    count,
    tag_id: '',
    share_aweme_id: '',
    live_insert_type: '',
    refresh_index: 1,
    video_type_select: 1,
    aweme_pc_rec_raw_data: encodeURIComponent('{"is_client":"false"}'),
    globalwid: '',
    pull_type: '',
    min_window: '',
    free_right: '',
    ug_source: '',
    creative_id: '',
  }
}

// 关注用户作品
export interface FollowFeedParams extends BaseRequestParams {
  cursor: number
  level: number
  count: number
  pull_type: string
}

export function createFollowFeedParams(
  cursor: number = 0,
  count: number = 20
): FollowFeedParams {
  return { ...getBaseRequestParams(), cursor, level: 1, count, pull_type: '' }
}

// 相关推荐
export interface PostRelatedParams extends BaseRequestParams {
  aweme_id: string
  count: number
  filterGids: string
  awemePcRecRawData: string
  sub_channel_id: number
}

export function createPostRelatedParams(
  awemeId: string,
  filterGids: string = '',
  count: number = 20
): PostRelatedParams {
  return {
    ...getBaseRequestParams(),
    aweme_id: awemeId,
    count,
    filterGids,
    awemePcRecRawData: encodeURIComponent('{"is_client":"false"}'),
    sub_channel_id: 3,
  }
}

// 作品详情
export interface PostDetailParams extends BaseRequestParams {
  aweme_id: string
}

export function createPostDetailParams(awemeId: string): PostDetailParams {
  return { ...getBaseRequestParams(), aweme_id: awemeId }
}

// 作品评论
export interface PostCommentParams extends BaseRequestParams {
  aweme_id: string
  cursor: number
  count: number
  item_type: number
  insert_ids: string
  whale_cut_token: string
  cut_version: number
  rcFT: string
}

export function createPostCommentParams(
  awemeId: string,
  cursor: number = 0,
  count: number = 20
): PostCommentParams {
  return {
    ...getBaseRequestParams(),
    aweme_id: awemeId,
    cursor,
    count,
    item_type: 0,
    insert_ids: '',
    whale_cut_token: '',
    cut_version: 1,
    rcFT: '',
  }
}

// 评论回复
export interface PostCommentReplyParams extends BaseRequestParams {
  item_id: string
  comment_id: string
  cursor: number
  count: number
  item_type: number
  cut_version: number
}

export function createPostCommentReplyParams(
  itemId: string,
  commentId: string,
  cursor: number = 0,
  count: number = 3
): PostCommentReplyParams {
  return {
    ...getBaseRequestParams(),
    item_id: itemId,
    comment_id: commentId,
    cursor,
    count,
    item_type: 0,
    cut_version: 1,
  }
}

// 定位作品
export interface PostLocateParams extends BaseRequestParams {
  sec_user_id: string
  max_cursor: string
  locate_item_id: string
  locate_item_cursor: string
  locate_query: string
  count: number
}

export function createPostLocateParams(
  secUserId: string,
  maxCursor: string,
  locateItemCursor: string,
  locateItemId: string = '',
  count: number = 10
): PostLocateParams {
  return {
    ...getBaseRequestParams(),
    sec_user_id: secUserId,
    max_cursor: maxCursor,
    locate_item_id: locateItemId,
    locate_item_cursor: locateItemCursor,
    locate_query: 'true',
    count,
  }
}

// 用户直播
export interface UserLiveParams extends BaseLiveParams {
  web_rid: string
  room_id_str: string
}

export function createUserLiveParams(webRid: string, roomIdStr: string): UserLiveParams {
  return { ...getBaseLiveParams(), web_rid: webRid, room_id_str: roomIdStr }
}

// 用户直播2
export interface UserLive2Params extends BaseLiveParams2 {
  room_id: string
}

export function createUserLive2Params(roomId: string): UserLive2Params {
  return { ...getBaseLiveParams2(), room_id: roomId }
}

// 关注用户直播
export interface FollowingUserLiveParams extends BaseRequestParams {
  scene: string
}

export function createFollowingUserLiveParams(): FollowingUserLiveParams {
  return { ...getBaseRequestParams(), scene: 'aweme_pc_follow_top' }
}

// 搜索建议
export interface SuggestWordParams extends BaseRequestParams {
  query: string
  count: number
  business_id: string
  from_group_id: string
  rsp_source: string
  penetrate_params: string
}

export function createSuggestWordParams(query: string, count: number = 8): SuggestWordParams {
  return {
    ...getBaseRequestParams(),
    query,
    count,
    business_id: '30068',
    from_group_id: '',
    rsp_source: '',
    penetrate_params: encodeURIComponent('{}'),
  }
}

// 作品搜索
export interface PostSearchParams extends BaseRequestParams {
  search_channel: string
  filter_selected: string
  keyword: string
  search_source: string
  search_id: string
  query_correct_type: number
  is_filter_search: number
  from_group_id: string
  offset: number
  count: number
  need_filter_settings: number
}

export function createPostSearchParams(
  keyword: string,
  filterSelected: string = '',
  offset: number = 0,
  count: number = 15
): PostSearchParams {
  return {
    ...getBaseRequestParams(),
    search_channel: 'aweme_general',
    filter_selected: filterSelected,
    keyword,
    search_source: 'normal_search',
    search_id: '',
    query_correct_type: 1,
    is_filter_search: 0,
    from_group_id: '',
    offset,
    count,
    need_filter_settings: 1,
  }
}

// 主页作品搜索
export interface HomePostSearchParams extends BaseRequestParams {
  search_channel: string
  search_source: string
  search_scene: string
  sort_type: number
  publish_time: number
  is_filter_search: number
  query_correct_type: number
  keyword: string
  enable_history: number
  search_id: string
  offset: number
  count: number
  from_user: string
}

export function createHomePostSearchParams(
  keyword: string,
  fromUser: string,
  offset: number = 0,
  count: number = 10
): HomePostSearchParams {
  return {
    ...getBaseRequestParams(),
    search_channel: 'aweme_personal_home_video',
    search_source: 'normal_search',
    search_scene: 'douyin_search',
    sort_type: 0,
    publish_time: 0,
    is_filter_search: 0,
    query_correct_type: 1,
    keyword,
    enable_history: 1,
    search_id: '',
    offset,
    count,
    from_user: fromUser,
  }
}

// 用户关注列表
export interface UserFollowingParams extends BaseRequestParams {
  user_id: string
  sec_user_id: string
  offset: number
  min_time: number
  max_time: number
  count: number
  source_type: number
  gps_access: number
  address_book_access: number
  is_top: number
}

export function createUserFollowingParams(
  secUserId: string,
  userId: string = '',
  offset: number = 0,
  count: number = 20,
  sourceType: number = 4
): UserFollowingParams {
  return {
    ...getBaseRequestParams(),
    user_id: userId,
    sec_user_id: secUserId,
    offset,
    min_time: 0,
    max_time: 0,
    count,
    source_type: sourceType,
    gps_access: 0,
    address_book_access: 0,
    is_top: 1,
  }
}

// 用户粉丝列表
export interface UserFollowerParams extends BaseRequestParams {
  user_id: string
  sec_user_id: string
  offset: number
  min_time: number
  max_time: number
  count: number
  source_type: number
  gps_access: number
  address_book_access: number
  is_top: number
}

export function createUserFollowerParams(
  userId: string,
  secUserId: string,
  offset: number = 0,
  count: number = 20,
  sourceType: number = 1
): UserFollowerParams {
  return {
    ...getBaseRequestParams(),
    user_id: userId,
    sec_user_id: secUserId,
    offset,
    min_time: 0,
    max_time: 0,
    count,
    source_type: sourceType,
    gps_access: 0,
    address_book_access: 0,
    is_top: 1,
  }
}

// 直播WebCast
export interface LiveWebcastParams extends BaseWebCastParams {
  webcast_sdk_version: string
  update_version_code: string
  compress: string
  im_path: string
  heartbeatDuration: number
  room_id: string
  user_unique_id: string
  cursor: string
  internal_ext: string
  signature: string
}

export function createLiveWebcastParams(
  roomId: string,
  userUniqueId: string,
  cursor: string,
  internalExt: string,
  signature: string
): LiveWebcastParams {
  return {
    ...getBaseWebCastParams(),
    webcast_sdk_version: '1.0.14-beta.0',
    update_version_code: '1.0.14-beta.0',
    compress: 'gzip',
    im_path: '/webcast/im/fetch/',
    heartbeatDuration: 0,
    room_id: roomId,
    user_unique_id: userUniqueId,
    cursor,
    internal_ext: internalExt,
    signature,
  }
}

// 直播弹幕初始化
export interface LiveImFetchParams extends BaseWebCastParams {
  resp_content_type: string
  fetch_rule: number
  last_rtt: number
  cursor: string
  internal_ext: string
  room_id: string
  user_unique_id: string
}

export function createLiveImFetchParams(
  roomId: string,
  userUniqueId: string,
  cursor: string = '',
  internalExt: string = ''
): LiveImFetchParams {
  return {
    ...getBaseWebCastParams(),
    resp_content_type: 'json',
    fetch_rule: 1,
    last_rtt: 0,
    cursor,
    internal_ext: internalExt,
    room_id: roomId,
    user_unique_id: userUniqueId,
  }
}

// 用户直播状态
export interface UserLiveStatusParams extends BaseRequestParams {
  user_ids: string
  distribution_scenes: string
}

export function createUserLiveStatusParams(userIds: string): UserLiveStatusParams {
  return {
    ...getBaseRequestParams(),
    user_ids: userIds,
    distribution_scenes: '254',
    channel: 'test',
  }
}

// 查询用户
export interface QueryUserParams extends BaseRequestParams {
  update_version_code: string
}

export function createQueryUserParams(): QueryUserParams {
  return {
    ...getBaseRequestParams(),
    update_version_code: '170400',
    version_code: '170400',
    version_name: '17.4.0',
  }
}

// 作品统计
export interface PostStatsParams extends BaseRequestParams {
  aweme_type: number
  item_id: string
  play_delta: number
  source: number
}

export function createPostStatsParams(
  itemId: string,
  awemeType: number = 0,
  playDelta: number = 1
): PostStatsParams {
  return {
    ...getBaseRequestParams(),
    aweme_type: awemeType,
    item_id: itemId,
    play_delta: playDelta,
    source: 0,
  }
}

// 工具函数：将参数对象转为查询字符串
export function toQueryString(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}
