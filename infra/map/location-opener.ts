import type { LocationSnapshot } from '../../core/types'
import { MapError, getWechatErrorMessage } from './map-errors'

interface MapApi {
  openLocation(option: WechatMiniprogram.OpenLocationOption): void
}

export interface OpenLocationOptions {
  readonly name?: string
  readonly address?: string
  readonly scale?: number
}

const DEFAULT_OPEN_LOCATION_SCALE = 18
const MIN_OPEN_LOCATION_SCALE = 5
const MAX_OPEN_LOCATION_SCALE = 18

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

function clampScale(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_OPEN_LOCATION_SCALE
  }

  const integerValue = Math.floor(value)
  if (integerValue < MIN_OPEN_LOCATION_SCALE) {
    return MIN_OPEN_LOCATION_SCALE
  }

  if (integerValue > MAX_OPEN_LOCATION_SCALE) {
    return MAX_OPEN_LOCATION_SCALE
  }

  return integerValue
}

function validateCoordinates(location: LocationSnapshot): void {
  if (
    !isFiniteNumber(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    throw new MapError(
      'invalid_location_coordinates',
      'open_location',
      'Location latitude is invalid.',
      { latitude: location.latitude }
    )
  }

  if (
    !isFiniteNumber(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw new MapError(
      'invalid_location_coordinates',
      'open_location',
      'Location longitude is invalid.',
      { longitude: location.longitude }
    )
  }
}

export class WechatLocationOpener {
  private readonly mapApi: MapApi

  constructor(mapApi: MapApi = wx) {
    this.mapApi = mapApi
  }

  async open(
    location: LocationSnapshot,
    options: OpenLocationOptions = {}
  ): Promise<void> {
    validateCoordinates(location)

    const name = trimOptionalString(options.name) ?? location.name
    const address = trimOptionalString(options.address) ?? location.address

    try {
      await this.openLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        name,
        address,
        scale: clampScale(options.scale),
      })
    } catch (error) {
      throw new MapError(
        'open_location_failed',
        'open_location',
        `Failed to open location: ${getWechatErrorMessage(error)}`,
        { cause: error }
      )
    }
  }

  private openLocation(
    option: WechatMiniprogram.OpenLocationOption
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.mapApi.openLocation({
        ...option,
        success: () => {
          resolve()
        },
        fail: (error) => {
          reject(error)
        },
      })
    })
  }
}
