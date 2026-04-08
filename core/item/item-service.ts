import type {
  CreateItemInput,
  Item,
  ItemId,
  ItemSummary,
  PhotoAsset,
  TimestampMs,
  UpdateEditableItemInput,
} from '../types'
import type {
  ItemRepository,
  ListRecentItemSummariesOptions,
} from './item-repository'
import { createItem } from './item-factory'
import { ItemDomainError } from './item-errors'
import { attachPhotoIfAbsent } from './item-photo-attacher'
import { buildItemSummary, type BuildItemSummaryOptions } from './item-summary'
import { updateEditableItem } from './item-updater'
import {
  createDefaultItemId,
  freezeItem,
  normalizeItemId,
  normalizeListLimit,
} from './item-utils'

export interface ItemServiceOptions {
  readonly now?: () => TimestampMs
  readonly idGenerator?: () => ItemId
  readonly summaryOptions?: BuildItemSummaryOptions
  readonly defaultRecentLimit?: number
}

export class ItemService {
  private readonly repository: ItemRepository
  private readonly now: () => TimestampMs
  private readonly idGenerator: () => ItemId
  private readonly summaryOptions?: BuildItemSummaryOptions
  private readonly defaultRecentLimit: number

  constructor(repository: ItemRepository, options: ItemServiceOptions = {}) {
    this.repository = repository
    this.now = options.now ?? Date.now
    this.idGenerator = options.idGenerator ?? createDefaultItemId
    this.summaryOptions = options.summaryOptions
    this.defaultRecentLimit = normalizeListLimit(options.defaultRecentLimit)
  }

  async create(input: CreateItemInput): Promise<Item> {
    const item = createItem(input, {
      now: this.now,
      idGenerator: this.idGenerator,
    })

    await this.repository.save({
      item,
      summary: buildItemSummary(item, this.summaryOptions),
    })

    return item
  }

  async attachPhotoIfAbsent(itemId: string, photo: PhotoAsset): Promise<Item> {
    const currentItem = await this.getByIdOrThrow(itemId)
    const nextItem = attachPhotoIfAbsent(currentItem, photo, {
      now: this.now,
    })

    await this.repository.save({
      item: nextItem,
      summary: buildItemSummary(nextItem, this.summaryOptions),
    })

    return nextItem
  }

  async getById(itemId: string): Promise<Item | null> {
    const item = await this.repository.getById(normalizeItemId(itemId))
    return item ? freezeItem(item) : null
  }

  async getByIdOrThrow(itemId: string): Promise<Item> {
    const item = await this.getById(itemId)
    if (!item) {
      throw new ItemDomainError('item_not_found', `Item "${itemId}" does not exist.`, {
        itemId,
      })
    }

    return item
  }

  async listRecent(
    options: ListRecentItemSummariesOptions = {}
  ): Promise<readonly ItemSummary[]> {
    const limit = normalizeListLimit(options.limit, this.defaultRecentLimit)
    return this.repository.listRecentSummaries({ limit })
  }

  async updateEditableFields(
    itemId: string,
    input: UpdateEditableItemInput
  ): Promise<Item> {
    const currentItem = await this.getByIdOrThrow(itemId)
    const nextItem = updateEditableItem(currentItem, input, {
      now: this.now,
    })

    if (nextItem === currentItem) {
      return currentItem
    }

    await this.repository.save({
      item: nextItem,
      summary: buildItemSummary(nextItem, this.summaryOptions),
    })

    return nextItem
  }

  async setPinned(itemId: string, pinned: boolean): Promise<Item> {
    const currentItem = await this.getByIdOrThrow(itemId)
    const nextPinnedAt = pinned ? this.now() : undefined

    if (currentItem.pinnedAt === nextPinnedAt) {
      return currentItem
    }

    const nextItem = freezeItem({
      ...currentItem,
      pinnedAt: nextPinnedAt,
    })

    await this.repository.save({
      item: nextItem,
      summary: buildItemSummary(nextItem, this.summaryOptions),
    })

    return nextItem
  }

  async deleteById(itemId: string): Promise<void> {
    const normalizedItemId = normalizeItemId(itemId)
    await this.getByIdOrThrow(normalizedItemId)
    await this.repository.deleteById(normalizedItemId)
  }
}
