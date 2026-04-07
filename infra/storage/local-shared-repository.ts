import type {
  SharedImageState,
  SharedItem,
  SharedRemotePhoto,
} from '../../core/types'
import {
  freezeItem,
  normalizeItemId,
  normalizeTimestampMs,
} from '../../core/item'
import { JsonFileStore } from './json-file-store'
import { StorageError } from './storage-errors'
import {
  createStoragePaths,
  getSharedFilePathFromDirectoryName,
  getSharedStoragePaths,
  type StoragePaths,
} from './storage-paths'

export interface LocalSharedRepositoryOptions {
  readonly fileStore?: JsonFileStore
  readonly rootBasePath?: string
  readonly storagePaths?: StoragePaths
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function normalizeShareId(shareId: string): string {
  const normalizedShareId = trimOptionalString(shareId)
  if (!normalizedShareId) {
    throw new StorageError(
      'invalid_stored_item',
      'read_json',
      'Shared item shareId must be a non-empty string.'
    )
  }

  return normalizedShareId
}

function normalizeSharedRemotePhoto(photo: SharedRemotePhoto): SharedRemotePhoto {
  const fileId = trimOptionalString(photo.fileId)
  const fileName = trimOptionalString(photo.fileName)
  const mimeType = trimOptionalString(photo.mimeType)

  if (!fileId || !fileName || !mimeType) {
    throw new StorageError(
      'invalid_stored_item',
      'read_json',
      'Shared remote photo metadata is invalid.'
    )
  }

  const normalizedPhoto: SharedRemotePhoto = {
    fileId,
    fileName,
    mimeType,
    byteLength:
      typeof photo.byteLength === 'number' && Number.isFinite(photo.byteLength)
        ? Math.max(0, Math.floor(photo.byteLength))
        : undefined,
    width:
      typeof photo.width === 'number' && Number.isFinite(photo.width)
        ? Math.max(0, Math.floor(photo.width))
        : undefined,
    height:
      typeof photo.height === 'number' && Number.isFinite(photo.height)
        ? Math.max(0, Math.floor(photo.height))
        : undefined,
  }

  return Object.freeze(normalizedPhoto)
}

function normalizeSharedImageState(
  value: unknown,
  hasRemoteImage: boolean,
  hasLocalPhotos: boolean
): SharedImageState {
  if (hasLocalPhotos) {
    return 'ready'
  }

  if (!hasRemoteImage) {
    return 'none'
  }

  return value === 'pending' || value === 'ready' || value === 'failed' || value === 'none'
    ? value
    : 'pending'
}

export function freezeSharedItem(item: SharedItem): SharedItem {
  const baseItem = freezeItem(item)
  const remotePhotos = Object.freeze(
    (item.remotePhotos ?? []).map((photo) => normalizeSharedRemotePhoto(photo))
  )
  const remoteImageFileId =
    trimOptionalString(item.remoteImageFileId) ?? remotePhotos[0]?.fileId
  const hasRemoteImage =
    Boolean(item.hasRemoteImage) ||
    remotePhotos.length > 0 ||
    typeof remoteImageFileId === 'string'

  return Object.freeze({
    ...baseItem,
    shareId: normalizeShareId(item.shareId),
    expiresAt: normalizeTimestampMs(item.expiresAt, 'Shared item expiresAt'),
    sourceItemId: normalizeItemId(item.sourceItemId),
    hasRemoteImage,
    imageState: normalizeSharedImageState(
      item.imageState,
      hasRemoteImage,
      baseItem.photos.length > 0
    ),
    remoteImageFileId,
    remotePhotos,
  })
}

export class LocalSharedRepository {
  private readonly fileStore: JsonFileStore
  private readonly storagePaths: StoragePaths

  constructor(options: LocalSharedRepositoryOptions = {}) {
    this.fileStore = options.fileStore ?? new JsonFileStore()
    this.storagePaths =
      options.storagePaths ?? createStoragePaths(options.rootBasePath)
  }

  async getByShareId(shareId: string): Promise<SharedItem | null> {
    this.ensureStorageLayout()

    const normalizedShareId = normalizeShareId(shareId)
    const sharedPaths = getSharedStoragePaths(this.storagePaths, normalizedShareId)
    const rawSharedItem =
      this.fileStore.readJsonOrNull<unknown>(sharedPaths.sharedItemFilePath)

    if (rawSharedItem === null) {
      return null
    }

    return this.normalizeStoredSharedItem(rawSharedItem, sharedPaths.sharedItemFilePath)
  }

  async save(item: SharedItem): Promise<void> {
    this.ensureStorageLayout()

    const sharedItem = freezeSharedItem(item)
    const sharedPaths = getSharedStoragePaths(this.storagePaths, sharedItem.shareId)

    this.fileStore.ensureDirectory(sharedPaths.sharedItemDir)
    if (sharedItem.photos.length > 0) {
      this.fileStore.ensureDirectory(sharedPaths.photosDir)
    }
    this.fileStore.writeJsonAtomic(sharedPaths.sharedItemFilePath, sharedItem)
  }

  async deleteByShareId(shareId: string): Promise<void> {
    this.ensureStorageLayout()

    const normalizedShareId = normalizeShareId(shareId)
    const sharedPaths = getSharedStoragePaths(this.storagePaths, normalizedShareId)
    this.fileStore.deleteDirectoryIfExists(sharedPaths.sharedItemDir, true)
  }

  async listAll(): Promise<readonly SharedItem[]> {
    this.ensureStorageLayout()

    const directoryNames = this.fileStore.listDirectoryNames(this.storagePaths.sharedDir)
    const sharedItems: SharedItem[] = []

    for (const directoryName of directoryNames) {
      const sharedFilePath = getSharedFilePathFromDirectoryName(
        this.storagePaths,
        directoryName
      )
      const rawSharedItem = this.fileStore.readJsonOrNull<unknown>(sharedFilePath)

      if (rawSharedItem === null) {
        continue
      }

      try {
        sharedItems.push(this.normalizeStoredSharedItem(rawSharedItem, sharedFilePath))
      } catch {
        // Skip invalid cached shares so healthy entries remain readable.
      }
    }

    return Object.freeze(sharedItems)
  }

  private ensureStorageLayout(): void {
    this.fileStore.ensureDirectory(this.storagePaths.rootDir)
    this.fileStore.ensureDirectory(this.storagePaths.sharedDir)
  }

  private normalizeStoredSharedItem(rawItem: unknown, filePath: string): SharedItem {
    try {
      return freezeSharedItem(rawItem as SharedItem)
    } catch (error) {
      throw new StorageError(
        'invalid_stored_item',
        'read_json',
        `Stored shared item file "${filePath}" is invalid.`,
        {
          path: filePath,
          details: { cause: error },
        }
      )
    }
  }
}
