import type { Item, SceneFieldValueMap, TimestampMs, UpdateEditableItemInput } from '../types'
import {
  assertSceneType,
  areSceneFieldValuesEqual,
  computeNextUpdatedAt,
  freezeItem,
  normalizeNote,
  normalizeSceneFieldValuesForScene,
  normalizeTimestampMs,
  sanitizeSceneFieldValuesForScene,
} from './item-utils'

interface UpdateEditableItemDependencies {
  readonly now?: () => TimestampMs
}

function resolveAnchorValues(
  currentItem: Item,
  nextSceneType: Item['sceneType'],
  nextAnchorValues: SceneFieldValueMap | undefined
): SceneFieldValueMap {
  if (nextAnchorValues !== undefined) {
    return normalizeSceneFieldValuesForScene(nextSceneType, nextAnchorValues)
  }

  if (nextSceneType !== currentItem.sceneType) {
    return sanitizeSceneFieldValuesForScene(nextSceneType, currentItem.anchorValues)
  }

  return currentItem.anchorValues
}

export function updateEditableItem(
  currentItem: Item,
  input: UpdateEditableItemInput,
  dependencies: UpdateEditableItemDependencies = {}
): Item {
  const nextSceneType = input.sceneType ?? currentItem.sceneType
  assertSceneType(nextSceneType)

  const nextAnchorValues = resolveAnchorValues(
    currentItem,
    nextSceneType,
    input.anchorValues
  )

  const nextNote =
    input.note === undefined ? currentItem.note : normalizeNote(input.note)

  const hasChanges =
    nextSceneType !== currentItem.sceneType ||
    nextNote !== currentItem.note ||
    !areSceneFieldValuesEqual(nextAnchorValues, currentItem.anchorValues)

  if (!hasChanges) {
    return currentItem
  }

  const now = normalizeTimestampMs(
    dependencies.now?.() ?? Date.now(),
    'Item update timestamp'
  )

  return freezeItem({
    ...currentItem,
    sceneType: nextSceneType,
    anchorValues: nextAnchorValues,
    note: nextNote,
    updatedAt: computeNextUpdatedAt(currentItem.updatedAt, now),
  })
}
