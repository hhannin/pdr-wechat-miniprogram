import type {
  CreateItemInput,
  CreateShareSnapshotRequest,
  CreateShareSnapshotResult,
  GetShareSnapshotResult,
  Item,
  ItemId,
  ItemSummary,
  LocationSelectionSource,
  LocationSnapshot,
  PhotoAsset,
  PreparedShareSnapshot,
  SceneFieldValueMap,
  SceneFieldKey,
  ShareSnapshotPayload,
  ShareSnapshotSelection,
  SharedItem,
  SharedRemotePhoto,
  TimestampMs,
  UpdateEditableItemInput,
} from '../../core/types/index'
import {
  ItemDomainError,
  ItemService,
  buildItemSummary,
  createItem,
  createDefaultItemId,
  freezeItem,
  normalizePhotoAssets,
} from '../../core/item/index'
import {
  ItemPhotoStore,
  LocalItemRepository,
  LocalSharedRepository,
  SharedPhotoStore,
  freezeSharedItem,
} from '../../infra/storage/index'
import {
  WechatLocationOpener,
  WechatLocationPicker,
} from '../../infra/map/index'
import { WechatPhotoCapture } from '../../infra/media/index'
import {
  buildShareCardSubtitleFromItem,
  buildShareCardTitleFromItem,
} from './frontend-presenters'
import { buildShareUrl } from './frontend-config'

export type CreateRecordInput = CreateItemInput

export type OpenSharedSnapshotResult =
  | {
      readonly status: 'ready'
      readonly item: SharedItem
    }
  | {
      readonly status: 'expired'
    }
  | {
      readonly status: 'requires_network'
    }

export interface AppRuntimeOptions {
  readonly now?: () => TimestampMs
  readonly idGenerator?: () => ItemId
}

const CREATE_SHARE_SNAPSHOT_FUNCTION_NAME = 'createShareSnapshot'
const GET_SHARE_SNAPSHOT_FUNCTION_NAME = 'getShareSnapshot'

function createShareId(now: number): string {
  return `share_${now.toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

function filterAnchorValues(
  anchorValues: SceneFieldValueMap,
  includedFieldKeys: readonly SceneFieldKey[]
): SceneFieldValueMap {
  if (includedFieldKeys.length === 0) {
    return {}
  }

  const nextValues: SceneFieldValueMap = {}
  const includedKeys = new Set(includedFieldKeys)

  for (const key of Object.keys(anchorValues) as SceneFieldKey[]) {
    if (!includedKeys.has(key)) {
      continue
    }

    nextValues[key] = anchorValues[key] ?? ''
  }

  return nextValues
}

function buildRemotePhotoMetadata(photo: PhotoAsset, fileId: string): SharedRemotePhoto {
  return Object.freeze({
    fileId,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    byteLength: photo.byteLength,
    width: photo.width,
    height: photo.height,
  })
}

function buildPreparedPreviewItem(
  item: Item,
  selection: ShareSnapshotSelection,
  shareId: string,
  expiresAt: TimestampMs,
  remotePhotos: readonly SharedRemotePhoto[]
): SharedItem {
  const selectedPhotos = selection.includePhoto ? normalizePhotoAssets(item.photos.slice(0, 1)) : []
  const selectedAnchorValues = filterAnchorValues(
    item.anchorValues,
    selection.includedFieldKeys
  )
  const hasRemoteImage = remotePhotos.length > 0

  return freezeSharedItem({
    ...item,
    shareId,
    expiresAt,
    sourceItemId: item.id,
    anchorValues: selectedAnchorValues,
    note: selection.includeNote ? item.note : '',
    photos: selectedPhotos,
    hasRemoteImage,
    imageState: selectedPhotos.length > 0 ? 'ready' : hasRemoteImage ? 'pending' : 'none',
    remoteImageFileId: remotePhotos[0]?.fileId,
    remotePhotos,
  })
}

function buildShareSnapshotRequest(
  item: Item,
  selection: ShareSnapshotSelection,
  shareId: string,
  remotePhotos: readonly SharedRemotePhoto[]
): CreateShareSnapshotRequest {
  const selectedAnchorValues = filterAnchorValues(
    item.anchorValues,
    selection.includedFieldKeys
  )

  return Object.freeze({
    requestedShareId: shareId,
    sourceItemId: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sceneType: item.sceneType,
    location: item.location,
    anchorValues: selectedAnchorValues,
    note: selection.includeNote ? item.note : '',
    remotePhotos,
    shareCardTitle: buildShareCardTitleFromItem({
      location: item.location,
      sceneType: item.sceneType,
    }),
    shareCardSubtitle: buildShareCardSubtitleFromItem({
      location: item.location,
      sceneType: item.sceneType,
      anchorValues: selectedAnchorValues,
    }),
  })
}

function buildSharedItemFromSnapshot(snapshot: ShareSnapshotPayload): SharedItem {
  return freezeSharedItem({
    schemaVersion: 1,
    id: snapshot.sourceItemId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    sceneType: snapshot.sceneType,
    anchorValues: snapshot.anchorValues,
    note: snapshot.note,
    location: snapshot.location,
    photos: [],
    shareId: snapshot.shareId,
    expiresAt: snapshot.expiresAt,
    sourceItemId: snapshot.sourceItemId,
    hasRemoteImage: snapshot.hasImage,
    imageState: snapshot.hasImage ? 'pending' : 'none',
    remoteImageFileId: snapshot.remotePhotos[0]?.fileId,
    remotePhotos: snapshot.remotePhotos,
  })
}

function createDownloadedPhotoAsset(
  shareId: string,
  remotePhoto: SharedRemotePhoto,
  tempFilePath: string,
  now: TimestampMs
): PhotoAsset {
  return Object.freeze({
    id: `${shareId}_${now.toString(36)}_photo_0`,
    createdAt: now,
    source: 'camera',
    localPath: tempFilePath,
    fileName: remotePhoto.fileName,
    mimeType: remotePhoto.mimeType,
    byteLength: remotePhoto.byteLength,
    width: remotePhoto.width,
    height: remotePhoto.height,
  })
}

async function getNetworkType(): Promise<
  WechatMiniprogram.GetNetworkTypeSuccessCallbackResult['networkType']
> {
  return new Promise((resolve, reject) => {
    wx.getNetworkType({
      success: (result) => resolve(result.networkType),
      fail: (error) => reject(error),
    })
  })
}

export class AppRuntime {
  private readonly repository: LocalItemRepository
  private readonly sharedRepository: LocalSharedRepository
  private readonly itemService: ItemService
  private readonly photoStore: ItemPhotoStore
  private readonly sharedPhotoStore: SharedPhotoStore
  private readonly locationPicker: WechatLocationPicker
  private readonly locationOpener: WechatLocationOpener
  private readonly photoCapture: WechatPhotoCapture
  private readonly now: () => TimestampMs
  private readonly idGenerator: () => ItemId

  constructor(options: AppRuntimeOptions = {}) {
    this.now = options.now ?? Date.now
    this.idGenerator = options.idGenerator ?? createDefaultItemId
    this.repository = new LocalItemRepository({
      now: this.now,
    })
    this.sharedRepository = new LocalSharedRepository()
    this.itemService = new ItemService(this.repository, {
      now: this.now,
      idGenerator: this.idGenerator,
    })
    this.photoStore = new ItemPhotoStore()
    this.sharedPhotoStore = new SharedPhotoStore()
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
    const draftItem = createItem(input, {
      now: this.now,
      idGenerator: () => itemId,
    })

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

  async prepareShareSnapshot(
    item: Item,
    selection: ShareSnapshotSelection
  ): Promise<PreparedShareSnapshot> {
    const shareId = createShareId(this.now())
    const selectedPhoto = selection.includePhoto ? item.photos[0] : undefined
    const remotePhotos: SharedRemotePhoto[] = []
    let uploadedFileIds: readonly string[] = []

    try {
      if (selectedPhoto) {
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `shares/${shareId}/photos/0-${selectedPhoto.fileName}`,
          filePath: selectedPhoto.localPath,
        })

        uploadedFileIds = [uploadResult.fileID]
        remotePhotos.push(buildRemotePhotoMetadata(selectedPhoto, uploadResult.fileID))
      }

      const createResult = await wx.cloud.callFunction({
        name: CREATE_SHARE_SNAPSHOT_FUNCTION_NAME,
        data: buildShareSnapshotRequest(item, selection, shareId, remotePhotos),
      })

      const result = createResult.result as CreateShareSnapshotResult
      const previewItem = buildPreparedPreviewItem(
        item,
        selection,
        result.shareId,
        result.expiresAt,
        remotePhotos
      )

      return Object.freeze({
        shareId: result.shareId,
        expiresAt: result.expiresAt,
        shareCardTitle: result.shareCardTitle,
        shareCardSubtitle: result.shareCardSubtitle,
        previewItem,
      })
    } catch (error) {
      if (uploadedFileIds.length > 0) {
        try {
          await wx.cloud.deleteFile({
            fileList: [...uploadedFileIds],
          })
        } catch {
          // Best effort cleanup for an unused uploaded share photo.
        }
      }

      throw error
    }
  }

  buildSharePath(shareId: string): string {
    return buildShareUrl(shareId)
  }

  async openSharedSnapshot(shareId: string): Promise<OpenSharedSnapshotResult> {
    const cachedItem = await this.sharedRepository.getByShareId(shareId)
    const now = this.now()

    if (cachedItem) {
      if (cachedItem.expiresAt <= now) {
        await this.sharedRepository.deleteByShareId(shareId)
        return Object.freeze({
          status: 'expired',
        })
      }

      return Object.freeze({
        status: 'ready',
        item: cachedItem,
      })
    }

    const networkType = await getNetworkType()
    if (networkType === 'none') {
      return Object.freeze({
        status: 'requires_network',
      })
    }

    const result = await wx.cloud.callFunction({
      name: GET_SHARE_SNAPSHOT_FUNCTION_NAME,
      data: {
        shareId,
      },
    })

    const payload = result.result as GetShareSnapshotResult
    if (payload.status !== 'ready') {
      await this.sharedRepository.deleteByShareId(shareId)
      return Object.freeze({
        status: 'expired',
      })
    }

    const sharedItem = buildSharedItemFromSnapshot(payload.snapshot)
    await this.sharedRepository.save(sharedItem)

    return Object.freeze({
      status: 'ready',
      item: sharedItem,
    })
  }

  async ensureSharedImage(shareId: string): Promise<SharedItem | null> {
    const currentItem = await this.sharedRepository.getByShareId(shareId)
    if (!currentItem) {
      return null
    }

    if (!currentItem.hasRemoteImage || currentItem.remotePhotos.length === 0) {
      return currentItem
    }

    if (currentItem.photos.length > 0 && currentItem.imageState === 'ready') {
      return currentItem
    }

    const pendingItem = freezeSharedItem({
      ...currentItem,
      imageState: 'pending',
    })
    await this.sharedRepository.save(pendingItem)

    try {
      const remotePhoto = pendingItem.remotePhotos[0]
      const downloadResult = await wx.cloud.downloadFile({
        fileID: remotePhoto.fileId,
      })
      const downloadedPhoto = createDownloadedPhotoAsset(
        shareId,
        remotePhoto,
        downloadResult.tempFilePath,
        this.now()
      )
      const persistedPhotos = this.sharedPhotoStore.persistPhotos(shareId, [downloadedPhoto])
      const readyItem = freezeSharedItem({
        ...pendingItem,
        photos: persistedPhotos,
        imageState: 'ready',
      })
      await this.sharedRepository.save(readyItem)
      return readyItem
    } catch {
      const failedItem = freezeSharedItem({
        ...pendingItem,
        imageState: 'failed',
      })
      await this.sharedRepository.save(failedItem)
      return failedItem
    }
  }

  async clearExpiredSharedSnapshots(): Promise<void> {
    const sharedItems = await this.sharedRepository.listAll()
    const now = this.now()

    await Promise.all(
      sharedItems.map(async (sharedItem) => {
        if (sharedItem.expiresAt > now) {
          return
        }

        await this.sharedRepository.deleteByShareId(sharedItem.shareId)
      })
    )
  }
}

export const appRuntime = new AppRuntime()
