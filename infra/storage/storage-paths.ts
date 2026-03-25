import type { ItemId } from '../../core/types'
import { StorageError } from './storage-errors'

export const STORAGE_NAMESPACE = 'foots'
export const STORAGE_ROOT_DIRECTORY_NAME = 'storage'
export const STORAGE_ITEMS_DIRECTORY_NAME = 'items'
export const STORAGE_INDEXES_DIRECTORY_NAME = 'indexes'
export const STORAGE_ITEM_INDEX_FILE_NAME = 'item-index.json'
export const STORAGE_ITEM_DATA_FILE_NAME = 'item.json'
export const STORAGE_ITEM_PHOTOS_DIRECTORY_NAME = 'photos'

export interface StoragePaths {
  readonly rootDir: string
  readonly itemsDir: string
  readonly indexesDir: string
  readonly itemIndexFilePath: string
}

export interface ItemStoragePaths {
  readonly itemId: ItemId
  readonly itemDir: string
  readonly itemFilePath: string
  readonly photosDir: string
}

function trimTrailingSeparators(value: string): string {
  return value.replace(/\/+$/g, '')
}

function trimLeadingSeparators(value: string): string {
  return value.replace(/^\/+/g, '')
}

export function joinStoragePath(
  ...segments: ReadonlyArray<string | undefined>
): string {
  const normalizedSegments = segments
    .filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
    .map((segment, index) =>
      index === 0
        ? trimTrailingSeparators(segment)
        : trimLeadingSeparators(trimTrailingSeparators(segment))
    )
    .filter((segment) => segment.length > 0)

  return normalizedSegments.join('/')
}

function resolveRootBasePath(rootBasePath?: string): string {
  const candidateRoot =
    typeof rootBasePath === 'string' && rootBasePath.trim().length > 0
      ? rootBasePath.trim()
      : typeof wx !== 'undefined' &&
          wx.env &&
          typeof wx.env.USER_DATA_PATH === 'string' &&
          wx.env.USER_DATA_PATH.trim().length > 0
        ? wx.env.USER_DATA_PATH.trim()
        : undefined

  if (!candidateRoot) {
    throw new StorageError(
      'unavailable_root_path',
      'resolve_root_path',
      'Unable to resolve mini program local storage root path.'
    )
  }

  return trimTrailingSeparators(candidateRoot)
}

function encodePathSegment(value: string): string {
  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) {
    throw new StorageError(
      'invalid_storage_path',
      'resolve_root_path',
      'Storage path segment must be a non-empty string.',
      { details: { value } }
    )
  }

  return encodeURIComponent(trimmedValue)
}

export function createStoragePaths(rootBasePath?: string): StoragePaths {
  const rootBase = resolveRootBasePath(rootBasePath)
  const rootDir = joinStoragePath(
    rootBase,
    STORAGE_NAMESPACE,
    STORAGE_ROOT_DIRECTORY_NAME
  )
  const itemsDir = joinStoragePath(rootDir, STORAGE_ITEMS_DIRECTORY_NAME)
  const indexesDir = joinStoragePath(rootDir, STORAGE_INDEXES_DIRECTORY_NAME)

  return Object.freeze({
    rootDir,
    itemsDir,
    indexesDir,
    itemIndexFilePath: joinStoragePath(indexesDir, STORAGE_ITEM_INDEX_FILE_NAME),
  })
}

export function getItemStoragePaths(
  storagePaths: StoragePaths,
  itemId: ItemId
): ItemStoragePaths {
  const safeItemDirectoryName = encodePathSegment(itemId)
  const itemDir = joinStoragePath(storagePaths.itemsDir, safeItemDirectoryName)

  return Object.freeze({
    itemId,
    itemDir,
    itemFilePath: joinStoragePath(itemDir, STORAGE_ITEM_DATA_FILE_NAME),
    photosDir: joinStoragePath(itemDir, STORAGE_ITEM_PHOTOS_DIRECTORY_NAME),
  })
}

export function getItemFilePathFromDirectoryName(
  storagePaths: StoragePaths,
  directoryName: string
): string {
  return joinStoragePath(
    storagePaths.itemsDir,
    directoryName,
    STORAGE_ITEM_DATA_FILE_NAME
  )
}
