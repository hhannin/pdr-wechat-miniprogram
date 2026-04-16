import type { SceneFieldDefinition } from './field'

export const SCENE_TYPES = [
  'default',
  'parking_lot',
  'mall',
  'hospital',
  'scenic_area',
] as const

export type SceneType = typeof SCENE_TYPES[number]

export interface SceneDefinition {
  readonly type: SceneType
  readonly label: string
  readonly description: string
}

export interface SceneCatalogEntry extends SceneDefinition {
  readonly fields: readonly SceneFieldDefinition[]
}
