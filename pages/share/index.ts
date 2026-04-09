import type {
  LocationSnapshot,
  SharedImageState,
  SharedItem,
} from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  buildAnchorDisplayLines,
  buildFieldViews,
  buildNoteDisplayText,
  buildPhotoPresentation,
  buildReminderDisplayText,
  buildShareCardSubtitleFromItem,
  buildShareCardTitleFromItem,
  getSceneLabel,
  trimOptionalString,
  type FrontendFieldView,
} from '../common/frontend-presenters'
import { buildShareUrl, FRONTEND_ROUTES } from '../common/frontend-config'

type SharePageStatus = 'loading' | 'ready' | 'expired' | 'requires_network'

interface SharePageData {
  readonly pageStatus: SharePageStatus
  readonly sceneLabel: string
  readonly shareCardTitle: string
  readonly shareCardSubtitle: string
  readonly fieldViews: readonly FrontendFieldView[]
  readonly hasFilledFields: boolean
  readonly hasLocation: boolean
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly imageState: SharedImageState
  readonly hasReminder: boolean
  readonly reminderDisplayText: string
  readonly hasNote: boolean
  readonly noteDisplayText: string
}

interface SharePageCustom {
  readonly runtime: AppRuntime
  shareId: string
  currentSharedItem: SharedItem | null
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  handleBackHome(): Promise<void>
  handleOpenLocation(): Promise<void>
  handlePhotoTap(): Promise<void>
  handleRetryImage(): Promise<void>
}

type SharePageInstance = WechatMiniprogram.Page.Instance<
  SharePageData,
  SharePageCustom
>

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'

function showToastMessage(
  title: string,
  icon: WechatMiniprogram.ShowToastOption['icon'] = 'none'
): void {
  wx.showToast({
    title,
    icon,
    duration: 1800,
  })
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }

  if (
    error &&
    typeof error === 'object' &&
    'errMsg' in error &&
    typeof (error as { readonly errMsg?: unknown }).errMsg === 'string'
  ) {
    const errMsg = (error as { readonly errMsg: string }).errMsg.trim()
    if (errMsg.length > 0) {
      return errMsg
    }
  }

  return '发生未知错误。'
}

async function previewPhoto(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wx.previewImage({
      current: path,
      urls: [path],
      success: () => resolve(),
      fail: (error) => reject(error),
    })
  })
}

async function reLaunch(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wx.reLaunch({
      url,
      success: () => resolve(),
      fail: (error) => reject(error),
    })
  })
}

function syncExpiredState(page: SharePageInstance): void {
  page.currentSharedItem = null
  page.setData({
    pageStatus: 'expired',
    sceneLabel: '',
    shareCardTitle: '',
    shareCardSubtitle: '',
    fieldViews: [],
    hasFilledFields: false,
    hasLocation: false,
    hasPhoto: false,
    photoPath: '',
    imageState: 'none',
    hasReminder: false,
    reminderDisplayText: '',
    hasNote: false,
    noteDisplayText: '',
  })
}

function syncRequiresNetworkState(page: SharePageInstance): void {
  page.currentSharedItem = null
  page.setData({
    pageStatus: 'requires_network',
    sceneLabel: '',
    shareCardTitle: '',
    shareCardSubtitle: '',
    fieldViews: [],
    hasFilledFields: false,
    hasLocation: false,
    hasPhoto: false,
    photoPath: '',
    imageState: 'none',
    hasReminder: false,
    reminderDisplayText: '',
    hasNote: false,
    noteDisplayText: '',
  })
}

function syncReadyState(page: SharePageInstance, sharedItem: SharedItem): void {
  page.currentSharedItem = sharedItem
  const detailFieldViews = buildFieldViews(sharedItem.sceneType, sharedItem.anchorValues).filter(
    (fieldView) => trimOptionalString(fieldView.value) !== undefined
  )
  const photoPresentation = buildPhotoPresentation(sharedItem.photos[0], 'view')
  const shareCardSubtitle = buildShareCardSubtitleFromItem(sharedItem)
  const anchorSummary = buildAnchorDisplayLines(
    sharedItem.sceneType,
    sharedItem.anchorValues
  ).join(' · ')
  const shouldHideFieldDetails =
    anchorSummary.length > 0 && shareCardSubtitle === anchorSummary
  const fieldViews = shouldHideFieldDetails ? [] : detailFieldViews

  page.setData({
    pageStatus: 'ready',
    sceneLabel: getSceneLabel(sharedItem.sceneType),
    shareCardTitle: buildShareCardTitleFromItem(sharedItem),
    shareCardSubtitle,
    fieldViews,
    hasFilledFields: fieldViews.length > 0,
    hasLocation: isLocationAvailable(sharedItem.location),
    hasPhoto: photoPresentation.hasPhoto,
    photoPath: photoPresentation.photoPath,
    imageState: sharedItem.imageState,
    hasReminder: typeof sharedItem.reminderAt === 'number',
    reminderDisplayText: buildReminderDisplayText(sharedItem.reminderAt),
    hasNote: trimOptionalString(sharedItem.note) !== undefined,
    noteDisplayText: buildNoteDisplayText(sharedItem.note),
  })
}

function isLocationAvailable(location: LocationSnapshot): boolean {
  return (
    trimOptionalString(location.name) !== undefined ||
    trimOptionalString(location.address) !== undefined
  )
}

async function hydrateSharedImage(page: SharePageInstance): Promise<void> {
  if (!page.shareId || !page.currentSharedItem?.hasRemoteImage) {
    return
  }

  if (page.currentSharedItem.photos.length > 0 && page.currentSharedItem.imageState === 'ready') {
    return
  }

  const nextSharedItem = await page.runtime.ensureSharedImage(page.shareId)
  if (!nextSharedItem) {
    return
  }

  syncReadyState(page, nextSharedItem)
}

Page<SharePageData, SharePageCustom>({
  data: {
    pageStatus: 'loading',
    sceneLabel: '',
    shareCardTitle: '',
    shareCardSubtitle: '',
    fieldViews: [],
    hasFilledFields: false,
    hasLocation: false,
    hasPhoto: false,
    photoPath: '',
    imageState: 'none',
    hasReminder: false,
    reminderDisplayText: '',
    hasNote: false,
    noteDisplayText: '',
  },

  runtime: appRuntime,
  shareId: '',
  currentSharedItem: null,

  async onLoad(options) {
    const shareId = trimOptionalString(options.shareId)
    if (!shareId) {
      syncExpiredState(this)
      return
    }

    this.shareId = shareId

    try {
      const result = await this.runtime.openSharedSnapshot(shareId)
      if (result.status === 'expired') {
        syncExpiredState(this)
        return
      }

      if (result.status === 'requires_network') {
        syncRequiresNetworkState(this)
        return
      }

      syncReadyState(this, result.item)
      void hydrateSharedImage(this)
    } catch (error) {
      showToastMessage(`打开分享失败：${formatErrorMessage(error)}`)
      syncExpiredState(this)
    }
  },

  onShareAppMessage() {
    if (!this.shareId) {
      return {
        title: '分享快照',
        path: FRONTEND_ROUTES.scene,
      }
    }

    return {
      title: '分享快照',
      path: buildShareUrl(this.shareId),
      imageUrl: SHARE_COVER_IMAGE_URL,
    }
  },

  async handleBackHome() {
    try {
      await reLaunch(FRONTEND_ROUTES.scene)
    } catch (error) {
      showToastMessage(`回到主页失败：${formatErrorMessage(error)}`)
    }
  },

  async handleOpenLocation() {
    if (this.data.pageStatus !== 'ready' || !this.currentSharedItem) {
      return
    }

    try {
      await this.runtime.openLocation(this.currentSharedItem.location)
    } catch (error) {
      showToastMessage(`打开地图失败：${formatErrorMessage(error)}`)
    }
  },

  async handlePhotoTap() {
    if (this.data.pageStatus !== 'ready') {
      return
    }

    const activePhoto = this.currentSharedItem?.photos[0]
    if (!activePhoto) {
      if (this.data.imageState === 'pending') {
        showToastMessage('图片加载中')
        return
      }

      if (this.data.imageState === 'failed') {
        await this.handleRetryImage()
      }

      return
    }

    try {
      await previewPhoto(activePhoto.localPath)
    } catch (error) {
      showToastMessage(`打开照片失败：${formatErrorMessage(error)}`)
    }
  },

  async handleRetryImage() {
    if (this.data.pageStatus !== 'ready' || !this.shareId) {
      return
    }

    try {
      const nextSharedItem = await this.runtime.ensureSharedImage(this.shareId)
      if (!nextSharedItem) {
        return
      }

      syncReadyState(this, nextSharedItem)
    } catch (error) {
      showToastMessage(`重新加载图片失败：${formatErrorMessage(error)}`)
    }
  },
})
