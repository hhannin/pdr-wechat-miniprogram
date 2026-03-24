import type { SceneFieldOption } from '../types'

interface SequentialNumberOptionsConfig {
  readonly labelPrefix?: string
  readonly labelSuffix?: string
  readonly valuePrefix?: string
  readonly valueSuffix?: string
  readonly padWidth?: number
}

function freezeOption(option: SceneFieldOption): SceneFieldOption {
  return Object.freeze(option)
}

function padNumber(value: number, width: number): string {
  return width > 0 ? String(value).padStart(width, '0') : String(value)
}

export function buildValueLabelOptions(
  entries: ReadonlyArray<{
    readonly value: string
    readonly label: string
    readonly keywords?: readonly string[]
  }>
): readonly SceneFieldOption[] {
  return Object.freeze(
    entries.map((entry) =>
      freezeOption({
        value: entry.value,
        label: entry.label,
        keywords: entry.keywords,
      })
    )
  )
}

export function buildSequentialNumberOptions(
  start: number,
  end: number,
  config: SequentialNumberOptionsConfig = {}
): readonly SceneFieldOption[] {
  const options: SceneFieldOption[] = []
  const padWidth = config.padWidth ?? 0
  const labelPrefix = config.labelPrefix ?? ''
  const labelSuffix = config.labelSuffix ?? ''
  const valuePrefix = config.valuePrefix ?? ''
  const valueSuffix = config.valueSuffix ?? ''

  for (let value = start; value <= end; value += 1) {
    const formatted = padNumber(value, padWidth)
    options.push(
      freezeOption({
        value: `${valuePrefix}${formatted}${valueSuffix}`,
        label: `${labelPrefix}${formatted}${labelSuffix}`,
      })
    )
  }

  return Object.freeze(options)
}

export function buildPrefixedOptions(
  labels: readonly string[],
  config: {
    readonly valuePrefix: string
    readonly labelSuffix: string
  }
): readonly SceneFieldOption[] {
  return Object.freeze(
    labels.map((label) =>
      freezeOption({
        value: `${config.valuePrefix}${label.toLowerCase()}`,
        label: `${label}${config.labelSuffix}`,
      })
    )
  )
}

export function buildFloorOptions(
  undergroundCount: number,
  aboveGroundCount: number
): readonly SceneFieldOption[] {
  const options: SceneFieldOption[] = []

  for (let floor = undergroundCount; floor >= 1; floor -= 1) {
    const value = `B${floor}`
    options.push(freezeOption({ value, label: value }))
  }

  for (let floor = 1; floor <= aboveGroundCount; floor += 1) {
    const value = `${floor}F`
    options.push(freezeOption({ value, label: value }))
  }

  return Object.freeze(options)
}

export function mergeOptionGroups(
  ...groups: ReadonlyArray<readonly SceneFieldOption[]>
): readonly SceneFieldOption[] {
  const seen = new Set<string>()
  const merged: SceneFieldOption[] = []

  for (const group of groups) {
    for (const option of group) {
      if (seen.has(option.value)) {
        continue
      }

      seen.add(option.value)
      merged.push(option)
    }
  }

  return Object.freeze(merged)
}
