import type { Item } from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  buildPostCardViewFromItem,
  type PostCardView,
} from '../common/frontend-presenters'
import { buildEditRecordUrl, buildRecordsUrl, FRONTEND_ROUTES } from '../common/frontend-config'
import {
  ShareFlowController,
  buildClosedShareFlowView,
  type ShareFlowView,
  type ShareSelectionItemView,
  type SharePrepareState,
} from '../common/share-flow'
import { confirmDestructive } from '../common/confirm'
import {
  showErrorToast,
  showInfoToast,
  showSuccessToast,
  previewLocalImage,
} from '../common/feedback'

interface PostViewPageData {
  readonly pageReady: boolean
  readonly loadError: string
  readonly postView: PostCardView | null
  readonly fading: boolean
  readonly shareFlowVisible: boolean
  readonly shareSelectionItems: readonly ShareSelectionItemView[]
  readonly sharePrepareState: SharePrepareState
  readonly shareCoverImage: string
}

interface PostViewPageCustom {
  readonly runtime: AppRuntime
  shareFlow: ShareFlowController
  item: Item | null
  itemId: string
  source: string
  onLoad(query: Record<string, string | undefined>): void
  onUnload(): void
  onShow(): Promise<void>
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  refresh(): Promise<void>
  applyShareFlowView(view: ShareFlowView): void
  handlePhotoTap(): Promise<void>
  handleNavigateTap(): Promise<void>
  handleShareTap(): void
  handleFavoriteTap(): Promise<void>
  handleEditTap(): void
  handleDeleteTap(): Promise<void>
  handleShareClose(): void
  handleShareToggle(event: ShareToggleEvent): void
  handleShareRetry(): void
}

type ShareToggleEvent = WechatMiniprogram.CustomEvent<{ readonly selectionKey?: string }>

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'

Page<PostViewPageData, PostViewPageCustom>({
  data: {
    pageReady: false,
    loadError: '',
    postView: null,
    fading: false,
    ...buildClosedShareFlowView(),
  },

  runtime: appRuntime,
  shareFlow: null as unknown as ShareFlowController,
  item: null,
  itemId: '',
  source: '',

  onLoad(query) {
    this.itemId = typeof query.itemId === 'string' ? query.itemId : ''
    this.source = typeof query.source === 'string' ? query.source : ''
    this.shareFlow = new ShareFlowController({
      runtime: this.runtime,
      applyShareFlowView: (view) => this.applyShareFlowView(view),
    })
  },

  onUnload() {
    this.shareFlow?.dispose()
  },

  async onShow() {
    await this.refresh()
  },

  onShareAppMessage() {
    const preparedShare = this.shareFlow?.getPreparedShare()
    if (!preparedShare) {
      return {
        title: '记这里',
      }
    }
    return {
      title: preparedShare.shareCardTitle || '分享快照',
      path: this.runtime.buildSharePath(preparedShare.shareId),
      imageUrl: SHARE_COVER_IMAGE_URL,
    }
  },

  async refresh() {
    if (!this.itemId) {
      this.setData({ pageReady: true, loadError: '缺少记录标识' })
      return
    }
    try {
      const item = await this.runtime.getItem(this.itemId)
      if (!item) {
        this.item = null
        if (this.source === 'reminder') {
          wx.reLaunch({
            url: `${FRONTEND_ROUTES.record}?toast=${encodeURIComponent('记录已被删除')}`,
          })
          return
        }
        this.setData({ pageReady: true, loadError: '记录不存在', postView: null })
        return
      }
      this.item = item
      this.setData({
        pageReady: true,
        loadError: '',
        postView: buildPostCardViewFromItem(item, Date.now()),
      })
    } catch (error) {
      this.setData({ pageReady: true, loadError: '加载失败' })
      showErrorToast(error, '加载记录失败：')
    }
  },

  applyShareFlowView(view) {
    this.setData(view)
  },

  async handlePhotoTap() {
    const photoPath = this.data.postView?.photoPath
    if (!photoPath) {
      return
    }
    try {
      await previewLocalImage(photoPath)
    } catch (error) {
      showErrorToast(error, '打开照片失败：')
    }
  },

  async handleNavigateTap() {
    if (!this.item) {
      return
    }
    try {
      await this.runtime.openLocation(this.item.location)
    } catch (error) {
      showErrorToast(error, '打开地图失败：')
    }
  },

  handleShareTap() {
    if (!this.item) {
      return
    }
    this.shareFlow.open(this.item)
  },

  async handleFavoriteTap() {
    if (!this.item) {
      return
    }
    const currentlyFavorite = typeof this.item.pinnedAt === 'number'
    try {
      const nextItem = await this.runtime.setPinned(this.item.id, !currentlyFavorite)
      this.item = nextItem
      this.setData({
        postView: buildPostCardViewFromItem(nextItem, Date.now()),
      })
      showInfoToast(typeof nextItem.pinnedAt === 'number' ? '已收藏' : '已取消收藏')
    } catch (error) {
      showErrorToast(error, '收藏失败：')
    }
  },

  handleEditTap() {
    if (!this.itemId) {
      return
    }
    wx.navigateTo({
      url: buildEditRecordUrl(this.itemId),
      fail: (error) => showErrorToast(error, '打开编辑失败：'),
    })
  },

  async handleDeleteTap() {
    if (!this.item) {
      return
    }
    try {
      const confirmed = await confirmDestructive(
        '删掉这条？',
        '删除后无法恢复。',
        '删掉'
      )
      if (!confirmed) {
        return
      }

      const item = this.item
      if (typeof item.reminderAt === 'number' && item.reminderAt > Date.now()) {
        const networkType = await this.runtime.getNetworkType()
        if (networkType !== 'none') {
          try {
            await this.runtime.syncReminderJob({
              itemId: item.id,
              reminderAt: undefined,
              reminderDisplayText: '',
              reminderSyncState: 'unscheduled',
              sceneType: item.sceneType,
              locationTitle: item.location.name,
              locationSubtitle: item.location.address,
            })
          } catch {
            // Best-effort reminder cancellation; deletion still proceeds.
          }
        }
      }

      this.setData({ fading: true })
      await this.runtime.deleteItem(item.id)

      setTimeout(() => {
        showSuccessToast('已删除')
        wx.navigateBack({
          fail: () => {
            wx.reLaunch({ url: buildRecordsUrl() })
          },
        })
      }, 220)
    } catch (error) {
      this.setData({ fading: false })
      showErrorToast(error, '删除失败：')
    }
  },

  handleShareClose() {
    this.shareFlow.close()
  },

  handleShareToggle(event) {
    const selectionKey = event.detail.selectionKey
    if (!selectionKey) {
      return
    }
    this.shareFlow.toggleSelection(selectionKey)
  },

  handleShareRetry() {
    this.shareFlow.retry()
  },
})
