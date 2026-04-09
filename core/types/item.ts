import type { EntityId, TimestampMs } from './common'
import type { SceneFieldValueMap } from './field'
import type { LocationSnapshot } from './location'
import type { PhotoAsset } from './media'
import type { SceneType } from './scene'

export const ITEM_SCHEMA_VERSION = 2 as const

export type ItemSchemaVersion = typeof ITEM_SCHEMA_VERSION
export const REMINDER_SYNC_STATES = [
  'scheduled',
  'unscheduled',
] as const

export type ReminderSyncState = typeof REMINDER_SYNC_STATES[number]

export type ItemId = EntityId

export interface ItemEditableFields {
  readonly sceneType: SceneType
  readonly anchorValues: SceneFieldValueMap
  readonly note: string
  readonly reminderAt?: TimestampMs
  readonly reminderSyncState?: ReminderSyncState
}

export interface ItemDraft extends ItemEditableFields {
  readonly location?: LocationSnapshot
  readonly photos: readonly PhotoAsset[]
}

export interface Item extends ItemEditableFields {
  readonly schemaVersion: ItemSchemaVersion
  readonly id: ItemId
  readonly createdAt: TimestampMs
  readonly updatedAt: TimestampMs
  readonly pinnedAt?: TimestampMs
  readonly location: LocationSnapshot
  readonly photos: readonly PhotoAsset[]
}

export interface CreateItemInput {
  readonly sceneType: SceneType
  readonly location: LocationSnapshot
  readonly anchorValues?: SceneFieldValueMap
  readonly note?: string
  readonly reminderAt?: TimestampMs
  readonly reminderSyncState?: ReminderSyncState
  readonly photos?: readonly PhotoAsset[]
}

export interface UpdateEditableItemInput {
  readonly anchorValues?: SceneFieldValueMap
  readonly note?: string
  readonly reminderAt?: TimestampMs | null
  readonly reminderSyncState?: ReminderSyncState
}

export interface AttachPhotoIfAbsentInput {
  readonly photo: PhotoAsset
}

export interface ItemSummary {
  readonly id: ItemId
  readonly sceneType: SceneType
  readonly createdAt: TimestampMs
  readonly updatedAt: TimestampMs
  readonly pinnedAt?: TimestampMs
  readonly reminderAt?: TimestampMs
  readonly reminderSyncState?: ReminderSyncState
  readonly locationName: string
  readonly address: string
  readonly coverPhotoPath?: string
  readonly primaryAnchors: readonly string[]
  readonly notePreview: string
}
