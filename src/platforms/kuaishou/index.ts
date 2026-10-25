import type { Platform } from '../../platform.js'

export * from './types.js'
export * from './client.js'
export * from './rest.js'
export * from './errors.js'
export * from './handler.js'
export * from './graphql.js'
export * from './api.js'
export * from './work.js'
export * from './downloader.js'
export * from './sign/index.js'

export {
  extractPhotoId,
  getLiveUserId,
  getPhotoId,
  getProfileId,
  getUserId,
  isShortUrl,
  parseKuaishouTarget,
  resolveShortUrl as resolveKuaishouShortUrl,
} from './url-parser.js'
export type { KuaishouUrlKind, ParsedKuaishouTarget } from './url-parser.js'

/**
 * 直播模块。CAVER / LIVE_URL_MAP / axiosEncode / liveNeedSign / liveSignUrl /
 * SDK_VERSION_LIVE 以 sign/ 为准，这里不重复导出。
 * decodeFrame 改名，避免和抖音直播的同名导出撞车。
 */
export {
  COMPRESSION_AES,
  COMPRESSION_GZIP,
  COMPRESSION_NONE,
  KuaishouLiveClient,
  KuaishouLiveDanmaku,
  LIVE_ORIGIN,
  LIVE_UA,
  WS_RESULT_RISK_CONTROL,
  createLiveSigner,
  decodeFrame as decodeKuaishouLiveFrame,
  decodeMessage,
  encodeFrame,
  encodeMessage,
  enterRoomFrame,
  extractInitialState,
  heartbeatFrame,
  isRiskControlled,
  roomStateFromInitialState,
  roomsFromHomePayload,
  sortQuery,
  toQueryString as liveToQueryString,
  userExitFrame,
  zigzagDecode,
} from './live/index.js'

export type {
  CategoryClassifyOptions,
  DecodedLiveFrame,
  EnterRoomOptions,
  GiftListOptions,
  KuaishouLiveClientConfig,
  KuaishouLiveDanmakuConfig,
  LiveDanmakuHandler,
  LiveDanmakuStats,
  LiveHomeRoom,
  LiveHxfalconInput,
  LiveHxfalconSigner,
  LiveJson,
  LiveRoomSnapshot,
  LiveRoomState,
  LiveWebSocketFactory,
  LiveWebSocketInit,
  LiveWebSocketLike,
  PlaybackListOptions,
  ProfileFeedOptions,
  ProtoObject,
  ProtoValue,
} from './live/index.js'

/** 快手平台实现 */
export const kuaishouPlatform: Platform = {
  id: 'kuaishou',
  name: '快手',
  match(url: string): boolean {
    return /kuaishou\.com/.test(url)
  },
}
