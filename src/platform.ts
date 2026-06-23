/**
 * 平台契约 - 每个受支持的平台（抖音、快手 ...）实现此接口
 *
 * 业务逻辑保留在各平台目录下（src/platforms/<id>/）。
 * 新增平台时实现本接口并注册到 registry.ts 即可，无需改动核心。
 */
export interface Platform {
  /** 平台唯一标识，如 'douyin' | 'kuaishou' */
  readonly id: string
  /** 平台展示名 */
  readonly name: string
  /** 判断给定 URL 是否属于本平台 */
  match(url: string): boolean
}
