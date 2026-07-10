/**
 * 抖音直播 WSS 签名生成
 * 对齐 f2 的 DouyinWebcastSignature：构造 raw_string → md5 得 X-MS-STUB → 执行
 * webcast_signature.js 的 get_signature(stub) → 取 X-Bogus 作为 WSS 的 signature 参数。
 */
import vm from 'node:vm'
import crypto from 'node:crypto'
import { WEBCAST_SIGNATURE_JS } from '../algorithm/webcast-signature-source.js'
import { getConfig } from '../config/index.js'

type SignFn = (xMsStub: string) => Record<string, string>

// 按 UA 缓存已编译的签名函数：执行 287KB 的混淆 JS 很贵，避免每次连接重复解析
const signFnCache = new Map<string, SignFn>()

function getSignFn(userAgent: string): SignFn {
  const cached = signFnCache.get(userAgent)
  if (cached) return cached

  // webcast_signature.js 内部用 global 自建 window/navigator，只需注入 _navigator
  const sandbox: Record<string, unknown> = {
    _navigator: { userAgent },
    console: { log: () => {}, error: () => {}, warn: () => {} },
  }
  sandbox.global = sandbox
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(WEBCAST_SIGNATURE_JS, sandbox, { timeout: 8000 })

  const fn = sandbox.get_signature as SignFn | undefined
  if (typeof fn !== 'function') {
    throw new Error('webcast_signature.js 未暴露 get_signature 函数')
  }
  signFnCache.set(userAgent, fn)
  return fn
}

/**
 * 生成直播弹幕 WSS 连接所需的 signature（X-Bogus）
 * @param roomId 直播间 ID
 * @param userUniqueId 用户唯一 ID（来自握手 fetchLiveImFetch）
 * @param userAgent 可选 UA，默认取全局配置
 */
export function getWebcastSignature(
  roomId: string,
  userUniqueId: string,
  userAgent?: string
): string {
  const ua = userAgent || getConfig().userAgent
  // 固定顺序的逗号串，与 f2 一致，任何字段/顺序变化都会导致签名失效
  const raw =
    `live_id=1,aid=6383,version_code=180800,webcast_sdk_version=1.0.14-beta.0,` +
    `room_id=${roomId},sub_room_id=,sub_channel_id=,did_rule=3,` +
    `user_unique_id=${userUniqueId},device_platform=web,device_type=,ac=,identity=audience`
  const xMsStub = crypto.createHash('md5').update(raw, 'utf8').digest('hex')

  const result = getSignFn(ua)(xMsStub)
  const signature = result?.['X-Bogus']
  if (!signature) {
    throw new Error('webcast signature 生成失败（get_signature 未返回 X-Bogus）')
  }
  return signature
}
