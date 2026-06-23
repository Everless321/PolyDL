import { JSONModel } from './base.js'
import { replaceT, filterToList } from './utils.js'

export class HomePostSearchFilter extends JSONModel {
  get statusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get hasAweme(): boolean {
    return Boolean(this._getAttrValue('$.aweme_list'))
  }

  get statusMsg(): string | null {
    return this._getAttrValue('$.status_msg')
  }

  get hasMore(): boolean | null {
    return this._getAttrValue('$.has_more')
  }

  get cursor(): number | null {
    return this._getAttrValue('$.cursor')
  }

  get homeText(): string | null {
    return this._getAttrValue('$.global_doodle_config.home_text')
  }

  get searchKeyword(): string | null {
    return this._getAttrValue('$.global_doodle_config.keyword')
  }

  get searchId(): string {
    const imprId = this._getAttrValue<string | number>('$.log_pb.impr_id')
    return String(imprId)
  }

  get userId(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.author.uid') as string[] | null
  }

  get uniqueId(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.author.unique_id') as string[] | null
  }

  get secUid(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.author.sec_uid') as string[] | null
  }

  get signature(): string[] | null {
    const raw = this._getListAttrValue<string>('$.aweme_list[*].item.author.signature') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get signatureRaw(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.author.signature') as string[] | null
  }

  get nickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.aweme_list[*].item.author.nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.author.nickname') as string[] | null
  }

  get avatarLarger(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.author.avatar_larger.url_list[0]') as string[] | null
  }

  get awemeType(): number[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.aweme_type') as number[] | null
  }

  get awemeId(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.aweme_id') as string[] | null
  }

  get caption(): string[] | null {
    const raw = this._getListAttrValue<string>('$.aweme_list[*].item.caption') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get captionRaw(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.caption') as string[] | null
  }

  get city(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.city') as string[] | null
  }

  get desc(): string[] | null {
    const raw = this._getListAttrValue<string>('$.aweme_list[*].item.desc') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get descRaw(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.desc') as string[] | null
  }

  get images(): (string[] | null)[] {
    const imagesList = this._getListAttrValue<Record<string, unknown>[]>('$.aweme_list[*].item.images') as (Record<string, unknown>[] | null)[] | null
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
    const imagesList = this._getListAttrValue<Record<string, unknown>[]>('$.aweme_list[*].item.images') as (Record<string, unknown>[] | null)[] | null
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

  get musicId(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.id') as string[] | null
  }

  get musicIdStr(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.id_str') as string[] | null
  }

  get musicMid(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.mid') as string[] | null
  }

  get musicDuration(): number[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.duration') as number[] | null
  }

  get musicPlayUrl(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.play_url.url_list[0]') as string[] | null
  }

  get musicOwnerNickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.aweme_list[*].item.music.owner_nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get musicOwnerNicknameRaw(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.owner_nickname') as string[] | null
  }

  get musicSecUid(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.sec_uid') as string[] | null
  }

  get musicTitle(): string[] | null {
    const raw = this._getListAttrValue<string>('$.aweme_list[*].item.music.title') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get musicTitleRaw(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.music.title') as string[] | null
  }

  get cover(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.video.cover.url_list[0]') as string[] | null
  }

  get dynamicCover(): string[] | null {
    return this._getListAttrValue('$.aweme_list[*].item.video.dynamic_cover.url_list[0]') as string[] | null
  }

  get animatedCover(): (string | null)[] {
    const videos = this._getListAttrValue<Record<string, unknown>>('$.aweme_list[*].item.video') as Record<string, unknown>[] | null
    if (!videos) return []

    return videos.map(video => {
      if (!video) return null
      const animatedCover = video.animated_cover as Record<string, unknown> | undefined
      if (!animatedCover) return null
      const urlList = animatedCover.url_list as string[] | undefined
      return urlList?.[0] || null
    })
  }

  get videoPlayAddr(): string[][] | null {
    return this._getListAttrValue('$.aweme_list[*].item.video.bit_rate[0].play_addr.url_list') as string[][] | null
  }

  toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.aweme_list',
      excludeFields: [
        'statusCode', 'statusMsg', 'hasAweme', 'hasMore',
        'cursor', 'homeText', 'searchKeyword', 'searchId'
      ],
      extraFields: ['hasMore', 'cursor', 'homeText', 'searchKeyword', 'searchId']
    })
  }
}

export class SuggestWordFilter extends JSONModel {
  get statusMsg(): string | null {
    return this._getAttrValue('$.msg')
  }

  get suggestWordId(): string[] | null {
    return this._getListAttrValue('$.data[0].words[*].id') as string[] | null
  }

  get suggestWord(): string[] | null {
    return this._getListAttrValue('$.data[0].words[*].word') as string[] | null
  }

  toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.data[0].words',
      excludeFields: ['statusMsg'],
      extraFields: []
    })
  }
}
