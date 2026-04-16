export const LOCATION_SELECTION_SOURCES = [
  'current',
  'manual',
] as const

export type LocationSelectionSource = typeof LOCATION_SELECTION_SOURCES[number]

export type CoordinateSystem = 'gcj02'

export interface GeoPoint {
  readonly latitude: number
  readonly longitude: number
}

export interface LocationSnapshot extends GeoPoint {
  readonly coordinateSystem: CoordinateSystem
  readonly source: LocationSelectionSource
  readonly name: string
  readonly address: string
  readonly province?: string
  readonly city?: string
  readonly district?: string
  readonly street?: string
  readonly poiId?: string
}
