import type { ItemSummary } from '../../core/types/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  formatSummaryTimestamp,
  getSceneLabel,
  trimOptionalString,
} from '../common/frontend-presenters'
import {
  buildRecordDetailUrl,
  FRONTEND_ROUTES,
  FRONTEND_PRIMARY_NAV,
  type FrontendPrimaryNavItem,
} from '../common/frontend-config'

interface FooterNavItemView extends FrontendPrimaryNavItem {
  readonly isActive: boolean
}

interface RecordsItemView {
  readonly rowKey: string
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly timestampText: string
  readonly sceneLabel: string
  readonly coverPhotoPath: string
  readonly hasPhoto: boolean
  readonly isPinned: boolean
  readonly pinActionLabel: string
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
  readonly hasItems: boolean
  readonly hasPinnedItems: boolean
  readonly pinnedSectionCollapsed: boolean
  readonly pinnedItems: readonly RecordsItemView[]
  readonly groups: readonly RecordsGroupView[]
  readonly footerNavItems: readonly FooterNavItemView[]
}

interface RecordsPageCustom {
  readonly runtime: AppRuntime
  summaries: readonly ItemSummary[]
  openSwipeRowKey: string
  focusItemId: string
  touchStartX: number
  touchStartY: number
  touchStartRowKey: string
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
  onShow(): void
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  onPullDownRefresh(): Promise<void>
  handleTogglePinnedSection(): void
  handleCardTouchStart(event: ItemTouchEvent): void
  handleCardTouchEnd(event: ItemTouchEvent): void
  handleCardTap(event: ItemTapEvent): Promise<void>
  handleEditTap(event: ItemTapEvent): Promise<void>
  handlePinTap(event: ItemTapEvent): Promise<void>
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
    readonly rowKey?: string
  }
>

type ItemTouchEvent = WechatMiniprogram.TouchEvent<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  {
    readonly itemId?: string
    readonly rowKey?: string
  },
  {
    readonly itemId?: string
    readonly rowKey?: string
  }
>

const FOOTER_NAV_ITEMS: readonly FooterNavItemView[] = FRONTEND_PRIMARY_NAV.map((navItem) => ({
  ...navItem,
  isActive: navItem.key === 'records',
}))

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'

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
  rowKey: string,
  openSwipeRowKey: string,
  focusItemId: string
): RecordsItemView {
  return {
    rowKey,
    id: summary.id,
    title: summary.locationName,
    subtitle: summary.address,
    timestampText: formatSummaryTimestamp(summary),
    sceneLabel: getSceneLabel(summary.sceneType),
    coverPhotoPath: summary.coverPhotoPath ?? '',
    hasPhoto: typeof summary.coverPhotoPath === 'string' && summary.coverPhotoPath.length > 0,
    isPinned: typeof summary.pinnedAt === 'number' && summary.pinnedAt > 0,
    pinActionLabel:
      typeof summary.pinnedAt === 'number' && summary.pinnedAt > 0 ? '取消置顶' : '置顶',
    isSwipeOpen: rowKey === openSwipeRowKey,
    isHighlighted: summary.id === focusItemId,
  }
}

function comparePinnedSummaries(left: ItemSummary, right: ItemSummary): number {
  const leftPinnedAt = typeof left.pinnedAt === 'number' ? left.pinnedAt : 0
  const rightPinnedAt = typeof right.pinnedAt === 'number' ? right.pinnedAt : 0

  if (leftPinnedAt !== rightPinnedAt) {
    return rightPinnedAt - leftPinnedAt
  }

  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt
  }

  return left.id.localeCompare(right.id)
}

function buildPinnedItemViews(
  summaries: readonly ItemSummary[],
  openSwipeRowKey: string,
  focusItemId: string
): readonly RecordsItemView[] {
  return summaries
    .filter((summary) => typeof summary.pinnedAt === 'number' && summary.pinnedAt > 0)
    .slice()
    .sort(comparePinnedSummaries)
    .map((summary) => buildItemView(summary, `pinned:${summary.id}`, openSwipeRowKey, focusItemId))
}

function buildGroupViews(
  summaries: readonly ItemSummary[],
  openSwipeRowKey: string,
  focusItemId: string
): readonly RecordsGroupView[] {
  const groups = new Map<string, RecordsItemView[]>()
  const titles = new Map<string, string>()

  for (const summary of summaries) {
    const groupKey = formatDateKey(summary.createdAt)
    const items = groups.get(groupKey) ?? []
    items.push(buildItemView(summary, `group:${groupKey}:${summary.id}`, openSwipeRowKey, focusItemId))
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
  const pinnedItems = buildPinnedItemViews(
    page.summaries,
    page.openSwipeRowKey,
    page.focusItemId
  )

  page.setData({
    hasItems: page.summaries.length > 0,
    hasPinnedItems: pinnedItems.length > 0,
    pinnedItems,
    groups: buildGroupViews(page.summaries, page.openSwipeRowKey, page.focusItemId),
  })
}

function closeSwipeActions(page: RecordsPageInstance): void {
  if (!page.openSwipeRowKey) {
    return
  }

  page.openSwipeRowKey = ''
  syncItemGroups(page)
}

function openSwipeActions(page: RecordsPageInstance, rowKey: string): void {
  if (page.openSwipeRowKey === rowKey) {
    return
  }

  page.openSwipeRowKey = rowKey
  syncItemGroups(page)
}

async function runBusy<T>(
  page: RecordsPageInstance,
  task: () => Promise<T>
): Promise<T> {
  page.setData({
    busy: true,
  })

  try {
    return await task()
  } finally {
    page.setData({
      busy: false,
    })
  }
}

async function refreshItems(
  page: RecordsPageInstance,
  options: {
    readonly silent?: boolean
  } = {}
): Promise<void> {
  const loadSummaries = async (): Promise<void> => {
    const summaries = (await page.runtime.listRecent(100))
      .slice()
      .sort((left, right) => right.createdAt - left.createdAt)
    page.summaries = summaries

    if (page.openSwipeRowKey) {
      const hasOpenItem = [
        ...buildPinnedItemViews(summaries, page.openSwipeRowKey, page.focusItemId),
        ...buildGroupViews(summaries, page.openSwipeRowKey, page.focusItemId).flatMap((group) => group.items),
      ].some((item) => item.rowKey === page.openSwipeRowKey)
      if (!hasOpenItem) {
        page.openSwipeRowKey = ''
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

  await runBusy(page, loadSummaries)
}

Page<RecordsPageData, RecordsPageCustom>({
  data: {
    pageReady: false,
    busy: false,
    hasItems: false,
    hasPinnedItems: false,
    pinnedSectionCollapsed: true,
    pinnedItems: [],
    groups: [],
    footerNavItems: FOOTER_NAV_ITEMS,
  },

  runtime: appRuntime,
  summaries: [],
  openSwipeRowKey: '',
  focusItemId: '',
  touchStartX: 0,
  touchStartY: 0,
  touchStartRowKey: '',

  async onLoad(options) {
    const focusItemId = readQueryString(options, 'focusItemId')
    this.focusItemId = focusItemId ?? ''
    try {
      await refreshItems(this)

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

  onShareAppMessage() {
    return {
      title: '记这里',
      path: FRONTEND_ROUTES.scene,
      imageUrl: SHARE_COVER_IMAGE_URL,
    }
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

  handleTogglePinnedSection() {
    if (!this.data.hasPinnedItems) {
      return
    }

    closeSwipeActions(this)
    this.setData({
      pinnedSectionCollapsed: !this.data.pinnedSectionCollapsed,
    })
  },

  handleCardTouchStart(event) {
    const touchPoint = event.touches[0]
    const rowKey = trimOptionalString(event.currentTarget.dataset.rowKey)

    this.touchStartX = touchPoint?.pageX ?? 0
    this.touchStartY = touchPoint?.pageY ?? 0
    this.touchStartRowKey = rowKey ?? ''
  },

  handleCardTouchEnd(event) {
    const rowKey = trimOptionalString(event.currentTarget.dataset.rowKey)
    const touchPoint = event.changedTouches[0]

    if (!rowKey || this.touchStartRowKey !== rowKey || !touchPoint) {
      this.touchStartRowKey = ''
      return
    }

    const deltaX = touchPoint.pageX - this.touchStartX
    const deltaY = touchPoint.pageY - this.touchStartY
    this.touchStartRowKey = ''

    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return
    }

    if (deltaX < 0) {
      openSwipeActions(this, rowKey)
      return
    }

    closeSwipeActions(this)
  },

  async handleCardTap(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    if (!itemId) {
      return
    }

    if (this.openSwipeRowKey) {
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

  async handlePinTap(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    if (!itemId) {
      return
    }

    const targetSummary = this.summaries.find((summary) => summary.id === itemId)
    if (!targetSummary) {
      showToastMessage('记录不存在或已删除')
      return
    }

    const nextPinned = !(typeof targetSummary.pinnedAt === 'number' && targetSummary.pinnedAt > 0)

    closeSwipeActions(this)
    this.focusItemId = ''

    try {
      await runBusy(this, async () => {
        await this.runtime.setPinned(itemId, nextPinned)
      })

      await refreshItems(this, {
        silent: true,
      })
    } catch (error) {
      showToastMessage(`${nextPinned ? '置顶失败' : '取消置顶失败'}：${formatErrorMessage(error)}`)
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

      await runBusy(this, async () => {
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
