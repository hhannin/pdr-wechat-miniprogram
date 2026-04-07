import type { Item, TimestampMs, UpdateEditableItemInput } from '../types'
import {
  areSceneFieldValuesEqual,
  computeNextUpdatedAt,
  freezeItem,
  normalizeNote,
  normalizeSceneFieldValuesForScene,
  normalizeTimestampMs,
} from './item-utils'
interface UpdateEditableItemDependencies {
  readonly now?: () => TimestampMs
}

export function updateEditableItem(
  currentItem: Item,
  input: UpdateEditableItemInput,
  dependencies: UpdateEditableItemDependencies = {}
): Item {
  const nextAnchorValues =
    input.anchorValues === undefined
      ? currentItem.anchorValues
      : normalizeSceneFieldValuesForScene(currentItem.sceneType, input.anchorValues)

  const nextNote =
    input.note === undefined ? currentItem.note : normalizeNote(input.note)

  const hasChanges =
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
    anchorValues: nextAnchorValues,
    note: nextNote,
    updatedAt: computeNextUpdatedAt(currentItem.updatedAt, now),
  })
}
