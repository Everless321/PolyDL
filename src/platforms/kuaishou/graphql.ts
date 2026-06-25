/**
 * 快手 GraphQL operation 文本
 *
 * 快手 web 接口无签名，POST https://www.kuaishou.com/graphql，
 * body = { operationName, query, variables }，仅需有效 Cookie。
 *
 * VISION_PROFILE_PHOTO_LIST 已从公开实现取到完整文本，可直接使用。
 * 其余 operation 标注 TODO —— 打开快手网页版对应页面，F12 → Network →
 * 过滤 graphql → 复制对应请求的完整 query 字符串回填即可。
 */

/**
 * 用户主页作品列表（分页）
 * 注意：feeds[].photo 是联合类型 Photo = PhotoEntity | recoPhotoEntity，
 * 必须用 fragment 在具体类型上取字段，直接 photo{id} 会 400。
 */
export const VISION_PROFILE_PHOTO_LIST = `fragment photoContent on PhotoEntity {
  __typename
  id
  duration
  caption
  originCaption
  likeCount
  viewCount
  commentCount
  realLikeCount
  coverUrl
  photoUrl
  photoH265Url
  manifest
  manifestH265
  videoResource
  coverUrls {
    url
    __typename
  }
  timestamp
  expTag
  animatedCoverUrl
  distance
  videoRatio
  liked
  stereoType
  profileUserTopPhoto
  musicBlocked
  riskTagContent
  riskTagUrl
}

fragment recoPhotoFragment on recoPhotoEntity {
  __typename
  id
  duration
  caption
  originCaption
  likeCount
  viewCount
  commentCount
  realLikeCount
  coverUrl
  photoUrl
  photoH265Url
  manifest
  manifestH265
  videoResource
  coverUrls {
    url
    __typename
  }
  timestamp
  expTag
  animatedCoverUrl
  distance
  videoRatio
  liked
  stereoType
  profileUserTopPhoto
  musicBlocked
  riskTagContent
  riskTagUrl
}

fragment feedContentWithLiveInfo on Feed {
  type
  author {
    id
    name
    headerUrl
    following
    livingInfo
    headerUrls {
      url
      __typename
    }
    __typename
  }
  photo {
    ...photoContent
    ...recoPhotoFragment
    __typename
  }
  canAddComment
  llsid
  status
  currentPcursor
  tags {
    type
    name
    __typename
  }
  __typename
}

query visionProfilePhotoList($pcursor: String, $userId: String, $page: String, $webPageArea: String) {
  visionProfilePhotoList(pcursor: $pcursor, userId: $userId, page: $page, webPageArea: $webPageArea) {
    result
    llsid
    webPageArea
    feeds {
      ...feedContentWithLiveInfo
      __typename
    }
    hostName
    pcursor
    __typename
  }
}
`

/** 用户资料（昵称/粉丝/作品数/头像） */
export const VISION_PROFILE = `query visionProfile($userId: String) {
  visionProfile(userId: $userId) {
    result
    hostName
    userProfile {
      ownerCount {
        fan
        photo
        follow
        photo_public
        __typename
      }
      profile {
        gender
        user_name
        user_id
        headurl
        user_text
        user_profile_bg_url
        __typename
      }
      isFollowing
      livingInfo
      __typename
    }
    __typename
  }
}
`

/** 单作品详情（含 HEVC photoH265Url + 多码率 manifest.adaptationSet） */
export const VISION_VIDEO_DETAIL = `query visionVideoDetail($photoId: String, $type: String, $page: String, $webPageArea: String) {
  visionVideoDetail(photoId: $photoId, type: $type, page: $page, webPageArea: $webPageArea) {
    status
    type
    author {
      id
      name
      following
      headerUrl
      livingInfo
    }
    photo {
      id
      duration
      caption
      likeCount
      realLikeCount
      coverUrl
      photoUrl
      liked
      timestamp
      expTag
      llsid
      viewCount
      videoRatio
      stereoType
      musicBlocked
      riskTagContent
      riskTagUrl
      manifest {
        mediaType
        businessType
        version
        adaptationSet {
          id
          duration
          representation {
            id
            defaultSelect
            backupUrl
            codecs
            url
            height
            width
            avgBitrate
            maxBitrate
            m3u8Slice
            qualityType
            qualityLabel
            frameRate
            featureP2sp
            hidden
            disableAdaptive
          }
        }
      }
      manifestH265
      photoH265Url
      coronaCropManifest
      coronaCropManifestH265
      croppedPhotoH265Url
      croppedPhotoUrl
      videoResource
    }
    tags {
      type
      name
    }
    commentLimit {
      canAddComment
    }
    llsid
    danmakuSwitch
  }
}
`
