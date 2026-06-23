import { JSONModel } from './base.js'
import { replaceT, timestamp2Str, filterToList } from './utils.js'

export class UserLiveFilter extends JSONModel {
  get apiStatusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get roomId(): string | null {
    return this._getAttrValue('$.data.data[0].id_str')
  }

  get liveStatus(): number | null {
    return this._getAttrValue('$.data.data[0].status')
  }

  get liveTitle(): string | null {
    const raw = this._getAttrValue<string>('$.data.data[0].title')
    return raw ? replaceT(raw) : null
  }

  get liveTitleRaw(): string | null {
    return this._getAttrValue('$.data.data[0].title')
  }

  get cover(): string | null {
    return this._getAttrValue('$.data.data[0].cover.url_list[0]')
  }

  get userCount(): string | null {
    return this._getAttrValue('$.data.data[0].stats.user_count_str')
  }

  get totalUserCount(): string | null {
    return this._getAttrValue('$.data.data[0].stats.total_user_str')
  }

  get likeCount(): string | null {
    return this._getAttrValue('$.data.data[0].stats.like_count_str')
  }

  get flvPullUrl(): Record<string, string> | null {
    return this._getAttrValue('$.data.data[0].stream_url.flv_pull_url')
  }

  get m3u8PullUrl(): Record<string, string> | null {
    return this._getAttrValue('$.data.data[0].stream_url.hls_pull_url_map')
  }

  get userId(): string | null {
    return this._getAttrValue('$.data.data[0].owner.id_str')
  }

  get secUserId(): string | null {
    return this._getAttrValue('$.data.data[0].owner.sec_uid')
  }

  get nickname(): string | null {
    const raw = this._getAttrValue<string>('$.data.data[0].owner.nickname')
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string | null {
    return this._getAttrValue('$.data.data[0].owner.nickname')
  }

  get avatarThumb(): string | null {
    return this._getAttrValue('$.data.data[0].owner.avatar_thumb.url_list[0]')
  }

  get followStatus(): number | null {
    return this._getAttrValue('$.data.data[0].owner.follow_info.follow_status')
  }

  get partitionId(): string | null {
    return this._getAttrValue('$.data.data[0].partition_road_map.partition.id_str')
  }

  get partitionTitle(): string | null {
    return this._getAttrValue('$.data.data[0].partition_road_map.partition.title')
  }

  get subPartitionId(): string | null {
    return this._getAttrValue('$.data.data[0].partition_road_map.sub_partition.id_str')
  }

  get subPartitionTitle(): string | null {
    return this._getAttrValue('$.data.data[0].partition_road_map.sub_partition.title')
  }

  get chatAuth(): boolean | null {
    return this._getAttrValue('$.data.data[0].room_auth.Chat')
  }

  get giftAuth(): boolean | null {
    return this._getAttrValue('$.data.data[0].room_auth.Gift')
  }

  get diggAuth(): boolean | null {
    return this._getAttrValue('$.data.data[0].room_auth.Digg')
  }

  get shareAuth(): boolean | null {
    return this._getAttrValue('$.data.data[0].room_auth.Share')
  }
}

export class UserLive2Filter extends JSONModel {
  get apiStatusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get roomId(): string | null {
    return this._getAttrValue('$.data.room.id')
  }

  get webRid(): string | null {
    return this._getAttrValue('$.data.room.owner.web_rid')
  }

  get liveStatus(): number | null {
    return this._getAttrValue('$.data.room.status')
  }

  get liveTitle(): string | null {
    const raw = this._getAttrValue<string>('$.data.room.title')
    return raw ? replaceT(raw) : null
  }

  get liveTitleRaw(): string | null {
    return this._getAttrValue('$.data.room.title')
  }

  get userCount(): number | null {
    return this._getAttrValue('$.data.room.user_count')
  }

  get createTime(): string {
    const ts = this._getAttrValue<number>('$.data.room.create_time')
    return timestamp2Str(String(ts)) as string
  }

  get finishTime(): string {
    const ts = this._getAttrValue<number>('$.data.room.finish_time')
    return timestamp2Str(String(ts)) as string
  }

  get cover(): string | null {
    return this._getAttrValue('$.data.room.cover.url_list[0]')
  }

  get streamId(): string | null {
    return this._getAttrValue('$.data.room.stream_id')
  }

  get resolutionName(): string | null {
    return this._getAttrValue('$.data.room.stream_url.resolution_name')
  }

  get flvPullUrl(): Record<string, string> | null {
    return this._getAttrValue('$.data.room.stream_url.flv_pull_url')
  }

  get hlsPullUrl(): Record<string, string> | null {
    return this._getAttrValue('$.data.room.stream_url.hls_pull_url_map')
  }

  get nickname(): string | null {
    const raw = this._getAttrValue<string>('$.data.room.owner.nickname')
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string | null {
    return this._getAttrValue('$.data.room.owner.nickname')
  }

  get gender(): string | null {
    const raw = this._getAttrValue<string>('$.data.room.owner.gender')
    return raw ? replaceT(raw) : null
  }

  get genderRaw(): string | null {
    return this._getAttrValue('$.data.room.owner.gender')
  }

  get signature(): string | null {
    const raw = this._getAttrValue<string>('$.data.room.owner.signature')
    return raw ? replaceT(raw) : null
  }

  get signatureRaw(): string | null {
    return this._getAttrValue('$.data.room.owner.signature')
  }

  get avatarLarge(): string | null {
    return this._getAttrValue('$.data.room.owner.avatar_large.url_list[0]')
  }

  get verified(): boolean | null {
    return this._getAttrValue('$.data.room.owner.verified')
  }

  get city(): string | null {
    return this._getAttrValue('$.data.room.owner.city')
  }

  get followingCount(): number | null {
    return this._getAttrValue('$.data.room.owner.follow_info.following_count')
  }

  get followerCount(): number | null {
    return this._getAttrValue('$.data.room.owner.follow_info.follower_count')
  }

  get secUid(): string | null {
    return this._getAttrValue('$.data.room.owner.sec_uid')
  }
}

export class UserLiveStatusFilter extends JSONModel {
  get apiStatusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get errorMsg(): string | null {
    return this._getAttrValue('$.data.prompts')
  }

  get sceneId(): string | null {
    return this._getAttrValue('$.data[0].scene_id')
  }

  get liveStatus(): number | null {
    return this._getAttrValue('$.data[0].user_live[0].live_status')
  }

  get roomId(): number | null {
    return this._getAttrValue('$.data[0].user_live[0].room_id')
  }

  get roomIdStr(): string | null {
    return this._getAttrValue('$.data[0].user_live[0].room_id_str')
  }

  get userId(): number | null {
    return this._getAttrValue('$.data[0].user_live[0].user_id')
  }

  get userIdStr(): string | null {
    return this._getAttrValue('$.data[0].user_live[0].user_id_str')
  }
}

export class FollowingUserLiveFilter extends JSONModel {
  get statusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get statusMsg(): string | null {
    return this._getAttrValue('$.data.message')
  }

  get coverType(): number[] | null {
    return this._getListAttrValue('$.data.data.[*].cover_type') as number[] | null
  }

  get isRecommend(): boolean[] | null {
    return this._getListAttrValue('$.data.data.[*].is_recommend') as boolean[] | null
  }

  get tagName(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].tag_name') as string[] | null
  }

  get titleType(): number[] | null {
    return this._getListAttrValue('$.data.data.[*].title_type') as number[] | null
  }

  get uniqId(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].uniq_id') as string[] | null
  }

  get webRid(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].web_rid') as string[] | null
  }

  get cover(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.cover.url_list[0]') as string[] | null
  }

  get hasCommerceGoods(): boolean[] | null {
    return this._getListAttrValue('$.data.data.[*].room.has_commerce_goods') as boolean[] | null
  }

  get roomId(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.id_str') as string[] | null
  }

  get liveTitle(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data.data.[*].room.title') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get liveTitleRaw(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.title') as string[] | null
  }

  get liveRoomMode(): number[] | null {
    return this._getListAttrValue('$.data.data.[*].room.live_room_mode') as number[] | null
  }

  get mosaicStatus(): number[] | null {
    return this._getListAttrValue('$.data.data.[*].room.mosaic_status') as number[] | null
  }

  get userCount(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.stats.user_count_str') as string[] | null
  }

  get likeCount(): number[] | null {
    return this._getListAttrValue('$.data.data.[*].room.stats.like_count') as number[] | null
  }

  get totalCount(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.stats.total_user_str') as string[] | null
  }

  get avatarThumb(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.owner.avatar_thumb.url_list[0]') as string[] | null
  }

  get userId(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.owner.id_str') as string[] | null
  }

  get userSecUid(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.owner.sec_uid') as string[] | null
  }

  get nickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.data.data.[*].room.owner.nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string[] | null {
    return this._getListAttrValue('$.data.data.[*].room.owner.nickname') as string[] | null
  }

  get flvPullUrl(): Record<string, string>[] | null {
    return this._getListAttrValue('$.data.data.[*].room.stream_url.flv_pull_url') as Record<string, string>[] | null
  }

  get hlsPullUrl(): Record<string, string>[] | null {
    return this._getListAttrValue('$.data.data.[*].room.stream_url.hls_pull_url_map') as Record<string, string>[] | null
  }

  get streamOrientation(): number[] | null {
    return this._getListAttrValue('$.data.data.[*].room.stream_url.stream_orientation') as number[] | null
  }

  toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.data.data',
      excludeFields: ['statusCode', 'statusMsg'],
      extraFields: []
    })
  }
}

export class LiveImFetchFilter extends JSONModel {
  get statusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get isShowMsg(): boolean | null {
    return this._getAttrValue('$.data[0].common.is_show_msg')
  }

  get msgId(): string | null {
    return this._getAttrValue('$.data[0].common.msg_id')
  }

  get roomId(): string | null {
    return this._getAttrValue('$.data[0].common.room_id')
  }

  get internalExt(): string | null {
    return this._getAttrValue('$.internal_ext')
  }

  get cursor(): string | null {
    return this._getAttrValue('$.extra.cursor')
  }

  get now(): string {
    const ts = this._getAttrValue<number>('$.extra.now')
    return timestamp2Str(String(ts)) as string
  }
}
