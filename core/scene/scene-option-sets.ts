import type { SceneFieldOption } from '../types'
import { buildFloorOptions, mergeOptionGroups } from './scene-option-builders'

function createOption(label: string): SceneFieldOption {
  return Object.freeze({
    value: label,
    label,
  })
}

function createOptionSet(labels: readonly string[]): readonly SceneFieldOption[] {
  return Object.freeze(labels.map((label) => createOption(label)))
}

export const SCENIC_GATE_OPTIONS = createOptionSet([
  '主入口',
  '南门',
  '北门',
  '东门',
  '西门',
  '检票口',
  '安检口',
  '游客中心入口',
  '索道入口',
  '码头入口',
])

export const SCENIC_FACILITY_OPTIONS = createOptionSet([
  '卫生间',
  '游客中心',
  '咨询台',
  '商店',
  '餐饮点',
  '饮水点',
  '自动售卖机',
  '医务点',
  '休息亭',
  '摆渡车点',
])

export const SCENIC_PATH_MARKER_OPTIONS = createOptionSet([
  '岔路口',
  '路牌旁',
  '观景台',
  '石阶旁',
  '桥边',
  '亭子旁',
  '雕塑旁',
  '大树旁',
  '栈道旁',
  '长椅旁',
])

export const COMMON_FLOOR_OPTIONS = mergeOptionGroups(
  createOptionSet(['LG', 'G']),
  buildFloorOptions(4, 15)
)

export const PARKING_FLOOR_OPTIONS = buildFloorOptions(6, 5)

export const MALL_FACILITY_OPTIONS = createOptionSet([
  '前台',
  '服务台',
  '直梯',
  '扶梯',
  '电梯厅',
  '闸机口',
  '大厅',
  '出入口',
  '卫生间',
  '停车场连通口',
])

export const HOSPITAL_FACILITY_OPTIONS = createOptionSet([
  '分诊台',
  '服务台',
  '护士站',
  '收费处',
  '取药处',
  '检验区',
  '影像区',
  '自助机',
  '电梯厅',
  '卫生间',
])

export const PARKING_ZONE_OPTIONS = createOptionSet([
  'A区',
  'B区',
  'C区',
  'D区',
  'E区',
  'F区',
  '东区',
  '西区',
  '南区',
  '北区',
  '中区',
])

export type SceneFieldOptionSet = readonly SceneFieldOption[]
