import type { Platform } from '../../platform.js'

export * from './types.js'
export * from './client.js'
export * from './rest.js'
export * from './handler.js'
export * from './graphql.js'
export * from './url-parser.js'

/** 快手平台实现 */
export const kuaishouPlatform: Platform = {
  id: 'kuaishou',
  name: '快手',
  match(url: string): boolean {
    return /kuaishou\.com/.test(url)
  },
}
