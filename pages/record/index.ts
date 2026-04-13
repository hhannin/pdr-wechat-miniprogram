import type {
  Item,
  LocationSnapshot,
  PhotoAsset,
  ReminderSyncState,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
  TimestampMs,
} from '../../core/types/index'
import { sanitizeSceneFieldValues } from '../../core/scene/index'
import { isMapError } from '../../infra/map/index'
import { isMediaError } from '../../infra/media/index'
import { appRuntime, type AppRuntime } from '../common/runtime'
import {
  buildFieldViews,
  buildLocationPresentation,
  extractAnchorValues,
  getSceneLabel,
  trimOptionalString,
  updateFieldViewsByKey,
  type FrontendFieldView,
} from '../common/frontend-presenters'
import { buildRecordsUrl, type RecordPageMode } from '../common/frontend-config'
import { REMINDER_SUBSCRIBE_TEMPLATE_IDS } from '../common/reminder-config'
import {
  showErrorToast,
  showInfoToast,
  showSuccessToast,
  previewLocalImage,
} from '../common/feedback'
import { confirmDestructive } from '../common/confirm'
import { listSceneDefinitions } from '../../core/scene/index'

interface SceneOptionView {
  readonly type: SceneType
  readonly label: string
}

interface RecordPageData {
  readonly pageReady: boolean
  readonly busy: boolean
  readonly pageMode: RecordPageMode
  readonly isEditMode: boolean
  readonly hasLocation: boolean
  readonly locationTitle: string
  readonly locationSubtitle: string
  readonly noteValue: string
  readonly reminderEnabled: boolean
  readonly reminderPickerDate: string
  readonly reminderPickerTime: string
  readonly reminderPickerMinDate: string
  readonly moreCluesExpanded: boolean
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly sceneType: SceneType
  readonly sceneLabel: string
  readonly sceneOptions: readonly SceneOptionView[]
  readonly sceneDropdownVisible: boolean
  readonly fieldViews: readonly FrontendFieldView[]
  readonly canSave: boolean
  readonly currentItemHasPhoto: boolean
  readonly textareaReady: boolean
}

interface RecordPageCustom {
  readonly runtime: AppRuntime
  currentItem: Item | null
  itemId: string
  draftLocation: LocationSnapshot | undefined
  draftPhoto: PhotoAsset | undefined
  anchorDraftByScene: Partial<Record<SceneType, SceneFieldValueMap>>
  reminderAtDraft: TimestampMs | undefined
  reminderSyncStateDraft: ReminderSyncState | undefined
  onLoad(query: Record<string, string | undefined>): Promise<void>
  handlePickLocation(): Promise<void>
  handleNoteInput(event: WechatMiniprogram.CustomEvent<{ value: string }>): void
  handleReminderToggle(event: WechatMiniprogram.CustomEvent<{ value: boolean }>): void
  handleReminderDateChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void
  handleReminderTimeChange(event: WechatMiniprogram.CustomEvent<{ value: string }>): void
  handleToggleMoreClues(): void
  handleCapturePhoto(): Promise<void>
  handlePreviewPhoto(): Promise<void>
  handleClearPhoto(): void
  handleToggleSceneDropdown(): void
  handlePickSceneType(event: WechatMiniprogram.BaseEvent<never, { sceneType?: string }>): void
  handleFieldInput(event: WechatMiniprogram.CustomEvent<{ value: string }, never, { fieldKey?: SceneFieldKey }>): void
  handleFieldSuggestionTap(event: WechatMiniprogram.BaseEvent<never, { fieldKey?: SceneFieldKey; suggestionValue?: string }>): void
  handleGoList(): void
  handleDelete(): Promise<void>
  handleSave(): Promise<void>
  syncCanSave(): void
  saveCreate(anchorValues: SceneFieldValueMap, reminderAt: TimestampMs | undefined, reminderSyncState: ReminderSyncState | undefined): Promise<void>
  saveEdit(anchorValues: SceneFieldValueMap, reminderAt: TimestampMs | undefined, reminderSyncState: ReminderSyncState | undefined): Promise<void>
}

type FieldInputEvent = WechatMiniprogram.CustomEvent<
  { readonly value: string },
  WechatMiniprogram.IAnyObject,
  { readonly fieldKey?: SceneFieldKey }
>

type FieldSuggestionEvent = WechatMiniprogram.BaseEvent<
  WechatMiniprogram.IAnyObject,
  { readonly fieldKey?: SceneFieldKey; readonly suggestionValue?: string }
>

const DEFAULT_SCENE_TYPE: SceneType = 'default'

function buildSceneOptions(): readonly SceneOptionView[] {
  return listSceneDefinitions().map((d) => ({ type: d.type, label: d.label }))
}

function formatPickerDate(ts: TimestampMs): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatPickerTime(ts: TimestampMs): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function pad2(n: number): string {
  return `${n}`.padStart(2, '0')
}

function parseReminderTimestamp(date: string, time: string): TimestampMs | null {
  const nd = trimOptionalString(date)
  const nt = trimOptionalString(time)
  if (!nd || !nt) return null
  const ts = new Date(`${nd}T${nt}:00`).getTime()
  return Number.isFinite(ts) && ts > 0 ? ts : null
}

function buildDefaultReminderTimestamp(now: TimestampMs = Date.now()): TimestampMs {
  const d = new Date(now)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 30)
  return d.getTime()
}

async function requestReminderPermission(): Promise<ReminderSyncState> {
  const templateIds = REMINDER_SUBSCRIBE_TEMPLATE_IDS.filter((id) => id.trim().length > 0)
  if (templateIds.length === 0) return 'unscheduled'
  try {
    const result = await new Promise<Record<string, string>>((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds: [...templateIds],
        success: (r) => resolve(r as Record<string, string>),
        fail: (e) => reject(e),
      })
    })
    return templateIds.some((id) => result[id] === 'accept') ? 'scheduled' : 'unscheduled'
  } catch {
    return 'unscheduled'
  }
}

Page<RecordPageData, RecordPageCustom>({
  data: {
    pageReady: false,
    busy: false,
    pageMode: 'create',
    isEditMode: false,
    hasLocation: false,
    locationTitle: '',
    locationSubtitle: '',
    noteValue: '',
    reminderEnabled: false,
    reminderPickerDate: '',
    reminderPickerTime: '',
    reminderPickerMinDate: formatPickerDate(Date.now()),
    moreCluesExpanded: false,
    hasPhoto: false,
    photoPath: '',
    sceneType: DEFAULT_SCENE_TYPE,
    sceneLabel: getSceneLabel(DEFAULT_SCENE_TYPE),
    sceneOptions: buildSceneOptions(),
    sceneDropdownVisible: false,
    fieldViews: [],
    canSave: false,
    currentItemHasPhoto: false,
    textareaReady: false,
  },

  runtime: appRuntime,
  currentItem: null,
  itemId: '',
  draftLocation: undefined,
  draftPhoto: undefined,
  anchorDraftByScene: {},
  reminderAtDraft: undefined,
  reminderSyncStateDraft: undefined,

  async onLoad(query) {
    if (query.toast) {
      const message = decodeURIComponent(query.toast)
      setTimeout(() => showInfoToast(message, 3000), 300)
    }

    const mode: RecordPageMode = query.mode === 'edit' ? 'edit' : 'create'
    this.itemId = typeof query.itemId === 'string' ? query.itemId : ''

    if (mode === 'edit' && this.itemId) {
      try {
        const item = await this.runtime.getItem(this.itemId)
        if (!item) {
          showErrorToast('记录不存在')
          wx.navigateBack()
          return
        }
        this.currentItem = item
        this.draftLocation = item.location
        this.draftPhoto = item.photos[0]
        this.anchorDraftByScene = { [item.sceneType]: item.anchorValues }

        const locPres = buildLocationPresentation(item.location)
        const hasReminder = typeof item.reminderAt === 'number'
        const reminderTs = item.reminderAt ?? buildDefaultReminderTimestamp()

        this.reminderAtDraft = item.reminderAt
        this.reminderSyncStateDraft = item.reminderSyncState

        this.setData({
          pageReady: true,
          pageMode: 'edit',
          isEditMode: true,
          hasLocation: locPres.hasLocation,
          locationTitle: locPres.title,
          locationSubtitle: locPres.subtitle,
          noteValue: item.note,
          reminderEnabled: hasReminder,
          reminderPickerDate: hasReminder ? formatPickerDate(reminderTs) : '',
          reminderPickerTime: hasReminder ? formatPickerTime(reminderTs) : '',
          reminderPickerMinDate: formatPickerDate(Date.now()),
          moreCluesExpanded:
            item.photos.length > 0 ||
            item.sceneType !== 'default' ||
            buildFieldViews(item.sceneType, item.anchorValues).some((f) => !f.isEmpty),
          hasPhoto: !!item.photos[0],
          photoPath: item.photos[0]?.localPath ?? '',
          sceneType: item.sceneType,
          sceneLabel: getSceneLabel(item.sceneType),
          fieldViews: buildFieldViews(item.sceneType, item.anchorValues),
          canSave: true,
          currentItemHasPhoto: item.photos.length > 0,
        })
        setTimeout(() => this.setData({ textareaReady: true }), 50)
      } catch (error) {
        showErrorToast(error, '加载失败：')
        wx.navigateBack()
      }
      return
    }

    this.setData({
      pageReady: true,
      pageMode: 'create',
      isEditMode: false,
      reminderPickerMinDate: formatPickerDate(Date.now()),
      fieldViews: buildFieldViews(DEFAULT_SCENE_TYPE, {}),
      textareaReady: true,
    })
  },

  async handlePickLocation() {
    if (this.data.busy) return
    if (this.data.isEditMode) return
    try {
      const location = await this.runtime.pickLocation('manual', this.draftLocation, {
        centerOnCurrentLocation: !this.draftLocation,
      })
      this.draftLocation = location
      const pres = buildLocationPresentation(location)
      this.setData({
        hasLocation: pres.hasLocation,
        locationTitle: pres.title,
        locationSubtitle: pres.subtitle,
      })
      this.syncCanSave()
    } catch (error) {
      if (isMapError(error) && error.code === 'location_pick_cancelled') return
      showErrorToast(error, '选取位置失败：')
    }
  },

  handleNoteInput(event) {
    this.setData({ noteValue: event.detail.value })
  },

  handleReminderToggle(event) {
    const enabled = event.detail.value
    if (enabled) {
      const ts = this.reminderAtDraft ?? buildDefaultReminderTimestamp()
      this.setData({
        reminderEnabled: true,
        reminderPickerDate: formatPickerDate(ts),
        reminderPickerTime: formatPickerTime(ts),
      })
    } else {
      this.setData({
        reminderEnabled: false,
      })
    }
  },

  handleReminderDateChange(event) {
    this.setData({ reminderPickerDate: event.detail.value })
  },

  handleReminderTimeChange(event) {
    this.setData({ reminderPickerTime: event.detail.value })
  },

  handleToggleMoreClues() {
    this.setData({ moreCluesExpanded: !this.data.moreCluesExpanded })
  },

  async handleCapturePhoto() {
    if (this.data.busy || this.data.hasPhoto) return
    if (this.data.isEditMode && this.currentItem && this.currentItem.photos.length > 0) return
    try {
      const photo = await this.runtime.capturePhoto()
      this.draftPhoto = photo
      this.setData({ hasPhoto: true, photoPath: photo.localPath })
    } catch (error) {
      if (isMediaError(error) && error.code === 'photo_capture_cancelled') return
      showErrorToast(error, '拍照失败：')
    }
  },

  async handlePreviewPhoto() {
    if (!this.data.photoPath) return
    try {
      await previewLocalImage(this.data.photoPath)
    } catch (error) {
      showErrorToast(error, '打开照片失败：')
    }
  },

  handleClearPhoto() {
    if (this.data.isEditMode && this.currentItem && this.currentItem.photos.length > 0) return
    this.draftPhoto = undefined
    this.setData({ hasPhoto: false, photoPath: '' })
  },

  handleToggleSceneDropdown() {
    if (this.data.isEditMode) return
    this.setData({ sceneDropdownVisible: !this.data.sceneDropdownVisible })
  },

  handlePickSceneType(event) {
    const sceneType = event.currentTarget.dataset.sceneType as SceneType | undefined
    if (!sceneType || sceneType === this.data.sceneType) {
      this.setData({ sceneDropdownVisible: false })
      return
    }

    this.anchorDraftByScene[this.data.sceneType] = extractAnchorValues(this.data.fieldViews)

    const restored = this.anchorDraftByScene[sceneType] ?? {}
    this.setData({
      sceneType,
      sceneLabel: getSceneLabel(sceneType),
      sceneDropdownVisible: false,
      fieldViews: buildFieldViews(sceneType, restored),
    })
  },

  handleFieldInput(event: FieldInputEvent) {
    const fieldKey = event.currentTarget.dataset.fieldKey
    if (!fieldKey) return
    this.setData({
      fieldViews: updateFieldViewsByKey(
        this.data.sceneType,
        this.data.fieldViews,
        fieldKey,
        event.detail.value
      ),
    })
  },

  handleFieldSuggestionTap(event: FieldSuggestionEvent) {
    const fieldKey = event.currentTarget.dataset.fieldKey
    const suggestionValue = event.currentTarget.dataset.suggestionValue
    if (!fieldKey || typeof suggestionValue !== 'string') return
    this.setData({
      fieldViews: updateFieldViewsByKey(
        this.data.sceneType,
        this.data.fieldViews,
        fieldKey,
        suggestionValue
      ),
    })
  },

  handleGoList() {
    wx.navigateTo({
      url: buildRecordsUrl(),
      fail: (error) => showErrorToast(error, '打开列表失败：'),
    })
  },

  async handleDelete() {
    if (this.data.busy || !this.currentItem) return
    try {
      const confirmed = await confirmDestructive(
        '删掉这条？',
        '删除后无法恢复。',
        '删掉'
      )
      if (!confirmed) return

      this.setData({ busy: true })
      const item = this.currentItem

      if (typeof item.reminderAt === 'number' && item.reminderAt > Date.now()) {
        const networkType = await this.runtime.getNetworkType()
        if (networkType !== 'none') {
          try {
            await this.runtime.syncReminderJob({
              itemId: item.id,
              reminderAt: undefined,
              reminderDisplayText: '',
              reminderSyncState: 'unscheduled',
              sceneType: item.sceneType,
              locationTitle: item.location.name,
              locationSubtitle: item.location.address,
            })
          } catch { /* best effort */ }
        }
      }

      await this.runtime.deleteItem(item.id)
      showSuccessToast('已删除')
      wx.reLaunch({ url: buildRecordsUrl() })
    } catch (error) {
      this.setData({ busy: false })
      showErrorToast(error, '删除失败：')
    }
  },

  syncCanSave() {
    const canSave = this.data.isEditMode || this.data.hasLocation
    if (canSave !== this.data.canSave) {
      this.setData({ canSave })
    }
  },

  async handleSave() {
    if (this.data.busy || !this.data.canSave) return

    this.setData({ busy: true })
    try {
      const anchorValues = sanitizeSceneFieldValues(
        this.data.sceneType,
        extractAnchorValues(this.data.fieldViews)
      )

      let reminderAt: TimestampMs | undefined
      let reminderSyncState: ReminderSyncState | undefined

      if (this.data.reminderEnabled) {
        const parsedTs = parseReminderTimestamp(
          this.data.reminderPickerDate,
          this.data.reminderPickerTime
        )
        if (!parsedTs) {
          showInfoToast('请选择提醒时间')
          return
        }
        if (parsedTs <= Date.now()) {
          showInfoToast('请选择未来时间')
          return
        }
        reminderAt = parsedTs
        const needAuth =
          this.data.pageMode === 'create' ||
          (this.data.isEditMode && this.currentItem?.reminderAt !== reminderAt)
        reminderSyncState = needAuth
          ? await requestReminderPermission()
          : this.currentItem?.reminderSyncState
      }

      if (this.data.pageMode === 'create') {
        await this.saveCreate(anchorValues, reminderAt, reminderSyncState)
      } else {
        await this.saveEdit(anchorValues, reminderAt, reminderSyncState)
      }
    } catch (error) {
      showErrorToast(error, '保存失败：')
    } finally {
      this.setData({ busy: false })
    }
  },

  async saveCreate(
    anchorValues: SceneFieldValueMap,
    reminderAt: TimestampMs | undefined,
    reminderSyncState: ReminderSyncState | undefined
  ) {
    if (!this.draftLocation) {
      showErrorToast('请先选择位置')
      return
    }

    const createdItemId = this.runtime.createItemId()
    let scheduledReminderCreated = false

    if (typeof reminderAt === 'number' && reminderSyncState === 'scheduled') {
      const networkType = await this.runtime.getNetworkType()
      if (networkType !== 'none') {
        try {
          const locPres = buildLocationPresentation(this.draftLocation)
          await this.runtime.syncReminderJob({
            itemId: createdItemId,
            reminderAt,
            reminderDisplayText: `${formatPickerDate(reminderAt)} ${formatPickerTime(reminderAt)}`,
            reminderSyncState: 'scheduled',
            sceneType: this.data.sceneType,
            locationTitle: locPres.title,
            locationSubtitle: locPres.subtitle,
          })
          scheduledReminderCreated = true
        } catch {
          reminderSyncState = 'unscheduled'
        }
      } else {
        reminderSyncState = 'unscheduled'
      }
    }

    try {
      await this.runtime.create({
        sceneType: this.data.sceneType,
        location: this.draftLocation,
        anchorValues,
        note: this.data.noteValue,
        reminderAt,
        reminderSyncState,
        photos: this.draftPhoto ? [this.draftPhoto] : [],
      }, {
        forcedItemId: createdItemId,
      })

      showSuccessToast('已保存')
      wx.navigateBack({
        fail: () => {
          wx.redirectTo({ url: buildRecordsUrl() })
        },
      })
    } catch (error) {
      if (scheduledReminderCreated) {
        try {
          await this.runtime.syncReminderJob({
            itemId: createdItemId,
            reminderAt: undefined,
            reminderDisplayText: '',
            reminderSyncState: 'unscheduled',
            sceneType: this.data.sceneType,
            locationTitle: '',
            locationSubtitle: '',
          })
        } catch { /* best effort rollback */ }
      }
      throw error
    }
  },

  async saveEdit(
    anchorValues: SceneFieldValueMap,
    reminderAt: TimestampMs | undefined,
    reminderSyncState: ReminderSyncState | undefined
  ) {
    if (!this.currentItem) return

    const item = this.currentItem
    const reminderChanged = item.reminderAt !== reminderAt

    if (reminderChanged && typeof reminderAt === 'number' && reminderSyncState === 'scheduled') {
      const networkType = await this.runtime.getNetworkType()
      if (networkType !== 'none') {
        const locPres = buildLocationPresentation(item.location)
        try {
          await this.runtime.syncReminderJob({
            itemId: item.id,
            reminderAt,
            reminderDisplayText: `${formatPickerDate(reminderAt)} ${formatPickerTime(reminderAt)}`,
            reminderSyncState: 'scheduled',
            sceneType: item.sceneType,
            locationTitle: locPres.title,
            locationSubtitle: locPres.subtitle,
          })
        } catch {
          reminderSyncState = 'unscheduled'
        }
      } else {
        reminderSyncState = 'unscheduled'
      }
    }

    if (reminderChanged && typeof item.reminderAt === 'number' && reminderAt === undefined) {
      const networkType = await this.runtime.getNetworkType()
      if (networkType !== 'none') {
        const locPres = buildLocationPresentation(item.location)
        try {
          await this.runtime.syncReminderJob({
            itemId: item.id,
            reminderAt: undefined,
            reminderDisplayText: '',
            reminderSyncState: 'unscheduled',
            sceneType: item.sceneType,
            locationTitle: locPres.title,
            locationSubtitle: locPres.subtitle,
          })
        } catch { /* best effort */ }
      }
    }

    const editInput = this.runtime.buildEditableInput(
      anchorValues,
      this.data.noteValue,
      reminderChanged
        ? { reminderAt: reminderAt ?? null, reminderSyncState }
        : undefined
    )

    const hasNewPhoto = this.draftPhoto && item.photos.length === 0
    await this.runtime.saveEdit(item.id, editInput, hasNewPhoto ? this.draftPhoto : undefined)

    showSuccessToast('已保存')
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: buildRecordsUrl() })
      },
    })
  },
})
