import type {
  CompleteCreateItemInput,
  Item,
  ItemId,
  ItemSummary,
  LocationSelectionSource,
  LocationSnapshot,
  PhotoAsset,
  QuickCreateItemInput,
  SceneFieldValueMap,
  TimestampMs,
  UpdateEditableItemInput,
} from '../../core/types'
import {
  ItemService,
  buildItemSummary,
  createCompleteItem,
  createDefaultItemId,
  freezeItem,
} from '../../core/item'
import { LocalItemRepository, ItemPhotoStore } from '../../infra/storage'
import { WechatLocationOpener, WechatLocationPicker } from '../../infra/map'
import { WechatPhotoCapture } from '../../infra/media'

export interface CreateCompleteRecordInput
  extends Pick<CompleteCreateItemInput, 'sceneType' | 'location' | 'anchorValues' | 'note'> {
  readonly photos?: readonly PhotoAsset[]
}

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

  async createQuick(input: QuickCreateItemInput): Promise<Item> {
    return this.itemService.createQuick(input)
  }

  async createComplete(input: CreateCompleteRecordInput): Promise<Item> {
    const itemId = this.idGenerator()
    const draftItem = createCompleteItem(
      {
        sceneType: input.sceneType,
        location: input.location,
        anchorValues: input.anchorValues,
        note: input.note,
        photos: input.photos,
      },
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

  async updateEditableFields(
    itemId: string,
    input: UpdateEditableItemInput
  ): Promise<Item> {
    return this.itemService.updateEditableFields(itemId, input)
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.itemService.deleteById(itemId)
  }

  async pickLocation(
    source: LocationSelectionSource,
    initialLocation?: LocationSnapshot
  ): Promise<LocationSnapshot> {
    return this.locationPicker.pick({
      source,
      initialLocation: initialLocation
        ? {
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
          }
        : undefined,
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
    sceneType: Item['sceneType'],
    anchorValues: SceneFieldValueMap,
    note: string
  ): UpdateEditableItemInput {
    return Object.freeze({
      sceneType,
      anchorValues,
      note,
    })
  }
}

export const debugRuntime = new DebugRuntime()
