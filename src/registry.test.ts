import { describe, it, expect } from 'vitest'
import { findPlatform, platforms } from './registry.js'
import { douyinPlatform } from './platforms/douyin/index.js'
import { kuaishouPlatform } from './platforms/kuaishou/index.js'

describe('platform registry', () => {
  it('注册了抖音和快手平台', () => {
    expect(platforms).toContain(douyinPlatform)
    expect(platforms).toContain(kuaishouPlatform)
  })

  it('能根据抖音链接匹配到抖音平台', () => {
    expect(findPlatform('https://v.douyin.com/abc123')?.id).toBe('douyin')
    expect(findPlatform('https://www.douyin.com/video/123')?.id).toBe('douyin')
  })

  it('能根据快手链接匹配到快手平台', () => {
    expect(findPlatform('https://www.kuaishou.com/profile/3x5mpuwhjphwr8w')?.id).toBe('kuaishou')
    expect(findPlatform('https://v.kuaishou.com/abc123')?.id).toBe('kuaishou')
  })

  it('未知平台链接返回 undefined', () => {
    expect(findPlatform('https://example.com/x')).toBeUndefined()
  })
})
