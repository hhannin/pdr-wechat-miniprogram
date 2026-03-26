import type { ItemSummary } from '../../core/types/index'
import { frontendRuntime, type DebugRuntime } from '../common/runtime'
import {
  buildSummaryAnchorsText,
  buildSummaryMeta,
  buildNoteDisplayText,
  getSceneLabel,
  trimOptionalString,
} from '../common/frontend-presenters'
import {
  buildRecordDetailUrl,
  FRONTEND_PRIMARY_NAV,
  type FrontendPrimaryNavItem,
  type RecordsPageEntryState,
} from '../index/frontend-config'

interface FooterNavItemView extends FrontendPrimaryNavItem {
  readonly isActive: boolean
}

interface RecordsItemView {
  readonly id: string
  readonly sceneLabel: string
  readonly title: string
  readonly subtitle: string
  readonly meta: string
  readonly anchorsText: string
  readonly noteText: string
  readonly coverPhotoPath: string
  readonly hasPhoto: boolean
  readonly isSwipeOpen: boolean
  readonly isHighlighted: boolean
}

interface RecordsPageData {
  readonly pageReady: boolean
  readonly busy: boolean
  readonly busyText: string
  readonly statusText: string
  readonly errorText: string
  readonly itemCountText: string
  readonly hasItems: boolean
  readonly items: readonly RecordsItemView[]
  readonly footerNavItems: readonly FooterNavItemView[]
}

interface RecordsPageCustom {
  readonly runtime: DebugRuntime
  openSwipeItemId: string
  focusItemId: string
  entryState?: RecordsPageEntryState
  touchStartX: number
  touchStartY: number
  touchStartItemId: string
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
  onShow(): void
  handleRefreshTap(): Promise<void>
  handleCardTouchStart(event: ItemTouchEvent): void
  handleCardTouchEnd(event: ItemTouchEvent): void
  handleCardTap(event: ItemTapEvent): Promise<void>
  handleEditTap(event: ItemTapEvent): Promise<void>
  handleDeleteTap(event: ItemTapEvent): Promise<void>
}

type RecordsPageInstance = WechatMiniprogram.Page.Instance<
  RecordsPageData,
  RecordsPageCustom
>

type ItemTapEvent = WechatMiniprogram.BaseEvent<
  WechatMiniprogram.IAnyObject,
  {
    readonly itemId?: string
  }
>

type ItemTouchEvent = WechatMiniprogram.TouchEvent<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  {
    readonly itemId?: string
  },
  {
    readonly itemId?: string
  }
>

const FOOTER_NAV_ITEMS: readonly FooterNavItemView[] = FRONTEND_PRIMARY_NAV.map((navItem) => ({
  ...navItem,
  isActive: navItem.key === 'records',
}))

function setFeedback(
  page: RecordsPageInstance,
  nextState: {
    readonly statusText?: string
    readonly errorText?: string
  }
): void {
  page.setData({
    statusText: nextState.statusText ?? page.data.statusText,
    errorText: nextState.errorText ?? page.data.errorText,
  })
}

function clearFeedback(page: RecordsPageInstance): void {
  page.setData({
    statusText: '',
    errorText: '',
  })
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { readonly message?: unknown }).message === 'string'
  ) {
    return (error as { readonly message: string }).message.trim()
  }

  return '发生未知错误。'
}

async function confirmAction(
  title: string,
  content: string,
  confirmText: string = '确定'
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title,
      content,
      confirmText,
      confirmColor: '#1f6a46',
      success: (result) => resolve(result.confirm),
      fail: (error) => reject(error),
    })
  })
}

async function navigateTo(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wx.navigateTo({
      url,
      success: () => resolve(),
      fail: (error) => reject(error),
    })
  })
}

function readQueryString(
  options: WechatMiniprogram.IAnyObject,
  key: string
): string | undefined {
  return trimOptionalString(options[key])
}

function isRecordsPageEntryState(value: string): value is RecordsPageEntryState {
  return value === 'created'
}

function buildItemViews(
  summaries: readonly ItemSummary[],
  openSwipeItemId: string,
  focusItemId: string
): readonly RecordsItemView[] {
  return summaries.map((summary) => ({
    id: summary.id,
    sceneLabel: getSceneLabel(summary.sceneType),
    title: summary.locationName,
    subtitle: summary.address,
    meta: buildSummaryMeta(summary),
    anchorsText: buildSummaryAnchorsText(summary),
    noteText: buildNoteDisplayText(summary.notePreview),
    coverPhotoPath: summary.coverPhotoPath ?? '',
    hasPhoto: typeof summary.coverPhotoPath === 'string' && summary.coverPhotoPath.length > 0,
    isSwipeOpen: summary.id === openSwipeItemId,
    isHighlighted: summary.id === focusItemId,
  }))
}

function syncItemList(
  page: RecordsPageInstance,
  summaries: readonly ItemSummary[]
): void {
  page.setData({
    hasItems: summaries.length > 0,
    itemCountText: summaries.length > 0 ? `共 ${summaries.length} 条记录` : '还没有任何记录',
    items: buildItemViews(summaries, page.openSwipeItemId, page.focusItemId),
  })
}

function closeSwipeActions(page: RecordsPageInstance): void {
  if (!page.openSwipeItemId) {
    return
  }

  page.openSwipeItemId = ''
  page.setData({
    items: page.data.items.map((item) => ({
      ...item,
      isSwipeOpen: false,
    })),
  })
}

function openSwipeActions(page: RecordsPageInstance, itemId: string): void {
  if (page.openSwipeItemId === itemId) {
    return
  }

  page.openSwipeItemId = itemId
  page.setData({
    items: page.data.items.map((item) => ({
      ...item,
      isSwipeOpen: item.id === itemId,
    })),
  })
}

async function runBusy<T>(
  page: RecordsPageInstance,
  busyText: string,
  task: () => Promise<T>
): Promise<T> {
  page.setData({
    busy: true,
    busyText,
  })

  try {
    return await task()
  } finally {
    page.setData({
      busy: false,
      busyText: '',
    })
  }
}

async function refreshItems(
  page: RecordsPageInstance,
  options: {
    readonly busyText?: string
    readonly silent?: boolean
  } = {}
): Promise<void> {
  const loadSummaries = async (): Promise<void> => {
    const summaries = await page.runtime.listRecent(100)

    if (page.openSwipeItemId) {
      const hasOpenItem = summaries.some((summary) => summary.id === page.openSwipeItemId)
      if (!hasOpenItem) {
        page.openSwipeItemId = ''
      }
    }

    if (page.focusItemId) {
      const hasFocusItem = summaries.some((summary) => summary.id === page.focusItemId)
      if (!hasFocusItem) {
        page.focusItemId = ''
      }
    }

    syncItemList(page, summaries)
  }

  if (options.silent) {
    await loadSummaries()
    return
  }

  await runBusy(page, options.busyText ?? '正在加载记录列表', loadSummaries)
}

Page<RecordsPageData, RecordsPageCustom>({
  data: {
    pageReady: false,
    busy: false,
    busyText: '',
    statusText: '',
    errorText: '',
    itemCountText: '还没有任何记录',
    hasItems: false,
    items: [],
    footerNavItems: FOOTER_NAV_ITEMS,
  },

  runtime: frontendRuntime,
  openSwipeItemId: '',
  focusItemId: '',
  entryState: undefined,
  touchStartX: 0,
  touchStartY: 0,
  touchStartItemId: '',

  async onLoad(options) {
    const focusItemId = readQueryString(options, 'focusItemId')
    const entryStateValue = readQueryString(options, 'entryState')

    this.focusItemId = focusItemId ?? ''
    this.entryState =
      entryStateValue && isRecordsPageEntryState(entryStateValue)
        ? entryStateValue
        : undefined

    clearFeedback(this)

    try {
      await refreshItems(this, {
        busyText: '正在读取本地记录',
      })

      this.setData({
        pageReady: true,
      })

      if (this.entryState === 'created') {
        setFeedback(this, {
          statusText: '记录已创建，已回到列表页。',
          errorText: '',
        })
      }
    } catch (error) {
      console.error(error)
      setFeedback(this, {
        statusText: '',
        errorText: `加载记录失败：${formatErrorMessage(error)}`,
      })
      this.setData({
        pageReady: true,
      })
    }
  },

  onShow() {
    if (!this.data.pageReady) {
      return
    }

    refreshItems(this, {
      silent: true,
    }).catch((error) => {
      console.error(error)
      setFeedback(this, {
        statusText: '',
        errorText: `刷新记录失败：${formatErrorMessage(error)}`,
      })
    })
  },

  async handleRefreshTap() {
    clearFeedback(this)
    this.focusItemId = ''

    try {
      await refreshItems(this, {
        busyText: '正在刷新记录列表',
      })

      setFeedback(this, {
        statusText: '记录列表已刷新。',
        errorText: '',
      })
    } catch (error) {
      console.error(error)
      setFeedback(this, {
        statusText: '',
        errorText: `刷新失败：${formatErrorMessage(error)}`,
      })
    }
  },

  handleCardTouchStart(event) {
    const touchPoint = event.touches[0]
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)

    this.touchStartX = touchPoint?.pageX ?? 0
    this.touchStartY = touchPoint?.pageY ?? 0
    this.touchStartItemId = itemId ?? ''
  },

  handleCardTouchEnd(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    const touchPoint = event.changedTouches[0]

    if (!itemId || this.touchStartItemId !== itemId || !touchPoint) {
      this.touchStartItemId = ''
      return
    }

    const deltaX = touchPoint.pageX - this.touchStartX
    const deltaY = touchPoint.pageY - this.touchStartY
    this.touchStartItemId = ''

    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return
    }

    if (deltaX < 0) {
      openSwipeActions(this, itemId)
      return
    }

    closeSwipeActions(this)
  },

  async handleCardTap(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    if (!itemId) {
      return
    }

    if (this.openSwipeItemId) {
      closeSwipeActions(this)
      return
    }

    clearFeedback(this)
    this.focusItemId = ''

    try {
      await navigateTo(buildRecordDetailUrl(itemId, 'view'))
    } catch (error) {
      console.error(error)
      setFeedback(this, {
        statusText: '',
        errorText: `打开记录失败：${formatErrorMessage(error)}`,
      })
    }
  },

  async handleEditTap(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    if (!itemId) {
      return
    }

    closeSwipeActions(this)
    this.focusItemId = ''

    try {
      await navigateTo(buildRecordDetailUrl(itemId, 'edit'))
    } catch (error) {
      console.error(error)
      setFeedback(this, {
        statusText: '',
        errorText: `打开编辑页失败：${formatErrorMessage(error)}`,
      })
    }
  },

  async handleDeleteTap(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    if (!itemId) {
      return
    }

    closeSwipeActions(this)
    this.focusItemId = ''

    try {
      const shouldDelete = await confirmAction(
        '删除记录',
        '删除后会同时移除本地 JSON 和照片文件。',
        '删除'
      )

      if (!shouldDelete) {
        setFeedback(this, {
          statusText: '已取消删除。',
          errorText: '',
        })
        return
      }

      await runBusy(this, '正在删除记录', async () => {
        await this.runtime.deleteItem(itemId)
      })

      await refreshItems(this, {
        silent: true,
      })

      setFeedback(this, {
        statusText: '记录已删除。',
        errorText: '',
      })
    } catch (error) {
      console.error(error)
      setFeedback(this, {
        statusText: '',
        errorText: `删除失败：${formatErrorMessage(error)}`,
      })
    }
  },
})
