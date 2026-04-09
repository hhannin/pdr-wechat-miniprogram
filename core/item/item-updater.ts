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
  const nextReminderAt =
    input.reminderAt === undefined
      ? currentItem.reminderAt
      : input.reminderAt === null
        ? undefined
        : normalizeTimestampMs(input.reminderAt, 'Item reminderAt')
  const nextReminderSyncState =
    input.reminderAt === undefined && input.reminderSyncState === undefined
      ? currentItem.reminderSyncState
      : nextReminderAt === undefined
        ? undefined
        : input.reminderSyncState ?? currentItem.reminderSyncState ?? 'unscheduled'

  const hasChanges =
    nextNote !== currentItem.note ||
    !areSceneFieldValuesEqual(nextAnchorValues, currentItem.anchorValues) ||
    nextReminderAt !== currentItem.reminderAt ||
    nextReminderSyncState !== currentItem.reminderSyncState

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
    reminderAt: nextReminderAt,
    reminderSyncState: nextReminderSyncState,
    updatedAt: computeNextUpdatedAt(currentItem.updatedAt, now),
  })
}
