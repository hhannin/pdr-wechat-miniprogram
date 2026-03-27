import type {
  Item,
  LocationSnapshot,
  PhotoAsset,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
} from '../../core/types/index'
import { isSceneType, sanitizeSceneFieldValues } from '../../core/scene/index'
import { isMapError } from '../../infra/map/index'
import { isMediaError } from '../../infra/media/index'
import { frontendRuntime, type DebugRuntime } from '../common/runtime'
import {
  buildFieldViews,
  buildLocationPresentation,
  buildNoteDisplayText,
  buildPhotoPresentation,
  extractAnchorValues,
  formatTimestamp,
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
} from '../index/frontend-config'

interface RecordPageData {
  readonly pageReady: boolean
  readonly busy: boolean
  readonly busyText: string
  readonly statusText: string
  readonly errorText: string
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
  readonly hasLocation: boolean
  readonly locationTitle: string
  readonly locationSubtitle: string
  readonly locationSourceText: string
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly photoMeta: string
  readonly createdAtText: string
  readonly updatedAtText: string
  readonly canCreate: boolean
  readonly canSave: boolean
  readonly canAttachPhoto: boolean
}

interface RecordPageCustom {
  readonly runtime: DebugRuntime
  currentItem: Item | null
  draftLocation?: LocationSnapshot
  draftPhotos: readonly PhotoAsset[]
  onLoad(options: WechatMiniprogram.IAnyObject): Promise<void>
  handlePickLocation(): Promise<void>
  handleClearDraftLocation(): void
  handleOpenLocation(): Promise<void>
  handleCapturePhoto(): Promise<void>
  handleClearDraftPhoto(): void
  handleFieldInput(event: FieldInputEvent): void
  handleFieldSuggestionTap(event: FieldSuggestionEvent): void
  handleNoteInput(event: NoteInputEvent): void
  handleCreate(): Promise<void>
  handleEnterEdit(): void
  handleCancelEdit(): void
  handleSaveEdit(): Promise<void>
  handleDeleteItem(): Promise<void>
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

const DEFAULT_SCENE_TYPE: SceneType = 'default'

function setFeedback(
  page: RecordPageInstance,
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

function clearFeedback(page: RecordPageInstance): void {
  page.setData({
    statusText: '',
    errorText: '',
  })
}

function getActiveLocation(page: RecordPageInstance): LocationSnapshot | undefined {
  return page.currentItem?.location ?? page.draftLocation
}

function getActivePhoto(page: RecordPageInstance): PhotoAsset | undefined {
  return page.currentItem?.photos[0] ?? page.draftPhotos[0]
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

  page.setData({
    pageMode: mode,
    isCreateMode: mode === 'create',
    isViewMode: mode === 'view',
    isEditMode: mode === 'edit',
    sceneType,
    sceneLabel,
    fieldViews: buildFieldViews(sceneType, anchorValues),
    noteValue: note,
    noteLength: note.length,
    noteDisplayText: buildNoteDisplayText(note),
    hasLocation: locationPresentation.hasLocation,
    locationTitle: locationPresentation.title,
    locationSubtitle: locationPresentation.subtitle,
    locationSourceText: locationPresentation.sourceText,
    hasPhoto: photoPresentation.hasPhoto,
    photoPath: photoPresentation.photoPath,
    photoMeta: photoPresentation.photoMeta,
    createdAtText: page.currentItem ? formatTimestamp(page.currentItem.createdAt) : '',
    updatedAtText: page.currentItem ? formatTimestamp(page.currentItem.updatedAt) : '',
    canCreate: mode === 'create' && locationPresentation.hasLocation,
    canSave: mode === 'edit',
    canAttachPhoto: mode === 'edit' && page.currentItem !== null && page.currentItem.photos.length === 0,
  })
}

function enterCreateMode(page: RecordPageInstance, sceneType: SceneType): void {
  page.currentItem = null
  page.draftLocation = undefined
  page.draftPhotos = []
  syncRecordState(page, 'create', sceneType, {}, '')
}

function enterViewMode(page: RecordPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  syncRecordState(page, 'view', item.sceneType, item.anchorValues, item.note)
}

function enterEditMode(page: RecordPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  syncRecordState(page, 'edit', item.sceneType, item.anchorValues, item.note)
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

async function offerOpenSettingIfNeeded(error: unknown): Promise<void> {
  if (!isMapError(error) || error.code !== 'location_permission_denied') {
    return
  }

  try {
    const shouldOpenSetting = await confirmAction(
      '需要位置权限',
      '地图选点需要位置权限，是否立即打开小程序设置？',
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
  page: RecordPageInstance,
  error: unknown,
  fallbackMessage: string
): Promise<void> {
  if (isMediaError(error) && error.code === 'photo_capture_cancelled') {
    setFeedback(page, {
      statusText: '已取消拍照',
      errorText: '',
    })
    return
  }

  if (isMapError(error) && error.code === 'location_pick_cancelled') {
    setFeedback(page, {
      statusText: '已取消选点',
      errorText: '',
    })
    return
  }

  console.error(error)
  await offerOpenSettingIfNeeded(error)

  setFeedback(page, {
    statusText: '',
    errorText: `${fallbackMessage}${formatErrorMessage(error)}`,
  })
}

async function runBusy<T>(
  page: RecordPageInstance,
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
  busyText: '',
  statusText: '',
  errorText: '',
  pageMode: 'create',
  isCreateMode: true,
  isViewMode: false,
  isEditMode: false,
  sceneType: DEFAULT_SCENE_TYPE,
  sceneLabel: getSceneLabel(DEFAULT_SCENE_TYPE),
  fieldViews: buildFieldViews(DEFAULT_SCENE_TYPE, {}),
  noteValue: '',
  noteLength: 0,
  noteDisplayText: '暂无备注',
  hasLocation: false,
  locationTitle: '地图选点',
  locationSubtitle: '',
  locationSourceText: '',
  hasPhoto: false,
  photoPath: '',
  photoMeta: '还没有照片',
  createdAtText: '',
  updatedAtText: '',
  canCreate: false,
  canSave: false,
  canAttachPhoto: false,
}

Page<RecordPageData, RecordPageCustom>({
  data: initialData,

  runtime: frontendRuntime,
  currentItem: null,
  draftLocation: undefined,
  draftPhotos: [],

  async onLoad(options) {
    clearFeedback(this)

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

  async handlePickLocation() {
    if (this.data.busy) {
      return
    }

    if (!this.data.isCreateMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '位置已固定',
      })
      return
    }

    clearFeedback(this)

    try {
      const hadLocation = Boolean(this.draftLocation)
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

      setFeedback(this, {
        statusText: hadLocation ? '位置已更新' : '位置已选',
        errorText: '',
      })
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
      setFeedback(this, {
        statusText: '',
        errorText: '请先选位置',
      })
      return
    }

    clearFeedback(this)

    try {
      await this.runtime.openLocation(activeLocation)
      setFeedback(this, {
        statusText: '已打开地图',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '打开地图失败：')
    }
  },

  async handleCapturePhoto() {
    if (this.data.busy) {
      return
    }

    clearFeedback(this)

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

        setFeedback(this, {
          statusText: '照片已加入',
          errorText: '',
        })
      } catch (error) {
        await handleAsyncError(this, error, '拍照失败：')
      }

      return
    }

    if (!this.data.isEditMode || !this.currentItem) {
      setFeedback(this, {
        statusText: '',
        errorText: '当前不可补照片',
      })
      return
    }

    if (this.currentItem.photos.length > 0) {
      setFeedback(this, {
        statusText: '',
        errorText: '已有照片',
      })
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

      setFeedback(this, {
        statusText: '照片已加入',
        errorText: '',
      })
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

    setFeedback(this, {
      statusText: '已移除照片',
      errorText: '',
    })
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

    setFeedback(this, {
      statusText: '已移除位置',
      errorText: '',
    })
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
    if (!this.data.isCreateMode) {
      return
    }

    if (!this.draftLocation) {
      setFeedback(this, {
        statusText: '',
        errorText: '请先选位置',
      })
      return
    }

    clearFeedback(this)

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
    if (!this.currentItem) {
      return
    }

    clearFeedback(this)
    enterEditMode(this, this.currentItem)
  },

  handleCancelEdit() {
    if (!this.currentItem) {
      return
    }

    clearFeedback(this)
    enterViewMode(this, this.currentItem)
  },

  async handleSaveEdit() {
    if (!this.currentItem || !this.data.isEditMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '暂无可保存内容',
      })
      return
    }

    clearFeedback(this)

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
      setFeedback(this, {
        statusText: '已保存',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '保存失败：')
    }
  },

  async handleDeleteItem() {
    if (!this.currentItem) {
      return
    }

    try {
      const shouldDelete = await confirmAction(
        '删除',
        '会同时删除本地照片。',
        '删除'
      )

      if (!shouldDelete) {
        setFeedback(this, {
          statusText: '已取消',
          errorText: '',
        })
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
})
