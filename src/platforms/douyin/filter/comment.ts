import { JSONModel } from './base.js'
import { replaceT, timestamp2Str, filterToList } from './utils.js'

export class PostCommentFilter extends JSONModel {
  get apiStatusCode(): number | null {
    return this._getAttrValue('$.status_code')
  }

  get hasMore(): boolean | null {
    return this._getAttrValue('$.has_more')
  }

  get total(): number | null {
    return this._getAttrValue('$.total')
  }

  get cursor(): number | null {
    return this._getAttrValue('$.cursor')
  }

  get canShare(): boolean[] | null {
    return this._getListAttrValue('$.comments[*].can_share') as boolean[] | null
  }

  get createTime(): string | string[] {
    const createTimes = this._getListAttrValue<number>('$.comments[*].create_time') as number[] | null
    if (!createTimes) return []
    return timestamp2Str(createTimes.map(String))
  }

  get commentId(): string[] | null {
    return this._getListAttrValue('$.comments[*].cid') as string[] | null
  }

  get commentText(): string[] | null {
    const raw = this._getListAttrValue<string>('$.comments[*].text') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get commentTextRaw(): string[] | null {
    return this._getListAttrValue('$.comments[*].text') as string[] | null
  }

  get itemCommentTotal(): number[] | null {
    return this._getListAttrValue('$.comments[*].item_comment_total') as number[] | null
  }

  get isHot(): boolean[] | null {
    return this._getListAttrValue('$.comments[*].is_hot') as boolean[] | null
  }

  get diggCount(): number[] | null {
    return this._getListAttrValue('$.comments[*].digg_count') as number[] | null
  }

  get userId(): string[] | null {
    return this._getListAttrValue('$.comments[*].user.uid') as string[] | null
  }

  get userUniqueId(): string[] | null {
    return this._getListAttrValue('$.comments[*].user.unique_id') as string[] | null
  }

  get secUid(): string[] | null {
    return this._getListAttrValue('$.comments[*].user.sec_uid') as string[] | null
  }

  get nickname(): string[] | null {
    const raw = this._getListAttrValue<string>('$.comments[*].user.nickname') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get nicknameRaw(): string[] | null {
    return this._getListAttrValue('$.comments[*].user.nickname') as string[] | null
  }

  get replyCommentId(): string[] | null {
    return this._getListAttrValue('$.comments[*].reply_comment[0].cid') as string[] | null
  }

  get replyCommentText(): string[] | null {
    const raw = this._getListAttrValue<string>('$.comments[*].reply_comment[0].text') as string[] | null
    return raw ? replaceT(raw) : null
  }

  get replyCommentTextRaw(): string[] | null {
    return this._getListAttrValue('$.comments[*].reply_comment[0].text') as string[] | null
  }

  get replyCommentTotal(): number[] | null {
    return this._getListAttrValue('$.comments[*].reply_comment_total') as number[] | null
  }

  get replyId(): string[] | null {
    return this._getListAttrValue('$.comments[*].reply_id') as string[] | null
  }

  get replyToReplyId(): string[] | null {
    return this._getListAttrValue('$.comments[*].reply_to_reply_id') as string[] | null
  }

  toList(): Record<string, unknown>[] {
    return filterToList(this, {
      entriesPath: '$.comments',
      excludeFields: ['apiStatusCode', 'hasMore', 'total', 'cursor'],
      extraFields: ['hasMore', 'total', 'cursor']
    })
  }
}

export class PostCommentReplyFilter extends PostCommentFilter {}
