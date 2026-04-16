import type {
  Item,
  PreparedShareSnapshot,
  SceneFieldKey,
  ShareSnapshotSelection,
} from '../../core/types/index'
import type { AppRuntime } from './runtime'
import { buildFieldViews } from './frontend-presenters'
import { showErrorToast } from './feedback'

export type ShareSelectionItemKind = 'photo' | 'field' | 'note' | 'reminder'
export type SharePrepareState = 'idle' | 'preparing' | 'ready' | 'failed'

export interface ShareSelectionItemView {
  readonly key: string
  readonly label: string
  readonly checked: boolean
  readonly kind: ShareSelectionItemKind
  readonly fieldKey?: SceneFieldKey
}

export interface ShareFlowView {
  readonly shareFlowVisible: boolean
  readonly shareSelectionItems: readonly ShareSelectionItemView[]
  readonly sharePrepareState: SharePrepareState
  readonly shareCoverImage: string
}

const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'
const SHARE_PREPARE_DEBOUNCE_MS = 320

export function buildClosedShareFlowView(): ShareFlowView {
  return {
    shareFlowVisible: false,
    shareSelectionItems: [],
    sharePrepareState: 'idle',
    shareCoverImage: SHARE_COVER_IMAGE_URL,
  }
}

function buildShareSelectionItems(item: Item): readonly ShareSelectionItemView[] {
  const selectionItems: ShareSelectionItemView[] = []
  const photo = item.photos[0]

  if (photo) {
    selectionItems.push({
      key: 'photo',
      label: '图片',
      checked: true,
      kind: 'photo',
    })
  }

  const filledFieldViews = buildFieldViews(item.sceneType, item.anchorValues).filter(
    (fieldView) => fieldView.value.trim().length > 0
  )
  for (const fieldView of filledFieldViews) {
    selectionItems.push({
      key: `field:${fieldView.key}`,
      label: fieldView.label,
      checked: true,
      kind: 'field',
      fieldKey: fieldView.key,
    })
  }

  if (item.note.trim().length > 0) {
    selectionItems.push({
      key: 'note',
      label: '备注',
      checked: true,
      kind: 'note',
    })
  }

  if (typeof item.reminderAt === 'number') {
    selectionItems.push({
      key: 'reminder',
      label: '提醒时间',
      checked: true,
      kind: 'reminder',
    })
  }

  return Object.freeze(selectionItems)
}

function cloneSelectionItems(
  selectionItems: readonly ShareSelectionItemView[]
): readonly ShareSelectionItemView[] {
  return Object.freeze(selectionItems.map((selectionItem) => ({ ...selectionItem })))
}

function buildShareSnapshotSelection(
  selectionItems: readonly ShareSelectionItemView[]
): ShareSnapshotSelection {
  const includedFieldKeys: SceneFieldKey[] = []
  let includePhoto = false
  let includeNote = false
  let includeReminder = false

  for (const selectionItem of selectionItems) {
    if (!selectionItem.checked) {
      continue
    }

    if (selectionItem.kind === 'photo') {
      includePhoto = true
      continue
    }

    if (selectionItem.kind === 'note') {
      includeNote = true
      continue
    }

    if (selectionItem.kind === 'reminder') {
      includeReminder = true
      continue
    }

    if (selectionItem.fieldKey) {
      includedFieldKeys.push(selectionItem.fieldKey)
    }
  }

  return Object.freeze({
    includePhoto,
    includedFieldKeys: Object.freeze(includedFieldKeys),
    includeNote,
    includeReminder,
  })
}

function buildSelectionFingerprint(
  item: Item,
  selectionItems: readonly ShareSelectionItemView[]
): string {
  const selection = buildShareSnapshotSelection(selectionItems)
  const sortedFieldKeys = [...selection.includedFieldKeys].sort()

  return [
    item.id,
    item.updatedAt.toString(),
    selection.includePhoto ? 'photo:1' : 'photo:0',
    selection.includeNote ? 'note:1' : 'note:0',
    selection.includeReminder ? 'reminder:1' : 'reminder:0',
    `fields:${sortedFieldKeys.join(',')}`,
  ].join('|')
}

export interface ShareFlowHost {
  readonly runtime: AppRuntime
  applyShareFlowView(view: ShareFlowView): void
}

export class ShareFlowController {
  private readonly host: ShareFlowHost
  private currentItem: Item | null = null
  private currentSelection: readonly ShareSelectionItemView[] = []
  private currentFingerprint = ''
  private prepareTimer: ReturnType<typeof setTimeout> | null = null
  private preparedShare: PreparedShareSnapshot | null = null
  private disposed = false
  private readonly preparedCache = new Map<string, PreparedShareSnapshot>()
  private readonly inflightTasks = new Map<string, Promise<PreparedShareSnapshot>>()
  private view: ShareFlowView = buildClosedShareFlowView()

  constructor(host: ShareFlowHost) {
    this.host = host
  }

  getPreparedShare(): PreparedShareSnapshot | null {
    return this.preparedShare
  }

  isOpen(): boolean {
    return this.view.shareFlowVisible
  }

  open(item: Item): void {
    this.clearTimer()
    this.preparedShare = null
    this.currentItem = item
    const selectionItems = buildShareSelectionItems(item)
    this.currentSelection = selectionItems
    this.currentFingerprint = buildSelectionFingerprint(item, selectionItems)
    this.view = {
      shareFlowVisible: true,
      shareSelectionItems: selectionItems,
      sharePrepareState: 'preparing',
      shareCoverImage: SHARE_COVER_IMAGE_URL,
    }
    this.host.applyShareFlowView(this.view)
    this.schedulePreparation(SHARE_PREPARE_DEBOUNCE_MS)
  }

  close(): void {
    this.clearTimer()
    this.preparedShare = null
    this.currentItem = null
    this.currentSelection = []
    this.currentFingerprint = ''
    this.view = buildClosedShareFlowView()
    this.host.applyShareFlowView(this.view)
  }

  toggleSelection(selectionKey: string): void {
    if (!this.view.shareFlowVisible || !this.currentItem) {
      return
    }

    const nextSelection = this.view.shareSelectionItems.map((selectionItem) =>
      selectionItem.key === selectionKey
        ? { ...selectionItem, checked: !selectionItem.checked }
        : selectionItem
    )

    const frozen = Object.freeze(nextSelection)
    this.currentSelection = frozen
    this.updateView({
      shareSelectionItems: frozen,
      sharePrepareState: 'preparing',
    })
    this.preparedShare = null
    this.schedulePreparation(SHARE_PREPARE_DEBOUNCE_MS)
  }

  retry(): void {
    if (!this.view.shareFlowVisible || !this.currentItem) {
      return
    }
    this.preparedShare = null
    this.updateView({ sharePrepareState: 'preparing' })
    this.schedulePreparation(0)
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
    this.preparedCache.clear()
    this.inflightTasks.clear()
  }

  private updateView(patch: Partial<ShareFlowView>): void {
    this.view = { ...this.view, ...patch }
    this.host.applyShareFlowView(this.view)
  }

  private clearTimer(): void {
    if (this.prepareTimer !== null) {
      clearTimeout(this.prepareTimer)
      this.prepareTimer = null
    }
  }

  private schedulePreparation(delayMs: number): void {
    this.clearTimer()
    if (!this.currentItem) {
      return
    }

    const item = this.currentItem
    const selection = cloneSelectionItems(this.currentSelection)
    const fingerprint = buildSelectionFingerprint(item, selection)
    this.currentFingerprint = fingerprint

    const cached = this.preparedCache.get(fingerprint)
    if (cached) {
      this.preparedShare = cached
      this.updateView({ sharePrepareState: 'ready' })
      return
    }

    if (delayMs <= 0) {
      this.startPreparation(item, selection, fingerprint)
      return
    }

    this.prepareTimer = setTimeout(() => {
      this.prepareTimer = null
      if (this.disposed || !this.view.shareFlowVisible) {
        return
      }
      if (this.currentFingerprint !== fingerprint) {
        return
      }
      this.startPreparation(item, selection, fingerprint)
    }, delayMs)
  }

  private startPreparation(
    item: Item,
    selection: readonly ShareSelectionItemView[],
    fingerprint: string
  ): void {
    const cached = this.preparedCache.get(fingerprint)
    if (cached) {
      this.preparedShare = cached
      this.updateView({ sharePrepareState: 'ready' })
      return
    }

    const existing = this.inflightTasks.get(fingerprint)
    if (existing) {
      this.attachTask(fingerprint, existing)
      return
    }

    const task = this.host.runtime
      .prepareShareSnapshot(item, buildShareSnapshotSelection(selection))
      .finally(() => {
        this.inflightTasks.delete(fingerprint)
      })

    this.inflightTasks.set(fingerprint, task)
    this.attachTask(fingerprint, task)
  }

  private attachTask(
    fingerprint: string,
    task: Promise<PreparedShareSnapshot>
  ): void {
    void task
      .then((preparedShare) => {
        if (this.disposed) {
          return
        }
        this.preparedCache.set(fingerprint, preparedShare)
        if (!this.view.shareFlowVisible || this.currentFingerprint !== fingerprint) {
          return
        }
        this.preparedShare = preparedShare
        this.updateView({ sharePrepareState: 'ready' })
      })
      .catch((error) => {
        if (this.disposed) {
          return
        }
        if (!this.view.shareFlowVisible || this.currentFingerprint !== fingerprint) {
          return
        }
        this.preparedShare = null
        this.updateView({ sharePrepareState: 'failed' })
        showErrorToast(error, '生成分享失败：')
      })
  }
}
