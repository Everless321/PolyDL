import { JSONModel } from './base.js'
import { replaceT, timestamp2Str, filterToList } from './utils.js'

export class FriendFeedFilter extends JSONModel {
  get statusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get statusMsg(): string | null {
    return this._getAttrValue('$.status_msg')
  }

  get toast(): string | null {
    return this._getAttrValue('$.toast')
  }

  get hasMore(): boolean {
    return Boolean(this._getAttrValue('$.has_more'))
  }

  get hasAweme(): boolean {
    return Boolean(this._getAttrValue('$.data'))
  }

  get friendUpdateCount(): number | null {
    return this._getAttrValue('$.friend_update_count')
  }

  get cursor(): number | null {
    return this._getAttrValue('$.cursor')
  }

  get level(): number | null {
    return this._getAttrValue('$.level')
  }

  get friendFeedType(): number[] | null {
    return this._getListAttrValue('$.data[*].feed_type') as number[] | null
  }

  get friendFeedSource(): string[] | null {
    return this._getListAttrValue('$.data[*].source') as string[] | null
  }

  get avatarLarger(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.author.avatar_larger.url_list[0]') as string[] | null
  }

  get nickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data[*].aweme.author.nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.author.nickname') as string[] | null
  }

  get secUid(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.author.sec_uid') as string[] | null
  }

  get uid(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.author.uid') as string[] | null
  }

  get awemeId(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.aweme_id') as string[] | null
  }

  get awemeType(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.aweme_type') as number[] | null
  }

  get caption(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data[*].aweme.desc') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get captionRaw(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.desc') as string[] | null
  }

  get desc(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data[*].aweme.desc') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get descRaw(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.desc') as string[] | null
  }

  get recommendReason(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.fall_card_struct.recommend_reason') as string[] | null
  }

  get createTime(): string | string[] {
    const createTimes = this._getListAttrValue<number>('$.data[*].aweme.create_time') as number[] | null
    if (!createTimes) return []
    return timestamp2Str(createTimes.map(String))
  }

  get is24Story(): boolean[] | null {
    return this._getListAttrValue('$.data[*].aweme.is_24_story') as boolean[] | null
  }

  get mediaType(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.media_type') as number[] | null
  }

  get collectCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.collect_count') as number[] | null
  }

  get commentCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.comment_count') as number[] | null
  }

  get diggCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.digg_count') as number[] | null
  }

  get exposureCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.exposure_count') as number[] | null
  }

  get liveWatchCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.live_watch_count') as number[] | null
  }

  get playCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.play_count') as number[] | null
  }

  get shareCount(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.statistics.share_count') as number[] | null
  }

  get allowShare(): boolean[] | null {
    return this._getListAttrValue('$.data[*].aweme.status.allow_share') as boolean[] | null
  }

  get privateStatus(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.status.private_status') as number[] | null
  }

  get isProhibited(): boolean[] | null {
    return this._getListAttrValue('$.data[*].aweme.status.is_prohibited') as boolean[] | null
  }

  get partSee(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.status.part_see') as number[] | null
  }

  get animatedCover(): (string | null)[] {
    const videos = this._getListAttrValue<Record<string, unknown>>('$.data[*].aweme.video') as Record<string, unknown>[] | null
    if (!videos) return []

    return videos.map(video => {
      if (!video) return null
      const animatedCover = video.animated_cover as Record<string, unknown> | undefined
      if (!animatedCover) return null
      const urlList = animatedCover.url_list as string[] | undefined
      return urlList?.[0] || null
    })
  }

  get cover(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.video.cover.url_list[0]') as string[] | null
  }

  get images(): (string[] | null)[] {
    const imagesList = this._getListAttrValue<Record<string, unknown>[]>('$.data[*].aweme.images') as (Record<string, unknown>[] | null)[] | null
    if (!imagesList) return []

    return imagesList.map(images => {
      if (!images) return null
      return images
        .filter((img): img is Record<string, unknown> =>
          typeof img === 'object' && img !== null && 'url_list' in img
        )
        .map(img => {
          const urlList = img.url_list as string[]
          return urlList?.[0] || null
        })
        .filter((url): url is string => url !== null)
    })
  }

  get imagesVideo(): (string[] | null)[] {
    const imagesList = this._getListAttrValue<Record<string, unknown>[]>('$.data[*].aweme.images') as (Record<string, unknown>[] | null)[] | null
    if (!imagesList) return []

    return imagesList.map(images => {
      if (!images) return null
      return images
        .filter((img): img is Record<string, unknown> =>
          typeof img === 'object' && img !== null && 'video' in img
        )
        .map(img => {
          const video = img.video as Record<string, unknown>
          const playAddr = video?.play_addr as Record<string, unknown>
          const urlList = playAddr?.url_list as string[]
          return urlList?.[0] || null
        })
        .filter((url): url is string => url !== null)
    })
  }

  get videoPlayAddr(): string[][] | null {
    return this._getListAttrValue('$.data[*].aweme.video.bit_rate[0].play_addr.url_list') as string[][] | null
  }

  get musicId(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.id') as string[] | null
  }

  get musicMid(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.mid') as string[] | null
  }

  get musicDuration(): number[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.duration') as number[] | null
  }

  get musicPlayUrl(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.play_url.url_list[0]') as string[] | null
  }

  get musicOwnerNickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data[*].aweme.music.owner_nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get musicOwnerNicknameRaw(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.owner_nickname') as string[] | null
  }

  get musicSecUid(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.sec_uid') as string[] | null
  }

  get musicTitle(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data[*].aweme.music.title') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get musicTitleRaw(): string[] | null {
    return this._getListAttrValue('$.data[*].aweme.music.title') as string[] | null
  }

  toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.data',
      excludeFields: [
        'statusCode', 'statusMsg', 'hasMore', 'hasAweme',
        'friendUpdateCount', 'cursor', 'level'
      ],
      extraFields: ['hasMore', 'hasAweme', 'friendUpdateCount', 'cursor', 'level']
    })
  }
}
