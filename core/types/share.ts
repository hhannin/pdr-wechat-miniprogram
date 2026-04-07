import type { TimestampMs } from './common'
import type { SceneFieldKey, SceneFieldValueMap } from './field'
import type { Item, ItemId } from './item'
import type { LocationSnapshot } from './location'
import type { PhotoAsset } from './media'
import type { SceneType } from './scene'

export const SHARED_IMAGE_STATES = [
  'none',
  'pending',
  'ready',
  'failed',
] as const

export type SharedImageState = typeof SHARED_IMAGE_STATES[number]

export interface SharedRemotePhoto {
  readonly fileId: string
  readonly fileName: string
  readonly mimeType: string
  readonly byteLength?: number
  readonly width?: number
  readonly height?: number
}

export interface SharedItem extends Item {
  readonly shareId: string
  readonly expiresAt: TimestampMs
  readonly sourceItemId: ItemId
  readonly hasRemoteImage: boolean
  readonly imageState: SharedImageState
  readonly remoteImageFileId?: string
  readonly remotePhotos: readonly SharedRemotePhoto[]
}

export interface ShareSnapshotSelection {
  readonly includePhoto: boolean
  readonly includedFieldKeys: readonly SceneFieldKey[]
  readonly includeNote: boolean
}

export interface ShareSnapshotPayload {
  readonly shareId: string
  readonly sourceItemId: ItemId
  readonly expiresAt: TimestampMs
  readonly createdAt: TimestampMs
  readonly updatedAt: TimestampMs
  readonly sceneType: SceneType
  readonly location: LocationSnapshot
  readonly anchorValues: SceneFieldValueMap
  readonly note: string
  readonly hasImage: boolean
  readonly remotePhotos: readonly SharedRemotePhoto[]
  readonly shareCardTitle: string
  readonly shareCardSubtitle: string
}

export interface CreateShareSnapshotRequest {
  readonly requestedShareId: string
  readonly sourceItemId: ItemId
  readonly createdAt: TimestampMs
  readonly updatedAt: TimestampMs
  readonly sceneType: SceneType
  readonly location: LocationSnapshot
  readonly anchorValues: SceneFieldValueMap
  readonly note: string
  readonly remotePhotos: readonly SharedRemotePhoto[]
  readonly shareCardTitle: string
  readonly shareCardSubtitle: string
}

export interface CreateShareSnapshotResult {
  readonly shareId: string
  readonly expiresAt: TimestampMs
  readonly shareCardTitle: string
  readonly shareCardSubtitle: string
}

export interface GetShareSnapshotReadyResult {
  readonly status: 'ready'
  readonly snapshot: ShareSnapshotPayload
}

export interface GetShareSnapshotExpiredResult {
  readonly status: 'expired'
}

export type GetShareSnapshotResult =
  | GetShareSnapshotReadyResult
  | GetShareSnapshotExpiredResult

export interface PreparedShareSnapshot {
  readonly shareId: string
  readonly expiresAt: TimestampMs
  readonly shareCardTitle: string
  readonly shareCardSubtitle: string
  readonly previewItem: SharedItem
}

export interface SharePreviewContent {
  readonly sceneType: SceneType
  readonly location: LocationSnapshot
  readonly anchorValues: SceneFieldValueMap
  readonly note: string
  readonly photos: readonly PhotoAsset[]
}
