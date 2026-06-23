import { JSONModel } from './base.js'
import { replaceT, timestamp2Str, filterToList } from './utils.js'

export class UserProfileFilter extends JSONModel {
  get avatarUrl(): string | null {
    return this._getAttrValue('$.user.avatar_larger.url_list[0]')
  }

  get awemeCount(): number | null {
    return this._getAttrValue('$.user.aweme_count')
  }

  get city(): string | null {
    return this._getAttrValue('$.user.city')
  }

  get country(): string | null {
    return this._getAttrValue('$.user.country')
  }

  get favoritingCount(): number | null {
    return this._getAttrValue('$.user.favoriting_count')
  }

  get followerCount(): number | null {
    return this._getAttrValue('$.user.follower_count')
  }

  get followingCount(): number | null {
    return this._getAttrValue('$.user.following_count')
  }

  get gender(): number | null {
    return this._getAttrValue('$.user.gender')
  }

  get ipLocation(): string | null {
    return this._getAttrValue('$.user.ip_location')
  }

  get isBan(): boolean | null {
    return this._getAttrValue('$.user.is_ban')
  }

  get isBlock(): boolean | null {
    return this._getAttrValue('$.user.is_block')
  }

  get isBlocked(): boolean | null {
    return this._getAttrValue('$.user.is_blocked')
  }

  get isStar(): boolean | null {
    return this._getAttrValue('$.user.is_star')
  }

  get liveStatus(): number | null {
    return this._getAttrValue('$.user.live_status')
  }

  get mixCount(): number | null {
    return this._getAttrValue('$.user.mix_count')
  }

  get mplatformFollowersCount(): number | null {
    return this._getAttrValue('$.user.mplatform_followers_count')
  }

  get nickname(): string | null {
    const raw = this._getAttrValue<string>('$.user.nickname')
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string | null {
    return this._getAttrValue('$.user.nickname')
  }

  get roomId(): string | null {
    return this._getAttrValue('$.user.room_id')
  }

  get schoolName(): string | null {
    return this._getAttrValue('$.user.school_name')
  }

  get secUserId(): string | null {
    return this._getAttrValue('$.user.sec_uid')
  }

  get shortId(): string | null {
    return this._getAttrValue('$.user.short_id')
  }

  get signature(): string | null {
    const raw = this._getAttrValue<string>('$.user.signature')
    return raw ? replaceT(raw) : null
  }

  get signatureRaw(): string | null {
    return this._getAttrValue('$.user.signature')
  }

  get totalFavorited(): number | null {
    return this._getAttrValue('$.user.total_favorited')
  }

  get uid(): string | null {
    return this._getAttrValue('$.user.uid')
  }

  get uniqueId(): string | null {
    return this._getAttrValue('$.user.unique_id')
  }

  get userAge(): number | null {
    return this._getAttrValue('$.user.user_age')
  }
}

export class UserFollowingFilter extends JSONModel {
  get statusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get statusMsg(): string | null {
    return this._getAttrValue('$.status_msg')
  }

  get hasMore(): boolean | null {
    return this._getAttrValue('$.has_more')
  }

  get total(): number | null {
    return this._getAttrValue('$.total')
  }

  get mixCount(): number | null {
    return this._getAttrValue('$.mix_count')
  }

  get offset(): number | null {
    return this._getAttrValue('$.offset')
  }

  get myselfUserId(): string | null {
    return this._getAttrValue('$.myself_user_id')
  }

  get maxTime(): number | null {
    return this._getAttrValue('$.max_time')
  }

  get minTime(): number | null {
    return this._getAttrValue('$.min_time')
  }

  get avatarLarger(): string[] | null {
    return this._getListAttrValue('$.followings[*].avatar_larger.url_list[0]') as string[] | null
  }

  get canComment(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].aweme_control.can_comment') as boolean[] | null
  }

  get canForward(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].aweme_control.can_forward') as boolean[] | null
  }

  get canShare(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].aweme_control.can_share') as boolean[] | null
  }

  get canShowComment(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].aweme_control.can_show_comment') as boolean[] | null
  }

  get awemeCount(): number[] | null {
    return this._getListAttrValue('$.followings[*].aweme_count') as number[] | null
  }

  get backCover(): string[] | null {
    return this._getListAttrValue('$.followings[*].cover_url[0].url_list[0]') as string[] | null
  }

  get registerTime(): number[] | null {
    return this._getListAttrValue('$.followings[*].create_time') as number[] | null
  }

  get secondaryPriority(): number[] | null {
    return this._getListAttrValue('$.followings[*].following_list_secondary_information_struct.secondary_information_priority') as number[] | null
  }

  get secondaryText(): string[] | null {
    const raw = this._getListAttrValue<string>('$.followings[*].following_list_secondary_information_struct.secondary_information_text') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get secondaryTextRaw(): string[] | null {
    return this._getListAttrValue('$.followings[*].following_list_secondary_information_struct.secondary_information_text') as string[] | null
  }

  get isBlock(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_block') as boolean[] | null
  }

  get isBlocked(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_blocked') as boolean[] | null
  }

  get isGovMediaVip(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_gov_media_vip') as boolean[] | null
  }

  get isMixUser(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_mix_user') as boolean[] | null
  }

  get isPhoneBinded(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_phone_binded') as boolean[] | null
  }

  get isStar(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_star') as boolean[] | null
  }

  get isTop(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_top') as boolean[] | null
  }

  get isVerified(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].is_verified') as boolean[] | null
  }

  get language(): string[] | null {
    return this._getListAttrValue('$.followings[*].language') as string[] | null
  }

  get nickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.followings[*].nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string[] | null {
    return this._getListAttrValue('$.followings[*].nickname') as string[] | null
  }

  get relationLabel(): string[] | null {
    return this._getListAttrValue('$.followings[*].relation_label') as string[] | null
  }

  get roomId(): string[] | null {
    return this._getListAttrValue('$.followings[*].room_id') as string[] | null
  }

  get secUid(): string[] | null {
    return this._getListAttrValue('$.followings[*].sec_uid') as string[] | null
  }

  get secret(): boolean[] | null {
    return this._getListAttrValue('$.followings[*].secret') as boolean[] | null
  }

  get shortId(): string[] | null {
    return this._getListAttrValue('$.followings[*].short_id') as string[] | null
  }

  get signature(): string[] | null {
    const raw = this._getListAttrValue<string>('$.followings[*].signature') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get signatureRaw(): string[] | null {
    return this._getListAttrValue('$.followings[*].signature') as string[] | null
  }

  get uid(): string[] | null {
    return this._getListAttrValue('$.followings[*].uid') as string[] | null
  }

  get uniqueId(): string[] | null {
    return this._getListAttrValue('$.followings[*].unique_id') as string[] | null
  }

  toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.followings',
      excludeFields: [
        'statusCode', 'statusMsg', 'hasMore', 'total', 'mixCount',
        'offset', 'myselfUserId', 'maxTime', 'minTime'
      ],
      extraFields: [
        'hasMore', 'total', 'mixCount', 'offset', 'myselfUserId', 'maxTime', 'minTime'
      ]
    })
  }
}

export class UserFollowerFilter extends UserFollowingFilter {
  get total(): number | null {
    return this._getAttrValue('$.total')
  }

  override get avatarLarger(): string[] | null {
    return this._getListAttrValue('$.followers[*].avatar_larger.url_list[0]') as string[] | null
  }

  override get canComment(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].aweme_control.can_comment') as boolean[] | null
  }

  override get canForward(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].aweme_control.can_forward') as boolean[] | null
  }

  override get canShare(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].aweme_control.can_share') as boolean[] | null
  }

  override get canShowComment(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].aweme_control.can_show_comment') as boolean[] | null
  }

  override get awemeCount(): number[] | null {
    return this._getListAttrValue('$.followers[*].aweme_count') as number[] | null
  }

  override get backCover(): string[] | null {
    return this._getListAttrValue('$.followers[*].cover_url[0].url_list[0]') as string[] | null
  }

  override get registerTime(): number[] | null {
    return this._getListAttrValue('$.followers[*].create_time') as number[] | null
  }

  override get isBlock(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_block') as boolean[] | null
  }

  override get isBlocked(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_blocked') as boolean[] | null
  }

  override get isGovMediaVip(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_gov_media_vip') as boolean[] | null
  }

  override get isMixUser(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_mix_user') as boolean[] | null
  }

  override get isPhoneBinded(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_phone_binded') as boolean[] | null
  }

  override get isStar(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_star') as boolean[] | null
  }

  override get isTop(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_top') as boolean[] | null
  }

  override get isVerified(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].is_verified') as boolean[] | null
  }

  override get language(): string[] | null {
    return this._getListAttrValue('$.followers[*].language') as string[] | null
  }

  override get nickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.followers[*].nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  override get nicknameRaw(): string[] | null {
    return this._getListAttrValue('$.followers[*].nickname') as string[] | null
  }

  override get relationLabel(): string[] | null {
    return this._getListAttrValue('$.followers[*].relation_label') as string[] | null
  }

  override get roomId(): string[] | null {
    return this._getListAttrValue('$.followers[*].room_id') as string[] | null
  }

  override get secUid(): string[] | null {
    return this._getListAttrValue('$.followers[*].sec_uid') as string[] | null
  }

  override get secret(): boolean[] | null {
    return this._getListAttrValue('$.followers[*].secret') as boolean[] | null
  }

  override get shortId(): string[] | null {
    return this._getListAttrValue('$.followers[*].short_id') as string[] | null
  }

  override get signature(): string[] | null {
    const raw = this._getListAttrValue<string>('$.followers[*].signature') as string[] | null
    return raw ? replaceT(raw) : null
  }

  override get signatureRaw(): string[] | null {
    return this._getListAttrValue('$.followers[*].signature') as string[] | null
  }

  override get uid(): string[] | null {
    return this._getListAttrValue('$.followers[*].uid') as string[] | null
  }

  override get uniqueId(): string[] | null {
    return this._getListAttrValue('$.followers[*].unique_id') as string[] | null
  }

  override toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.followers',
      excludeFields: [
        'statusCode', 'statusMsg', 'hasMore', 'total', 'mixCount',
        'offset', 'myselfUserId', 'maxTime', 'minTime'
      ],
      extraFields: [
        'hasMore', 'total', 'mixCount', 'offset', 'myselfUserId', 'maxTime', 'minTime'
      ]
    })
  }
}

export class QueryUserFilter extends JSONModel {
  get statusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get statusMsg(): string | null {
    return this._getAttrValue('$.status_msg')
  }

  get browserName(): string | null {
    return this._getAttrValue('$.browser_name')
  }

  get createTime(): string {
    const ts = this._getAttrValue<number>('$.create_time')
    return timestamp2Str(String(ts)) as string
  }

  get firebaseInstanceId(): string | null {
    return this._getAttrValue('$.firebase_instance_id')
  }

  get userUniqueId(): string | null {
    return this._getAttrValue('$.id')
  }

  get lastTime(): string {
    const ts = this._getAttrValue<number>('$.last_time')
    return timestamp2Str(String(ts)) as string
  }

  get userAgent(): string | null {
    return this._getAttrValue('$.user_agent')
  }

  get userUid(): string | null {
    return this._getAttrValue('$.user_uid')
  }

  get userUidType(): number | null {
    return this._getAttrValue('$.user_uid_type')
  }
}
