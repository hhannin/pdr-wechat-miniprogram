import {
  LOCATION_SELECTION_SOURCES,
  ITEM_SCHEMA_VERSION,
  SCENE_TYPES,
  type Item,
  type ItemId,
  type ItemSchemaVersion,
  type LocationSnapshot,
  type PhotoAsset,
  type SceneFieldValueMap,
  type SceneType,
  type TimestampMs,
} from '../types'
import {
  sanitizeSceneFieldValues,
  validateSceneFieldValues,
} from '../scene'
import { ItemDomainError } from './item-errors'

export const ITEM_NOTE_MAX_LENGTH = 2000
export const ITEM_MAX_PHOTO_COUNT = 9
export const DEFAULT_LIST_RECENT_LIMIT = 20
export const MAX_LIST_RECENT_LIMIT = 100

const EMPTY_PHOTO_ASSETS = Object.freeze([]) as readonly PhotoAsset[]
const EMPTY_SCENE_FIELD_VALUES = Object.freeze({}) as SceneFieldValueMap

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (!isFiniteNumber(value) || value < 0) {
    return undefined
  }

  return Math.floor(value)
}

function inferMimeType(fileName: string): string {
  const lowerCaseFileName = fileName.toLowerCase()

  if (lowerCaseFileName.endsWith('.png')) {
    return 'image/png'
  }

  if (lowerCaseFileName.endsWith('.webp')) {
    return 'image/webp'
  }

  if (lowerCaseFileName.endsWith('.heic')) {
    return 'image/heic'
  }

  return 'image/jpeg'
}

function inferFileName(localPath: string): string {
  const normalizedPath = localPath.replace(/\\/g, '/')
  const segments = normalizedPath.split('/')
  const inferredName = segments[segments.length - 1]?.trim()

  return inferredName && inferredName.length > 0
    ? inferredName
    : `photo-${Date.now()}`
}

function derivePhotoId(photo: {
  readonly createdAt: TimestampMs
  readonly fileName: string
  readonly localPath: string
}): string {
  const baseName = photo.fileName || inferFileName(photo.localPath)
  const normalizedBaseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `photo_${photo.createdAt}_${normalizedBaseName || 'asset'}`
}

export function createDefaultItemId(): ItemId {
  return `item_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

export function assertValidItemId(id: string): asserts id is ItemId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ItemDomainError('invalid_item_id', 'Item id must be a non-empty string.', {
      id,
    })
  }
}

export function normalizeItemId(id: string): ItemId {
  assertValidItemId(id)
  return id.trim()
}

export function normalizeTimestampMs(
  value: unknown,
  label: string
): TimestampMs {
  if (!isFiniteNumber(value) || value <= 0) {
    throw new ItemDomainError('invalid_timestamp', `${label} must be a positive timestamp.`, {
      value,
    })
  }

  return Math.floor(value)
}

export function assertSceneType(sceneType: string): asserts sceneType is SceneType {
  if (!(SCENE_TYPES as readonly string[]).includes(sceneType)) {
    throw new ItemDomainError('invalid_scene_type', `Unsupported scene type "${sceneType}".`, {
      sceneType,
    })
  }
}

export function normalizeNote(note: string | undefined): string {
  if (note === undefined) {
    return ''
  }

  if (typeof note !== 'string') {
    throw new ItemDomainError('invalid_note', 'Item note must be a string.', {
      note,
    })
  }

  const normalizedNote = note.replace(/\r\n/g, '\n').trim()
  if (normalizedNote.length > ITEM_NOTE_MAX_LENGTH) {
    throw new ItemDomainError(
      'invalid_note',
      `Item note must be at most ${ITEM_NOTE_MAX_LENGTH} characters.`,
      { noteLength: normalizedNote.length }
    )
  }

  return normalizedNote
}

export function normalizeLocationSnapshot(
  location: LocationSnapshot
): LocationSnapshot {
  if (!location || typeof location !== 'object') {
    throw new ItemDomainError('invalid_location', 'Location must be an object.')
  }

  const latitude = location.latitude
  const longitude = location.longitude

  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    throw new ItemDomainError('invalid_location', 'Location latitude is out of range.', {
      latitude,
    })
  }

  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    throw new ItemDomainError('invalid_location', 'Location longitude is out of range.', {
      longitude,
    })
  }

  if (location.coordinateSystem !== 'gcj02') {
    throw new ItemDomainError(
      'invalid_location',
      'Location coordinate system must be "gcj02".',
      { coordinateSystem: location.coordinateSystem }
    )
  }

  if (
    !(LOCATION_SELECTION_SOURCES as readonly string[]).includes(location.source)
  ) {
    throw new ItemDomainError('invalid_location', 'Location source is invalid.', {
      source: location.source,
    })
  }

  const name = trimOptionalString(location.name)
  const address = trimOptionalString(location.address)

  if (!name && !address) {
    throw new ItemDomainError(
      'invalid_location',
      'Location name or address must contain a value.'
    )
  }

  return Object.freeze({
    latitude,
    longitude,
    coordinateSystem: 'gcj02' as const,
    source: location.source,
    name: name ?? address ?? '',
    address: address ?? name ?? '',
    province: trimOptionalString(location.province),
    city: trimOptionalString(location.city),
    district: trimOptionalString(location.district),
    street: trimOptionalString(location.street),
    poiId: trimOptionalString(location.poiId),
  })
}

function normalizePhotoAsset(photo: PhotoAsset): PhotoAsset {
  if (!photo || typeof photo !== 'object') {
    throw new ItemDomainError('invalid_photo', 'Photo asset must be an object.', {
      photo,
    })
  }

  const localPath = trimOptionalString(photo.localPath)
  if (!localPath) {
    throw new ItemDomainError('invalid_photo', 'Photo localPath is required.', {
      photo,
    })
  }

  const createdAt = photo.createdAt
  if (!isFiniteNumber(createdAt) || createdAt <= 0) {
    throw new ItemDomainError('invalid_photo', 'Photo createdAt must be a positive timestamp.', {
      photo,
    })
  }

  const fileName = trimOptionalString(photo.fileName) ?? inferFileName(localPath)
  const mimeType = trimOptionalString(photo.mimeType) ?? inferMimeType(fileName)
  const source = photo.source === 'camera' ? 'camera' : undefined

  if (!source) {
    throw new ItemDomainError('invalid_photo', 'Photo source is invalid.', {
      source: photo.source,
    })
  }

  return Object.freeze({
    id: trimOptionalString(photo.id) ?? derivePhotoId({ createdAt, fileName, localPath }),
    createdAt,
    source,
    localPath,
    fileName,
    mimeType,
    byteLength: normalizePositiveInteger(photo.byteLength),
    width: normalizePositiveInteger(photo.width),
    height: normalizePositiveInteger(photo.height),
  })
}

export function normalizePhotoAssets(
  photos?: readonly PhotoAsset[]
): readonly PhotoAsset[] {
  if (photos === undefined) {
    return EMPTY_PHOTO_ASSETS
  }

  if (!Array.isArray(photos)) {
    throw new ItemDomainError('invalid_photo', 'Photos must be provided as an array.', {
      photos,
    })
  }

  if (photos.length > ITEM_MAX_PHOTO_COUNT) {
    throw new ItemDomainError(
      'photo_limit_exceeded',
      `Photo count must not exceed ${ITEM_MAX_PHOTO_COUNT}.`,
      { photoCount: photos.length }
    )
  }

  if (photos.length === 0) {
    return EMPTY_PHOTO_ASSETS
  }

  const normalizedPhotos = photos.map((photo) => normalizePhotoAsset(photo))
  const seenIds = new Set<string>()
  const seenPaths = new Set<string>()

  for (const photo of normalizedPhotos) {
    if (seenIds.has(photo.id)) {
      throw new ItemDomainError('invalid_photo', 'Photo ids must be unique.', {
        photoId: photo.id,
      })
    }

    if (seenPaths.has(photo.localPath)) {
      throw new ItemDomainError('invalid_photo', 'Photo localPath values must be unique.', {
        localPath: photo.localPath,
      })
    }

    seenIds.add(photo.id)
    seenPaths.add(photo.localPath)
  }

  return Object.freeze(normalizedPhotos)
}

export function normalizeSceneFieldValuesForScene(
  sceneType: SceneType,
  values?: SceneFieldValueMap
): SceneFieldValueMap {
  const validationResult = validateSceneFieldValues(sceneType, values)

  if (!validationResult.isValid) {
    throw new ItemDomainError(
      'invalid_scene_fields',
      'Scene field values are invalid for the selected scene.',
      validationResult.issues
    )
  }

  return freezeSceneFieldValues(validationResult.normalizedValues)
}

export function sanitizeSceneFieldValuesForScene(
  sceneType: SceneType,
  values?: SceneFieldValueMap
): SceneFieldValueMap {
  return freezeSceneFieldValues(sanitizeSceneFieldValues(sceneType, values))
}

export function freezeSceneFieldValues(
  values?: SceneFieldValueMap
): SceneFieldValueMap {
  if (!values || Object.keys(values).length === 0) {
    return EMPTY_SCENE_FIELD_VALUES
  }

  return Object.freeze({ ...values })
}

export function areSceneFieldValuesEqual(
  left: SceneFieldValueMap,
  right: SceneFieldValueMap
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (const key of leftKeys) {
    if (left[key as keyof SceneFieldValueMap] !== right[key as keyof SceneFieldValueMap]) {
      return false
    }
  }

  return true
}

export function computeNextUpdatedAt(
  existingUpdatedAt: TimestampMs | undefined,
  nextNow: TimestampMs
): TimestampMs {
  if (existingUpdatedAt === undefined) {
    return nextNow
  }

  return nextNow > existingUpdatedAt ? nextNow : existingUpdatedAt + 1
}

export function normalizeListLimit(
  requestedLimit: number | undefined,
  defaultLimit: number = DEFAULT_LIST_RECENT_LIMIT
): number {
  if (requestedLimit === undefined) {
    return defaultLimit
  }

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit <= 0 ||
    requestedLimit > MAX_LIST_RECENT_LIMIT
  ) {
    throw new ItemDomainError(
      'invalid_list_limit',
      `List limit must be an integer between 1 and ${MAX_LIST_RECENT_LIMIT}.`,
      { limit: requestedLimit }
    )
  }

  return requestedLimit
}

export function freezeItem(item: Item): Item {
  assertSceneType(item.sceneType)

  return Object.freeze({
    schemaVersion: normalizeSchemaVersion(item),
    id: normalizeItemId(item.id),
    createdAt: normalizeTimestampMs(item.createdAt, 'Item createdAt'),
    updatedAt: normalizeTimestampMs(item.updatedAt, 'Item updatedAt'),
    sceneType: item.sceneType,
    anchorValues: freezeSceneFieldValues(item.anchorValues),
    note: normalizeNote(item.note),
    location: normalizeLocationSnapshot(item.location),
    photos: normalizePhotoAssets(item.photos),
  })
}

export function cloneTimestamped<T extends object>(
  value: T,
  timestamps: {
    readonly createdAt: TimestampMs
    readonly updatedAt: TimestampMs
  }
): T & {
  readonly createdAt: TimestampMs
  readonly updatedAt: TimestampMs
} {
  return {
    ...value,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  }
}

function normalizeSchemaVersion(item: Item): ItemSchemaVersion {
  return item.schemaVersion === ITEM_SCHEMA_VERSION
    ? ITEM_SCHEMA_VERSION
    : ITEM_SCHEMA_VERSION
}
