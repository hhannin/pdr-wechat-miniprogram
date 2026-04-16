import type { PhotoAsset } from '../../core/types'
import { normalizePhotoAssets } from '../../core/item'
import { JsonFileStore } from './json-file-store'
import { StorageError } from './storage-errors'
import {
  createStoragePaths,
  getSharedStoragePaths,
  joinStoragePath,
  type SharedStoragePaths,
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

function normalizeShareId(shareId: string): string {
  const normalizedShareId = shareId.trim()
  if (normalizedShareId.length === 0) {
    throw new StorageError(
      'invalid_stored_item',
      'copy_file',
      'Shared photo shareId must be a non-empty string.'
    )
  }

  return normalizedShareId
}

export interface SharedPhotoStoreOptions {
  readonly fileStore?: JsonFileStore
  readonly rootBasePath?: string
  readonly storagePaths?: StoragePaths
}

export class SharedPhotoStore {
  private readonly fileStore: JsonFileStore
  private readonly storagePaths: StoragePaths

  constructor(options: SharedPhotoStoreOptions = {}) {
    this.fileStore = options.fileStore ?? new JsonFileStore()
    this.storagePaths =
      options.storagePaths ?? createStoragePaths(options.rootBasePath)
  }

  persistPhotos(
    shareId: string,
    photos?: readonly PhotoAsset[]
  ): readonly PhotoAsset[] {
    const normalizedPhotos = normalizePhotoAssets(photos)
    if (normalizedPhotos.length === 0) {
      return normalizedPhotos
    }

    const sharedPaths = this.ensureSharedPhotoDirectory(normalizeShareId(shareId))

    return Object.freeze(
      normalizedPhotos.map((photo) => this.persistSinglePhoto(sharedPaths, photo))
    )
  }

  deleteAll(shareId: string): void {
    const sharedPaths = getSharedStoragePaths(this.storagePaths, normalizeShareId(shareId))
    this.fileStore.deleteDirectoryIfExists(sharedPaths.photosDir, true)
  }

  private ensureSharedPhotoDirectory(shareId: string): SharedStoragePaths {
    const sharedPaths = getSharedStoragePaths(this.storagePaths, shareId)
    this.fileStore.ensureDirectory(this.storagePaths.rootDir)
    this.fileStore.ensureDirectory(this.storagePaths.sharedDir)
    this.fileStore.ensureDirectory(sharedPaths.sharedItemDir)
    this.fileStore.ensureDirectory(sharedPaths.photosDir)
    return sharedPaths
  }

  private persistSinglePhoto(
    sharedPaths: SharedStoragePaths,
    photo: PhotoAsset
  ): PhotoAsset {
    const targetFilePath = joinStoragePath(
      sharedPaths.photosDir,
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
