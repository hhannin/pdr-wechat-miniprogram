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
  COMMON_FLOOR_OPTIONS,
  HOSPITAL_FACILITY_OPTIONS,
  MALL_FACILITY_OPTIONS,
  PARKING_FLOOR_OPTIONS,
  PARKING_ZONE_OPTIONS,
  SCENIC_FACILITY_OPTIONS,
  SCENIC_GATE_OPTIONS,
  SCENIC_PATH_MARKER_OPTIONS,
} from './scene-option-sets'

function defineField(field: SceneFieldDefinition): SceneFieldDefinition {
  return Object.freeze(field)
}

function defineCatalogEntry(entry: SceneCatalogEntry): SceneCatalogEntry {
  return Object.freeze({
    ...entry,
    fields: Object.freeze(entry.fields),
  })
}

const SCENE_CATALOG: Readonly<Record<SceneType, SceneCatalogEntry>> = Object.freeze({
  default: defineCatalogEntry({
    type: 'default',
    label: '默认',
    description: '通用地点记录，不限制额外场景字段，只保留备注补充。',
    fields: [],
  }),
  parking_lot: defineCatalogEntry({
    type: 'parking_lot',
    label: '停车场',
    description: '聚焦楼层、区域和停车位，尽量用最少字段记住车所在的位置。',
    fields: [
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'hybrid',
        options: PARKING_FLOOR_OPTIONS,
        required: false,
        primary: true,
        description: '可直接点常用楼层，也可以手动输入实际楼层写法。',
        placeholder: '例如 B2、负一层、1F',
        maxLength: 16,
      }),
      defineField({
        key: 'zone',
        label: '区域',
        control: 'hybrid',
        options: PARKING_ZONE_OPTIONS,
        required: false,
        primary: true,
        description: '如果没有标准分区，也可以输入电梯厅附近、东侧等描述。',
        placeholder: '例如 C区、东区、靠电梯厅',
        maxLength: 24,
      }),
      defineField({
        key: 'parkingSpot',
        label: '停车位',
        control: 'text',
        options: Object.freeze([]),
        required: false,
        primary: true,
        description: '停车位编号通常差异很大，直接输入最贴近现场的写法。',
        placeholder: '例如 C34、A-120、17号柱旁',
        maxLength: 40,
      }),
    ],
  }),
  mall: defineCatalogEntry({
    type: 'mall',
    label: '办公楼/商场',
    description: '聚焦楼层、门牌或号牌和服务设施，帮助用户更快回到室内目标点位。',
    fields: [
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'hybrid',
        options: COMMON_FLOOR_OPTIONS,
        required: false,
        primary: true,
        description: '常见楼层可直接点选，办公楼和商场的特殊楼层写法也支持手填。',
        placeholder: '例如 3F、B1、LG、12F',
        maxLength: 16,
      }),
      defineField({
        key: 'shop',
        label: '门牌/号牌',
        control: 'text',
        options: Object.freeze([]),
        required: false,
        primary: true,
        description: '可填写店铺名、门牌号、房号或区域号牌，尽量保留现场最常用的叫法。',
        placeholder: '例如 星巴克、MUJI、1208、A座-201',
        maxLength: 40,
      }),
      defineField({
        key: 'facility',
        label: '服务设施',
        control: 'hybrid',
        options: MALL_FACILITY_OPTIONS,
        required: false,
        primary: true,
        description: '优先记录前台、电梯厅、闸机口等最容易帮助你回找的公共设施。',
        placeholder: '例如 前台、电梯厅、闸机口',
        maxLength: 24,
      }),
    ],
  }),
  hospital: defineCatalogEntry({
    type: 'hospital',
    label: '医院',
    description: '聚焦楼层、诊室和服务设施，减少回找诊区时的认知负担。',
    fields: [
      defineField({
        key: 'floor',
        label: '楼层',
        control: 'hybrid',
        options: COMMON_FLOOR_OPTIONS,
        required: false,
        primary: true,
        description: '医院楼层写法不完全统一，保留手填能力更稳妥。',
        placeholder: '例如 2F、门诊三层、B1',
        maxLength: 16,
      }),
      defineField({
        key: 'clinic',
        label: '诊室',
        control: 'text',
        options: Object.freeze([]),
        required: false,
        primary: true,
        description: '诊室、窗口、检查室命名差异很大，建议直接输入。',
        placeholder: '例如 3诊室、B超2室、取药窗口6',
        maxLength: 40,
      }),
      defineField({
        key: 'facility',
        label: '服务设施',
        control: 'hybrid',
        options: HOSPITAL_FACILITY_OPTIONS,
        required: false,
        primary: true,
        description: '优先记录分诊台、护士站、收费处等最容易帮助回找的设施。',
        placeholder: '例如 分诊台、护士站、电梯厅',
        maxLength: 24,
      }),
    ],
  }),
  scenic_area: defineCatalogEntry({
    type: 'scenic_area',
    label: '景区',
    description: '景区差异大，建议以大门、服务设施和路径标识作为核心线索。',
    fields: [
      defineField({
        key: 'gate',
        label: '大门',
        control: 'hybrid',
        options: SCENIC_GATE_OPTIONS,
        required: false,
        primary: true,
        description: '景区入口命名差异较大，既能点常用项，也能手动补充。',
        placeholder: '例如 南门、检票口、游客中心入口',
        maxLength: 24,
      }),
      defineField({
        key: 'facility',
        label: '服务设施',
        control: 'hybrid',
        options: SCENIC_FACILITY_OPTIONS,
        required: false,
        primary: true,
        description: '记录附近最容易辨认的服务设施。',
        placeholder: '例如 游客中心、卫生间、咨询台',
        maxLength: 24,
      }),
      defineField({
        key: 'pathMarker',
        label: '路径标识',
        control: 'hybrid',
        options: SCENIC_PATH_MARKER_OPTIONS,
        required: false,
        primary: true,
        description: '路径标识通常最能帮助回找，支持自由补充现场描述。',
        placeholder: '例如 路牌旁、桥边、观景台',
        maxLength: 40,
      }),
    ],
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
