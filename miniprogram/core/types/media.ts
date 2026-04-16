import type { EntityId, TimestampMs } from './common'

export const PHOTO_SOURCES = ['camera'] as const

export type PhotoSource = typeof PHOTO_SOURCES[number]

export interface PhotoAsset {
  readonly id: EntityId
  readonly createdAt: TimestampMs
  readonly source: PhotoSource
  readonly localPath: string
  readonly fileName: string
  readonly mimeType: string
  readonly byteLength?: number
  readonly width?: number
  readonly height?: number
}
