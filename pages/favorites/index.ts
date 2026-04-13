import type { ItemSummary } from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  buildPostCardViewFromSummary,
  type PostCardView,
} from '../common/frontend-presenters'
import {
  buildEditRecordUrl,
  buildPostViewUrl,
} from '../common/frontend-config'
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

interface FavoritesPageData {
  readonly pageReady: boolean
  readonly hasItems: boolean
  readonly postViews: readonly PostCardView[]
  readonly fadingIds: Readonly<Record<string, boolean>>
  readonly shareFlowVisible: boolean
  readonly shareSelectionItems: readonly ShareSelectionItemView[]
  readonly sharePrepareState: SharePrepareState
  readonly shareCoverImage: string
}

interface FavoritesPageCustom {
  readonly runtime: AppRuntime
  shareFlow: ShareFlowController
  summaries: readonly ItemSummary[]
  onLoad(): void
  onUnload(): void
  onShow(): Promise<void>
  onPullDownRefresh(): Promise<void>
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  refresh(): Promise<void>
  applyShareFlowView(view: ShareFlowView): void
  handleCardTap(event: PostCardEvent): void
  handlePhotoTap(event: PostCardEvent): Promise<void>
  handleNavigateTap(event: PostCardEvent): Promise<void>
  handleShareTap(event: PostCardEvent): Promise<void>
  handleFavoriteTap(event: PostCardEvent): Promise<void>
  handleEditTap(event: PostCardEvent): void
  handleDeleteTap(event: PostCardEvent): Promise<void>
  handleShareClose(): void
  handleShareToggle(event: ShareToggleEvent): void
  handleShareRetry(): void
}

type PostCardEvent = WechatMiniprogram.CustomEvent<{ readonly id?: string }>
type ShareToggleEvent = WechatMiniprogram.CustomEvent<{ readonly selectionKey?: string }>

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'
const REMINDER_RECOVERY_TIMEOUT_MS = 2500

function buildFavoriteViews(
  summaries: readonly ItemSummary[],
  now: number
): readonly PostCardView[] {
  const pinned = summaries.filter((s) => typeof s.pinnedAt === 'number')
  const sorted = [...pinned].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
  return Object.freeze(sorted.map((s) => buildPostCardViewFromSummary(s, now)))
}

Page<FavoritesPageData, FavoritesPageCustom>({
  data: {
    pageReady: false,
    hasItems: false,
    postViews: [],
    fadingIds: {},
    ...buildClosedShareFlowView(),
  },

  runtime: appRuntime,
  shareFlow: null as unknown as ShareFlowController,
  summaries: [],

  onLoad() {
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

  async onPullDownRefresh() {
    try {
      await this.refresh()
      const recoveredCount = await this.runtime.recoverFailedReminderJobs(
        this.data.postViews.map((postView) => postView.id),
        REMINDER_RECOVERY_TIMEOUT_MS
      )
      if (recoveredCount > 0) {
        await this.refresh()
        showInfoToast(
          recoveredCount === 1
            ? '已恢复 1 条提醒'
            : `已恢复 ${recoveredCount} 条提醒`,
          2200
        )
      }
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  onShareAppMessage() {
    const preparedShare = this.shareFlow?.getPreparedShare()
    if (!preparedShare) {
      return { title: '收藏 - 记这里' }
    }
    return {
      title: '分享快照',
      path: this.runtime.buildSharePath(preparedShare.shareId),
      imageUrl: SHARE_COVER_IMAGE_URL,
    }
  },

  async refresh() {
    try {
      const summaries = await this.runtime.listRecent()
      this.summaries = summaries
      const postViews = buildFavoriteViews(summaries, Date.now())
      this.setData({
        pageReady: true,
        hasItems: postViews.length > 0,
        postViews,
        fadingIds: {},
      })
    } catch (error) {
      this.setData({ pageReady: true })
      showErrorToast(error, '加载收藏失败：')
    }
  },

  applyShareFlowView(view) {
    this.setData(view)
  },

  handleCardTap(event) {
    const id = event.detail.id
    if (!id) return
    wx.navigateTo({
      url: buildPostViewUrl(id),
      fail: (error) => showErrorToast(error, '打开详情失败：'),
    })
  },

  async handlePhotoTap(event) {
    const id = event.detail.id
    const postView = this.data.postViews.find((v) => v.id === id)
    if (!postView?.photoPath) return
    try {
      await previewLocalImage(postView.photoPath)
    } catch (error) {
      showErrorToast(error, '打开照片失败：')
    }
  },

  async handleNavigateTap(event) {
    const id = event.detail.id
    if (!id) return
    try {
      const item = await this.runtime.getItem(id)
      if (!item) {
        showErrorToast('记录不存在')
        return
      }
      await this.runtime.openLocation(item.location)
    } catch (error) {
      showErrorToast(error, '打开地图失败：')
    }
  },

  async handleShareTap(event) {
    const id = event.detail.id
    if (!id) return
    try {
      const item = await this.runtime.getItem(id)
      if (!item) {
        showErrorToast('记录不存在')
        return
      }
      this.shareFlow.open(item)
    } catch (error) {
      showErrorToast(error, '打开分享失败：')
    }
  },

  async handleFavoriteTap(event) {
    const id = event.detail.id
    if (!id) return
    try {
      await this.runtime.setPinned(id, false)
      this.setData({
        fadingIds: { ...this.data.fadingIds, [id]: true },
      })
      setTimeout(() => {
        this.summaries = this.summaries.filter((s) => s.id !== id)
        const nextViews = this.data.postViews.filter((v) => v.id !== id)
        const nextFading = { ...this.data.fadingIds }
        delete nextFading[id]
        this.setData({
          postViews: nextViews,
          hasItems: nextViews.length > 0,
          fadingIds: nextFading,
        })
        showInfoToast('已取消收藏')
      }, 220)
    } catch (error) {
      showErrorToast(error, '取消收藏失败：')
    }
  },

  handleEditTap(event) {
    const id = event.detail.id
    if (!id) return
    wx.navigateTo({
      url: buildEditRecordUrl(id),
      fail: (error) => showErrorToast(error, '打开编辑失败：'),
    })
  },

  async handleDeleteTap(event) {
    const id = event.detail.id
    if (!id) return
    try {
      const confirmed = await confirmDestructive('删掉这条？', '删除后无法恢复。', '删掉')
      if (!confirmed) return

      const targetSummary = this.summaries.find((s) => s.id === id)
      if (targetSummary && typeof targetSummary.reminderAt === 'number' && targetSummary.reminderAt > Date.now()) {
        const networkType = await this.runtime.getNetworkType()
        if (networkType !== 'none') {
          try {
            await this.runtime.syncReminderJob({
              itemId: id,
              reminderAt: undefined,
              reminderDisplayText: '',
              reminderSyncState: 'unscheduled',
              sceneType: targetSummary.sceneType,
              locationTitle: targetSummary.locationName,
              locationSubtitle: targetSummary.address,
            })
          } catch { /* best effort */ }
        }
      }

      this.setData({ fadingIds: { ...this.data.fadingIds, [id]: true } })
      await this.runtime.deleteItem(id)

      setTimeout(() => {
        this.summaries = this.summaries.filter((s) => s.id !== id)
        const nextViews = this.data.postViews.filter((v) => v.id !== id)
        const nextFading = { ...this.data.fadingIds }
        delete nextFading[id]
        this.setData({
          postViews: nextViews,
          hasItems: nextViews.length > 0,
          fadingIds: nextFading,
        })
        showSuccessToast('已删除')
      }, 220)
    } catch (error) {
      showErrorToast(error, '删除失败：')
    }
  },

  handleShareClose() {
    this.shareFlow.close()
  },

  handleShareToggle(event) {
    const selectionKey = event.detail.selectionKey
    if (!selectionKey) return
    this.shareFlow.toggleSelection(selectionKey)
  },

  handleShareRetry() {
    this.shareFlow.retry()
  },
})
