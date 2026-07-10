# 抖音直播弹幕 使用文档

> 模块：`polydl`（`src/platforms/douyin/live/`）
> 能力：连接抖音直播间 WebSocket，实时拉取结构化弹幕（聊天/礼物/点赞/进场/关注/统计…）
> 版本：0.4.0+

---

## 1. 快速开始

```ts
import { DouyinHandler, getSecUserId } from 'polydl'

const handler = new DouyinHandler({ cookie: process.env.DOUYIN_COOKIE })

// 1) 解析主页链接 → sec_user_id → 判断是否开播、取精确 room_id
const secUserId = await getSecUserId('https://v.douyin.com/xxxxx/')
const profile = await handler.fetchUserProfile(secUserId)
const status = await handler.fetchUserLiveStatus(String(profile?.uid))

if (status.liveStatus !== 1 || !status.roomIdStr) {
  console.log('当前未开播')
  return
}

// 2) 拉弹幕（AsyncGenerator，持续产出事件）
for await (const ev of handler.fetchLiveDanmaku(status.roomIdStr)) {
  if (ev.type === 'chat') {
    console.log(`${ev.user.nickname}: ${ev.content}`)
  }
}
```

> `room_id` **必须用字符串**（`status.roomIdStr`），不要用会丢精度的 number 字段。

---

## 2. API

### `handler.fetchLiveDanmaku(roomId, options?)`

推荐入口。内部自动完成 `fetchQueryUser → 握手(fetchLiveImFetch) → 签名 → WSS 连接`。

```ts
async *fetchLiveDanmaku(
  roomId: string,
  options?: {
    userUniqueId?: string    // 用户唯一 ID；不传则自动 fetchQueryUser 获取
    pingInterval?: number    // ws ping 间隔(ms)，默认 10000；0 关闭
    signal?: AbortSignal     // 主动停止
  }
): AsyncGenerator<DanmakuEvent>
```

- **返回**：`AsyncGenerator<DanmakuEvent>`，用 `for await` 消费。
- **自动结束**：收到 `control`(status=3，直播结束) 或连接断开时，生成器结束。
- **手动结束**：`AbortController.abort()` 或 `break` 出循环。

### `streamLiveDanmaku(options)`（低阶）

已有 `internalExt` / `cursor`（自行握手）时直接连接：

```ts
import { streamLiveDanmaku } from 'polydl'

for await (const ev of streamLiveDanmaku({
  roomId, userUniqueId, internalExt, cursor,
  pingInterval: 10000,
  signal,
})) { /* ... */ }
```

---

## 3. 事件类型 `DanmakuEvent`

判别联合（`ev.type` 收窄），**每个事件都带时间字段**（见第 4 节）：

| `type` | 含义 | 字段 |
|---|---|---|
| `chat` | 聊天弹幕 | `user`, `content` |
| `gift` | 礼物 | `user`, `giftId`, `giftName`, `comboCount`, `totalCount` |
| `like` | 点赞 | `user`, `count`, `total` |
| `member` | 进场 | `user`, `memberCount` |
| `social` | 关注/分享 | `user`, `followCount` |
| `roomUserSeq` | 在线/累计观众 | `total`, `totalUser` |
| `roomStats` | 房间统计 | `displayLong`, `total` |
| `control` | 控制（`status===3` 直播结束） | `status` |
| `raw` | 未映射类型透传 | `method`, `payload`(Uint8Array) |

`user`（`DanmakuUser`）：

```ts
{ id: string | null; nickname: string | null; secUid: string | null; avatar: string | null }
```

处理示例：

```ts
for await (const ev of handler.fetchLiveDanmaku(roomId)) {
  switch (ev.type) {
    case 'chat':   console.log(`💬 ${ev.user.nickname}: ${ev.content}`); break
    case 'gift':   console.log(`🎁 ${ev.user.nickname} ${ev.giftName} x${ev.comboCount}`); break
    case 'member': console.log(`🚪 ${ev.user.nickname} 进入`); break
    case 'social': console.log(`➕ ${ev.user.nickname} 关注`); break
    case 'like':   console.log(`👍 +${ev.count}（总 ${ev.total}）`); break
    case 'control': if (ev.status === 3) console.log('⏹ 直播结束'); break
  }
}
```

> `raw` 是我们暂未映射的消息（排行榜/粉丝团/表情等）。需要的话可用导出的 `decodeFrame` 自行解，或提需求补映射。

---

## 4. 时间字段与「弹幕对齐录制视频」

每个事件都带两个时间戳（`DanmakuMeta`）：

| 字段 | 含义 |
|---|---|
| `receivedAt` | 帧**到达本地**的墙钟时间（epoch ms） |
| `createTime` | 消息**服务端创建时间**（来自 `Common.create_time`；`raw` 或缺失为 `null`） |

### 和录制视频对齐

直播流（flv/hls）比弹幕 WSS **慢 3~5 秒**，所以对齐时要减一个「流延迟」补偿，否则弹幕会早于画面出现：

```ts
const T0 = Date.now()          // ffmpeg 开始录制的时刻
const STREAM_LATENCY_MS = 4000 // 流延迟补偿，按实际微调（flv 约 3~5s）

for await (const ev of handler.fetchLiveDanmaku(roomId)) {
  if (ev.type !== 'chat') continue
  // 该弹幕应出现在录制视频的第几毫秒
  const videoOffsetMs = (ev.receivedAt - T0) - STREAM_LATENCY_MS
  // → 写入弹幕文件（.ass / .xml / .jsonl），回放时按 videoOffsetMs 显示
}
```

- **方案 A（简单）**：用 `receivedAt`，如上。
- **方案 B（更稳）**：用 `createTime`（服务端时间，不受本地处理抖动影响）。
- 校标 `STREAM_LATENCY_MS`：观察 `receivedAt - createTime` 的差值可辅助估计端到端延迟。

> ⚠️ `createTime` 的确切单位（毫秒 / 秒）尚待对开播直播间实测最终确认；当前按 epoch ms 暴露原始值。

---

## 5. 生命周期与停止

```ts
const controller = new AbortController()
process.on('SIGINT', () => controller.abort())   // Ctrl+C 停止

for await (const ev of handler.fetchLiveDanmaku(roomId, { signal: controller.signal })) {
  // ...
}
// 循环结束 = 直播结束 / 断线 / 被 abort
```

- 内部每帧回 **ack** 保活，并按 `pingInterval` 发 ws ping。
- 生成器退出时会自动关闭底层 WebSocket。

---

## 6. 注意事项

- **Cookie**：`DouyinHandler({ cookie })` 需要有效 cookie（`fetchQueryUser`/`fetchLiveImFetch` 用）。WSS 连接本身用独立的 `ttwid`（内部自动生成）。
- **room_id 用字符串**：大整数 number 会丢精度，务必用 `roomIdStr` / 修复后的 `.roomId`。
- **开播判断**：`fetchUserLiveStatus(uid).liveStatus === 1` 表示在播；关播后 `roomIdStr` 为空。
- **签名**：WSS URL 的 signature 由内嵌的 `webcast_signature.js`（vm 执行）生成，无需额外配置。
- **重连**：当前断线即结束生成器，不自动重连。需要长时间录制可在外层 `while` 里重启（配合 liveStatus 轮询）。

---

## 7. 完整示例

见 `examples/douyin-live-danmaku.ts`（弹幕打印）与 `examples/douyin-live-record.ts`（ffmpeg 录制）。二者结合即可实现「边录视频边存带时间轴的弹幕」。

---

## 8. 底层导出（进阶）

```ts
import {
  streamLiveDanmaku,     // 低阶弹幕流
  getWebcastSignature,   // WSS 签名
  decodeFrame,           // 手动解一个 WSS 帧
  buildAckFrame,
  buildPingFrame,
  type DanmakuEvent,
  type DanmakuUser,
  type DanmakuMeta,
} from 'polydl'
```
