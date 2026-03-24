import type {
  SceneCatalogEntry,
  SceneDefinition,
  SceneFieldDefinition,
  SceneFieldKey,
  SceneFieldOption,
  SceneType,
} from '../types'
import { SCENE_TYPES } from '../types'
import {
  BUILDING_OPTIONS,
  CODE_OPTIONS,
  DEPARTMENT_ZONE_OPTIONS,
  ENTRY_OPTIONS,
  FLOOR_OPTIONS,
  MARKER_OPTIONS,
  PARKING_FLOOR_OPTIONS,
  PARKING_TYPE_OPTIONS,
  ROUTE_SECTION_OPTIONS,
  SERVICE_POINT_OPTIONS,
  SPOT_TYPE_OPTIONS,
  UNIT_OPTIONS,
  ZONE_OPTIONS,
} from './scene-option-sets'

function defineField(field: SceneFieldDefinition): SceneFieldDefinition {
  return Object.freeze(field)
}

const SCENE_CATALOG: Readonly<Record<SceneType, SceneCatalogEntry>> = Object.freeze({
  default: Object.freeze({
    type: 'default',
    label: '默认',
    description: '适合小区、园区、街区等通用地点记录。',
    fields: Object.freeze([
      defineField({
        key: 'entry',
        label: '入口',
        control: 'single_select',
        options: ENTRY_OPTIONS,
        required: false,
        primary: true,
        description: '例如南门、北门、D2出口。',
      }),
      defineField({
        key: 'building',
        label: '楼栋',
        control: 'single_select',
        options: BUILDING_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'unit',
        label: '单元',
        control: 'single_select',
        options: UNIT_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'single_select',
        options: FLOOR_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'zone',
        label: '区域',
        control: 'single_select',
        options: ZONE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'marker',
        label: '附近锚点',
        control: 'single_select',
        options: MARKER_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'code',
        label: '门牌 / 编号',
        control: 'single_select',
        options: CODE_OPTIONS,
        required: false,
        primary: false,
      }),
    ]),
  }),
  parking_lot: Object.freeze({
    type: 'parking_lot',
    label: '停车场',
    description: '突出地下楼层、分区和车位号等最后 50 米线索。',
    fields: Object.freeze([
      defineField({
        key: 'parkingType',
        label: '停车类型',
        control: 'single_select',
        options: PARKING_TYPE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'single_select',
        options: PARKING_FLOOR_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'zone',
        label: '区域',
        control: 'single_select',
        options: ZONE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'entry',
        label: '入口 / 车行口',
        control: 'single_select',
        options: ENTRY_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'marker',
        label: '附近锚点',
        control: 'single_select',
        options: MARKER_OPTIONS,
        required: false,
        primary: true,
        description: '例如电梯厅、柱子旁、出入口旁。',
      }),
      defineField({
        key: 'code',
        label: '车位 / 柱号',
        control: 'single_select',
        options: CODE_OPTIONS,
        required: false,
        primary: true,
      }),
    ]),
  }),
  mall: Object.freeze({
    type: 'mall',
    label: '商场',
    description: '突出入口、楼层、区域和附近地标店铺等信息。',
    fields: Object.freeze([
      defineField({
        key: 'entry',
        label: '入口 / 出口',
        control: 'single_select',
        options: ENTRY_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'building',
        label: '楼栋',
        control: 'single_select',
        options: BUILDING_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'single_select',
        options: FLOOR_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'zone',
        label: '区域',
        control: 'single_select',
        options: ZONE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'marker',
        label: '附近地标',
        control: 'single_select',
        options: MARKER_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'code',
        label: '店铺 / 门牌',
        control: 'single_select',
        options: CODE_OPTIONS,
        required: false,
        primary: false,
      }),
    ]),
  }),
  hospital: Object.freeze({
    type: 'hospital',
    label: '医院',
    description: '突出楼栋、楼层、科室区域和服务点信息。',
    fields: Object.freeze([
      defineField({
        key: 'entry',
        label: '入口 / 楼门',
        control: 'single_select',
        options: ENTRY_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'building',
        label: '楼栋',
        control: 'single_select',
        options: BUILDING_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'single_select',
        options: FLOOR_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'departmentZone',
        label: '科室区域',
        control: 'single_select',
        options: DEPARTMENT_ZONE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'servicePoint',
        label: '服务点',
        control: 'single_select',
        options: SERVICE_POINT_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'code',
        label: '诊室 / 窗口号',
        control: 'single_select',
        options: CODE_OPTIONS,
        required: false,
        primary: false,
      }),
    ]),
  }),
  scenic_area: Object.freeze({
    type: 'scenic_area',
    label: '景区',
    description: '突出入口、片区、路线分段和点位类型信息。',
    fields: Object.freeze([
      defineField({
        key: 'entry',
        label: '入口 / 闸口',
        control: 'single_select',
        options: ENTRY_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'zone',
        label: '片区',
        control: 'single_select',
        options: ZONE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'routeSection',
        label: '路线分段',
        control: 'single_select',
        options: ROUTE_SECTION_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'spotType',
        label: '点位类型',
        control: 'single_select',
        options: SPOT_TYPE_OPTIONS,
        required: false,
        primary: true,
      }),
      defineField({
        key: 'servicePoint',
        label: '服务点',
        control: 'single_select',
        options: SERVICE_POINT_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'marker',
        label: '附近锚点',
        control: 'single_select',
        options: MARKER_OPTIONS,
        required: false,
        primary: false,
      }),
      defineField({
        key: 'code',
        label: '编号 / 点位号',
        control: 'single_select',
        options: CODE_OPTIONS,
        required: false,
        primary: false,
      }),
    ]),
  }),
})

const SCENE_DEFINITION_INDEX: Readonly<Record<SceneType, SceneDefinition>> = Object.freeze(
  SCENE_TYPES.reduce((sceneAccumulator, sceneType) => {
    const scene = SCENE_CATALOG[sceneType]

    sceneAccumulator[sceneType] = Object.freeze({
      type: scene.type,
      label: scene.label,
      description: scene.description,
    })

    return sceneAccumulator
  }, {} as Record<SceneType, SceneDefinition>)
)

const SCENE_DEFINITIONS: readonly SceneDefinition[] = Object.freeze(
  SCENE_TYPES.map((sceneType) => SCENE_DEFINITION_INDEX[sceneType])
)

const FIELD_INDEX: Readonly<
  Record<SceneType, Partial<Record<SceneFieldKey, SceneFieldDefinition>>>
> = Object.freeze(
  SCENE_TYPES.reduce((sceneAccumulator, sceneType) => {
    const fieldMap: Partial<Record<SceneFieldKey, SceneFieldDefinition>> = {}

    for (const field of SCENE_CATALOG[sceneType].fields) {
      fieldMap[field.key] = field
    }

    sceneAccumulator[sceneType] = Object.freeze(fieldMap)
    return sceneAccumulator
  }, {} as Record<SceneType, Partial<Record<SceneFieldKey, SceneFieldDefinition>>>)
)

const OPTION_INDEX: Readonly<
  Record<SceneType, Partial<Record<SceneFieldKey, Record<string, SceneFieldOption>>>>
> = Object.freeze(
  SCENE_TYPES.reduce((sceneAccumulator, sceneType) => {
    const optionMap: Partial<Record<SceneFieldKey, Record<string, SceneFieldOption>>> = {}

    for (const field of SCENE_CATALOG[sceneType].fields) {
      const fieldOptions = field.options.reduce((optionAccumulator, option) => {
        optionAccumulator[option.value] = option
        return optionAccumulator
      }, {} as Record<string, SceneFieldOption>)

      optionMap[field.key] = Object.freeze(fieldOptions)
    }

    sceneAccumulator[sceneType] = Object.freeze(optionMap)
    return sceneAccumulator
  }, {} as Record<SceneType, Partial<Record<SceneFieldKey, Record<string, SceneFieldOption>>>>)
)

const SCENE_CATALOG_ENTRIES: readonly SceneCatalogEntry[] = Object.freeze(
  SCENE_TYPES.map((sceneType) => SCENE_CATALOG[sceneType])
)

export function listSceneCatalogEntries(): readonly SceneCatalogEntry[] {
  return SCENE_CATALOG_ENTRIES
}

export function listSceneDefinitions(): readonly SceneDefinition[] {
  return SCENE_DEFINITIONS
}

export function isSceneType(value: string): value is SceneType {
  return (SCENE_TYPES as readonly string[]).includes(value)
}

export function getSceneDefinition(sceneType: SceneType): SceneDefinition {
  return SCENE_DEFINITION_INDEX[sceneType]
}

export function getSceneCatalogEntry(sceneType: SceneType): SceneCatalogEntry {
  return SCENE_CATALOG[sceneType]
}

export function getSceneFieldDefinitions(
  sceneType: SceneType
): readonly SceneFieldDefinition[] {
  return SCENE_CATALOG[sceneType].fields
}

export function getSceneFieldDefinition(
  sceneType: SceneType,
  key: SceneFieldKey
): SceneFieldDefinition | undefined {
  return FIELD_INDEX[sceneType][key]
}

export function hasSceneField(
  sceneType: SceneType,
  key: SceneFieldKey
): boolean {
  return getSceneFieldDefinition(sceneType, key) !== undefined
}

export function findSceneFieldOption(
  sceneType: SceneType,
  key: SceneFieldKey,
  value: string
): SceneFieldOption | undefined {
  return OPTION_INDEX[sceneType][key]?.[value]
}

export function getSceneFieldOptionLabel(
  sceneType: SceneType,
  key: SceneFieldKey,
  value: string
): string | undefined {
  return findSceneFieldOption(sceneType, key, value)?.label
}
