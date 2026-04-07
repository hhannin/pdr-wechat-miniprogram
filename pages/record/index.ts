import type {
  Item,
  LocationSnapshot,
  PhotoAsset,
  PreparedShareSnapshot,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
  ShareSnapshotSelection,
  SharedImageState,
  SharedItem,
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

type ShareStep = 'select' | 'preview'
type ShareSelectionItemKind = 'photo' | 'field' | 'note'

interface ShareMandatoryItemView {
  readonly key: 'scene' | 'location'
  readonly label: string
  readonly value: string
  readonly helperText: string
}

interface ShareSelectionItemView {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly helperText: string
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
  readonly shareStep: ShareStep
  readonly shareMandatoryItems: readonly ShareMandatoryItemView[]
  readonly shareSelectionItems: readonly ShareSelectionItemView[]
  readonly shareHasSelectionItems: boolean
  readonly sharePreviewShareId: string
  readonly sharePreviewCardTitle: string
  readonly sharePreviewCardSubtitle: string
  readonly sharePreviewFieldViews: readonly FrontendFieldView[]
  readonly sharePreviewHasFields: boolean
  readonly sharePreviewHasLocation: boolean
  readonly sharePreviewLocationTitle: string
  readonly sharePreviewLocationSubtitle: string
  readonly sharePreviewHasPhoto: boolean
  readonly sharePreviewPhotoPath: string
  readonly sharePreviewImageState: SharedImageState
  readonly sharePreviewHasNote: boolean
  readonly sharePreviewNoteText: string
}

interface RecordPageCustom {
  readonly runtime: AppRuntime
  currentItem: Item | null
  draftLocation?: LocationSnapshot
  draftPhotos: readonly PhotoAsset[]
  preparedShare: PreparedShareSnapshot | null
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
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
  handleGenerateSharePreview(): Promise<void>
  handleReturnToShareSelection(): void
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

function resolveNavigationTitle(
  mode: RecordPageMode,
  sceneLabel: string,
  shareFlowVisible: boolean,
  shareStep: ShareStep
): string {
  if (shareFlowVisible) {
    return shareStep === 'preview' ? '预览分享' : '选择分享内容'
  }

  if (mode === 'create') {
    return `记下${sceneLabel}`
  }

  if (mode === 'edit') {
    return `补充${sceneLabel}`
  }

  return sceneLabel
}

function syncNavigationTitle(
  mode: RecordPageMode,
  sceneLabel: string,
  shareFlowVisible: boolean = false,
  shareStep: ShareStep = 'select'
): void {
  wx.setNavigationBarTitle({
    title: resolveNavigationTitle(mode, sceneLabel, shareFlowVisible, shareStep),
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
  | 'shareStep'
  | 'shareMandatoryItems'
  | 'shareSelectionItems'
  | 'shareHasSelectionItems'
  | 'sharePreviewShareId'
  | 'sharePreviewCardTitle'
  | 'sharePreviewCardSubtitle'
  | 'sharePreviewFieldViews'
  | 'sharePreviewHasFields'
  | 'sharePreviewHasLocation'
  | 'sharePreviewLocationTitle'
  | 'sharePreviewLocationSubtitle'
  | 'sharePreviewHasPhoto'
  | 'sharePreviewPhotoPath'
  | 'sharePreviewImageState'
  | 'sharePreviewHasNote'
  | 'sharePreviewNoteText'
> {
  return {
    shareFlowVisible: false,
    shareStep: 'select',
    shareMandatoryItems: [],
    shareSelectionItems: [],
    shareHasSelectionItems: false,
    sharePreviewShareId: '',
    sharePreviewCardTitle: '',
    sharePreviewCardSubtitle: '',
    sharePreviewFieldViews: [],
    sharePreviewHasFields: false,
    sharePreviewHasLocation: false,
    sharePreviewLocationTitle: '',
    sharePreviewLocationSubtitle: '',
    sharePreviewHasPhoto: false,
    sharePreviewPhotoPath: '',
    sharePreviewImageState: 'none',
    sharePreviewHasNote: false,
    sharePreviewNoteText: '',
  }
}

function resetShareState(page: RecordPageInstance): void {
  page.preparedShare = null
  page.setData(buildClosedShareState())
  syncNavigationTitle(page.data.pageMode, page.data.sceneLabel, false, 'select')
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

  syncNavigationTitle(mode, sceneLabel, page.data.shareFlowVisible, page.data.shareStep)

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
  page.preparedShare = null
  page.setData(buildClosedShareState())
  syncRecordState(page, 'create', sceneType, {}, '')
}

function enterViewMode(page: RecordPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  page.preparedShare = null
  page.setData(buildClosedShareState())
  syncRecordState(page, 'view', item.sceneType, item.anchorValues, item.note)
}

function enterEditMode(page: RecordPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  page.preparedShare = null
  page.setData(buildClosedShareState())
  syncRecordState(page, 'edit', item.sceneType, item.anchorValues, item.note)
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

function buildShareMandatoryItems(item: Item): readonly ShareMandatoryItemView[] {
  return Object.freeze([
    {
      key: 'scene',
      label: '场景',
      value: getSceneLabel(item.sceneType),
      helperText: '场景会始终被分享',
    },
    {
      key: 'location',
      label: '定位',
      value: item.location.name,
      helperText: '定位会始终被分享',
    },
  ])
}

function buildShareSelectionItems(item: Item): readonly ShareSelectionItemView[] {
  const selectionItems: ShareSelectionItemView[] = []
  const photo = item.photos[0]

  if (photo) {
    selectionItems.push({
      key: 'photo',
      label: '图片',
      value: '包含当前照片',
      helperText: '发送后可查看照片',
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
      value: fieldView.displayValue,
      helperText: '可按需隐藏这一项',
      checked: true,
      kind: 'field',
      fieldKey: fieldView.key,
    })
  }

  if (item.note.trim().length > 0) {
    selectionItems.push({
      key: 'note',
      label: '备注',
      value: item.note,
      helperText: '可按需隐藏备注',
      checked: true,
      kind: 'note',
    })
  }

  return Object.freeze(selectionItems)
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

function syncSharePreviewState(
  page: RecordPageInstance,
  previewItem: SharedItem,
  preparedShare: PreparedShareSnapshot
): void {
  const shareFieldViews = buildFieldViews(
    previewItem.sceneType,
    previewItem.anchorValues
  ).filter((fieldView) => fieldView.value.trim().length > 0)
  const locationPresentation = buildLocationPresentation(previewItem.location)
  const photoPresentation = buildPhotoPresentation(previewItem.photos[0], 'view')

  page.setData({
    shareFlowVisible: true,
    shareStep: 'preview',
    sharePreviewShareId: preparedShare.shareId,
    sharePreviewCardTitle: preparedShare.shareCardTitle,
    sharePreviewCardSubtitle: preparedShare.shareCardSubtitle,
    sharePreviewFieldViews: shareFieldViews,
    sharePreviewHasFields: shareFieldViews.length > 0,
    sharePreviewHasLocation: locationPresentation.hasLocation,
    sharePreviewLocationTitle: locationPresentation.title,
    sharePreviewLocationSubtitle: locationPresentation.subtitle,
    sharePreviewHasPhoto: photoPresentation.hasPhoto,
    sharePreviewPhotoPath: photoPresentation.photoPath,
    sharePreviewImageState: photoPresentation.hasPhoto ? 'ready' : 'none',
    sharePreviewHasNote: previewItem.note.trim().length > 0,
    sharePreviewNoteText: buildNoteDisplayText(previewItem.note),
  })

  syncNavigationTitle(page.data.pageMode, page.data.sceneLabel, true, 'preview')
}

function openShareFlow(page: RecordPageInstance, item: Item): void {
  page.preparedShare = null
  page.setData({
    shareFlowVisible: true,
    shareStep: 'select',
    shareMandatoryItems: buildShareMandatoryItems(item),
    shareSelectionItems: buildShareSelectionItems(item),
    shareHasSelectionItems: buildShareSelectionItems(item).length > 0,
    sharePreviewShareId: '',
    sharePreviewCardTitle: '',
    sharePreviewCardSubtitle: '',
    sharePreviewFieldViews: [],
    sharePreviewHasFields: false,
    sharePreviewHasLocation: false,
    sharePreviewLocationTitle: '',
    sharePreviewLocationSubtitle: '',
    sharePreviewHasPhoto: false,
    sharePreviewPhotoPath: '',
    sharePreviewImageState: 'none',
    sharePreviewHasNote: false,
    sharePreviewNoteText: '',
  })
  syncNavigationTitle(page.data.pageMode, page.data.sceneLabel, true, 'select')
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

  async onLoad(options) {
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

  onShareAppMessage() {
    const preparedShare = this.preparedShare
    if (!preparedShare) {
      return {
        title: this.data.sceneLabel,
        path: FRONTEND_ROUTES.scene,
      }
    }

    return {
      title: preparedShare.shareCardTitle,
      path: this.runtime.buildSharePath(preparedShare.shareId),
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
      showToastMessage('请先点击补充，再添加照片')
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
      await handleAsyncError(this, error, '补充照片失败：')
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
      const shouldContinue = await confirmAction(
        '分享前提醒',
        '隐私信息请勿分享给陌生人。你可以在下一步选择具体分享哪些内容。',
        '继续'
      )

      if (!shouldContinue) {
        return
      }

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
    if (this.data.busy || !this.data.shareFlowVisible || this.data.shareStep !== 'select') {
      return
    }

    const selectionKey = event.currentTarget.dataset.selectionKey
    if (typeof selectionKey !== 'string' || selectionKey.length === 0) {
      return
    }

    this.setData({
      shareSelectionItems: this.data.shareSelectionItems.map((selectionItem) =>
        selectionItem.key === selectionKey
          ? {
              ...selectionItem,
              checked: !selectionItem.checked,
            }
          : selectionItem
      ),
    })
  },

  async handleGenerateSharePreview() {
    if (
      this.data.busy ||
      !this.data.shareFlowVisible ||
      this.data.shareStep !== 'select' ||
      !this.currentItem
    ) {
      return
    }

    try {
      const preparedShare = await runBusy(this, '生成分享', async () =>
        this.runtime.prepareShareSnapshot(
          this.currentItem as Item,
          buildShareSnapshotSelection(this.data.shareSelectionItems)
        )
      )

      this.preparedShare = preparedShare
      syncSharePreviewState(this, preparedShare.previewItem, preparedShare)
    } catch (error) {
      await handleAsyncError(this, error, '生成分享失败：')
    }
  },

  handleReturnToShareSelection() {
    if (!this.data.shareFlowVisible || this.data.shareStep !== 'preview') {
      return
    }

    this.setData({
      shareStep: 'select',
    })
    syncNavigationTitle(this.data.pageMode, this.data.sceneLabel, true, 'select')
  },
})
