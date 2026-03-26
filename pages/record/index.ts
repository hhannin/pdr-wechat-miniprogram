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
  getSceneDescription,
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
  readonly sceneDescription: string
  readonly pageTitle: string
  readonly pageSubtitle: string
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
  readonly recordId: string
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
  handlePickCurrentLocation(): Promise<void>
  handlePickManualLocation(): Promise<void>
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
  const hasPhoto = page.currentItem?.photos.length ? page.currentItem.photos.length > 0 : page.draftPhotos.length > 0

  page.setData({
    pageMode: mode,
    isCreateMode: mode === 'create',
    isViewMode: mode === 'view',
    isEditMode: mode === 'edit',
    sceneType,
    sceneLabel,
    sceneDescription: getSceneDescription(sceneType),
    pageTitle:
      mode === 'create'
        ? `创建${sceneLabel}记录`
        : mode === 'edit'
          ? '编辑可变字段'
          : page.currentItem?.location.name ?? `${sceneLabel}记录`,
    pageSubtitle:
      mode === 'create'
        ? '位置是唯一必填项，其余线索可按需补充后再保存。'
        : mode === 'edit'
          ? hasPhoto
            ? '场景、位置、时间和照片已固化；当前可继续编辑场景字段和备注。'
            : '场景、位置和时间已固化；当前可编辑场景字段、备注，并补一张照片。'
          : '现在可以直接查看地点线索、打开导航，或进入编辑态调整可变字段。',
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
    recordId: page.currentItem?.id ?? '',
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
      statusText: '已取消拍照。',
      errorText: '',
    })
    return
  }

  if (isMapError(error) && error.code === 'location_pick_cancelled') {
    setFeedback(page, {
      statusText: '已取消地图选点。',
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

  const item = await runBusy(page, '正在读取记录详情', async () =>
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
  sceneDescription: getSceneDescription(DEFAULT_SCENE_TYPE),
  pageTitle: '创建记录',
  pageSubtitle: '位置是唯一必填项，其余线索可按需补充后再保存。',
  fieldViews: buildFieldViews(DEFAULT_SCENE_TYPE, {}),
  noteValue: '',
  noteLength: 0,
  noteDisplayText: '还没有补充备注。',
  hasLocation: false,
  locationTitle: '尚未选择位置',
  locationSubtitle: '位置必须通过地图选点确认，不能自动记录。',
  locationSourceText: '',
  hasPhoto: false,
  photoPath: '',
  photoMeta: '照片不是必填项；如果现在不拍，创建后仍可以补一张，但补上后不可更换。',
  recordId: '',
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

  async handlePickCurrentLocation() {
    if (!this.data.isCreateMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '位置在创建后不可修改。',
      })
      return
    }

    clearFeedback(this)

    try {
      const location = await runBusy(this, '正在打开地图选点', async () =>
        this.runtime.pickLocation('current', this.draftLocation)
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
        statusText: '位置已选择，可以继续补充信息或直接创建。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '选取位置失败：')
    }
  },

  async handlePickManualLocation() {
    if (!this.data.isCreateMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '位置在创建后不可修改。',
      })
      return
    }

    clearFeedback(this)

    try {
      const location = await runBusy(this, '正在打开地图选点', async () =>
        this.runtime.pickLocation('manual', this.draftLocation)
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
        statusText: '位置已更新。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '选取位置失败：')
    }
  },

  async handleOpenLocation() {
    const activeLocation = getActiveLocation(this)
    if (!activeLocation) {
      setFeedback(this, {
        statusText: '',
        errorText: '请先选择位置。',
      })
      return
    }

    clearFeedback(this)

    try {
      await this.runtime.openLocation(activeLocation)
      setFeedback(this, {
        statusText: '已尝试打开微信地图。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '打开地图失败：')
    }
  },

  async handleCapturePhoto() {
    clearFeedback(this)

    if (this.data.isCreateMode) {
      try {
        const photo = await runBusy(this, '正在调用相机拍照', async () =>
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
          statusText: '照片已加入创建草稿，保存后会固化到本地目录。',
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
        errorText: '当前状态不能补充照片。',
      })
      return
    }

    if (this.currentItem.photos.length > 0) {
      setFeedback(this, {
        statusText: '',
        errorText: '该记录已有照片，当前不支持更换。',
      })
      return
    }

    try {
      const updatedItem = await runBusy(this, '正在补充线索照片', async () => {
        const photo = await this.runtime.capturePhoto()
        return this.runtime.attachPhotoIfAbsent(this.currentItem?.id ?? '', photo)
      })

      enterEditMode(this, updatedItem)
      setFeedback(this, {
        statusText: '照片已补充并固化到本地存储。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '补充照片失败：')
    }
  },

  handleClearDraftPhoto() {
    if (!this.data.isCreateMode) {
      return
    }

    this.draftPhotos = []
    syncRecordState(
      this,
      'create',
      this.data.sceneType,
      extractAnchorValues(this.data.fieldViews),
      this.data.noteValue
    )

    setFeedback(this, {
      statusText: '已移除创建前照片。',
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
        errorText: '创建前必须先选位置。',
      })
      return
    }

    clearFeedback(this)

    try {
      const createdItem = await runBusy(this, '正在创建记录', async () =>
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
        errorText: '当前没有可保存的编辑内容。',
      })
      return
    }

    clearFeedback(this)

    try {
      const updatedItem = await runBusy(this, '正在保存修改', async () =>
        this.runtime.updateEditableFields(
          this.currentItem?.id ?? '',
          this.runtime.buildEditableInput(
            sanitizeSceneFieldValues(
              this.currentItem?.sceneType ?? this.data.sceneType,
              extractAnchorValues(this.data.fieldViews)
            ),
            this.data.noteValue
          )
        )
      )

      enterViewMode(this, updatedItem)
      setFeedback(this, {
        statusText: '修改已保存，不可变字段保持不变。',
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
        '删除记录',
        '删除后会同时移除本地 JSON 和该记录下的照片文件。',
        '删除'
      )

      if (!shouldDelete) {
        setFeedback(this, {
          statusText: '已取消删除。',
          errorText: '',
        })
        return
      }

      const deletedItemId = this.currentItem.id

      await runBusy(this, '正在删除记录', async () => {
        await this.runtime.deleteItem(deletedItemId)
      })

      await redirectTo(FRONTEND_ROUTES.records)
    } catch (error) {
      await handleAsyncError(this, error, '删除记录失败：')
    }
  },
})
