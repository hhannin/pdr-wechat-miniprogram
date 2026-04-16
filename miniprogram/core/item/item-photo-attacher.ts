import type { Item, PhotoAsset, TimestampMs } from '../types'
import { ItemDomainError } from './item-errors'
import {
  computeNextUpdatedAt,
  freezeItem,
  normalizePhotoAssets,
  normalizeTimestampMs,
} from './item-utils'

interface AttachPhotoIfAbsentDependencies {
  readonly now?: () => TimestampMs
}

export function attachPhotoIfAbsent(
  currentItem: Item,
  photo: PhotoAsset,
  dependencies: AttachPhotoIfAbsentDependencies = {}
): Item {
  if (currentItem.photos.length > 0) {
    throw new ItemDomainError(
      'photo_already_attached',
      '该记录已有照片，当前不支持更换。',
      { itemId: currentItem.id }
    )
  }

  const normalizedPhotos = normalizePhotoAssets([photo])
  const now = normalizeTimestampMs(
    dependencies.now?.() ?? Date.now(),
    'Item photo attachment timestamp'
  )

  return freezeItem({
    ...currentItem,
    photos: normalizedPhotos,
    updatedAt: computeNextUpdatedAt(currentItem.updatedAt, now),
  })
}
