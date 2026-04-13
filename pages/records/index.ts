import type { ItemSummary } from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  buildPostCardViewFromSummary,
  resolveEffectiveTimestamp,
  type PostCardView,
} from '../common/frontend-presenters'
import {
  buildCreateRecordUrl,
  buildEditRecordUrl,
  buildFavoritesUrl,
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

interface RecordsPageData {
  readonly pageReady: boolean
  readonly hasItems: boolean
  readonly postViews: readonly PostCardView[]
  readonly dateKeys: readonly string[]
  readonly scrollIntoViewId: string
  readonly fadingIds: Readonly<Record<string, boolean>>
  readonly shareFlowVisible: boolean
  readonly shareSelectionItems: readonly ShareSelectionItemView[]
  readonly sharePrepareState: SharePrepareState
  readonly shareCoverImage: string
}

interface RecordsPageCustom {
  readonly runtime: AppRuntime
  shareFlow: ShareFlowController
  summaries: readonly ItemSummary[]
  onLoad(query: Record<string, string | undefined>): void
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
  handleGoFavorites(): void
  handleGoCreate(): void
  handleDateChange(event: DateChangeEvent): void
  handleShareClose(): void
  handleShareToggle(event: ShareToggleEvent): void
  handleShareRetry(): void
}

type PostCardEvent = WechatMiniprogram.CustomEvent<{ readonly id?: string }>
type DateChangeEvent = WechatMiniprogram.CustomEvent<{ readonly dateKey?: string }>
type ShareToggleEvent = WechatMiniprogram.CustomEvent<{ readonly selectionKey?: string }>

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'
const REMINDER_RECOVERY_TIMEOUT_MS = 2500

function buildPostViews(
  summaries: readonly ItemSummary[],
  now: number
): readonly PostCardView[] {
  const sorted = [...summaries].sort((left, right) => {
    const leftAt = resolveEffectiveTimestamp(left, now)
    const rightAt = resolveEffectiveTimestamp(right, now)
    if (leftAt !== rightAt) {
      return rightAt - leftAt
    }
    return right.createdAt - left.createdAt
  })
  return Object.freeze(sorted.map((summary) => buildPostCardViewFromSummary(summary, now)))
}

function buildDateKeys(postViews: readonly PostCardView[]): readonly string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const view of postViews) {
    if (!seen.has(view.dateKey)) {
      seen.add(view.dateKey)
      keys.push(view.dateKey)
    }
  }
  return Object.freeze(keys)
}

Page<RecordsPageData, RecordsPageCustom>({
  data: {
    pageReady: false,
    hasItems: false,
    postViews: [],
    dateKeys: [],
    scrollIntoViewId: '',
    fadingIds: {},
    ...buildClosedShareFlowView(),
  },

  runtime: appRuntime,
  shareFlow: null as unknown as ShareFlowController,
  summaries: [],

  onLoad(query: Record<string, string | undefined>) {
    this.shareFlow = new ShareFlowController({
      runtime: this.runtime,
      applyShareFlowView: (view) => this.applyShareFlowView(view),
    })
    if (query.toast) {
      const message = decodeURIComponent(query.toast)
      setTimeout(() => showInfoToast(message, 3000), 300)
    }
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
      return {
        title: '记这里',
      }
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
      const postViews = buildPostViews(summaries, Date.now())
      this.setData({
        pageReady: true,
        hasItems: postViews.length > 0,
        postViews,
        dateKeys: buildDateKeys(postViews),
        fadingIds: {},
      })
    } catch (error) {
      this.setData({ pageReady: true })
      showErrorToast(error, '加载记录失败：')
    }
  },

  applyShareFlowView(view) {
    this.setData(view)
  },

  handleCardTap(event) {
    const id = event.detail.id
    if (!id) {
      return
    }
    wx.navigateTo({
      url: buildPostViewUrl(id),
      fail: (error) => showErrorToast(error, '打开详情失败：'),
    })
  },

  async handlePhotoTap(event) {
    const id = event.detail.id
    const postView = this.data.postViews.find((view) => view.id === id)
    if (!postView?.photoPath) {
      return
    }
    try {
      await previewLocalImage(postView.photoPath)
    } catch (error) {
      showErrorToast(error, '打开照片失败：')
    }
  },

  async handleNavigateTap(event) {
    const id = event.detail.id
    if (!id) {
      return
    }
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
    if (!id) {
      return
    }
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
    if (!id) {
      return
    }
    const targetView = this.data.postViews.find((view) => view.id === id)
    if (!targetView) {
      return
    }
    try {
      const nextItem = await this.runtime.setPinned(id, !targetView.isFavorite)
      const nextViews = this.data.postViews.map((view) =>
        view.id === id
          ? { ...view, isFavorite: typeof nextItem.pinnedAt === 'number' }
          : view
      )
      this.setData({ postViews: Object.freeze(nextViews) })
      showInfoToast(typeof nextItem.pinnedAt === 'number' ? '已收藏' : '已取消收藏')
    } catch (error) {
      showErrorToast(error, '收藏失败：')
    }
  },

  handleEditTap(event) {
    const id = event.detail.id
    if (!id) {
      return
    }
    wx.navigateTo({
      url: buildEditRecordUrl(id),
      fail: (error) => showErrorToast(error, '打开编辑失败：'),
    })
  },

  async handleDeleteTap(event) {
    const id = event.detail.id
    if (!id) {
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

      const targetSummary = this.summaries.find((summary) => summary.id === id)
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
          } catch {
            // Best-effort reminder cancellation; deletion still proceeds.
          }
        }
      }

      this.setData({
        fadingIds: { ...this.data.fadingIds, [id]: true },
      })

      await this.runtime.deleteItem(id)

      setTimeout(() => {
        this.summaries = this.summaries.filter((summary) => summary.id !== id)
        const nextViews = this.data.postViews.filter((view) => view.id !== id)
        const nextFading = { ...this.data.fadingIds }
        delete nextFading[id]
        this.setData({
          postViews: nextViews,
          dateKeys: buildDateKeys(nextViews),
          hasItems: nextViews.length > 0,
          fadingIds: nextFading,
        })
        showSuccessToast('已删除')
      }, 220)
    } catch (error) {
      showErrorToast(error, '删除失败：')
    }
  },

  handleGoFavorites() {
    wx.navigateTo({
      url: buildFavoritesUrl(),
      fail: (error) => showErrorToast(error, '打开收藏失败：'),
    })
  },

  handleGoCreate() {
    wx.navigateTo({
      url: buildCreateRecordUrl(),
      fail: (error) => showErrorToast(error, '打开创建失败：'),
    })
  },

  handleDateChange(event) {
    const dateKey = event.detail.dateKey
    if (!dateKey) {
      return
    }
    const targetView = this.data.postViews.find((view) => view.dateKey === dateKey)
    if (!targetView) {
      return
    }
    this.setData({ scrollIntoViewId: `post-${targetView.id}` })
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
