import type { ItemId, ItemSummary, TimestampMs } from '../../core/types'
import { SCENE_TYPES } from '../../core/types'
import { normalizeItemId, normalizeTimestampMs } from '../../core/item'
import { JsonFileStore } from './json-file-store'
import { StorageError } from './storage-errors'
import type { StoragePaths } from './storage-paths'

const ITEM_INDEX_SCHEMA_VERSION = 1 as const

interface StoredItemIndexFile {
  readonly schemaVersion: typeof ITEM_INDEX_SCHEMA_VERSION
  readonly updatedAt: TimestampMs
  readonly summaries: readonly ItemSummary[]
}

function compareSummariesDescending(left: ItemSummary, right: ItemSummary): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt - left.updatedAt
  }

  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt
  }

  return left.id.localeCompare(right.id)
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string
): string {
  if (typeof value !== 'string') {
    throw new StorageError(
      'invalid_stored_summary',
      'read_json',
      `Stored item summary field "${fieldName}" must be a string.`
    )
  }

  return value.trim()
}

function normalizeSceneType(value: unknown): ItemSummary['sceneType'] {
  if (typeof value !== 'string' || !(SCENE_TYPES as readonly string[]).includes(value)) {
    throw new StorageError(
      'invalid_stored_summary',
      'read_json',
      'Stored item summary contains an invalid scene type.',
      { details: { sceneType: value } }
    )
  }

  return value as ItemSummary['sceneType']
}

function normalizePrimaryAnchors(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return Object.freeze([])
  }

  const anchors = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return Object.freeze(anchors)
}

function normalizeItemSummary(summary: unknown): ItemSummary {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new StorageError(
      'invalid_stored_summary',
      'read_json',
      'Stored item summary must be an object.'
    )
  }

  const rawSummary = summary as Partial<Record<keyof ItemSummary, unknown>>

  return Object.freeze({
    id: normalizeItemId(normalizeRequiredString(rawSummary.id, 'id')),
    sceneType: normalizeSceneType(rawSummary.sceneType),
    createdAt: normalizeTimestampMs(rawSummary.createdAt, 'Stored summary createdAt'),
    updatedAt: normalizeTimestampMs(rawSummary.updatedAt, 'Stored summary updatedAt'),
    locationName: normalizeRequiredString(rawSummary.locationName, 'locationName'),
    address: normalizeRequiredString(rawSummary.address, 'address'),
    coverPhotoPath: normalizeOptionalString(rawSummary.coverPhotoPath),
    primaryAnchors: normalizePrimaryAnchors(rawSummary.primaryAnchors),
    notePreview: normalizeRequiredString(rawSummary.notePreview, 'notePreview'),
  })
}

function deduplicateAndSortSummaries(
  summaries: ReadonlyArray<ItemSummary>
): readonly ItemSummary[] {
  const bestSummaryById = new Map<ItemId, ItemSummary>()

  for (const summary of summaries) {
    const existingSummary = bestSummaryById.get(summary.id)

    if (!existingSummary || compareSummariesDescending(summary, existingSummary) < 0) {
      bestSummaryById.set(summary.id, summary)
    }
  }

  const normalizedSummaries = [...bestSummaryById.values()]
  normalizedSummaries.sort(compareSummariesDescending)

  return Object.freeze(normalizedSummaries)
}

function createEmptyIndex(updatedAt: TimestampMs): StoredItemIndexFile {
  return Object.freeze({
    schemaVersion: ITEM_INDEX_SCHEMA_VERSION,
    updatedAt,
    summaries: Object.freeze([]),
  })
}

function normalizeStoredIndexFile(
  value: unknown,
  fallbackUpdatedAt: TimestampMs
): StoredItemIndexFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageError(
      'invalid_stored_index',
      'read_json',
      'Stored item index must be an object.'
    )
  }

  const rawIndex = value as Partial<Record<'schemaVersion' | 'updatedAt' | 'summaries', unknown>>
  if (rawIndex.schemaVersion !== ITEM_INDEX_SCHEMA_VERSION) {
    throw new StorageError(
      'invalid_stored_index',
      'read_json',
      'Stored item index schema version is invalid.',
      { details: { schemaVersion: rawIndex.schemaVersion } }
    )
  }

  if (!Array.isArray(rawIndex.summaries)) {
    throw new StorageError(
      'invalid_stored_index',
      'read_json',
      'Stored item index summaries must be an array.'
    )
  }

  const summaries = deduplicateAndSortSummaries(
    rawIndex.summaries.map((entry) => normalizeItemSummary(entry))
  )

  const updatedAt =
    typeof rawIndex.updatedAt === 'number' && rawIndex.updatedAt > 0
      ? normalizeTimestampMs(rawIndex.updatedAt, 'Stored item index updatedAt')
      : summaries[0]?.updatedAt ?? fallbackUpdatedAt

  return Object.freeze({
    schemaVersion: ITEM_INDEX_SCHEMA_VERSION,
    updatedAt,
    summaries,
  })
}

function upsertSummaryIntoSortedList(
  summaries: ReadonlyArray<ItemSummary>,
  summary: ItemSummary
): readonly ItemSummary[] {
  const nextSummaries = summaries.filter((entry) => entry.id !== summary.id)

  let insertIndex = nextSummaries.length
  for (let index = 0; index < nextSummaries.length; index += 1) {
    if (compareSummariesDescending(summary, nextSummaries[index]) < 0) {
      insertIndex = index
      break
    }
  }

  nextSummaries.splice(insertIndex, 0, summary)
  return Object.freeze(nextSummaries)
}

export interface ItemIndexStoreOptions {
  readonly now?: () => TimestampMs
}

export class ItemIndexStore {
  private readonly jsonFileStore: JsonFileStore
  private readonly storagePaths: StoragePaths
  private readonly now: () => TimestampMs

  constructor(
    jsonFileStore: JsonFileStore,
    storagePaths: StoragePaths,
    options: ItemIndexStoreOptions = {}
  ) {
    this.jsonFileStore = jsonFileStore
    this.storagePaths = storagePaths
    this.now = options.now ?? Date.now
  }

  listRecent(limit: number): readonly ItemSummary[] {
    const indexFile = this.readIndexFile()
    return Object.freeze(indexFile.summaries.slice(0, limit))
  }

  upsert(summary: ItemSummary, updatedAt: TimestampMs = this.now()): void {
    const normalizedSummary = normalizeItemSummary(summary)
    const currentIndex = this.readIndexFile()

    this.writeIndexFile({
      schemaVersion: ITEM_INDEX_SCHEMA_VERSION,
      updatedAt: normalizeTimestampMs(updatedAt, 'Item index updatedAt'),
      summaries: upsertSummaryIntoSortedList(currentIndex.summaries, normalizedSummary),
    })
  }

  remove(itemId: ItemId, updatedAt: TimestampMs = this.now()): void {
    const normalizedItemId = normalizeItemId(itemId)
    const currentIndex = this.readIndexFile()
    const nextSummaries = currentIndex.summaries.filter(
      (summary) => summary.id !== normalizedItemId
    )

    if (nextSummaries.length === currentIndex.summaries.length) {
      return
    }

    this.writeIndexFile({
      schemaVersion: ITEM_INDEX_SCHEMA_VERSION,
      updatedAt: normalizeTimestampMs(updatedAt, 'Item index updatedAt'),
      summaries: Object.freeze(nextSummaries),
    })
  }

  replaceAll(
    summaries: ReadonlyArray<ItemSummary>,
    updatedAt: TimestampMs = this.now()
  ): void {
    this.writeIndexFile({
      schemaVersion: ITEM_INDEX_SCHEMA_VERSION,
      updatedAt: normalizeTimestampMs(updatedAt, 'Item index updatedAt'),
      summaries: deduplicateAndSortSummaries(
        summaries.map((summary) => normalizeItemSummary(summary))
      ),
    })
  }

  private readIndexFile(): StoredItemIndexFile {
    const rawIndex = this.jsonFileStore.readJsonOrNull<unknown>(
      this.storagePaths.itemIndexFilePath
    )

    if (rawIndex === null) {
      return createEmptyIndex(normalizeTimestampMs(this.now(), 'Item index updatedAt'))
    }

    return normalizeStoredIndexFile(
      rawIndex,
      normalizeTimestampMs(this.now(), 'Item index updatedAt')
    )
  }

  private writeIndexFile(indexFile: StoredItemIndexFile): void {
    this.jsonFileStore.writeJsonAtomic(this.storagePaths.itemIndexFilePath, indexFile)
  }
}
