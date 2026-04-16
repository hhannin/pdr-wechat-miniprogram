import type { Item, ItemId, ItemSummary } from '../types'

export interface ListRecentItemSummariesOptions {
  readonly limit?: number
}

export interface PersistedItemRecord {
  readonly item: Item
  readonly summary: ItemSummary
}

export interface ItemRepository {
  getById(id: ItemId): Promise<Item | null>
  save(record: PersistedItemRecord): Promise<void>
  deleteById(id: ItemId): Promise<void>
  listRecentSummaries(
    options?: ListRecentItemSummariesOptions
  ): Promise<readonly ItemSummary[]>
}
