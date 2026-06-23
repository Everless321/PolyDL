/**
 * Surge HTTP 脚本：拦截抖音收藏接口，打印真实请求参数
 *
 * 用途：点击 App/网页里的「收藏 / 取消收藏」按钮时，捕获实际发出的请求，
 *      验证 action=1（收藏）/ action=0（取消收藏）的约定。
 *
 * 触发事件：http-request（在请求发出前拦截，不修改、原样放行）
 */

const req = $request

// 解析 body（收藏接口是 application/x-www-form-urlencoded）
const rawBody = req.body || ''
const params = {}
for (const pair of rawBody.split('&')) {
  if (!pair) continue
  const idx = pair.indexOf('=')
  const key = idx === -1 ? pair : pair.slice(0, idx)
  const val = idx === -1 ? '' : pair.slice(idx + 1)
  params[decodeURIComponent(key)] = decodeURIComponent(val)
}

const actionMap = { 0: '取消收藏', 1: '收藏' }
const actionText = actionMap[params.action] ?? `未知(${params.action})`

const lines = [
  '===== 抖音收藏接口拦截 =====',
  `method:     ${req.method}`,
  `url:        ${req.url}`,
  `action:     ${params.action}  → ${actionText}`,
  `aweme_id:   ${params.aweme_id}`,
  `aweme_type: ${params.aweme_type}`,
  `raw body:   ${rawBody}`,
]
const log = lines.join('\n')

console.log(log)

// 通知（标题/副标题/内容），方便在手机上直接看到
$notification.post(
  `抖音${actionText}`,
  `aweme_id: ${params.aweme_id ?? '-'}`,
  `action=${params.action ?? '-'} type=${params.aweme_type ?? '-'}`
)

// 原样放行，不修改请求
$done({})
