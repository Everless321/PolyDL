/**
 * 快手直播：只读 HTTP 接口 + 弹幕 WebSocket。
 */
export {
  CAVER,
  LIVE_ORIGIN,
  LIVE_UA,
  LIVE_URL_MAP,
  SDK_VERSION_LIVE,
  axiosEncode,
  liveNeedSign,
  liveSignUrl,
  sortQuery,
  toQueryString,
} from './url-map.js'

export {
  COMPRESSION_AES,
  COMPRESSION_GZIP,
  COMPRESSION_NONE,
  decodeFrame,
  decodeMessage,
  encodeFrame,
  encodeMessage,
  enterRoomFrame,
  heartbeatFrame,
  userExitFrame,
  zigzagDecode,
  type DecodedLiveFrame,
  type EnterRoomOptions,
  type ProtoObject,
  type ProtoValue,
} from './proto.js'

export {
  KuaishouLiveClient,
  WS_RESULT_RISK_CONTROL,
  extractInitialState,
  isRiskControlled,
  roomStateFromInitialState,
  roomsFromHomePayload,
} from './api.js'

export { KuaishouLiveDanmaku } from './danmaku.js'
export { createLiveSigner } from './signer.js'

export type {
  CategoryClassifyOptions,
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
} from './types.js'
