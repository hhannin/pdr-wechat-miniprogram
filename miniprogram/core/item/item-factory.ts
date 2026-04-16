import type {
  CreateItemInput,
  Item,
  ItemId,
  TimestampMs,
} from '../types'
import { ITEM_SCHEMA_VERSION } from '../types'
import {
  assertSceneType,
  cloneTimestamped,
  computeNextUpdatedAt,
  createDefaultItemId,
  freezeItem,
  normalizeLocationSnapshot,
  normalizeItemId,
  normalizeNote,
  normalizePhotoAssets,
  normalizeSceneFieldValuesForScene,
  normalizeTimestampMs,
} from './item-utils'

interface ItemFactoryDependencies {
  readonly now?: () => TimestampMs
  readonly idGenerator?: () => ItemId
}

function createItemBase(
  input: CreateItemInput,
  dependencies: ItemFactoryDependencies = {}
): Item {
  assertSceneType(input.sceneType)

  const now = normalizeTimestampMs(
    dependencies.now?.() ?? Date.now(),
    'Item creation timestamp'
  )
  const itemId = normalizeItemId(
    dependencies.idGenerator?.() ?? createDefaultItemId()
  )

  const baseItem = {
    schemaVersion: ITEM_SCHEMA_VERSION,
    id: itemId,
    sceneType: input.sceneType,
    anchorValues: normalizeSceneFieldValuesForScene(
      input.sceneType,
      input.anchorValues
    ),
    note: normalizeNote(input.note),
    reminderAt: input.reminderAt,
    reminderSyncState: input.reminderSyncState,
    location: normalizeLocationSnapshot(input.location),
    photos: normalizePhotoAssets(input.photos),
  }

  const itemWithTimestamps = cloneTimestamped(baseItem, {
    createdAt: now,
    updatedAt: computeNextUpdatedAt(undefined, now),
  })

  return freezeItem(itemWithTimestamps)
}

export function createItem(
  input: CreateItemInput,
  dependencies: ItemFactoryDependencies = {}
): Item {
  return createItemBase(input, dependencies)
}
