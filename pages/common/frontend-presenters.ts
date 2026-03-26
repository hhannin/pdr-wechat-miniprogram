import type {
  ItemSummary,
  LocationSnapshot,
  PhotoAsset,
  SceneFieldControl,
  SceneFieldKey,
  SceneFieldValueMap,
  SceneType,
} from '../../core/types/index'
import {
  getSceneDefinition,
  getSceneFieldDefinitions,
  getSceneFieldOptionLabel,
} from '../../core/scene/index'
import type { RecordPageMode } from '../index/frontend-config'

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

function formatByteLength(byteLength: number | undefined): string | undefined {
  if (typeof byteLength !== 'number' || !Number.isFinite(byteLength) || byteLength <= 0) {
    return undefined
  }

  if (byteLength < 1024) {
    return `${byteLength} B`
  }

  return `${(byteLength / 1024).toFixed(1)} KB`
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
          ? `可输入或点选${fieldDefinition.label}`
          : `请输入${fieldDefinition.label}`),
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

export function buildPhotoPresentation(
  photo: PhotoAsset | undefined,
  mode: RecordPageMode
): PhotoPresentation {
  if (!photo) {
    if (mode === 'create') {
      return {
        hasPhoto: false,
        photoPath: '',
        photoMeta: '照片不是必填项；如果现在不拍，创建后仍可以补一张，但补上后不可更换。',
      }
    }

    if (mode === 'edit') {
      return {
        hasPhoto: false,
        photoPath: '',
        photoMeta: '该记录当前没有照片，可在本次编辑阶段补一张；补上后不可更换。',
      }
    }

    return {
      hasPhoto: false,
      photoPath: '',
      photoMeta: '当前还没有线索照片。',
    }
  }

  const photoMetaParts = [
    trimOptionalString(photo.fileName),
    formatByteLength(photo.byteLength),
    typeof photo.width === 'number' && typeof photo.height === 'number'
      ? `${photo.width} × ${photo.height}`
      : undefined,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return {
    hasPhoto: true,
    photoPath: photo.localPath,
    photoMeta: photoMetaParts.join(' · '),
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
  return `${getSceneLabel(summary.sceneType)} · 更新于 ${formatTimestamp(summary.updatedAt)}`
}

export function buildSummaryAnchorsText(summary: ItemSummary): string {
  return summary.primaryAnchors.length > 0
    ? summary.primaryAnchors.join(' · ')
    : '还没有补充场景线索'
}

export function buildNoteDisplayText(note: string): string {
  return trimOptionalString(note) ?? '还没有补充备注。'
}
