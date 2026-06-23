# 账号池 (Account Pool) 技术调研

> 调研日期: 2026-03-08
> 状态: 调研阶段，暂不实现
> 定位: dy-downloader 是 npm 库，账号池作为库的内置能力提供

## 1. 当前项目现状

- **npm 库**: `dy-downloader`，同时提供 ESM/CJS，有 CLI (`dy` 命令)
- **对外入口**: `DouyinHandler` (业务层) + `DouyinCrawler` (请求层)
- **单 Cookie 架构**: `HandlerConfig.cookie` → `DouyinCrawler.headers.Cookie`
- **有基础重试**: GET 3 次指数退避 (1s/2s/3s)，POST 无重试
- **有并发控制**: p-limit 默认 3 并发
- **有降级策略**: API 失败自动降级到分享页面（无需 cookie）
- **无轮换机制**: 单账号运行，cookie 失效后整体不可用

### 用户当前使用方式
```typescript
import { DouyinHandler, setConfig } from 'dy-downloader'

setConfig({ cookie: '...' })
const handler = new DouyinHandler({ cookie: '...' })
const profile = await handler.fetchUserProfile(secUid)
```

## 2. 为什么需要账号池

| 问题 | 单账号 | 账号池 |
|------|--------|--------|
| 限流 | 触发后全部请求失败 | 自动切换到其他账号 |
| 封禁 | 整体不可用 | 隔离封禁账号，继续运行 |
| Cookie 过期 | 手动更换 | 自动淘汰，通知补充 |
| 吞吐量 | 受单账号 QPS 限制 | 线性扩展 |

## 3. 核心架构

```
┌─────────────────────────────────────────────┐
│                AccountPool                   │
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Account │  │ Account │  │ Account │ ... │
│  │ cookie  │  │ cookie  │  │ cookie  │     │
│  │ status  │  │ status  │  │ status  │     │
│  │ stats   │  │ stats   │  │ stats   │     │
│  └─────────┘  └─────────┘  └─────────┘     │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Scheduler│  │HealthChk │  │ Stats     │ │
│  │ (调度器)  │  │ (健康检查) │  │ (统计)    │ │
│  └──────────┘  └──────────┘  └───────────┘ │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  DouyinCrawler   │  ← 每次请求从池中获取账号
└─────────────────┘
```

### 3.1 账号数据模型

```typescript
interface PoolAccount {
  id: string
  cookie: string
  status: AccountStatus

  // 统计
  totalRequests: number
  failedRequests: number
  lastUsedAt: number
  lastCheckedAt: number

  // 限流追踪
  rateLimitedAt: number | null
  rateLimitCooldown: number  // ms

  // 元数据
  addedAt: number
  label?: string  // 可选标识，方便管理
}

enum AccountStatus {
  ACTIVE = 'active',         // 正常使用
  RATE_LIMITED = 'rate_limited', // 被限流，冷却中
  SUSPENDED = 'suspended',   // 被封禁
  EXPIRED = 'expired',       // Cookie 过期
  DISABLED = 'disabled',     // 手动禁用
}
```

### 3.2 调度策略

#### 调度粒度 — 按 API 数据性质自动决定

核心洞察：抖音的分页 cursor 本质是时间戳/偏移量，与 cookie 无关。
唯一例外是"用户收藏"等私有数据接口，cursor 与 session 绑定。

```
公开数据 API（作品/喜欢/合集/直播/搜索）
  → 请求级轮换：每次 API 调用都可以换 cookie

私有数据 API（收藏/收藏夹）
  → 会话级锁定：整个分页过程锁定同一个 cookie
```

| API | 数据性质 | cursor 绑定 | 调度粒度 |
|-----|---------|------------|---------|
| fetchUserPost | 公开 | 无关 | 请求级轮换 |
| fetchUserLike | 公开 | 无关 | 请求级轮换 |
| fetchUserMix | 公开 | 无关 | 请求级轮换 |
| fetchPostDetail | 公开 | 无分页 | 请求级轮换 |
| fetchUserLive | 公开 | 无分页 | 请求级轮换 |
| fetchHomePostSearch | 公开 | 无关 | 请求级轮换 |
| **fetchUserCollection** | **私有** | **session** | **会话级锁定** |
| **fetchUserCollects** | **私有** | **session** | **会话级锁定** |
| **fetchUserMusicCollection** | **私有** | **session** | **会话级锁定** |

库内部自动判定，用户无感：
```typescript
handler.fetchUserPost(secUid)       // 每页可以换 cookie
handler.fetchUserCollection()       // 自动锁定，整个分页不换
```

#### 轮换算法

#### 方案 A: 轮询 (Round Robin)
- 最简单，均匀分配请求
- 适合账号质量一致的场景
- 缺点：不考虑账号健康状态

#### 方案 B: 最少使用 (Least Recently Used)
- 优先选择最久未使用的账号
- 自然实现负载均衡
- 被限流的账号天然获得冷却时间

#### 方案 C: 加权轮询 (Weighted Round Robin)
- 根据账号成功率分配权重
- 高质量账号获得更多请求
- 适合账号质量差异大的场景

#### 方案 D: 随机 (Random)
- 简单，反爬检测难以识别模式
- 可能导致负载不均

**推荐**: V1 用 Round-Robin + 冷却跳过（简单有效），后续按需升级为 LRU 或加权。

### 3.3 健康检查

```
健康检查流程:
1. 定期检查 (每 5-10 分钟)
   └→ 发送轻量级 API 请求 (如获取用户信息)
   └→ 根据响应更新状态

2. 被动检查 (每次请求后)
   └→ 401/403 → 标记 EXPIRED 或 SUSPENDED
   └→ 429 / 空响应 → 标记 RATE_LIMITED + 冷却
   └→ 200 → 更新 lastUsedAt、成功计数

3. 恢复检查 (冷却期结束后)
   └→ RATE_LIMITED 账号冷却 30-60s 后自动重试
   └→ 连续 3 次成功 → 恢复 ACTIVE
   └→ 仍然失败 → 延长冷却期 (指数退避)
```

### 3.4 淘汰策略

| 状态 | 处理 |
|------|------|
| RATE_LIMITED | 冷却后自动恢复，指数退避 (30s → 60s → 120s → 300s) |
| EXPIRED | 移入过期队列，通知用户更新 cookie |
| SUSPENDED | 永久移除，通知用户 |
| 连续失败 > 10 次 | 降级为 DISABLED，等待手动处理 |

## 4. 存储方案

作为 npm 库，**不应该管持久化**。持久化是用户的事，库只管内存中的运行时状态。

- 用户传入 cookie 数组 → 库在内存中管理状态和调度
- 库提供事件/回调通知状态变化 → 用户自行决定是否持久化
- 零外部依赖，纯内存 Map

## 5. 与代理池配合

```
Account Pool × Proxy Pool = 矩阵组合

账号A + 代理1  ──→  请求
账号A + 代理2  ──→  请求
账号B + 代理1  ──→  请求
账号B + 代理3  ──→  请求
```

### 绑定策略

1. **松散绑定**: 每次请求随机分配 账号+代理 组合
   - 优点：灵活
   - 缺点：同一账号频繁切换 IP 容易触发风控

2. **固定绑定**: 一个账号绑定一个代理（或代理组）✅ 推荐
   - 优点：模拟真实用户行为
   - 缺点：代理挂掉会影响绑定账号

3. **会话绑定**: 同一会话期间保持 账号+代理 不变
   - 折中方案

**推荐**: 先不做代理池，账号池是独立模块。后续加代理池时用固定绑定。

## 6. npm 库视角的 API 设计

### 设计原则

1. **向后兼容**: 单 cookie 用法不变，多 cookie 是增强能力
2. **零配置可用**: 传入 cookie 数组即可，调度策略有默认值
3. **可观测**: 通过事件通知状态变化，用户自行决定处理方式
4. **不管持久化**: 库只管运行时，持久化是用户的事

### 用户使用方式

```typescript
import { DouyinHandler } from 'dy-downloader'

// 方式 1: 单 cookie（完全向后兼容，不变）
const handler = new DouyinHandler({ cookie: '...' })

// 方式 2: 多 cookie（新能力，传数组自动启用账号池）
const handler = new DouyinHandler({
  cookies: ['cookie_a', 'cookie_b', 'cookie_c'],
  pool: {                          // 可选配置
    strategy: 'round-robin',       // 默认 round-robin
    cooldown: 30_000,              // 限流冷却时间，默认 30s
    maxConsecutiveFailures: 3,     // 连续失败阈值，默认 3
    onStatusChange: (event) => {   // 状态变化回调
      console.log(`${event.cookie} → ${event.status}`)
      // 用户自行处理：持久化、告警、补充新 cookie 等
    },
  },
})

// 使用方式完全一样，池在内部自动调度
const profile = await handler.fetchUserProfile(secUid)
const posts = await handler.fetchUserPost(secUid)

// 运行时管理
handler.pool?.addCookie('new_cookie_d')     // 动态添加
handler.pool?.removeCookie('cookie_a')      // 动态移除
handler.pool?.getStats()                     // 查看池状态
```

### 内部架构

```
HandlerConfig.cookies → AccountPool (内部自动创建)
                              │
                              ├─ acquire() → 选一个可用 cookie
                              │
DouyinCrawler ← ─ ─ ─ ─ ─ ─ ─┘  每次请求动态注入 cookie
                              │
                              ├─ reportSuccess(cookie)
                              └─ reportFailure(cookie, error)
```

关键改动点:
- `DouyinHandler` 构造函数: 检测 `cookies` 数组 → 创建内部 `AccountPool`
- `DouyinCrawler`: 不再在构造时固定 cookie，改为每次请求时接收 cookie
- 或者: `DouyinHandler` 持有多个 `DouyinCrawler` 实例（一个 cookie 一个），按需调度

### 核心类型

```typescript
interface PoolConfig {
  strategy?: 'round-robin' | 'lru'    // 调度策略
  cooldown?: number                    // 限流冷却 ms，默认 30000
  maxConsecutiveFailures?: number      // 连续失败阈值，默认 3
  onStatusChange?: (event: PoolStatusEvent) => void
}

// AccountPool 核心方法
class AccountPool {
  acquire(): string                    // 轮换获取一个可用 cookie（公开数据用）
  acquireExclusive(): string           // 锁定获取一个 cookie（私有数据分页用）
  releaseExclusive(cookieId: string)   // 分页结束后释放锁定

  reportSuccess(cookieId: string)      // 报告请求成功
  reportFailure(cookieId: string, error: Error)  // 报告请求失败

  addCookie(cookie: string): void
  removeCookie(cookieId: string): void
  getStats(): PoolStats
}

interface PoolStatusEvent {
  cookie: string                       // 脱敏后的 cookie 标识
  status: AccountStatus
  previousStatus: AccountStatus
  reason: string                       // 'rate_limited' | 'expired' | 'consecutive_failures'
  timestamp: number
}

interface PoolStats {
  total: number
  active: number
  rateLimited: number
  error: number
  banned: number
}
```

### 实现方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A: 多 Crawler 实例** | 每个 cookie 创建一个 DouyinCrawler，Handler 调度 | 隔离性好，改动小 | 内存占用多（每个实例有独立 msToken） |
| **B: 动态注入 cookie** | Crawler 保持一个，每次请求前注入不同 cookie | 内存省，但需改 Crawler 接口 | 并发时 cookie 可能冲突 |
| **C: 请求级包装** | Pool 包装在请求层，Crawler 不感知 | 对 Crawler 零侵入 | 需要拦截所有请求 |

**推荐方案 A**: 每个 cookie 一个 Crawler 实例。
- DouyinCrawler 本身很轻（就是 headers + msToken）
- msToken 本来就应该每个 cookie 独立
- 完全不影响 Crawler 现有逻辑
- Handler 只需加一层调度逻辑

```typescript
// Handler 内部伪代码
class DouyinHandler {
  private pool: AccountPool | null = null
  private crawlers: Map<string, DouyinCrawler> = new Map()

  constructor(config: HandlerConfig) {
    if (config.cookies?.length) {
      // 多 cookie 模式
      this.pool = new AccountPool(config.cookies, config.pool)
      for (const cookie of config.cookies) {
        this.crawlers.set(cookie, new DouyinCrawler({ cookie }))
      }
    } else {
      // 单 cookie 模式（向后兼容）
      this.crawlers.set('default', new DouyinCrawler({ cookie: config.cookie || '' }))
    }
  }

  // 公开数据：每次请求轮换
  private getCrawler(): { crawler: DouyinCrawler; cookieId: string } {
    if (this.pool) {
      const cookieId = this.pool.acquire()
      return { crawler: this.crawlers.get(cookieId)!, cookieId }
    }
    return { crawler: this.crawlers.get('default')!, cookieId: 'default' }
  }

  // 私有数据：锁定一个 cookie，返回的 release 函数在分页结束后调用
  private lockCrawler(): { crawler: DouyinCrawler; cookieId: string; release: () => void } {
    if (this.pool) {
      const cookieId = this.pool.acquireExclusive()  // 锁定，不再分配给其他请求
      return {
        crawler: this.crawlers.get(cookieId)!,
        cookieId,
        release: () => this.pool!.releaseExclusive(cookieId),
      }
    }
    return { crawler: this.crawlers.get('default')!, cookieId: 'default', release: () => {} }
  }

  // 公开数据 — 每页轮换
  async fetchUserProfile(secUid: string) {
    const { crawler, cookieId } = this.getCrawler()
    try {
      const result = await crawler.fetchUserProfile(secUid)
      this.pool?.reportSuccess(cookieId)
      return new UserProfileFilter(result.data)
    } catch (error) {
      this.pool?.reportFailure(cookieId, error)
      throw error
    }
  }

  // 私有数据 — 整个分页锁定同一个 cookie
  async fetchAllUserCollection(options?: PaginationOptions) {
    const { crawler, cookieId, release } = this.lockCrawler()
    try {
      // 所有分页请求都用同一个 crawler
      while (hasMore) {
        const result = await crawler.fetchUserCollection(cursor)
        this.pool?.reportSuccess(cookieId)
        // ... 翻页逻辑
      }
      return allResults
    } catch (error) {
      this.pool?.reportFailure(cookieId, error)
      throw error
    } finally {
      release()  // 分页结束，释放锁定
    }
  }
}
```

### 文件变更清单

```
新增:
  src/pool/
    index.ts          - AccountPool 类 + export
    types.ts          - PoolConfig, PoolStats, AccountStatus 等类型

修改:
  src/handler/types.ts  - HandlerConfig 增加 cookies + pool 字段
  src/handler/index.ts  - 构造函数 + 每个请求方法加调度逻辑
  src/index.ts          - export pool 模块
```

### V1 - 核心能力
- `cookies` 数组配置 + round-robin 调度
- 被动健康检查（根据请求响应自动判定状态）
- 连续失败计数 + 冷却机制
- `onStatusChange` 回调
- `getStats()` 查看池状态

### V2 - 增强
- `addCookie` / `removeCookie` 动态管理
- 请求失败自动 fallback 到下一个 cookie 重试
- CLI `dy account list/check` 命令
- EventEmitter 事件（替代单一回调）

### V3 - 完整
- LRU / 加权调度策略
- 主动健康检查（定时轮询）
- 代理池集成（cookie + proxy 绑定）

## 7. 开源参考

| 项目 | 语言 | 特点 |
|------|------|------|
| **Germey/CookiesPool** | Python | 经典 Cookie 池，Redis 存储 + Flask API + 随机获取 |
| **NanmiCoder/MediaCrawler** | Python | 抖音/小红书爬虫，AccountPool + IPPool 联动 |
| **fawney19/Aether** | Python | 最完善的账号池架构，多维度调度 + 健康策略 + Redis 状态管理 |
| **mucsbr/lyzr2api** | Python | 完整账号状态机 (ACTIVE/RATE_LIMITED/BANNED/ERROR)，连续错误计数 |
| **chaogei/Kiro-account-manager** | TypeScript | 轮询调度 + 冷却机制 + 错误计数，与本项目语言栈一致 |
| **xiangsx/gpt4free-ts** | TypeScript | AccountPool 实现：JSON 文件持久化 + Set 互斥锁 |
| **duoan/mega-data-factory** | Python | 线程安全 round-robin 池，rate-limit 感知跳过 |
| **jhao104/ProxyPool** | Python | 代理池经典实现，调度+健康检查模式可参考 |
| **Johnserf-Seed/f2** | Python | 抖音爬虫，有多账号配置但无池化调度 |

### 关键实现细节 (来自开源调研)

**Aether 的健康策略 (health_policy.py)** — 按 HTTP 状态码分级处理:

| 状态码 | 动作 | 冷却时间 |
|--------|------|---------|
| 401 | Token 失效，标记永久停用 | 1 小时 |
| 403 | 封禁/暂停，分级冷却 | 300s ~ 1h |
| 429 | 限流，按 retry-after 冷却 | 动态 / 300s |
| 5xx | 临时过载 | 30s |

**Kiro 的调度逻辑 (TypeScript)** — 最接近我们的场景:
- `currentIndex` 记录轮询位置
- 每次取下一个时调用 `isAccountAvailable(account, now)` 检查冷却时间和错误次数
- 找不到可用账号返回 null，上层决定是否等待或报错

**lyzr2api 的错误计数** — 简单有效:
- `consecutive_errors` 连续错误计数
- 超过阈值（默认 3 次）→ 状态切为 ERROR
- 成功一次 → 计数归零

**MediaCrawler 的账号+代理配合**:
- `get_account()` 同时返回 `(phone, ip)` 对
- 一个账号绑定一个固定代理 IP，降低同账号 IP 跳变的风控风险

**gpt4free-ts 的互斥锁设计**:
- 使用 `Set<string>` 记录正在使用的账号
- `acquire()` 时跳过已被占用的账号
- `release()` 时从 Set 中移除

## 8. 关键设计决策 (待确认)

1. **cookie vs cookies**: `HandlerConfig` 同时支持 `cookie: string` 和 `cookies: string[]`，互斥还是合并？
2. **失败重试策略**: 一个 cookie 失败后，是否自动用下一个 cookie 重试同一个请求？
3. **并发模型**: 多个并发请求能否使用同一个 cookie，还是每个请求独占？
4. **Crawler 实例策略**: 方案 A (多实例) 确认还是方案 B (动态注入)？
5. **事件机制**: 用回调函数 `onStatusChange` 还是 EventEmitter？
6. **Downloader 是否也需要池化**: 下载文件时也需要轮换 cookie 吗？
