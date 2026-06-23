import { request } from './client.js'
import { ENDPOINTS } from './endpoints.js'
import type { DouyinUser, DouyinVideo } from '../model/types.js'

export async function fetchUserProfile(_secUid: string): Promise<DouyinUser | null> {
  // TODO: 实现用户信息获取
  void request
  void ENDPOINTS
  throw new Error('Not implemented')
}

export async function fetchVideoDetail(_awemeId: string): Promise<DouyinVideo | null> {
  // TODO: 实现单个视频详情获取
  throw new Error('Not implemented')
}

export async function fetchUserPosts(
  _secUid: string,
  _maxCursor: number = 0,
  _count: number = 20
): Promise<{ videos: DouyinVideo[]; hasMore: boolean; maxCursor: number }> {
  // TODO: 实现用户作品列表获取
  throw new Error('Not implemented')
}

export async function fetchUserLikes(
  _secUid: string,
  _maxCursor: number = 0,
  _count: number = 20
): Promise<{ videos: DouyinVideo[]; hasMore: boolean; maxCursor: number }> {
  // TODO: 实现用户喜欢列表获取
  throw new Error('Not implemented')
}

export { ENDPOINTS }
