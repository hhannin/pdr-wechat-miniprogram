import type { SceneFieldOption } from '../types'

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
  '南门',
  '北门',
  '东门',
  '西门',
  '主入口',
  '次入口',
  '检票口',
  '安检口',
  '栈道入口',
  '索道入口',
  '码头入口',
])

export const SCENIC_FACILITY_OPTIONS = createOptionSet([
  '卫生间',
  '商店',
  '餐饮点',
  '自动售卖机',
  '充电点',
  '饮水点',
  '医务点',
  '咨询台',
  '休息亭',
  '停车接驳点',
])

export const SCENIC_PATH_MARKER_OPTIONS = createOptionSet([
  '岔路口',
  '石阶旁',
  '桥边',
  '路牌旁',
  '亭子旁',
  '雕塑旁',
  '大树旁',
  '湖边栏杆',
  '花坛旁',
  '长椅旁',
])

export const COMMON_FLOOR_OPTIONS = createOptionSet([
  'B3',
  'B2',
  'B1',
  '1F',
  '2F',
  '3F',
  '4F',
  '5F',
  '6F',
  '7F',
])

export const PARKING_FLOOR_OPTIONS = createOptionSet([
  'B4',
  'B3',
  'B2',
  'B1',
  '1F',
  '2F',
  '3F',
])

export const MALL_FACILITY_OPTIONS = createOptionSet([
  '服务台',
  '卫生间',
  '扶梯',
  '直梯',
  '出入口',
  '停车场连通口',
  '儿童区',
  '影院入口',
  '超市入口',
  '餐饮区',
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
  '东区',
  '西区',
  '南区',
  '北区',
  '中区',
])

export type SceneFieldOptionSet = readonly SceneFieldOption[]
