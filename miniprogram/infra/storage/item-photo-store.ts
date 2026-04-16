import type { ItemId, PhotoAsset } from '../../core/types'
import { normalizeItemId, normalizePhotoAssets } from '../../core/item'
import { JsonFileStore } from './json-file-store'
import { StorageError } from './storage-errors'
import {
  createStoragePaths,
  getItemStoragePaths,
  joinStoragePath,
  type ItemStoragePaths,
  type StoragePaths,
} from './storage-paths'

const MIME_TYPE_EXTENSION_MAP = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
} as const)

function trimTrailingSeparators(value: string): string {
  return value.replace(/\/+$/g, '')
}

function normalizeComparablePath(path: string): string {
  return trimTrailingSeparators(path)
}

function isSamePath(left: string, right: string): boolean {
  return normalizeComparablePath(left) === normalizeComparablePath(right)
}

function extractExtension(fileName: string): string | undefined {
  const normalizedFileName = fileName.trim().toLowerCase()
  const extensionIndex = normalizedFileName.lastIndexOf('.')

  if (extensionIndex < 0 || extensionIndex === normalizedFileName.length - 1) {
    return undefined
  }

  return normalizedFileName.slice(extensionIndex)
}

function resolveFileExtension(photo: PhotoAsset): string {
  const fileNameExtension = extractExtension(photo.fileName)
  if (fileNameExtension) {
    return fileNameExtension
  }

  return MIME_TYPE_EXTENSION_MAP[photo.mimeType as keyof typeof MIME_TYPE_EXTENSION_MAP] ?? '.jpg'
}

function sanitizeFileStem(value: string): string {
  const sanitizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitizedValue.length > 0 ? sanitizedValue : 'photo'
}

function buildPhotoFileName(photo: PhotoAsset): string {
  return `${sanitizeFileStem(photo.id)}${resolveFileExtension(photo)}`
}

export interface ItemPhotoStoreOptions {
  readonly fileStore?: JsonFileStore
  readonly rootBasePath?: string
  readonly storagePaths?: StoragePaths
}

export class ItemPhotoStore {
  private readonly fileStore: JsonFileStore
  private readonly storagePaths: StoragePaths

  constructor(options: ItemPhotoStoreOptions = {}) {
    this.fileStore = options.fileStore ?? new JsonFileStore()
    this.storagePaths =
      options.storagePaths ?? createStoragePaths(options.rootBasePath)
  }

  persistPhoto(itemId: ItemId, photo: PhotoAsset): PhotoAsset {
    const persistedPhotos = this.persistPhotos(itemId, [photo])
    return persistedPhotos[0]
  }

  persistPhotos(
    itemId: ItemId,
    photos?: readonly PhotoAsset[]
  ): readonly PhotoAsset[] {
    const normalizedPhotos = normalizePhotoAssets(photos)
    if (normalizedPhotos.length === 0) {
      return normalizedPhotos
    }

    const itemPaths = this.ensureItemPhotoDirectory(normalizeItemId(itemId))

    return Object.freeze(
      normalizedPhotos.map((photo) => this.persistSinglePhoto(itemPaths, photo))
    )
  }

  deleteAll(itemId: ItemId): void {
    const itemPaths = getItemStoragePaths(this.storagePaths, normalizeItemId(itemId))
    this.fileStore.deleteDirectoryIfExists(itemPaths.photosDir, true)
  }

  private ensureItemPhotoDirectory(itemId: ItemId): ItemStoragePaths {
    const itemPaths = getItemStoragePaths(this.storagePaths, itemId)
    this.fileStore.ensureDirectory(this.storagePaths.rootDir)
    this.fileStore.ensureDirectory(this.storagePaths.itemsDir)
    this.fileStore.ensureDirectory(itemPaths.itemDir)
    this.fileStore.ensureDirectory(itemPaths.photosDir)
    return itemPaths
  }

  private persistSinglePhoto(
    itemPaths: ItemStoragePaths,
    photo: PhotoAsset
  ): PhotoAsset {
    const targetFilePath = joinStoragePath(
      itemPaths.photosDir,
      buildPhotoFileName(photo)
    )

    if (isSamePath(photo.localPath, targetFilePath)) {
      if (!this.fileStore.fileExists(targetFilePath)) {
        throw new StorageError(
          'file_read_failed',
          'copy_file',
          `Photo file "${targetFilePath}" does not exist.`,
          { path: targetFilePath }
        )
      }

      return photo
    }

    this.fileStore.copyFile(photo.localPath, targetFilePath)

    return Object.freeze({
      ...photo,
      localPath: targetFilePath,
    })
  }
}
