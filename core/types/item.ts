import type { EntityId, TimestampMs } from './common'
import type { SceneFieldValueMap } from './field'
import type { LocationSnapshot } from './location'
import type { PhotoAsset } from './media'
import type { SceneType } from './scene'

export const ITEM_SCHEMA_VERSION = 1 as const

export type ItemSchemaVersion = typeof ITEM_SCHEMA_VERSION

export type ItemId = EntityId

export interface ItemEditableFields {
  readonly sceneType: SceneType
  readonly anchorValues: SceneFieldValueMap
  readonly note: string
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
  readonly location: LocationSnapshot
  readonly photos: readonly PhotoAsset[]
}

export interface QuickCreateItemInput {
  readonly sceneType: SceneType
  readonly location: LocationSnapshot
}

export interface CompleteCreateItemInput extends QuickCreateItemInput {
  readonly anchorValues?: SceneFieldValueMap
  readonly note?: string
  readonly photos?: readonly PhotoAsset[]
}

export interface UpdateEditableItemInput {
  readonly sceneType?: SceneType
  readonly anchorValues?: SceneFieldValueMap
  readonly note?: string
}

export interface ItemSummary {
  readonly id: ItemId
  readonly sceneType: SceneType
  readonly createdAt: TimestampMs
  readonly updatedAt: TimestampMs
  readonly locationName: string
  readonly address: string
  readonly coverPhotoPath?: string
  readonly primaryAnchors: readonly string[]
  readonly notePreview: string
}
