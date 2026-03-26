import type {
  Item,
  ItemSummary,
  LocationSnapshot,
  PhotoAsset,
  SceneFieldControl,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
} from '../../core/types'
import {
  getSceneFieldDefinitions,
  listSceneDefinitions,
  sanitizeSceneFieldValues,
} from '../../core/scene'
import { isMapError } from '../../infra/map'
import { isMediaError } from '../../infra/media'
import { debugRuntime, type DebugRuntime } from './debug-runtime'

interface DebugSceneOption {
  readonly value: SceneType
  readonly label: string
  readonly description: string
}

interface DebugSuggestionView {
  readonly value: string
  readonly label: string
  readonly isActive: boolean
}

interface DebugFieldView {
  readonly key: SceneFieldKey
  readonly label: string
  readonly description: string
  readonly required: boolean
  readonly primary: boolean
  readonly control: SceneFieldControl
  readonly value: string
  readonly isEmpty: boolean
  readonly placeholder: string
  readonly maxLength: number
  readonly suggestions: readonly DebugSuggestionView[]
}

interface DebugRecentItemView {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly meta: string
  readonly anchorsText: string
  readonly noteText: string
  readonly coverPhotoPath: string
  readonly hasPhoto: boolean
  readonly isActive: boolean
}

interface IndexPageData {
  readonly pageReady: boolean
  readonly busy: boolean
  readonly busyText: string
  readonly statusText: string
  readonly errorText: string
  readonly isEditMode: boolean
  readonly editorTitle: string
  readonly editorHint: string
  readonly sceneOptions: readonly DebugSceneOption[]
  readonly selectedSceneIndex: number
  readonly sceneDescription: string
  readonly draftFieldViews: readonly DebugFieldView[]
  readonly noteValue: string
  readonly noteLength: number
  readonly hasLocation: boolean
  readonly locationTitle: string
  readonly locationSubtitle: string
  readonly locationSourceText: string
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly photoMeta: string
  readonly recentItems: readonly DebugRecentItemView[]
  readonly selectedItemId: string
  readonly selectedItemCreatedAt: string
  readonly selectedItemUpdatedAt: string
  readonly selectedItemDebugJson: string
  readonly canCreate: boolean
  readonly canSaveEdit: boolean
}

interface IndexPageCustom {
  runtime: DebugRuntime
  draftLocation?: LocationSnapshot
  draftPhotos: readonly PhotoAsset[]
  currentItem: Item | null
  onLoad(): Promise<void>
  handleRefreshTap(): Promise<void>
  handleSceneChange(event: PickerChangeEvent): void
  handleFieldInput(event: InputEvent<FieldDataset>): void
  handleFieldSuggestionTap(event: TapEvent<FieldSuggestionDataset>): void
  handleNoteInput(event: InputEvent): void
  handlePickCurrentLocation(): Promise<void>
  handlePickManualLocation(): Promise<void>
  handleOpenLocation(): Promise<void>
  handleCapturePhoto(): Promise<void>
  handleClearDraftPhoto(): void
  handleCreate(): Promise<void>
  handleSelectRecentItem(event: TapEvent<ItemDataset>): Promise<void>
  handleStartNew(): void
  handleSaveEdit(): Promise<void>
  handleDeleteItem(): Promise<void>
}

type IndexPageInstance = WechatMiniprogram.Page.Instance<
  IndexPageData,
  IndexPageCustom
>

type PickerChangeEvent<
  Dataset extends WechatMiniprogram.IAnyObject = WechatMiniprogram.IAnyObject,
> = WechatMiniprogram.CustomEvent<
  {
    readonly value: string | number
  },
  WechatMiniprogram.IAnyObject,
  Dataset
>

type InputEvent<
  Dataset extends WechatMiniprogram.IAnyObject = WechatMiniprogram.IAnyObject,
> = WechatMiniprogram.CustomEvent<
  {
    readonly value: string
  },
  WechatMiniprogram.IAnyObject,
  Dataset
>

type TapEvent<
  Dataset extends WechatMiniprogram.IAnyObject = WechatMiniprogram.IAnyObject,
> = WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, Dataset>

interface FieldDataset extends WechatMiniprogram.IAnyObject {
  readonly fieldKey: SceneFieldKey
}

interface FieldSuggestionDataset extends FieldDataset {
  readonly suggestionValue: string
}

interface ItemDataset extends WechatMiniprogram.IAnyObject {
  readonly itemId: string
}

const SCENE_OPTIONS: readonly DebugSceneOption[] = listSceneDefinitions().map(
  (sceneDefinition) => ({
    value: sceneDefinition.type,
    label: sceneDefinition.label,
    description: sceneDefinition.description,
  })
)

const DEFAULT_SCENE_TYPE: SceneType = SCENE_OPTIONS[0]?.value ?? 'default'
const DEFAULT_FIELD_MAX_LENGTH = 40

function formatTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function formatByteLength(byteLength: number | undefined): string | undefined {
  if (typeof byteLength !== 'number' || !Number.isFinite(byteLength) || byteLength <= 0) {
    return undefined
  }

  if (byteLength < 1024) {
    return `${byteLength} B`
  }

  return `${(byteLength / 1024).toFixed(1)} KB`
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function normalizePickerIndex(rawValue: string | number, optionCount: number): number {
  const numericValue =
    typeof rawValue === 'number' ? rawValue : Number.parseInt(rawValue, 10)

  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue >= optionCount) {
    return 0
  }

  return numericValue
}

function getSceneIndex(sceneType: SceneType): number {
  const sceneIndex = SCENE_OPTIONS.findIndex((sceneOption) => sceneOption.value === sceneType)
  return sceneIndex >= 0 ? sceneIndex : 0
}

function getSceneTypeByIndex(index: number): SceneType {
  return SCENE_OPTIONS[index]?.value ?? DEFAULT_SCENE_TYPE
}

function getSceneDescription(sceneType: SceneType): string {
  return SCENE_OPTIONS[getSceneIndex(sceneType)]?.description ?? ''
}

function getSceneLabel(sceneType: SceneType): string {
  return SCENE_OPTIONS[getSceneIndex(sceneType)]?.label ?? sceneType
}

function buildFieldViews(
  sceneType: SceneType,
  anchorValues: SceneFieldValueMap
): readonly DebugFieldView[] {
  return getSceneFieldDefinitions(sceneType).map((fieldDefinition) => {
    const currentValue = anchorValues[fieldDefinition.key] ?? ''

    return {
      key: fieldDefinition.key,
      label: fieldDefinition.label,
      description: fieldDefinition.description ?? '',
      required: fieldDefinition.required,
      primary: fieldDefinition.primary,
      control: fieldDefinition.control,
      value: currentValue,
      isEmpty: currentValue.length === 0,
      placeholder:
        fieldDefinition.placeholder ??
        (fieldDefinition.control === 'hybrid'
          ? `可输入或点选${fieldDefinition.label}`
          : `请输入${fieldDefinition.label}`),
      maxLength: fieldDefinition.maxLength ?? DEFAULT_FIELD_MAX_LENGTH,
      suggestions: fieldDefinition.options.map((option) => ({
        value: option.value,
        label: option.label,
        isActive: currentValue === option.value,
      })),
    }
  })
}

function extractAnchorValues(fieldViews: readonly DebugFieldView[]): SceneFieldValueMap {
  const values: SceneFieldValueMap = {}

  for (const fieldView of fieldViews) {
    const normalizedValue = trimOptionalString(fieldView.value)
    if (normalizedValue) {
      values[fieldView.key] = normalizedValue
    }
  }

  return values
}

function updateFieldViewsByKey(
  fieldViews: readonly DebugFieldView[],
  fieldKey: SceneFieldKey,
  nextValue: string
): readonly DebugFieldView[] {
  return fieldViews.map((fieldView) => {
    if (fieldView.key !== fieldKey) {
      return fieldView
    }

    return {
      ...fieldView,
      value: nextValue,
      isEmpty: trimOptionalString(nextValue) === undefined,
      suggestions: fieldView.suggestions.map((suggestion) => ({
        ...suggestion,
        isActive: suggestion.value === nextValue,
      })),
    }
  })
}

function buildLocationPresentation(location: LocationSnapshot | undefined): {
  readonly hasLocation: boolean
  readonly title: string
  readonly subtitle: string
  readonly sourceText: string
} {
  if (!location) {
    return {
      hasLocation: false,
      title: '尚未选择位置',
      subtitle: '位置必须通过地图选点确认，不能自动记录。',
      sourceText: '',
    }
  }

  return {
    hasLocation: true,
    title: location.name,
    subtitle: location.address,
    sourceText:
      location.source === 'current' ? '来源：当前位置选点' : '来源：地图手动选点',
  }
}

function buildPhotoPresentation(
  photo: PhotoAsset | undefined,
  isEditMode: boolean
): {
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly photoMeta: string
} {
  if (!photo) {
    return {
      hasPhoto: false,
      photoPath: '',
      photoMeta: isEditMode
        ? '该记录当前没有照片，可在编辑阶段补一张；补上后不可再更换。'
        : '创建前可反复重拍；若创建时未拍，创建后仍可补一张，但补上后不可更换。',
    }
  }

  const metaParts = [
    trimOptionalString(photo.fileName),
    formatByteLength(photo.byteLength),
    typeof photo.width === 'number' && typeof photo.height === 'number'
      ? `${photo.width} × ${photo.height}`
      : undefined,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0)

  return {
    hasPhoto: true,
    photoPath: photo.localPath,
    photoMeta: metaParts.join(' · '),
  }
}

function buildRecentItemViews(
  summaries: readonly ItemSummary[],
  activeItemId: string
): readonly DebugRecentItemView[] {
  return summaries.map((summary) => ({
    id: summary.id,
    title: summary.locationName,
    subtitle: summary.address,
    meta: `${formatTimestamp(summary.updatedAt)} · ${getSceneLabel(summary.sceneType)}`,
    anchorsText:
      summary.primaryAnchors.length > 0
        ? summary.primaryAnchors.join(' · ')
        : '未补充语义锚点',
    noteText: summary.notePreview || '无文字备注',
    coverPhotoPath: summary.coverPhotoPath ?? '',
    hasPhoto: typeof summary.coverPhotoPath === 'string' && summary.coverPhotoPath.length > 0,
    isActive: summary.id === activeItemId,
  }))
}

function buildItemDebugJson(item: Item | null): string {
  if (!item) {
    return ''
  }

  return JSON.stringify(
    {
      id: item.id,
      sceneType: item.sceneType,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      location: item.location,
      anchorValues: item.anchorValues,
      note: item.note,
      photos: item.photos,
    },
    null,
    2
  )
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
      confirmColor: '#00ff88',
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
      success: () => {
        resolve()
      },
      fail: (error) => {
        reject(error)
      },
    })
  })
}

function setFeedback(
  page: IndexPageInstance,
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

function clearFeedback(page: IndexPageInstance): void {
  page.setData({
    statusText: '',
    errorText: '',
  })
}

function getActiveLocation(page: IndexPageInstance): LocationSnapshot | undefined {
  return page.currentItem?.location ?? page.draftLocation
}

function getActivePhoto(page: IndexPageInstance): PhotoAsset | undefined {
  return page.currentItem?.photos[0] ?? page.draftPhotos[0]
}

function getSelectedSceneType(page: IndexPageInstance): SceneType {
  return getSceneTypeByIndex(page.data.selectedSceneIndex)
}

function syncEditorState(
  page: IndexPageInstance,
  sceneType: SceneType,
  anchorValues: SceneFieldValueMap,
  note: string
): void {
  const isEditMode = page.currentItem !== null
  const activeLocation = getActiveLocation(page)
  const activePhoto = getActivePhoto(page)
  const hasImmutablePhoto = page.currentItem !== null && page.currentItem.photos.length > 0
  const locationPresentation = buildLocationPresentation(activeLocation)
  const photoPresentation = buildPhotoPresentation(activePhoto, isEditMode)

  page.setData({
    isEditMode,
    editorTitle: isEditMode ? '编辑已创建记录' : '创建新记录',
    editorHint: isEditMode
      ? hasImmutablePhoto
        ? '场景、位置、创建时间、照片已固化；当前可继续编辑场景线索字段和备注。'
        : '场景、位置和创建时间已固化；当前可继续编辑场景线索字段、备注，并可补一张照片。'
      : '先选位置，再按需补充语义锚点、备注或照片，然后创建记录。',
    selectedSceneIndex: getSceneIndex(sceneType),
    sceneDescription: getSceneDescription(sceneType),
    draftFieldViews: buildFieldViews(sceneType, anchorValues),
    noteValue: note,
    noteLength: note.length,
    hasLocation: locationPresentation.hasLocation,
    locationTitle: locationPresentation.title,
    locationSubtitle: locationPresentation.subtitle,
    locationSourceText: locationPresentation.sourceText,
    hasPhoto: photoPresentation.hasPhoto,
    photoPath: photoPresentation.photoPath,
    photoMeta: photoPresentation.photoMeta,
    selectedItemId: page.currentItem?.id ?? '',
    selectedItemCreatedAt: page.currentItem
      ? formatTimestamp(page.currentItem.createdAt)
      : '',
    selectedItemUpdatedAt: page.currentItem
      ? formatTimestamp(page.currentItem.updatedAt)
      : '',
    selectedItemDebugJson: buildItemDebugJson(page.currentItem),
    canCreate: !isEditMode && locationPresentation.hasLocation,
    canSaveEdit: isEditMode,
  })
}

function enterCreateMode(
  page: IndexPageInstance,
  sceneType: SceneType = DEFAULT_SCENE_TYPE
): void {
  page.currentItem = null
  page.draftLocation = undefined
  page.draftPhotos = []
  syncEditorState(page, sceneType, {}, '')
}

function enterEditMode(page: IndexPageInstance, item: Item): void {
  page.currentItem = item
  page.draftLocation = undefined
  page.draftPhotos = []
  syncEditorState(page, item.sceneType, item.anchorValues, item.note)
}

async function refreshRecent(
  page: IndexPageInstance,
  activeItemId: string = page.currentItem?.id ?? ''
): Promise<void> {
  const recentItems = await page.runtime.listRecent(20)
  page.setData({
    recentItems: buildRecentItemViews(recentItems, activeItemId),
  })
}

async function runBusy<T>(
  page: IndexPageInstance,
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
    // Ignore setting prompt failures, the original error is already surfaced.
  }
}

async function handleAsyncError(
  page: IndexPageInstance,
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

const initialData: IndexPageData = {
  pageReady: false,
  busy: false,
  busyText: '',
  statusText: '',
  errorText: '',
  isEditMode: false,
  editorTitle: '创建新记录',
  editorHint: '先选位置，再按需补充语义锚点、备注或照片，然后创建记录。',
  sceneOptions: SCENE_OPTIONS,
  selectedSceneIndex: getSceneIndex(DEFAULT_SCENE_TYPE),
  sceneDescription: getSceneDescription(DEFAULT_SCENE_TYPE),
  draftFieldViews: buildFieldViews(DEFAULT_SCENE_TYPE, {}),
  noteValue: '',
  noteLength: 0,
  hasLocation: false,
  locationTitle: '尚未选择位置',
  locationSubtitle: '位置必须通过地图选点确认，不能自动记录。',
  locationSourceText: '',
  hasPhoto: false,
  photoPath: '',
  photoMeta: '创建前可反复重拍；若创建时未拍，创建后仍可补一张，但补上后不可更换。',
  recentItems: [],
  selectedItemId: '',
  selectedItemCreatedAt: '',
  selectedItemUpdatedAt: '',
  selectedItemDebugJson: '',
  canCreate: false,
  canSaveEdit: false,
}

Page<IndexPageData, IndexPageCustom>({
  data: initialData,

  runtime: debugRuntime,
  draftLocation: undefined,
  draftPhotos: [],
  currentItem: null,

  async onLoad() {
    clearFeedback(this)
    enterCreateMode(this, DEFAULT_SCENE_TYPE)

    try {
      await runBusy(this, '正在加载本地记录', async () => {
        await refreshRecent(this)
      })

      this.setData({
        pageReady: true,
      })
      setFeedback(this, {
        statusText: '调试页已就绪，可以开始创建记录。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '初始化失败：')
      this.setData({
        pageReady: true,
      })
    }
  },

  async handleRefreshTap() {
    clearFeedback(this)

    try {
      await runBusy(this, '正在刷新最近记录', async () => {
        await refreshRecent(this)
      })

      setFeedback(this, {
        statusText: '最近记录已刷新。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '刷新失败：')
    }
  },

  handleSceneChange(event) {
    const nextSceneIndex = normalizePickerIndex(
      event.detail.value,
      this.data.sceneOptions.length
    )
    const nextSceneType = getSceneTypeByIndex(nextSceneIndex)
    const currentAnchorValues = extractAnchorValues(this.data.draftFieldViews)
    const nextAnchorValues = sanitizeSceneFieldValues(
      nextSceneType,
      currentAnchorValues
    )

    syncEditorState(this, nextSceneType, nextAnchorValues, this.data.noteValue)
  },

  handleFieldInput(event) {
    const fieldKey = event.currentTarget.dataset.fieldKey
    if (!fieldKey) {
      return
    }

    const nextFieldViews = updateFieldViewsByKey(
      this.data.draftFieldViews,
      fieldKey,
      event.detail.value
    )

    this.setData({
      draftFieldViews: nextFieldViews,
    })
  },

  handleFieldSuggestionTap(event) {
    if (this.data.busy) {
      return
    }

    const fieldKey = event.currentTarget.dataset.fieldKey
    const suggestionValue = event.currentTarget.dataset.suggestionValue
    if (!fieldKey || typeof suggestionValue !== 'string') {
      return
    }

    const nextFieldViews = updateFieldViewsByKey(
      this.data.draftFieldViews,
      fieldKey,
      suggestionValue
    )

    this.setData({
      draftFieldViews: nextFieldViews,
    })
  },

  handleNoteInput(event) {
    this.setData({
      noteValue: event.detail.value,
      noteLength: event.detail.value.length,
    })
  },

  async handlePickCurrentLocation() {
    if (this.data.isEditMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '位置在创建后不可修改，请先返回新建模式。',
      })
      return
    }

    clearFeedback(this)

    try {
      const location = await runBusy(this, '正在打开地图选点', async () =>
        this.runtime.pickLocation('current', this.draftLocation)
      )

      this.draftLocation = location
      syncEditorState(
        this,
        getSelectedSceneType(this),
        extractAnchorValues(this.data.draftFieldViews),
        this.data.noteValue
      )

      setFeedback(this, {
        statusText: '位置已选择，可以直接创建，也可以继续补充信息。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '选取位置失败：')
    }
  },

  async handlePickManualLocation() {
    if (this.data.isEditMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '位置在创建后不可修改，请先返回新建模式。',
      })
      return
    }

    clearFeedback(this)

    try {
      const location = await runBusy(this, '正在打开地图选点', async () =>
        this.runtime.pickLocation('manual', this.draftLocation)
      )

      this.draftLocation = location
      syncEditorState(
        this,
        getSelectedSceneType(this),
        extractAnchorValues(this.data.draftFieldViews),
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
    const location = getActiveLocation(this)
    if (!location) {
      setFeedback(this, {
        statusText: '',
        errorText: '请先选择位置。',
      })
      return
    }

    clearFeedback(this)

    try {
      await this.runtime.openLocation(location)
      setFeedback(this, {
        statusText: '已尝试打开微信地图。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '打开地图失败：')
    }
  },

  async handleCapturePhoto() {
    if (this.data.isEditMode) {
      if (!this.currentItem) {
        setFeedback(this, {
          statusText: '',
          errorText: '当前没有可补充照片的记录。',
        })
        return
      }

      if (this.currentItem.photos.length > 0) {
        setFeedback(this, {
          statusText: '',
          errorText: '该记录已有照片，当前不支持更换照片。',
        })
        return
      }

      clearFeedback(this)

      try {
        const updatedItem = await runBusy(this, '正在补充线索照片', async () => {
          const photo = await this.runtime.capturePhoto()
          return this.runtime.attachPhotoIfAbsent(this.currentItem?.id ?? '', photo)
        })

        enterEditMode(this, updatedItem)
        await refreshRecent(this, updatedItem.id)

        setFeedback(this, {
          statusText: '照片已补充并固化到本地存储。',
          errorText: '',
        })
      } catch (error) {
        await handleAsyncError(this, error, '补充照片失败：')
      }

      return
    }

    clearFeedback(this)

    try {
      const photo = await runBusy(this, '正在调用相机拍照', async () =>
        this.runtime.capturePhoto()
      )

      this.draftPhotos = [photo]
      syncEditorState(
        this,
        getSelectedSceneType(this),
        extractAnchorValues(this.data.draftFieldViews),
        this.data.noteValue
      )

      setFeedback(this, {
        statusText: '照片已写入创建草稿，创建后会固化到本地目录。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '拍照失败：')
    }
  },

  handleClearDraftPhoto() {
    if (this.data.isEditMode) {
      return
    }

    this.draftPhotos = []
    syncEditorState(
      this,
      getSelectedSceneType(this),
      extractAnchorValues(this.data.draftFieldViews),
      this.data.noteValue
    )

    setFeedback(this, {
      statusText: '已清除创建前照片。',
      errorText: '',
    })
  },

  async handleCreate() {
    if (this.data.isEditMode) {
      setFeedback(this, {
        statusText: '',
        errorText: '当前处于编辑模式，请先返回新建模式。',
      })
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
          sceneType: getSelectedSceneType(this),
          location: this.draftLocation as LocationSnapshot,
          anchorValues: extractAnchorValues(this.data.draftFieldViews),
          note: this.data.noteValue,
          photos: this.draftPhotos,
        })
      )

      enterEditMode(this, createdItem)
      await refreshRecent(this, createdItem.id)

      setFeedback(this, {
        statusText:
          createdItem.photos.length > 0
            ? '记录创建成功，位置和照片已固化到本地存储。'
            : '记录创建成功；位置已固化，后续仍可编辑文字字段，且可补一张照片。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '创建失败：')
    }
  },

  async handleSelectRecentItem(event) {
    const itemId = trimOptionalString(event.currentTarget.dataset.itemId)
    if (!itemId) {
      return
    }

    clearFeedback(this)

    try {
      const item = await runBusy(this, '正在读取记录详情', async () =>
        this.runtime.getItem(itemId)
      )

      if (!item) {
        await refreshRecent(this)
        setFeedback(this, {
          statusText: '',
          errorText: '该记录不存在，最近列表已刷新。',
        })
        return
      }

      enterEditMode(this, item)
      await refreshRecent(this, item.id)

      setFeedback(this, {
        statusText: '已载入记录详情，可以编辑可变字段或直接导航。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '读取记录失败：')
    }
  },

  handleStartNew() {
    clearFeedback(this)
    enterCreateMode(this, getSelectedSceneType(this))
    refreshRecent(this).catch((error) => {
      void handleAsyncError(this, error, '刷新最近记录失败：')
    })

    setFeedback(this, {
      statusText: '已切回新建模式。',
      errorText: '',
    })
  },

  async handleSaveEdit() {
    if (!this.currentItem) {
      setFeedback(this, {
        statusText: '',
        errorText: '当前没有可编辑的已创建记录。',
      })
      return
    }

    clearFeedback(this)

    try {
      const updatedItem = await runBusy(this, '正在保存可编辑字段', async () =>
          this.runtime.updateEditableFields(
            this.currentItem?.id ?? '',
            this.runtime.buildEditableInput(
              extractAnchorValues(this.data.draftFieldViews),
              this.data.noteValue
            )
        )
      )

      enterEditMode(this, updatedItem)
      await refreshRecent(this, updatedItem.id)

      setFeedback(this, {
        statusText: '记录已更新，不可变字段保持不变。',
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '保存编辑失败：')
    }
  },

  async handleDeleteItem() {
    if (!this.currentItem) {
      setFeedback(this, {
        statusText: '',
        errorText: '当前没有可删除的记录。',
      })
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
      const nextSceneType = this.currentItem.sceneType

      await runBusy(this, '正在删除记录', async () => {
        await this.runtime.deleteItem(deletedItemId)
      })

      enterCreateMode(this, nextSceneType)
      await refreshRecent(this)

      setFeedback(this, {
        statusText: `记录 ${deletedItemId} 已删除。`,
        errorText: '',
      })
    } catch (error) {
      await handleAsyncError(this, error, '删除记录失败：')
    }
  },
})
