export const SCENE_FIELD_KEYS = [
  'entry',
  'building',
  'unit',
  'floor',
  'zone',
  'marker',
  'code',
  'parkingType',
  'departmentZone',
  'servicePoint',
  'routeSection',
  'spotType',
] as const

export type SceneFieldKey = typeof SCENE_FIELD_KEYS[number]

export type SceneFieldControl = 'single_select'

export interface SceneFieldOption {
  readonly value: string
  readonly label: string
  readonly keywords?: readonly string[]
}

export interface SceneFieldDefinition {
  readonly key: SceneFieldKey
  readonly label: string
  readonly control: SceneFieldControl
  readonly options: readonly SceneFieldOption[]
  readonly required: boolean
  readonly primary: boolean
  readonly description?: string
}

export type SceneFieldValueMap = Partial<Record<SceneFieldKey, string>>

export const SCENE_FIELD_ISSUE_CODES = [
  'invalid_payload',
  'unknown_field',
  'invalid_value_type',
  'invalid_value',
  'missing_required_field',
] as const

export type SceneFieldIssueCode = typeof SCENE_FIELD_ISSUE_CODES[number]

export interface SceneFieldValidationIssue {
  readonly code: SceneFieldIssueCode
  readonly key: string
  readonly value?: unknown
  readonly message: string
}

export interface SceneFieldValidationResult {
  readonly isValid: boolean
  readonly normalizedValues: SceneFieldValueMap
  readonly issues: readonly SceneFieldValidationIssue[]
}
