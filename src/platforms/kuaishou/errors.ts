/**
 * 快手 www 接口的风控 / 登录错误。
 *
 * 只识别响应，不解题：result 400002（或 GraphQL 的 errors + data.captcha.url）
 * 抛 KuaishouRiskError；result 109 或文案 "No Login" 抛 KuaishouLoginError。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textHasNoLogin(value: unknown): boolean {
  return typeof value === 'string' && /no login/i.test(value)
}

/** 滑块风控挑战里的验证码页 URL；不是挑战则返回 null。 */
export function captchaUrlOf(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const data = isRecord(payload.data) ? payload.data : undefined
  if (data && data.result === 400002 && typeof data.url === 'string' && data.url) {
    return data.url
  }
  const captcha = data && isRecord(data.captcha) ? data.captcha : undefined
  if (
    captcha &&
    typeof captcha.url === 'string' &&
    captcha.url &&
    Array.isArray(payload.errors) &&
    payload.errors.length > 0
  ) {
    return captcha.url
  }
  if (payload.result === 400002) {
    if (typeof payload.url === 'string' && payload.url) return payload.url
    if (data && typeof data.url === 'string' && data.url) return data.url
  }
  return null
}

/** result === 109，或错误文案含 "No Login"。 */
export function isLoginPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false
  if (payload.result === 109) return true
  if (
    textHasNoLogin(payload.error_msg) ||
    textHasNoLogin(payload.message) ||
    textHasNoLogin(payload.error)
  ) {
    return true
  }
  if (Array.isArray(payload.errors)) {
    for (const err of payload.errors) {
      if (isRecord(err) && textHasNoLogin(err.message)) return true
    }
  }
  return false
}

export function throwIfKuaishouStatus(payload: unknown): void {
  const captchaUrl = captchaUrlOf(payload)
  if (captchaUrl) throw new KuaishouRiskError(captchaUrl, payload)
  if (isLoginPayload(payload)) {
    throw new KuaishouLoginError('快手未登录（result=109 / No Login）', payload)
  }
}

/** 风控验证码。captchaUrl 是响应里的 iframe 地址，调用方自行决定要不要打开。 */
export class KuaishouRiskError extends Error {
  readonly captchaUrl: string
  readonly response: unknown

  constructor(captchaUrl: string, response: unknown) {
    super(`快手触发风控验证码: ${captchaUrl}`)
    this.name = 'KuaishouRiskError'
    this.captchaUrl = captchaUrl
    this.response = response
  }
}

/** 登录态失效。 */
export class KuaishouLoginError extends Error {
  readonly response: unknown

  constructor(message = '快手未登录（result=109 / No Login）', response?: unknown) {
    super(message)
    this.name = 'KuaishouLoginError'
    this.response = response
  }
}
