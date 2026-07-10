/**
 * 抖音直播弹幕模块
 */
export { streamLiveDanmaku, type LiveDanmakuOptions } from './danmaku.js'
export { getWebcastSignature } from './webcast-signature.js'
export {
  decodeFrame,
  buildAckFrame,
  buildPingFrame,
  type DanmakuEvent,
  type DanmakuEventBody,
  type DanmakuMeta,
  type DanmakuUser,
  type DecodedFrame,
} from './message-parser.js'
