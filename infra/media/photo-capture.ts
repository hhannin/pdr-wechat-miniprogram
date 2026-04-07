import type { PhotoAsset, TimestampMs } from '../../core/types'
import {
  MediaError,
  getWechatErrorMessage,
  isWechatCancelError,
} from './media-errors'

interface MediaApi {
  chooseImage(option: WechatMiniprogram.ChooseImageOption): void
  getImageInfo(option: WechatMiniprogram.GetImageInfoOption): void
  getFileInfo(option: WechatMiniprogram.WxGetFileInfoOption): void
}

type CaptureSizePreference = 'compressed' | 'original' | 'balanced'

interface RawCapturedPhotoEntry {
  readonly tempFilePath: string
  readonly declaredByteLength?: number
}

export interface CapturePhotoOptions {
  readonly count?: number
  readonly sizePreference?: CaptureSizePreference
}

export interface PhotoCaptureServiceOptions {
  readonly mediaApi?: MediaApi
  readonly now?: () => TimestampMs
}

const DEFAULT_CAPTURE_COUNT = 1
const MAX_CAPTURE_COUNT = 9

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (!isFiniteNumber(value) || value < 0) {
    return undefined
  }

  return Math.floor(value)
}

function normalizeCaptureCount(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_CAPTURE_COUNT
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_CAPTURE_COUNT
  ) {
    throw new MediaError(
      'invalid_capture_request',
      'capture_photo',
      `Capture count must be an integer between 1 and ${MAX_CAPTURE_COUNT}.`,
      { count: value }
    )
  }

  return Math.floor(value)
}

function resolveSizeTypes(
  sizePreference: CaptureSizePreference | undefined
): WechatMiniprogram.ChooseImageOption['sizeType'] {
  switch (sizePreference) {
    case 'original':
      return ['original']
    case 'balanced':
      return ['compressed', 'original']
    case 'compressed':
    default:
      return ['compressed']
  }
}

function inferFileName(path: string, createdAt: TimestampMs, index: number): string {
  const normalizedPath = path.replace(/\\/g, '/')
  const rawName = normalizedPath.split('/').pop()?.trim()

  if (rawName && rawName.length > 0) {
    return rawName
  }

  return `photo_${createdAt}_${index + 1}.jpg`
}

function inferFileExtension(path: string): string | undefined {
  const normalizedPath = path.replace(/\\/g, '/').toLowerCase()
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  const fileName = lastSlashIndex >= 0 ? normalizedPath.slice(lastSlashIndex + 1) : normalizedPath
  const extensionIndex = fileName.lastIndexOf('.')

  if (extensionIndex < 0 || extensionIndex === fileName.length - 1) {
    return undefined
  }

  return fileName.slice(extensionIndex + 1)
}

function inferMimeType(imageType: unknown, path: string): string {
  const normalizedType =
    typeof imageType === 'string' ? imageType.trim().toLowerCase() : ''

  switch (normalizedType) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'heic':
      return 'image/heic'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    default: {
      const extension = inferFileExtension(path)
      switch (extension) {
        case 'png':
          return 'image/png'
        case 'webp':
          return 'image/webp'
        case 'heic':
          return 'image/heic'
        default:
          return 'image/jpeg'
      }
    }
  }
}

function buildCapturedPhotoEntries(
  result: WechatMiniprogram.ChooseImageSuccessCallbackResult
): readonly RawCapturedPhotoEntry[] {
  const entries: RawCapturedPhotoEntry[] = []
  const tempFiles = Array.isArray(result.tempFiles) ? result.tempFiles : []
  const tempFilePaths = Array.isArray(result.tempFilePaths) ? result.tempFilePaths : []
  const candidateCount = Math.max(tempFiles.length, tempFilePaths.length)

  for (let index = 0; index < candidateCount; index += 1) {
    const tempFile = tempFiles[index]
    const tempFilePath =
      trimOptionalString(tempFilePaths[index]) ?? trimOptionalString(tempFile?.path)

    if (!tempFilePath) {
      continue
    }

    entries.push(
      Object.freeze({
        tempFilePath,
        declaredByteLength: normalizePositiveInteger(
          typeof tempFile?.size === 'number' ? tempFile.size : undefined
        ),
      })
    )
  }

  return Object.freeze(entries)
}

export class WechatPhotoCapture {
  private readonly mediaApi: MediaApi
  private readonly now: () => TimestampMs

  constructor(options: PhotoCaptureServiceOptions = {}) {
    this.mediaApi = options.mediaApi ?? wx
    this.now = options.now ?? Date.now
  }

  async captureOne(options: CapturePhotoOptions = {}): Promise<PhotoAsset> {
    const photos = await this.captureMany({
      ...options,
      count: 1,
    })

    return photos[0]
  }

  async captureMany(
    options: CapturePhotoOptions = {}
  ): Promise<readonly PhotoAsset[]> {
    const count = normalizeCaptureCount(options.count)

    let captureResult: WechatMiniprogram.ChooseImageSuccessCallbackResult
    try {
      captureResult = await this.chooseImage({
        count,
        sizeType: resolveSizeTypes(options.sizePreference),
        sourceType: ['camera'],
      })
    } catch (error) {
      if (isWechatCancelError(error)) {
        throw new MediaError(
          'photo_capture_cancelled',
          'capture_photo',
          'User cancelled photo capture.',
          { cause: error }
        )
      }

      throw new MediaError(
        'photo_capture_failed',
        'capture_photo',
        `Failed to capture photo: ${getWechatErrorMessage(error)}`,
        { cause: error }
      )
    }

    const entries = buildCapturedPhotoEntries(captureResult)
    if (entries.length === 0) {
      throw new MediaError(
        'photo_capture_empty',
        'capture_photo',
        'Photo capture returned no usable image files.'
      )
    }

    const baseCreatedAt = this.resolveBaseCreatedAt()

    return Object.freeze(
      await Promise.all(
        entries.map((entry, index) =>
          this.buildPhotoAsset(entry, baseCreatedAt + index, index)
        )
      )
    )
  }

  private resolveBaseCreatedAt(): TimestampMs {
    const value = this.now()
    if (!isFiniteNumber(value) || value <= 0) {
      throw new MediaError(
        'photo_result_invalid',
        'capture_photo',
        'Photo capture timestamp is invalid.',
        { value }
      )
    }

    return Math.floor(value)
  }

  private async buildPhotoAsset(
    entry: RawCapturedPhotoEntry,
    createdAt: TimestampMs,
    index: number
  ): Promise<PhotoAsset> {
    const imageInfo = await this.readImageInfo(entry.tempFilePath)
    const localPath = trimOptionalString(imageInfo.path) ?? entry.tempFilePath
    const byteLength =
      entry.declaredByteLength ?? (await this.readFileByteLength(localPath))

    if (!trimOptionalString(localPath)) {
      throw new MediaError(
        'photo_result_invalid',
        'capture_photo',
        'Captured photo local path is invalid.',
        { entry }
      )
    }

    return Object.freeze({
      id: `photo_${createdAt}_${index + 1}`,
      createdAt,
      source: 'camera',
      localPath,
      fileName: inferFileName(localPath, createdAt, index),
      mimeType: inferMimeType(imageInfo.type, localPath),
      byteLength,
      width: normalizePositiveInteger(imageInfo.width),
      height: normalizePositiveInteger(imageInfo.height),
    })
  }

  private chooseImage(
    option: WechatMiniprogram.ChooseImageOption
  ): Promise<WechatMiniprogram.ChooseImageSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      this.mediaApi.chooseImage({
        ...option,
        success: (result) => {
          resolve(result)
        },
        fail: (error) => {
          reject(error)
        },
      })
    })
  }

  private readImageInfo(
    src: string
  ): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      this.mediaApi.getImageInfo({
        src,
        success: (result) => {
          resolve(result)
        },
        fail: (error) => {
          reject(
            new MediaError(
              'photo_metadata_failed',
              'read_image_info',
              `Failed to read image info: ${getWechatErrorMessage(error)}`,
              {
                src,
                cause: error,
              }
            )
          )
        },
      })
    })
  }

  private async readFileByteLength(filePath: string): Promise<number | undefined> {
    try {
      const result = await this.getFileInfo(filePath)
      return normalizePositiveInteger(result.size)
    } catch (error) {
      if (error instanceof MediaError) {
        throw error
      }

      throw new MediaError(
        'photo_file_info_failed',
        'read_file_info',
        `Failed to read file info: ${getWechatErrorMessage(error)}`,
        {
          filePath,
          cause: error,
        }
      )
    }
  }

  private getFileInfo(
    filePath: string
  ): Promise<WechatMiniprogram.WxGetFileInfoSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      this.mediaApi.getFileInfo({
        filePath,
        digestAlgorithm: 'md5',
        success: (result) => {
          resolve(result)
        },
        fail: (error) => {
          reject(error)
        },
      })
    })
  }
}
