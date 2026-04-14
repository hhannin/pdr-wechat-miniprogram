import type {
  ItemSummary,
  Item,
  LocationSnapshot,
  PhotoAsset,
  ReminderSyncState,
  SceneFieldControl,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
  SharedItem,
  TimestampMs,
} from '../../core/types/index'
import {
  getSceneDefinition,
  getSceneFieldDefinitions,
  getSceneFieldOptionLabel,
} from '../../core/scene/index'
import type { RecordPageMode } from './frontend-config'

const DEFAULT_FIELD_MAX_LENGTH = 40

export interface FrontendSuggestionView {
  readonly value: string
  readonly label: string
  readonly isActive: boolean
}

export interface FrontendFieldView {
  readonly key: SceneFieldKey
  readonly label: string
  readonly description: string
  readonly required: boolean
  readonly primary: boolean
  readonly control: SceneFieldControl
  readonly value: string
  readonly displayValue: string
  readonly isEmpty: boolean
  readonly placeholder: string
  readonly maxLength: number
  readonly suggestions: readonly FrontendSuggestionView[]
}

export interface LocationPresentation {
  readonly hasLocation: boolean
  readonly title: string
  readonly subtitle: string
  readonly sourceText: string
}

export interface PhotoPresentation {
  readonly hasPhoto: boolean
  readonly photoPath: string
  readonly photoMeta: string
}

export type ReminderPresentationState = 'none' | 'active' | 'inactive'

export function formatTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

export function getSceneLabel(sceneType: SceneType): string {
  return getSceneDefinition(sceneType).label
}

export function getSceneDescription(sceneType: SceneType): string {
  return getSceneDefinition(sceneType).description
}

export function resolveSceneFieldDisplayValue(
  sceneType: SceneType,
  fieldKey: SceneFieldKey,
  value: string
): string {
  return getSceneFieldOptionLabel(sceneType, fieldKey, value) ?? value
}

export function buildFieldViews(
  sceneType: SceneType,
  anchorValues: SceneFieldValueMap
): readonly FrontendFieldView[] {
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
      displayValue:
        currentValue.length > 0
          ? resolveSceneFieldDisplayValue(
              sceneType,
              fieldDefinition.key,
              currentValue
            )
          : '',
      isEmpty: currentValue.length === 0,
      placeholder:
        fieldDefinition.placeholder ??
        (fieldDefinition.control === 'hybrid'
          ? `输入或点选${fieldDefinition.label}`
          : `输入${fieldDefinition.label}`),
      maxLength: fieldDefinition.maxLength ?? DEFAULT_FIELD_MAX_LENGTH,
      suggestions: fieldDefinition.options.map((option) => ({
        value: option.value,
        label: option.label,
        isActive: option.value === currentValue,
      })),
    }
  })
}

export function extractAnchorValues(
  fieldViews: readonly FrontendFieldView[]
): SceneFieldValueMap {
  const anchorValues: SceneFieldValueMap = {}

  for (const fieldView of fieldViews) {
    const normalizedValue = trimOptionalString(fieldView.value)
    if (!normalizedValue) {
      continue
    }

    anchorValues[fieldView.key] = normalizedValue
  }

  return anchorValues
}

export function updateFieldViewsByKey(
  sceneType: SceneType,
  fieldViews: readonly FrontendFieldView[],
  fieldKey: SceneFieldKey,
  nextValue: string
): readonly FrontendFieldView[] {
  return fieldViews.map((fieldView) => {
    if (fieldView.key !== fieldKey) {
      return fieldView
    }

    return {
      ...fieldView,
      value: nextValue,
      displayValue:
        trimOptionalString(nextValue) !== undefined
          ? resolveSceneFieldDisplayValue(sceneType, fieldKey, nextValue)
          : '',
      isEmpty: trimOptionalString(nextValue) === undefined,
      suggestions: fieldView.suggestions.map((suggestion) => ({
        ...suggestion,
        isActive: suggestion.value === nextValue,
      })),
    }
  })
}

export function buildLocationPresentation(
  location: LocationSnapshot | undefined
): LocationPresentation {
  if (!location) {
    return {
      hasLocation: false,
      title: '选一个位置',
      subtitle: '',
      sourceText: '',
    }
  }

  return {
    hasLocation: true,
    title: location.name,
    subtitle: location.address,
    sourceText: location.source === 'current' ? '当前位置' : '地图选点',
  }
}

export function buildPhotoPresentation(
  photo: PhotoAsset | undefined,
  _mode: RecordPageMode
): PhotoPresentation {
  if (!photo) {
    return {
      hasPhoto: false,
      photoPath: '',
      photoMeta: '',
    }
  }

  return {
    hasPhoto: true,
    photoPath: photo.localPath,
    photoMeta: '',
  }
}

export function buildAnchorDisplayLines(
  sceneType: SceneType,
  anchorValues: SceneFieldValueMap
): readonly string[] {
  return Object.freeze(
    getSceneFieldDefinitions(sceneType).reduce((anchorLines, fieldDefinition) => {
      const fieldValue = anchorValues[fieldDefinition.key]
      if (!fieldValue) {
        return anchorLines
      }

      anchorLines.push(
        `${fieldDefinition.label}：${resolveSceneFieldDisplayValue(
          sceneType,
          fieldDefinition.key,
          fieldValue
        )}`
      )

      return anchorLines
    }, [] as string[])
  )
}

export function buildSummaryMeta(summary: ItemSummary): string {
  return `更新 ${formatTimestamp(summary.updatedAt)}`
}

export function formatSummaryTimestamp(summary: ItemSummary): string {
  return formatTimestamp(summary.createdAt)
}

export function buildSummaryAnchorsText(summary: ItemSummary): string {
  return summary.primaryAnchors.length > 0
    ? summary.primaryAnchors.join(' · ')
    : ''
}

export function buildNoteDisplayText(note: string): string {
  return trimOptionalString(note) ?? ''
}

export function isReminderFuture(
  reminderAt: TimestampMs | undefined,
  now: TimestampMs = Date.now()
): boolean {
  return typeof reminderAt === 'number' && reminderAt > now
}

export function buildReminderDisplayText(
  reminderAt: TimestampMs | undefined
): string {
  return typeof reminderAt === 'number' ? formatTimestamp(reminderAt) : ''
}

export function resolveReminderPresentationState(
  reminderAt: TimestampMs | undefined,
  reminderSyncState: ReminderSyncState | undefined,
  now: TimestampMs = Date.now()
): ReminderPresentationState {
  if (typeof reminderAt !== 'number') {
    return 'none'
  }

  if (reminderAt > now && reminderSyncState === 'scheduled') {
    return 'active'
  }

  return 'inactive'
}

export function buildShareCardTitleFromItem(item: Pick<Item, 'location' | 'sceneType'>): string {
  return (
    trimOptionalString(item.location.name) ??
    trimOptionalString(item.location.address) ??
    getSceneLabel(item.sceneType)
  )
}

export function buildShareCardSubtitleFromItem(
  item: Pick<Item, 'location' | 'sceneType' | 'anchorValues'>
): string {
  const address = trimOptionalString(item.location.address)
  if (address) {
    return address
  }

  const anchorText = buildAnchorDisplayLines(item.sceneType, item.anchorValues).join(' · ')
  return anchorText.length > 0 ? anchorText : getSceneLabel(item.sceneType)
}

export interface PostHeadlineInput {
  readonly sceneType: SceneType
  readonly locationName: string
  readonly address: string
  readonly primaryAnchors: readonly string[]
}

export function buildPostHeadline(input: PostHeadlineInput): string {
  const sceneLabel = getSceneLabel(input.sceneType)
  const locationNameText = trimOptionalString(input.locationName)
  const addressText = trimOptionalString(input.address)
  const locationParts: string[] = []

  if (locationNameText) {
    locationParts.push(locationNameText)
  }

  if (addressText && addressText !== locationNameText) {
    locationParts.push(addressText)
  }

  const baseLocationText =
    locationParts.length > 0 ? locationParts.join(' · ') : '未命名位置'
  const anchorsText = input.primaryAnchors.length > 0 ? input.primaryAnchors.join(' · ') : ''
  const locationText =
    anchorsText.length > 0 ? `${baseLocationText} · ${anchorsText}` : baseLocationText
  return `${sceneLabel} ｜ ${locationText}`
}

function pad2(value: number): string {
  return `${value}`.padStart(2, '0')
}

export function formatPostTimestamp(
  timestampMs: TimestampMs,
  now: TimestampMs = Date.now()
): string {
  const target = new Date(timestampMs)
  const current = new Date(now)
  const hm = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`

  const isSameDay =
    target.getFullYear() === current.getFullYear() &&
    target.getMonth() === current.getMonth() &&
    target.getDate() === current.getDate()
  if (isSameDay) {
    return `今天 ${hm}`
  }

  const tomorrow = new Date(current)
  tomorrow.setDate(current.getDate() + 1)
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate()
  if (isTomorrow) {
    return `明天 ${hm}`
  }

  const yesterday = new Date(current)
  yesterday.setDate(current.getDate() - 1)
  const isYesterday =
    target.getFullYear() === yesterday.getFullYear() &&
    target.getMonth() === yesterday.getMonth() &&
    target.getDate() === yesterday.getDate()
  if (isYesterday) {
    return `昨天 ${hm}`
  }

  const isSameYear = target.getFullYear() === current.getFullYear()
  const md = `${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`
  if (isSameYear) {
    return `${md} ${hm}`
  }

  return `${target.getFullYear()}-${md} ${hm}`
}

export function resolveEffectiveTimestamp(
  summary: Pick<ItemSummary, 'reminderAt' | 'createdAt'>,
  now: TimestampMs = Date.now()
): TimestampMs {
  if (typeof summary.reminderAt === 'number' && summary.reminderAt <= now) {
    return summary.reminderAt
  }
  return summary.createdAt
}

export type AlarmIconState = 'none' | 'gray' | 'green'

export function resolveAlarmIconState(
  reminderAt: TimestampMs | undefined,
  reminderSyncState: ReminderSyncState | undefined,
  now: TimestampMs = Date.now()
): AlarmIconState {
  if (typeof reminderAt !== 'number' || reminderAt <= now) {
    return 'none'
  }
  return reminderSyncState === 'scheduled' ? 'green' : 'gray'
}

export interface PostCardView {
  readonly id: string
  readonly sceneType: SceneType
  readonly headline: string
  readonly noteText: string
  readonly hasNote: boolean
  readonly photoPath: string
  readonly hasPhoto: boolean
  readonly timeText: string
  readonly alarmState: AlarmIconState
  readonly reminderBadgeText: string
  readonly isFavorite: boolean
  readonly dateKey: string
  readonly effectiveAt: TimestampMs
}

function buildReminderBadgeText(
  reminderAt: TimestampMs | undefined,
  _alarmState: AlarmIconState
): string {
  if (typeof reminderAt !== 'number') {
    return ''
  }
  const date = new Date(reminderAt)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`
}

function toDateKey(timestampMs: TimestampMs): string {
  const date = new Date(timestampMs)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function buildPostCardViewFromSummary(
  summary: ItemSummary,
  now: TimestampMs = Date.now()
): PostCardView {
  const effectiveAt = resolveEffectiveTimestamp(summary, now)
  const alarmState = resolveAlarmIconState(summary.reminderAt, summary.reminderSyncState, now)
  return {
    id: summary.id,
    sceneType: summary.sceneType,
    headline: buildPostHeadline({
      sceneType: summary.sceneType,
      locationName: summary.locationName,
      address: summary.address,
      primaryAnchors: summary.primaryAnchors,
    }),
    noteText: summary.notePreview,
    hasNote: summary.notePreview.trim().length > 0,
    photoPath: summary.coverPhotoPath ?? '',
    hasPhoto: typeof summary.coverPhotoPath === 'string' && summary.coverPhotoPath.length > 0,
    timeText: formatPostTimestamp(effectiveAt, now),
    alarmState,
    reminderBadgeText: buildReminderBadgeText(summary.reminderAt, alarmState),
    isFavorite: typeof summary.pinnedAt === 'number',
    dateKey: toDateKey(effectiveAt),
    effectiveAt,
  }
}

export function buildPostCardViewFromItem(
  item: Item,
  now: TimestampMs = Date.now()
): PostCardView {
  const primaryAnchors = buildAnchorDisplayLines(item.sceneType, item.anchorValues)
  const photo = item.photos[0]
  const effectiveAt = resolveEffectiveTimestamp(item, now)
  const alarmState = resolveAlarmIconState(item.reminderAt, item.reminderSyncState, now)
  return {
    id: item.id,
    sceneType: item.sceneType,
    headline: buildPostHeadline({
      sceneType: item.sceneType,
      locationName: item.location.name,
      address: item.location.address,
      primaryAnchors,
    }),
    noteText: item.note,
    hasNote: item.note.trim().length > 0,
    photoPath: photo ? photo.localPath : '',
    hasPhoto: photo !== undefined,
    timeText: formatPostTimestamp(effectiveAt, now),
    alarmState,
    reminderBadgeText: buildReminderBadgeText(item.reminderAt, alarmState),
    isFavorite: typeof item.pinnedAt === 'number',
    dateKey: toDateKey(effectiveAt),
    effectiveAt,
  }
}

export function buildPostCardViewFromSharedItem(
  item: SharedItem,
  now: TimestampMs = Date.now()
): PostCardView {
  const primaryAnchors = buildAnchorDisplayLines(item.sceneType, item.anchorValues)
  const photo = item.photos[0]
  const effectiveAt = resolveEffectiveTimestamp(item, now)
  const alarmState = resolveAlarmIconState(item.reminderAt, item.reminderSyncState, now)
  return {
    id: item.sourceItemId,
    sceneType: item.sceneType,
    headline: buildPostHeadline({
      sceneType: item.sceneType,
      locationName: item.location.name,
      address: item.location.address,
      primaryAnchors,
    }),
    noteText: item.note,
    hasNote: item.note.trim().length > 0,
    photoPath: photo ? photo.localPath : '',
    hasPhoto: photo !== undefined,
    timeText: formatPostTimestamp(effectiveAt, now),
    alarmState,
    reminderBadgeText: buildReminderBadgeText(item.reminderAt, alarmState),
    isFavorite: false,
    dateKey: toDateKey(effectiveAt),
    effectiveAt,
  }
}
