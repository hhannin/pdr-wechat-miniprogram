import type {
  Item,
  ItemSummary,
  SceneFieldDefinition,
} from '../types'
import {
  getSceneFieldDefinitions,
  getSceneFieldOptionLabel,
} from '../scene'

const DEFAULT_MAX_SUMMARY_ANCHORS = 4
const DEFAULT_NOTE_PREVIEW_LENGTH = 80

export interface BuildItemSummaryOptions {
  readonly maxAnchors?: number
  readonly notePreviewLength?: number
}

function buildAnchorDisplay(
  item: Item,
  field: SceneFieldDefinition
): string | undefined {
  const value = item.anchorValues[field.key]
  if (!value) {
    return undefined
  }

  const optionLabel = getSceneFieldOptionLabel(item.sceneType, field.key, value)
  const displayValue = optionLabel ?? value

  return `${field.label}: ${displayValue}`
}

function buildPrimaryAnchors(
  item: Item,
  maxAnchors: number
): readonly string[] {
  const fields = getSceneFieldDefinitions(item.sceneType)
  const anchors: string[] = []

  for (const field of fields) {
    if (!field.primary) {
      continue
    }

    const anchorDisplay = buildAnchorDisplay(item, field)
    if (!anchorDisplay) {
      continue
    }

    anchors.push(anchorDisplay)
    if (anchors.length >= maxAnchors) {
      return Object.freeze(anchors)
    }
  }

  for (const field of fields) {
    if (field.primary) {
      continue
    }

    const anchorDisplay = buildAnchorDisplay(item, field)
    if (!anchorDisplay) {
      continue
    }

    anchors.push(anchorDisplay)
    if (anchors.length >= maxAnchors) {
      break
    }
  }

  return Object.freeze(anchors)
}

function buildNotePreview(note: string, maxLength: number): string {
  const compactNote = note.replace(/\s+/g, ' ').trim()
  if (compactNote.length <= maxLength) {
    return compactNote
  }

  return `${compactNote.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function buildItemSummary(
  item: Item,
  options: BuildItemSummaryOptions = {}
): ItemSummary {
  const maxAnchors = Number.isInteger(options.maxAnchors)
    ? Math.max(0, options.maxAnchors ?? 0)
    : DEFAULT_MAX_SUMMARY_ANCHORS
  const notePreviewLength = Number.isInteger(options.notePreviewLength)
    ? Math.max(1, options.notePreviewLength ?? 1)
    : DEFAULT_NOTE_PREVIEW_LENGTH

  return Object.freeze({
    id: item.id,
    sceneType: item.sceneType,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    locationName: item.location.name,
    address: item.location.address,
    coverPhotoPath: item.photos[0]?.localPath,
    primaryAnchors: buildPrimaryAnchors(item, maxAnchors),
    notePreview: buildNotePreview(item.note, notePreviewLength),
  })
}
