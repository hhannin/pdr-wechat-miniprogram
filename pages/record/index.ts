import type {
  Item,
  LocationSnapshot,
  PhotoAsset,
  PreparedShareSnapshot,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
  ShareSnapshotSelection,
} from '../../core/types/index'
import { isSceneType, sanitizeSceneFieldValues } from '../../core/scene/index'
import { isMapError } from '../../infra/map/index'
import { isMediaError } from '../../infra/media/index'
import {
  appRuntime,
  type AppRuntime,
} from '../common/runtime'
import {
  buildFieldViews,
  buildLocationPresentation,
  buildNoteDisplayText,
  buildPhotoPresentation,
  extractAnchorValues,
  getSceneLabel,
  trimOptionalString,
  updateFieldViewsByKey,
  type FrontendFieldView,
} from '../common/frontend-presenters'
import {
  buildRecordsUrl,
  FRONTEND_ROUTES,
  isRecordPageMode,
  type RecordPageMode,
} from '../common/frontend-config'

type ShareSelectionItemKind = 'photo' | 'field' | 'note'
type SharePrepareState = 'idle' | 'preparing' | 'ready' | 'failed'

interface ShareSelectionItemView {
  readonly key: string
  readonly label: string
  readonly checked: boolean
  readonly kind: ShareSelectionItemKind
  readonly fieldKey?: SceneFieldKey
}

interface RecordPageData {
  readonly pageReady: boolean
  readonly busy: boolean
  readonly pageMode: RecordPageMode
  readonly isCreateMode: boolean
  readonly isViewMode: boolean
  readonly isEditMode: boolean
  readonly sceneType: SceneType
  readonly sceneLabel: string
  readonly fieldViews: readonly FrontendFieldView[]
  readonly noteValue: string
  readonly noteLength: number
  readonly noteDisplayText: string
  readonly hasNote: boolean
  readonly hasFilledFields: boolean
  readonly hasLocation: boolean
  readonly locationTitle: string
  readonly locationSubtitle: string
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly canCreate: boolean
  readonly canSave: boolean
  readonly canAttachPhoto: boolean
  readonly shareFlowVisible: boolean
  readonly shareSelectionItems: readonly ShareSelectionItemView[]
  readonly sharePrepareState: SharePrepareState
}

interface RecordPageCustom {
  readonly runtime: AppRuntime
  currentItem: Item | null
  draftLocation?: LocationSnapshot
  draftPhotos: readonly PhotoAsset[]
  preparedShare: PreparedShareSnapshot | null
  shareCurrentFingerprint: string
  sharePrepareTimer: number | null
  sharePreparedSnapshotCache: Map<string, PreparedShareSnapshot>
  sharePreparationTasks: Map<string, Promise<PreparedShareSnapshot>>
  pageDisposed: boolean
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
  onUnload(): void
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent
  handlePickLocation(): Promise<void>
  handleClearDraftLocation(): void
  handleOpenLocation(): Promise<void>
  handlePhotoTap(): Promise<void>
  handleClearDraftPhoto(): void
  handleFieldInput(event: FieldInputEvent): void
  handleFieldSuggestionTap(event: FieldSuggestionEvent): void
  handleNoteInput(event: NoteInputEvent): void
  handleCreate(): Promise<void>
  handleEnterEdit(): void
  handleCancelEdit(): void
  handleSaveEdit(): Promise<void>
  handleDeleteItem(): Promise<void>
  handleOpenShare(): Promise<void>
  handleCloseShareFlow(): void
  handleToggleShareSelection(event: ShareSelectionToggleEvent): void
  handleRetrySharePreparation(): Promise<void>
}

type RecordPageInstance = WechatMiniprogram.Page.Instance<
  RecordPageData,
  RecordPageCustom
>

type FieldInputEvent = WechatMiniprogram.CustomEvent<
  {
    readonly value: string
  },
  WechatMiniprogram.IAnyObject,
  {
    readonly fieldKey?: SceneFieldKey
  }
>

type FieldSuggestionEvent = WechatMiniprogram.BaseEvent<
  WechatMiniprogram.IAnyObject,
  {
    readonly fieldKey?: SceneFieldKey
    readonly suggestionValue?: string
  }
>

type NoteInputEvent = WechatMiniprogram.CustomEvent<{
  readonly value: string
}>

type ShareSelectionToggleEvent = WechatMiniprogram.BaseEvent<
  WechatMiniprogram.IAnyObject,
  {
    readonly selectionKey?: string
  }
>

const DEFAULT_SCENE_TYPE: SceneType = 'default'
const SHARE_COVER_IMAGE_URL = '/assets/share/share-cover.png'

function resolveNavigationTitle(
  mode: RecordPageMode,
  sceneLabel: string,
  _shareFlowVisible: boolean
): string {
  if (mode === 'create') {
    return `记下${sceneLabel}`
  }

  if (mode === 'edit') {
    return `编辑${sceneLabel}`
  }

  return sceneLabel
}

function syncNavigationTitle(
  mode: RecordPageMode,
  sceneLabel: string,
  shareFlowVisible: boolean = false
): void {
  wx.setNavigationBarTitle({
    title: resolveNavigationTitle(mode, sceneLabel, shareFlowVisible),
  })
}

function getActiveLocation(page: RecordPageInstance): LocationSnapshot | undefined {
  return page.currentItem?.location ?? page.draftLocation
}

function getActivePhoto(page: RecordPageInstance): PhotoAsset | undefined {
  return page.currentItem?.photos[0] ?? page.draftPhotos[0]
}

function buildClosedShareState(): Pick<
  RecordPageData,
  | 'shareFlowVisible'
  | 'shareSelectionItems'
  | 'sharePrepareState'
> {
  return {
    shareFlowVisible: false,
    shareSelectionItems: [],
    sharePrepareState: 'idle',
  }
}

function clearSharePrepareTimer(page: RecordPageInstance): void {
  if (page.sharePrepareTimer !== null) {
    clearTimeout(page.sharePrepareTimer)
    page.sharePrepareTimer = null
  }
}

function clearSharePreparationArtifacts(
  page: RecordPageInstance,
  options: {
    readonly clearCache?: boolean
  } = {}
): void {
  clearSharePrepareTimer(page)
  page.shareCurrentFingerprint = ''
  page.preparedShare = null
  if (options.clearCache) {
    page.sharePreparedSnapshotCache.clear()
    page.sharePreparationTasks.clear()
  }
}

function resetShareState(page: RecordPageInstance): void {
  clearSharePreparationArtifacts(page)
  page.setData(buildClosedShareState())
  syncNavigationTitle(page.data.pageMode, page.data.sceneLabel, false)
}

function syncRecordState(
  page: RecordPageInstance,
  mode: RecordPageMode,
  sceneType: SceneType,
  anchorValues: SceneFieldValueMap,
  note: string
): void {
  const locationPresentation = buildLocationPresentation(getActiveLocation(page))
  const photoPresentation = buildPhotoPresentation(getActivePhoto(page), mode)
  const sceneLabel = getSceneLabel(sceneType)
  const nextFieldViews = buildFieldViews(sceneType, anchorValues)
  const hasFilledFields = nextFieldViews.some((fieldView) => fieldView.value.trim().length > 0)
  const hasNote = note.trim().length > 0

  syncNavigationTitle(mode, sceneLabel, page.data.shareFlowVisible)

  page.setData({
    pageMode: mode,
    isCreateMode: mode === 'create',
    isViewMode: mode === 'view',
    isEditMode: mode === 'edit',
    sceneType,
    sceneLabel,
    fieldViews: nextFieldViews,
    noteValue: note,
    noteLength: note.length,
    noteDisplayText: buildNoteDisplayText(note),
    hasNote,
    hasFilledFields,
    hasLocation: locationPresentation.hasLocation,
    locationTitle: locationPresentation.title,
    locationSubtitle: locationPresentation.subtitle,
    hasPhoto: photoPresentation.hasPhoto,
    photoPath: photoPresentation.photoPath,
    canCreate: mode === 'create' && locationPresentation.hasLocation,
    canSave: mode === 'edit',
    canAttachPhoto: mode === 'edit' && page.currentItem !== null && page.currentItem.photos.length === 0,
  })
}

function enterCreateMode(page: RecordPageInstance, sceneType: SceneType): void {
  page.currentItem = null
  page.draftLocation = undefined
  page.draftPhotos = []
  clearSharePreparationArtifacts(page, { clearCache: true })
  page.setData(buildClosedShareState())
  syncRecordState(page, 'create', sceneType, {}, '')
}

function enterViewMode(page: RecordPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  clearSharePreparationArtifacts(page, { clearCache: true })
  page.setData(buildClosedShareState())
  syncRecordState(page, 'view', item.sceneType, item.anchorValues, item.note)
}

function enterEditMode(page: RecordPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  clearSharePreparationArtifacts(page, { clearCache: true })
  page.setData(buildClosedShareState())
  syncRecordState(page, 'edit', item.sceneType, item.anchorValues, item.note)
}

function formatErrorMessage(error: unknown): string {
  const sanitizeUserFacingMessage = (message: string): string => {
    const trimmedMessage = message.trim()
    if (trimmedMessage.length === 0) {
      return '发生未知错误。'
    }

    const normalizedMessage = trimmedMessage
      .replace(/^cloud\.callFunction:fail\s*/i, '')
      .replace(/^requestid:\s*[^ ]+\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .split('\n')[0]
      .trim()

    if (normalizedMessage.length === 0) {
      return '发生未知错误。'
    }

    if (/Item\s+"[^"]+"\s+does not exist\./.test(normalizedMessage)) {
      return '记录不存在或已删除。'
    }

    if (/wxfile:\/\//i.test(normalizedMessage) || /\/Users\//.test(normalizedMessage)) {
      return '本地文件处理失败，请重试。'
    }

    return normalizedMessage
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

  if (
    error &&
    typeof error === 'object' &&
    'errMsg' in error &&
    typeof (error as { readonly errMsg?: unknown }).errMsg === 'string'
  ) {
    return sanitizeUserFacingMessage((error as { readonly errMsg: string }).errMsg)
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
      success: (result) => {
        resolve(result.confirm)
      },
      fail: (error) => {
        reject(error)
      },
    })
  })
}

async function openMiniProgramSetting(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wx.openSetting({
      success: () => resolve(),
      fail: (error) => reject(error),
    })
  })
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

async function offerOpenSettingIfNeeded(error: unknown): Promise<void> {
  if (!isMapError(error) || error.code !== 'location_permission_denied') {
    return
  }

  try {
    const shouldOpenSetting = await confirmAction(
      '需要位置权限',
      '开启位置权限后，可更顺畅地选择位置。是否前往设置？',
      '去设置'
    )

    if (shouldOpenSetting) {
      await openMiniProgramSetting()
    }
  } catch {
    // Ignore setting prompt failures.
  }
}

async function handleAsyncError(
  _page: RecordPageInstance,
  error: unknown,
  fallbackMessage: string
): Promise<void> {
  if (isMediaError(error) && error.code === 'photo_capture_cancelled') {
    return
  }

  if (isMapError(error) && error.code === 'location_pick_cancelled') {
    return
  }

  await offerOpenSettingIfNeeded(error)
  showToastMessage(`${fallbackMessage}${formatErrorMessage(error)}`)
}

async function runBusy<T>(
  page: RecordPageInstance,
  _busyText: string,
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

function readQueryString(
  options: WechatMiniprogram.IAnyObject,
  key: string
): string | undefined {
  return trimOptionalString(options[key])
}

async function redirectTo(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wx.redirectTo({
      url,
      success: () => resolve(),
      fail: (error) => reject(error),
    })
  })
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

  return Object.freeze(selectionItems)
}

function cloneShareSelectionItems(
  selectionItems: readonly ShareSelectionItemView[]
): readonly ShareSelectionItemView[] {
  return Object.freeze(selectionItems.map((selectionItem) => ({ ...selectionItem })))
}

function buildShareSelectionState(
  selectionItems: readonly ShareSelectionItemView[]
): Pick<RecordPageData, 'shareSelectionItems'> {
  return {
    shareSelectionItems: selectionItems,
  }
}

function buildShareSnapshotSelection(
  selectionItems: readonly ShareSelectionItemView[]
): ShareSnapshotSelection {
  const includedFieldKeys: SceneFieldKey[] = []
  let includePhoto = false
  let includeNote = false

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

    if (selectionItem.fieldKey) {
      includedFieldKeys.push(selectionItem.fieldKey)
    }
  }

  return Object.freeze({
    includePhoto,
    includedFieldKeys: Object.freeze(includedFieldKeys),
    includeNote,
  })
}

const SHARE_PREPARE_DEBOUNCE_MS = 320

function buildShareSelectionFingerprint(
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
    `fields:${sortedFieldKeys.join(',')}`,
  ].join('|')
}

function syncSharePrepareState(
  page: RecordPageInstance,
  sharePrepareState: SharePrepareState
): void {
  page.setData({
    sharePrepareState,
  })
}

function attachSharePreparationTask(
  page: RecordPageInstance,
  fingerprint: string,
  task: Promise<PreparedShareSnapshot>
): void {
  void task
    .then((preparedShare) => {
      if (page.pageDisposed) {
        return
      }

      page.sharePreparedSnapshotCache.set(fingerprint, preparedShare)
      if (!page.data.shareFlowVisible || page.shareCurrentFingerprint !== fingerprint) {
        return
      }

      page.preparedShare = preparedShare
      syncSharePrepareState(page, 'ready')
    })
    .catch(async (error) => {
      if (page.pageDisposed) {
        return
      }

      if (!page.data.shareFlowVisible || page.shareCurrentFingerprint !== fingerprint) {
        return
      }

      page.preparedShare = null
      syncSharePrepareState(page, 'failed')
      await handleAsyncError(page, error, '生成分享失败：')
    })
}

function startSharePreparationTask(
  page: RecordPageInstance,
  item: Item,
  selectionItems: readonly ShareSelectionItemView[],
  fingerprint: string
): void {
  const cachedPreparedShare = page.sharePreparedSnapshotCache.get(fingerprint)
  if (cachedPreparedShare) {
    page.preparedShare = cachedPreparedShare
    syncSharePrepareState(page, 'ready')
    return
  }

  const existingTask = page.sharePreparationTasks.get(fingerprint)
  if (existingTask) {
    page.preparedShare = null
    syncSharePrepareState(page, 'preparing')
    attachSharePreparationTask(page, fingerprint, existingTask)
    return
  }

  page.preparedShare = null
  syncSharePrepareState(page, 'preparing')

  const task = page.runtime
    .prepareShareSnapshot(item, buildShareSnapshotSelection(selectionItems))
    .finally(() => {
      page.sharePreparationTasks.delete(fingerprint)
    })

  page.sharePreparationTasks.set(fingerprint, task)
  attachSharePreparationTask(page, fingerprint, task)
}

function scheduleSharePreparation(
  page: RecordPageInstance,
  item: Item,
  selectionItems: readonly ShareSelectionItemView[],
  delayMs: number
): void {
  clearSharePrepareTimer(page)

  const fingerprint = buildShareSelectionFingerprint(item, selectionItems)
  page.shareCurrentFingerprint = fingerprint

  const cachedPreparedShare = page.sharePreparedSnapshotCache.get(fingerprint)
  if (cachedPreparedShare) {
    page.preparedShare = cachedPreparedShare
    syncSharePrepareState(page, 'ready')
    return
  }

  syncSharePrepareState(page, 'preparing')
  page.preparedShare = null

  const existingTask = page.sharePreparationTasks.get(fingerprint)
  if (existingTask) {
    attachSharePreparationTask(page, fingerprint, existingTask)
    return
  }

  page.sharePrepareTimer = setTimeout(() => {
    page.sharePrepareTimer = null
    if (page.pageDisposed || !page.data.shareFlowVisible || page.shareCurrentFingerprint !== fingerprint) {
      return
    }

    startSharePreparationTask(page, item, selectionItems, fingerprint)
  }, delayMs) as unknown as number
}

function openShareFlow(page: RecordPageInstance, item: Item): void {
  clearSharePreparationArtifacts(page)
  const selectionItems = buildShareSelectionItems(item)
  page.setData({
    shareFlowVisible: true,
    ...buildShareSelectionState(selectionItems),
    sharePrepareState: 'preparing',
  })
  scheduleSharePreparation(page, item, selectionItems, SHARE_PREPARE_DEBOUNCE_MS)
}

async function initializeRecordPage(
  page: RecordPageInstance,
  options: WechatMiniprogram.IAnyObject
): Promise<void> {
  const rawMode = readQueryString(options, 'mode')
  const rawSceneType = readQueryString(options, 'sceneType')
  const rawItemId = readQueryString(options, 'itemId')
  const resolvedMode: RecordPageMode =
    rawMode && isRecordPageMode(rawMode) ? rawMode : rawItemId ? 'view' : 'create'

  if (resolvedMode === 'create') {
    if (!rawSceneType || !isSceneType(rawSceneType)) {
      await redirectTo(FRONTEND_ROUTES.scene)
      return
    }

    enterCreateMode(page, rawSceneType)
    return
  }

  if (!rawItemId) {
    await redirectTo(FRONTEND_ROUTES.records)
    return
  }

  const item = await runBusy(page, '读取记录', async () =>
    page.runtime.getItem(rawItemId)
  )

  if (!item) {
    wx.showToast({
      title: '记录不存在或已删除',
      icon: 'none',
      duration: 1800,
    })
    await redirectTo(FRONTEND_ROUTES.records)
    return
  }

  if (resolvedMode === 'edit') {
    enterEditMode(page, item)
    return
  }

  enterViewMode(page, item)
}

const initialData: RecordPageData = {
  pageReady: false,
  busy: false,
  pageMode: 'create',
  isCreateMode: true,
  isViewMode: false,
  isEditMode: false,
  sceneType: DEFAULT_SCENE_TYPE,
  sceneLabel: getSceneLabel(DEFAULT_SCENE_TYPE),
  fieldViews: buildFieldViews(DEFAULT_SCENE_TYPE, {}),
  noteValue: '',
  noteLength: 0,
  noteDisplayText: '',
  hasNote: false,
  hasFilledFields: false,
  hasLocation: false,
  locationTitle: '选一个位置',
  locationSubtitle: '',
  hasPhoto: false,
  photoPath: '',
  canCreate: false,
  canSave: false,
  canAttachPhoto: false,
  ...buildClosedShareState(),
}

Page<RecordPageData, RecordPageCustom>({
  data: initialData,

  runtime: appRuntime,
  currentItem: null,
  draftLocation: undefined,
  draftPhotos: [],
  preparedShare: null,
  shareCurrentFingerprint: '',
  sharePrepareTimer: null,
  sharePreparedSnapshotCache: new Map(),
  sharePreparationTasks: new Map(),
  pageDisposed: false,

  async onLoad(options) {
    this.pageDisposed = false
    this.shareCurrentFingerprint = ''
    this.sharePrepareTimer = null
    this.sharePreparedSnapshotCache = new Map()
    this.sharePreparationTasks = new Map()
    this.preparedShare = null
    try {
      await initializeRecordPage(this, options)
      this.setData({
        pageReady: true,
      })
    } catch (error) {
      await handleAsyncError(this, error, '页面初始化失败：')
      this.setData({
        pageReady: true,
      })
    }
  },

  onUnload() {
    this.pageDisposed = true
    clearSharePreparationArtifacts(this, { clearCache: true })
  },

  onShareAppMessage() {
    const preparedShare = this.preparedShare
    if (!preparedShare) {
      return {
        title: this.data.sceneLabel,
        path: FRONTEND_ROUTES.scene,
      }
    }

    return {
      title: '分享快照',
      path: this.runtime.buildSharePath(preparedShare.shareId),
      imageUrl: SHARE_COVER_IMAGE_URL,
    }
  },

  async handlePickLocation() {
    if (this.data.busy) {
      return
    }

    if (!this.data.isCreateMode) {
      showToastMessage('位置已固定')
      return
    }

    try {
      const location = await runBusy(this, '打开地图', async () =>
        this.runtime.pickLocation('manual', undefined, {
          centerOnCurrentLocation: true,
        })
      )

      this.draftLocation = location
      syncRecordState(
        this,
        'create',
        this.data.sceneType,
        extractAnchorValues(this.data.fieldViews),
        this.data.noteValue
      )
    } catch (error) {
      await handleAsyncError(this, error, '选取位置失败：')
    }
  },

  async handleOpenLocation() {
    if (this.data.busy) {
      return
    }

    const activeLocation = getActiveLocation(this)
    if (!activeLocation) {
      showToastMessage('请先选位置')
      return
    }

    try {
      await this.runtime.openLocation(activeLocation)
    } catch (error) {
      await handleAsyncError(this, error, '打开地图失败：')
    }
  },

  async handlePhotoTap() {
    if (this.data.busy) {
      return
    }

    const activePhoto = getActivePhoto(this)
    if (activePhoto) {
      try {
        await previewPhoto(activePhoto.localPath)
      } catch (error) {
        await handleAsyncError(this, error, '打开照片失败：')
      }
      return
    }

    if (this.data.isCreateMode) {
      try {
        const photo = await runBusy(this, '拍照', async () =>
          this.runtime.capturePhoto()
        )

        this.draftPhotos = [photo]
        syncRecordState(
          this,
          'create',
          this.data.sceneType,
          extractAnchorValues(this.data.fieldViews),
          this.data.noteValue
        )
      } catch (error) {
        await handleAsyncError(this, error, '拍照失败：')
      }

      return
    }

    if (!this.data.isEditMode || !this.currentItem) {
      showToastMessage('请先点击编辑，再添加照片')
      return
    }

    if (this.currentItem.photos.length > 0) {
      showToastMessage('已有照片')
      return
    }

    try {
      const photo = await runBusy(this, '拍照', async () =>
        this.runtime.capturePhoto()
      )

      this.draftPhotos = [photo]
      syncRecordState(
        this,
        'edit',
        this.currentItem.sceneType,
        extractAnchorValues(this.data.fieldViews),
        this.data.noteValue
      )
    } catch (error) {
      await handleAsyncError(this, error, '编辑照片失败：')
    }
  },

  handleClearDraftPhoto() {
    if (this.data.busy) {
      return
    }

    if (!this.data.isCreateMode && (!this.data.isEditMode || !this.currentItem)) {
      return
    }

    this.draftPhotos = []
    syncRecordState(
      this,
      this.data.isCreateMode ? 'create' : 'edit',
      this.currentItem?.sceneType ?? this.data.sceneType,
      extractAnchorValues(this.data.fieldViews),
      this.data.noteValue
    )
  },

  handleClearDraftLocation() {
    if (!this.data.isCreateMode || this.data.busy) {
      return
    }

    this.draftLocation = undefined
    syncRecordState(
      this,
      'create',
      this.data.sceneType,
      extractAnchorValues(this.data.fieldViews),
      this.data.noteValue
    )
  },

  handleFieldInput(event) {
    const fieldKey = event.currentTarget.dataset.fieldKey
    if (!fieldKey || this.data.isViewMode) {
      return
    }

    this.setData({
      fieldViews: updateFieldViewsByKey(
        this.data.sceneType,
        this.data.fieldViews,
        fieldKey,
        event.detail.value
      ),
    })
  },

  handleFieldSuggestionTap(event) {
    if (this.data.busy || this.data.isViewMode) {
      return
    }

    const fieldKey = event.currentTarget.dataset.fieldKey
    const suggestionValue = event.currentTarget.dataset.suggestionValue
    if (!fieldKey || typeof suggestionValue !== 'string') {
      return
    }

    this.setData({
      fieldViews: updateFieldViewsByKey(
        this.data.sceneType,
        this.data.fieldViews,
        fieldKey,
        suggestionValue
      ),
    })
  },

  handleNoteInput(event) {
    if (this.data.isViewMode) {
      return
    }

    this.setData({
      noteValue: event.detail.value,
      noteLength: event.detail.value.length,
    })
  },

  async handleCreate() {
    if (this.data.busy) {
      return
    }

    if (!this.data.isCreateMode) {
      return
    }

    if (!this.draftLocation) {
      showToastMessage('请先选位置')
      return
    }

    try {
      const createdItem = await runBusy(this, '创建', async () =>
        this.runtime.create({
          sceneType: this.data.sceneType,
          location: this.draftLocation as LocationSnapshot,
          anchorValues: sanitizeSceneFieldValues(
            this.data.sceneType,
            extractAnchorValues(this.data.fieldViews)
          ),
          note: this.data.noteValue,
          photos: this.draftPhotos,
        })
      )

      await redirectTo(
        buildRecordsUrl({
          focusItemId: createdItem.id,
          entryState: 'created',
        })
      )
    } catch (error) {
      await handleAsyncError(this, error, '创建失败：')
    }
  },

  handleEnterEdit() {
    if (this.data.busy) {
      return
    }

    if (!this.currentItem) {
      return
    }

    enterEditMode(this, this.currentItem)
  },

  handleCancelEdit() {
    if (this.data.busy) {
      return
    }

    if (!this.currentItem) {
      return
    }

    enterViewMode(this, this.currentItem)
  },

  async handleSaveEdit() {
    if (this.data.busy) {
      return
    }

    if (!this.currentItem || !this.data.isEditMode) {
      showToastMessage('还没改动')
      return
    }

    try {
      const updatedItem = await runBusy(this, '保存', async () =>
        this.runtime.saveEdit(
          this.currentItem?.id ?? '',
          this.runtime.buildEditableInput(
            sanitizeSceneFieldValues(
              this.currentItem?.sceneType ?? this.data.sceneType,
              extractAnchorValues(this.data.fieldViews)
            ),
            this.data.noteValue
          ),
          this.draftPhotos[0]
        )
      )

      enterViewMode(this, updatedItem)
    } catch (error) {
      await handleAsyncError(this, error, '保存失败：')
    }
  },

  async handleDeleteItem() {
    if (this.data.busy) {
      return
    }

    if (!this.currentItem) {
      return
    }

    try {
      const shouldDelete = await confirmAction(
        '删掉这条？',
        '照片也会一起删掉。',
        '删掉'
      )

      if (!shouldDelete) {
        return
      }

      const deletedItemId = this.currentItem.id

      await runBusy(this, '删除', async () => {
        await this.runtime.deleteItem(deletedItemId)
      })

      await redirectTo(FRONTEND_ROUTES.records)
    } catch (error) {
      await handleAsyncError(this, error, '删除记录失败：')
    }
  },

  async handleOpenShare() {
    if (this.data.busy || !this.data.isViewMode || !this.currentItem) {
      return
    }

    try {
      openShareFlow(this, this.currentItem)
    } catch (error) {
      await handleAsyncError(this, error, '打开分享失败：')
    }
  },

  handleCloseShareFlow() {
    if (!this.data.shareFlowVisible) {
      return
    }

    resetShareState(this)
  },

  handleToggleShareSelection(event) {
    if (this.data.busy || !this.data.shareFlowVisible || !this.currentItem) {
      return
    }

    const selectionKey = event.currentTarget.dataset.selectionKey
    if (typeof selectionKey !== 'string' || selectionKey.length === 0) {
      return
    }

    const nextSelectionItems = this.data.shareSelectionItems.map((selectionItem) =>
      selectionItem.key === selectionKey
        ? {
            ...selectionItem,
            checked: !selectionItem.checked,
          }
        : selectionItem
    )

    this.setData(buildShareSelectionState(nextSelectionItems))
    scheduleSharePreparation(
      this,
      this.currentItem,
      cloneShareSelectionItems(nextSelectionItems),
      SHARE_PREPARE_DEBOUNCE_MS
    )
  },

  async handleRetrySharePreparation() {
    if (this.data.busy || !this.data.shareFlowVisible || !this.currentItem) {
      return
    }

    const selectionItems = cloneShareSelectionItems(this.data.shareSelectionItems)
    scheduleSharePreparation(this, this.currentItem, selectionItems, 0)
  },
})
