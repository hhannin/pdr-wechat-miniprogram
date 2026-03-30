import type { ItemSummary } from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  formatSummaryTimestamp,
  trimOptionalString,
} from '../common/frontend-presenters'
import {
  buildRecordDetailUrl,
  FRONTEND_PRIMARY_NAV,
  type FrontendPrimaryNavItem,
} from '../common/frontend-config'

interface FooterNavItemView extends FrontendPrimaryNavItem {
  readonly isActive: boolean
}

interface RecordsItemView {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly timestampText: string
  readonly coverPhotoPath: string
  readonly hasPhoto: boolean
  readonly isSwipeOpen: boolean
  readonly isHighlighted: boolean
}

interface RecordsGroupView {
  readonly key: string
  readonly title: string
  readonly items: readonly RecordsItemView[]
}

interface RecordsPageData {
  readonly pageReady: boolean
  readonly busy: boolean
  readonly busyText: string
  readonly statusText: string
  readonly errorText: string
  readonly hasItems: boolean
  readonly groups: readonly RecordsGroupView[]
  readonly footerNavItems: readonly FooterNavItemView[]
}

interface RecordsPageCustom {
  readonly runtime: AppRuntime
  summaries: readonly ItemSummary[]
  openSwipeItemId: string
  focusItemId: string
  touchStartX: number
  touchStartY: number
  touchStartItemId: string
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
  onShow(): void
  onPullDownRefresh(): Promise<void>
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

function formatDateKey(timestampMs: number): string {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function buildGroupTitle(timestampMs: number): string {
  const date = new Date(timestampMs)
  const fullDate = formatDateKey(timestampMs)
  const today = new Date()
  const yesterday = new Date(today.getTime())
  yesterday.setDate(today.getDate() - 1)

  if (isSameCalendarDay(date, today)) {
    return `${fullDate} 今天`
  }

  if (isSameCalendarDay(date, yesterday)) {
    return `${fullDate} 昨天`
  }

  return fullDate
}

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
  const sanitizeUserFacingMessage = (message: string): string => {
    const trimmedMessage = message.trim()
    if (trimmedMessage.length === 0) {
      return '发生未知错误。'
    }

    if (/Item\s+"[^"]+"\s+does not exist\./.test(trimmedMessage)) {
      return '记录不存在或已删除。'
    }

    if (/wxfile:\/\//i.test(trimmedMessage) || /\/Users\//.test(trimmedMessage)) {
      return '本地文件处理失败，请重试。'
    }

    return trimmedMessage
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return sanitizeUserFacingMessage(error.message)
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { readonly message?: unknown }).message === 'string'
  ) {
    return sanitizeUserFacingMessage((error as { readonly message: string }).message)
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

function buildItemView(
  summary: ItemSummary,
  openSwipeItemId: string,
  focusItemId: string
): RecordsItemView {
  return {
    id: summary.id,
    title: summary.locationName,
    subtitle: summary.address,
    timestampText: formatSummaryTimestamp(summary),
    coverPhotoPath: summary.coverPhotoPath ?? '',
    hasPhoto: typeof summary.coverPhotoPath === 'string' && summary.coverPhotoPath.length > 0,
    isSwipeOpen: summary.id === openSwipeItemId,
    isHighlighted: summary.id === focusItemId,
  }
}

function buildGroupViews(
  summaries: readonly ItemSummary[],
  openSwipeItemId: string,
  focusItemId: string
): readonly RecordsGroupView[] {
  const groups = new Map<string, RecordsItemView[]>()
  const titles = new Map<string, string>()

  for (const summary of summaries) {
    const groupKey = formatDateKey(summary.createdAt)
    const items = groups.get(groupKey) ?? []
    items.push(buildItemView(summary, openSwipeItemId, focusItemId))
    groups.set(groupKey, items)

    if (!titles.has(groupKey)) {
      titles.set(groupKey, buildGroupTitle(summary.createdAt))
    }
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    title: titles.get(key) ?? key,
    items,
  }))
}

function syncItemGroups(page: RecordsPageInstance): void {
  page.setData({
    hasItems: page.summaries.length > 0,
    groups: buildGroupViews(page.summaries, page.openSwipeItemId, page.focusItemId),
  })
}

function closeSwipeActions(page: RecordsPageInstance): void {
  if (!page.openSwipeItemId) {
    return
  }

  page.openSwipeItemId = ''
  syncItemGroups(page)
}

function openSwipeActions(page: RecordsPageInstance, itemId: string): void {
  if (page.openSwipeItemId === itemId) {
    return
  }

  page.openSwipeItemId = itemId
  syncItemGroups(page)
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
    const summaries = (await page.runtime.listRecent(100))
      .slice()
      .sort((left, right) => right.createdAt - left.createdAt)
    page.summaries = summaries

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

    syncItemGroups(page)
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
    hasItems: false,
    groups: [],
    footerNavItems: FOOTER_NAV_ITEMS,
  },

  runtime: appRuntime,
  summaries: [],
  openSwipeItemId: '',
  focusItemId: '',
  touchStartX: 0,
  touchStartY: 0,
  touchStartItemId: '',

  async onLoad(options) {
    const focusItemId = readQueryString(options, 'focusItemId')
    this.focusItemId = focusItemId ?? ''
    try {
      await refreshItems(this, {
        busyText: '读取记录',
      })

      this.setData({
        pageReady: true,
      })
    } catch (error) {
      showToastMessage(`加载记录失败：${formatErrorMessage(error)}`)
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
      showToastMessage(`刷新记录失败：${formatErrorMessage(error)}`)
    })
  },

  async onPullDownRefresh() {
    if (!this.data.pageReady) {
      wx.stopPullDownRefresh()
      return
    }

    this.focusItemId = ''

    try {
      await refreshItems(this, {
        silent: true,
      })
    } catch (error) {
      showToastMessage(`刷新失败：${formatErrorMessage(error)}`)
    } finally {
      wx.stopPullDownRefresh()
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

    this.focusItemId = ''

    try {
      await navigateTo(buildRecordDetailUrl(itemId, 'view'))
    } catch (error) {
      showToastMessage(`打开记录失败：${formatErrorMessage(error)}`)
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
      showToastMessage(`打开编辑页失败：${formatErrorMessage(error)}`)
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
      const shouldDelete = await confirmAction('删掉这条？', '照片也会一起删掉。', '删掉')

      if (!shouldDelete) {
        return
      }

      await runBusy(this, '删除', async () => {
        await this.runtime.deleteItem(itemId)
      })

      await refreshItems(this, {
        silent: true,
      })
    } catch (error) {
      showToastMessage(`删除失败：${formatErrorMessage(error)}`)
    }
  },
})
