import type {
  LocationSelectionSource,
  LocationSnapshot,
} from '../../core/types'
import {
  MapError,
  getWechatErrorMessage,
  isWechatCancelError,
  isWechatPermissionError,
} from './map-errors'

interface MapApi {
  chooseLocation(option: WechatMiniprogram.ChooseLocationOption): void
}

export interface PickLocationOptions {
  readonly source?: LocationSelectionSource
  readonly initialLocation?: Pick<LocationSnapshot, 'latitude' | 'longitude'>
}

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

function parseCoordinate(
  value: unknown,
  label: 'latitude' | 'longitude'
): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  const lowerBound = label === 'latitude' ? -90 : -180
  const upperBound = label === 'latitude' ? 90 : 180

  if (!Number.isFinite(numericValue) || numericValue < lowerBound || numericValue > upperBound) {
    throw new MapError(
      'location_result_invalid',
      'pick_location',
      `Chosen location ${label} is invalid.`,
      { label, value }
    )
  }

  return numericValue
}

function normalizeInitialCoordinate(
  value: unknown,
  label: 'latitude' | 'longitude'
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isFiniteNumber(value)) {
    throw new MapError(
      'invalid_location_coordinates',
      'pick_location',
      `Initial ${label} must be a finite number.`,
      { label, value }
    )
  }

  return parseCoordinate(value, label)
}

function buildLocationSnapshot(
  result: WechatMiniprogram.ChooseLocationSuccessCallbackResult,
  source: LocationSelectionSource
): LocationSnapshot {
  const name = trimOptionalString(result.name)
  const address = trimOptionalString(result.address)

  if (!name && !address) {
    throw new MapError(
      'location_result_invalid',
      'pick_location',
      'Chosen location must contain a name or address.',
      { result }
    )
  }

  return Object.freeze({
    latitude: parseCoordinate(result.latitude, 'latitude'),
    longitude: parseCoordinate(result.longitude, 'longitude'),
    coordinateSystem: 'gcj02',
    source,
    name: name ?? address ?? '',
    address: address ?? name ?? '',
  })
}

export class WechatLocationPicker {
  private readonly mapApi: MapApi

  constructor(mapApi: MapApi = wx) {
    this.mapApi = mapApi
  }

  async pick(options: PickLocationOptions = {}): Promise<LocationSnapshot> {
    const chooseLocationOptions: WechatMiniprogram.ChooseLocationOption = {}
    const source = options.source ?? 'manual'

    const initialLatitude = normalizeInitialCoordinate(
      options.initialLocation?.latitude,
      'latitude'
    )
    const initialLongitude = normalizeInitialCoordinate(
      options.initialLocation?.longitude,
      'longitude'
    )

    if (initialLatitude !== undefined) {
      chooseLocationOptions.latitude = initialLatitude
    }

    if (initialLongitude !== undefined) {
      chooseLocationOptions.longitude = initialLongitude
    }

    try {
      const result = await this.chooseLocation(chooseLocationOptions)
      return buildLocationSnapshot(result, source)
    } catch (error) {
      if (isWechatCancelError(error)) {
        throw new MapError(
          'location_pick_cancelled',
          'pick_location',
          'User cancelled location selection.',
          { cause: error }
        )
      }

      if (isWechatPermissionError(error)) {
        throw new MapError(
          'location_permission_denied',
          'pick_location',
          'Location selection permission was denied.',
          { cause: error }
        )
      }

      throw new MapError(
        'location_pick_failed',
        'pick_location',
        `Failed to choose location: ${getWechatErrorMessage(error)}`,
        { cause: error }
      )
    }
  }

  private chooseLocation(
    option: WechatMiniprogram.ChooseLocationOption
  ): Promise<WechatMiniprogram.ChooseLocationSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      this.mapApi.chooseLocation({
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
}
