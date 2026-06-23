/**
 * Mode Handler - 模式处理器
 * 对应 Python f2 项目 handler.py 中的 @mode_handler 装饰器
 */

import { ModeType } from './types.js'

export type ModeHandlerFn<T = unknown> = (...args: unknown[]) => Promise<T> | AsyncGenerator<T, void, unknown>

export interface ModeHandlerConfig {
  mode: ModeType
  description: string
  handler: ModeHandlerFn
}

const modeHandlers = new Map<ModeType, ModeHandlerConfig>()

/**
 * 注册模式处理器
 */
export function registerModeHandler(config: ModeHandlerConfig): void {
  modeHandlers.set(config.mode, config)
}

/**
 * 获取模式处理器
 */
export function getModeHandler(mode: ModeType): ModeHandlerConfig | undefined {
  return modeHandlers.get(mode)
}

/**
 * 获取所有模式
 */
export function getAllModes(): ModeType[] {
  return Array.from(modeHandlers.keys())
}

/**
 * 模式处理器装饰器（用于类方法）
 */
export function modeHandler(mode: ModeType, description: string = '') {
  return function <T extends (...args: unknown[]) => unknown>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value!

    registerModeHandler({
      mode,
      description: description || `Handler for ${mode} mode`,
      handler: originalMethod as unknown as ModeHandlerFn,
    })

    return descriptor
  }
}

/**
 * 模式路由器 - 根据模式执行对应处理器
 */
export class ModeRouter {
  private handlers: Map<ModeType, ModeHandlerFn> = new Map()

  register(mode: ModeType, handler: ModeHandlerFn): void {
    this.handlers.set(mode, handler)
  }

  async execute<T>(mode: ModeType, ...args: unknown[]): Promise<T | null> {
    const handler = this.handlers.get(mode)
    if (!handler) {
      throw new Error(`Unknown mode: ${mode}`)
    }
    return handler(...args) as Promise<T>
  }

  async *executeGenerator<T>(mode: ModeType, ...args: unknown[]): AsyncGenerator<T, void, unknown> {
    const handler = this.handlers.get(mode)
    if (!handler) {
      throw new Error(`Unknown mode: ${mode}`)
    }

    const result = handler(...args)
    if (Symbol.asyncIterator in Object(result)) {
      yield* result as AsyncGenerator<T, void, unknown>
    } else {
      yield (await result) as T
    }
  }

  hasMode(mode: ModeType): boolean {
    return this.handlers.has(mode)
  }

  getModes(): ModeType[] {
    return Array.from(this.handlers.keys())
  }
}

/**
 * 模式名称映射
 */
export const MODE_NAMES: Record<ModeType, string> = {
  one: '单个作品',
  post: '用户作品',
  like: '用户喜欢',
  music: '音乐收藏',
  collection: '用户收藏',
  collects: '收藏夹',
  mix: '合集作品',
  live: '直播',
  feed: '朋友作品',
  related: '相关推荐',
  friend: '关注作品',
}

/**
 * 获取模式描述
 */
export function getModeDescription(mode: ModeType): string {
  return MODE_NAMES[mode] || '未知模式'
}

/**
 * 验证模式是否有效
 */
export function isValidMode(mode: string): mode is ModeType {
  return mode in MODE_NAMES
}
