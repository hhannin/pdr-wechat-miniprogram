import type {
  Item,
  ItemId,
  ItemSummary,
  TimestampMs,
} from '../../core/types'
import type {
  ItemRepository,
  ListRecentItemSummariesOptions,
  PersistedItemRecord,
} from '../../core/item'
import {
  buildItemSummary,
  freezeItem,
  normalizeItemId,
  normalizeListLimit,
} from '../../core/item'
import type { BuildItemSummaryOptions } from '../../core/item'
import { JsonFileStore } from './json-file-store'
import { ItemIndexStore } from './item-index'
import { StorageError, isStorageError } from './storage-errors'
import {
  createStoragePaths,
  getItemFilePathFromDirectoryName,
  getItemStoragePaths,
  type StoragePaths,
} from './storage-paths'

export interface LocalItemRepositoryOptions {
  readonly fileStore?: JsonFileStore
  readonly now?: () => TimestampMs
  readonly rootBasePath?: string
  readonly storagePaths?: StoragePaths
  readonly summaryOptions?: BuildItemSummaryOptions
}

export class LocalItemRepository implements ItemRepository {
  private readonly fileStore: JsonFileStore
  private readonly storagePaths: StoragePaths
  private readonly itemIndexStore: ItemIndexStore
  private readonly now: () => TimestampMs
  private readonly summaryOptions?: BuildItemSummaryOptions

  constructor(options: LocalItemRepositoryOptions = {}) {
    this.fileStore = options.fileStore ?? new JsonFileStore()
    this.storagePaths =
      options.storagePaths ?? createStoragePaths(options.rootBasePath)
    this.now = options.now ?? Date.now
    this.summaryOptions = options.summaryOptions
    this.itemIndexStore = new ItemIndexStore(this.fileStore, this.storagePaths, {
      now: this.now,
    })
  }

  async getById(id: ItemId): Promise<Item | null> {
    this.ensureStorageLayout()

    const normalizedItemId = normalizeItemId(id)
    const itemPaths = getItemStoragePaths(this.storagePaths, normalizedItemId)
    const rawItem = this.fileStore.readJsonOrNull<unknown>(itemPaths.itemFilePath)

    if (rawItem === null) {
      return null
    }

    return this.normalizeStoredItem(rawItem, itemPaths.itemFilePath)
  }

  async save(record: PersistedItemRecord): Promise<void> {
    this.ensureStorageLayout()

    const item = freezeItem(record.item)
    const summary = buildItemSummary(item, this.summaryOptions)
    const itemPaths = getItemStoragePaths(this.storagePaths, item.id)

    this.fileStore.ensureDirectory(itemPaths.itemDir)
    if (item.photos.length > 0) {
      this.fileStore.ensureDirectory(itemPaths.photosDir)
    }
    this.fileStore.writeJsonAtomic(itemPaths.itemFilePath, item)

    this.updateIndexAfterMutation(() => {
      this.itemIndexStore.upsert(summary, item.updatedAt)
    })
  }

  async deleteById(id: ItemId): Promise<void> {
    this.ensureStorageLayout()

    const normalizedItemId = normalizeItemId(id)
    const itemPaths = getItemStoragePaths(this.storagePaths, normalizedItemId)

    this.fileStore.deleteDirectoryIfExists(itemPaths.itemDir, true)

    this.updateIndexAfterMutation(() => {
      this.itemIndexStore.remove(normalizedItemId, this.now())
    })
  }

  async listRecentSummaries(
    options: ListRecentItemSummariesOptions = {}
  ): Promise<readonly ItemSummary[]> {
    this.ensureStorageLayout()

    const limit = normalizeListLimit(options.limit)

    try {
      return this.itemIndexStore.listRecent(limit)
    } catch (error) {
      if (!isStorageError(error)) {
        throw error
      }

      this.rebuildIndexFromDisk()
      return this.itemIndexStore.listRecent(limit)
    }
  }

  private ensureStorageLayout(): void {
    this.fileStore.ensureDirectory(this.storagePaths.rootDir)
    this.fileStore.ensureDirectory(this.storagePaths.itemsDir)
    this.fileStore.ensureDirectory(this.storagePaths.indexesDir)
  }

  private normalizeStoredItem(rawItem: unknown, filePath: string): Item {
    try {
      return freezeItem(rawItem as Item)
    } catch (error) {
      throw new StorageError(
        'invalid_stored_item',
        'read_json',
        `Stored item file "${filePath}" is invalid.`,
        {
          path: filePath,
          details: { cause: error },
        }
      )
    }
  }

  private rebuildIndexFromDisk(): void {
    try {
      const itemDirectoryNames = this.fileStore.listDirectoryNames(
        this.storagePaths.itemsDir
      )
      const summaries: ItemSummary[] = []

      for (const directoryName of itemDirectoryNames) {
        const itemFilePath = getItemFilePathFromDirectoryName(
          this.storagePaths,
          directoryName
        )
        const rawItem = this.fileStore.readJsonOrNull<unknown>(itemFilePath)

        if (rawItem === null) {
          continue
        }

        try {
          const item = this.normalizeStoredItem(rawItem, itemFilePath)
          summaries.push(buildItemSummary(item, this.summaryOptions))
        } catch {
          // Skip corrupted item files during index rebuild so valid data remains readable.
        }
      }

      this.itemIndexStore.replaceAll(summaries, this.now())
    } catch (error) {
      throw new StorageError(
        'invalid_stored_index',
        'rebuild_index',
        'Failed to rebuild local item index from disk.',
        {
          path: this.storagePaths.itemIndexFilePath,
          details: { cause: error },
        }
      )
    }
  }

  private updateIndexAfterMutation(updateIndex: () => void): void {
    try {
      updateIndex()
    } catch (error) {
      if (!isStorageError(error)) {
        throw error
      }

      this.rebuildIndexFromDisk()
    }
  }
}
