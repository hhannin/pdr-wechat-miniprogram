import type { SharedItem } from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  buildPostCardViewFromSharedItem,
  trimOptionalString,
  type PostCardView,
} from '../common/frontend-presenters'
import { buildShareUrl, FRONTEND_ROUTES } from '../common/frontend-config'
import {
  showErrorToast,
  previewLocalImage,
} from '../common/feedback'

type SharePageStatus = 'loading' | 'ready' | 'expired' | 'requires_network'

interface SharePageData {
  readonly pageStatus: SharePageStatus
  readonly postView: PostCardView | null
}

interface SharePageCustom {
  readonly runtime: AppRuntime
  shareId: string
  currentSharedItem: SharedItem | null
  onLoad(options: Record<string, string | undefined>): Promise<void>
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  handleBackHome(): void
  handleOpenLocation(): Promise<void>
  handlePhotoTap(): Promise<void>
  hydrateImage(): Promise<void>
}

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'

Page<SharePageData, SharePageCustom>({
  data: {
    pageStatus: 'loading',
    postView: null,
  },

  runtime: appRuntime,
  shareId: '',
  currentSharedItem: null,

  async onLoad(options) {
    const shareId = trimOptionalString(options.shareId)
    if (!shareId) {
      this.setData({ pageStatus: 'expired' })
      return
    }

    this.shareId = shareId

    try {
      const result = await this.runtime.openSharedSnapshot(shareId)
      if (result.status === 'expired') {
        this.setData({ pageStatus: 'expired' })
        return
      }
      if (result.status === 'requires_network') {
        this.setData({ pageStatus: 'requires_network' })
        return
      }

      this.currentSharedItem = result.item
      this.setData({
        pageStatus: 'ready',
        postView: buildPostCardViewFromSharedItem(result.item, Date.now()),
      })

      void this.hydrateImage()
    } catch (error) {
      showErrorToast(error, '打开分享失败：')
      this.setData({ pageStatus: 'expired' })
    }
  },

  onShareAppMessage() {
    if (!this.shareId) {
      return { title: '分享快照', path: FRONTEND_ROUTES.record }
    }
    return {
      title: this.currentSharedItem?.location.name || '分享快照',
      path: buildShareUrl(this.shareId),
      imageUrl: SHARE_COVER_IMAGE_URL,
    }
  },

  handleBackHome() {
    wx.reLaunch({
      url: FRONTEND_ROUTES.record,
      fail: (error) => showErrorToast(error, '回到主页失败：'),
    })
  },

  async handleOpenLocation() {
    if (!this.currentSharedItem) return
    try {
      await this.runtime.openLocation(this.currentSharedItem.location)
    } catch (error) {
      showErrorToast(error, '打开地图失败：')
    }
  },

  async handlePhotoTap() {
    const photo = this.currentSharedItem?.photos[0]
    if (!photo) {
      if (this.currentSharedItem?.imageState === 'pending') {
        showErrorToast('图片加载中')
        return
      }
      if (this.currentSharedItem?.imageState === 'failed') {
        await this.hydrateImage()
      }
      return
    }
    try {
      await previewLocalImage(photo.localPath)
    } catch (error) {
      showErrorToast(error, '打开照片失败：')
    }
  },

  async hydrateImage() {
    if (!this.shareId || !this.currentSharedItem?.hasRemoteImage) return
    if (this.currentSharedItem.photos.length > 0 && this.currentSharedItem.imageState === 'ready') return

    try {
      const nextItem = await this.runtime.ensureSharedImage(this.shareId)
      if (!nextItem) return
      this.currentSharedItem = nextItem
      this.setData({
        postView: buildPostCardViewFromSharedItem(nextItem, Date.now()),
      })
    } catch {
      // Image hydration is best-effort.
    }
  },
})
