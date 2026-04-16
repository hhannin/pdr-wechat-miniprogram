import type {
  SceneFieldDefinition,
  SceneFieldKey,
  SceneFieldValidationIssue,
  SceneFieldValidationResult,
  SceneFieldValueMap,
  SceneType,
} from '../types'
import { getSceneFieldDefinitions, getSceneFieldDefinition } from './scene-catalog'

function freezeValidationResult(
  normalizedValues: SceneFieldValueMap,
  issues: SceneFieldValidationIssue[]
): SceneFieldValidationResult {
  return Object.freeze({
    isValid: issues.length === 0,
    normalizedValues: Object.freeze(normalizedValues),
    issues: Object.freeze(issues),
  })
}

function buildMissingRequiredIssue(
  field: SceneFieldDefinition
): SceneFieldValidationIssue {
  return Object.freeze({
    code: 'missing_required_field',
    key: field.key,
    message: `Missing required scene field "${field.key}".`,
  })
}

function normalizeSceneFieldValue(rawValue: string): string {
  return rawValue.replace(/\s+/g, ' ').trim()
}

function buildValueTooLongIssue(
  field: SceneFieldDefinition,
  value: string
): SceneFieldValidationIssue {
  return Object.freeze({
    code: 'value_too_long',
    key: field.key,
    value,
    message: `Scene field "${field.key}" exceeds the max length limit.`,
  })
}

export function validateSceneFieldValues(
  sceneType: SceneType,
  values?: SceneFieldValueMap
): SceneFieldValidationResult {
  const normalizedValues: SceneFieldValueMap = {}
  const issues: SceneFieldValidationIssue[] = []

  if (values === undefined) {
    return freezeValidationResult(normalizedValues, issues)
  }

  if (values === null || Array.isArray(values) || typeof values !== 'object') {
    issues.push(
      Object.freeze({
        code: 'invalid_payload',
        key: '*',
        value: values,
        message: 'Scene field values must be a plain object.',
      })
    )

    return freezeValidationResult(normalizedValues, issues)
  }

  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = rawKey as SceneFieldKey
    const field = getSceneFieldDefinition(sceneType, key)

    if (!field) {
      issues.push(
        Object.freeze({
          code: 'unknown_field',
          key: rawKey,
          value: rawValue,
          message: `Unknown scene field "${rawKey}" for scene "${sceneType}".`,
        })
      )
      continue
    }

    if (typeof rawValue !== 'string') {
      issues.push(
        Object.freeze({
          code: 'invalid_value_type',
          key,
          value: rawValue,
          message: `Scene field "${key}" must be a string value.`,
        })
      )
      continue
    }

    const normalizedValue = normalizeSceneFieldValue(rawValue)
    if (!normalizedValue) {
      continue
    }

    if (
      typeof field.maxLength === 'number' &&
      Number.isInteger(field.maxLength) &&
      field.maxLength > 0 &&
      normalizedValue.length > field.maxLength
    ) {
      issues.push(buildValueTooLongIssue(field, normalizedValue))
      continue
    }

    normalizedValues[key] = normalizedValue
  }

  for (const field of getSceneFieldDefinitions(sceneType)) {
    if (field.required && !normalizedValues[field.key]) {
      issues.push(buildMissingRequiredIssue(field))
    }
  }

  return freezeValidationResult(normalizedValues, issues)
}

export function sanitizeSceneFieldValues(
  sceneType: SceneType,
  values?: SceneFieldValueMap
): SceneFieldValueMap {
  return validateSceneFieldValues(sceneType, values).normalizedValues
}
