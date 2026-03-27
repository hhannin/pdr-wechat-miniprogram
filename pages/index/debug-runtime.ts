import type {
  CreateItemInput,
  Item,
  ItemId,
  ItemSummary,
  LocationSelectionSource,
  LocationSnapshot,
  PhotoAsset,
  SceneFieldValueMap,
  TimestampMs,
  UpdateEditableItemInput,
} from '../../core/types'
import {
  ItemDomainError,
  ItemService,
  buildItemSummary,
  createItem,
  createDefaultItemId,
  freezeItem,
} from '../../core/item'
import { LocalItemRepository, ItemPhotoStore } from '../../infra/storage'
import { WechatLocationOpener, WechatLocationPicker } from '../../infra/map'
import { WechatPhotoCapture } from '../../infra/media'

export type CreateRecordInput = CreateItemInput

export interface DebugRuntimeOptions {
  readonly now?: () => TimestampMs
  readonly idGenerator?: () => ItemId
}

export class DebugRuntime {
  private readonly repository: LocalItemRepository
  private readonly itemService: ItemService
  private readonly photoStore: ItemPhotoStore
  private readonly locationPicker: WechatLocationPicker
  private readonly locationOpener: WechatLocationOpener
  private readonly photoCapture: WechatPhotoCapture
  private readonly now: () => TimestampMs
  private readonly idGenerator: () => ItemId

  constructor(options: DebugRuntimeOptions = {}) {
    this.now = options.now ?? Date.now
    this.idGenerator = options.idGenerator ?? createDefaultItemId
    this.repository = new LocalItemRepository({
      now: this.now,
    })
    this.itemService = new ItemService(this.repository, {
      now: this.now,
      idGenerator: this.idGenerator,
    })
    this.photoStore = new ItemPhotoStore()
    this.locationPicker = new WechatLocationPicker()
    this.locationOpener = new WechatLocationOpener()
    this.photoCapture = new WechatPhotoCapture({
      now: this.now,
    })
  }

  async listRecent(limit?: number): Promise<readonly ItemSummary[]> {
    return this.itemService.listRecent({ limit })
  }

  async getItem(itemId: string): Promise<Item | null> {
    return this.itemService.getById(itemId)
  }

  async create(input: CreateRecordInput): Promise<Item> {
    if (!input.photos || input.photos.length === 0) {
      return this.itemService.create(input)
    }

    const itemId = this.idGenerator()
    const draftItem = createItem(
      input,
      {
        now: this.now,
        idGenerator: () => itemId,
      }
    )

    let persistedPhotos: readonly PhotoAsset[] = draftItem.photos

    try {
      if (draftItem.photos.length > 0) {
        persistedPhotos = this.photoStore.persistPhotos(itemId, draftItem.photos)
      }

      const persistedItem = freezeItem({
        ...draftItem,
        photos: persistedPhotos,
      })

      await this.repository.save({
        item: persistedItem,
        summary: buildItemSummary(persistedItem),
      })

      return persistedItem
    } catch (error) {
      if (draftItem.photos.length > 0) {
        try {
          this.photoStore.deleteAll(itemId)
        } catch {
          // Best effort cleanup for partially persisted photo files.
        }
      }

      throw error
    }
  }

  async attachPhotoIfAbsent(itemId: string, photo: PhotoAsset): Promise<Item> {
    const currentItem = await this.itemService.getByIdOrThrow(itemId)
    if (currentItem.photos.length > 0) {
      throw new ItemDomainError(
        'photo_already_attached',
        '该记录已有照片，当前不支持更换。',
        { itemId: currentItem.id }
      )
    }

    const persistedPhoto = this.photoStore.persistPhoto(currentItem.id, photo)

    try {
      return await this.itemService.attachPhotoIfAbsent(currentItem.id, persistedPhoto)
    } catch (error) {
      try {
        this.photoStore.deleteAll(currentItem.id)
      } catch {
        // Best effort cleanup for partially persisted photo files.
      }

      throw error
    }
  }

  async updateEditableFields(
    itemId: string,
    input: UpdateEditableItemInput
  ): Promise<Item> {
    return this.itemService.updateEditableFields(itemId, input)
  }

  async saveEdit(
    itemId: string,
    input: UpdateEditableItemInput,
    draftPhoto?: PhotoAsset
  ): Promise<Item> {
    const updatedItem = await this.itemService.updateEditableFields(itemId, input)

    if (!draftPhoto) {
      return updatedItem
    }

    if (updatedItem.photos.length > 0) {
      throw new ItemDomainError(
        'photo_already_attached',
        '该记录已有照片，当前不支持更换。',
        { itemId: updatedItem.id }
      )
    }

    const persistedPhoto = this.photoStore.persistPhoto(updatedItem.id, draftPhoto)

    try {
      return await this.itemService.attachPhotoIfAbsent(updatedItem.id, persistedPhoto)
    } catch (error) {
      try {
        this.photoStore.deleteAll(updatedItem.id)
      } catch {
        // Best effort cleanup for partially persisted photo files.
      }

      throw error
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.itemService.deleteById(itemId)
  }

  async pickLocation(
    source: LocationSelectionSource,
    initialLocation?: LocationSnapshot,
    options: {
      readonly centerOnCurrentLocation?: boolean
    } = {}
  ): Promise<LocationSnapshot> {
    return this.locationPicker.pick({
      source,
      initialLocation: initialLocation
        ? {
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
          }
        : undefined,
      centerOnCurrentLocation: options.centerOnCurrentLocation,
    })
  }

  async openLocation(location: LocationSnapshot): Promise<void> {
    await this.locationOpener.open(location)
  }

  async capturePhoto(): Promise<PhotoAsset> {
    return this.photoCapture.captureOne({
      count: 1,
      sizePreference: 'compressed',
    })
  }

  buildEditableInput(
    anchorValues: SceneFieldValueMap,
    note: string
  ): UpdateEditableItemInput {
    return Object.freeze({
      anchorValues,
      note,
    })
  }
}

export const debugRuntime = new DebugRuntime()
