import type { SceneFieldOption } from '../types'
import {
  buildFloorOptions,
  buildPrefixedOptions,
  buildSequentialNumberOptions,
  buildValueLabelOptions,
  mergeOptionGroups,
} from './scene-option-builders'

const LETTER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

const DIRECTION_OPTIONS = buildValueLabelOptions([
  { value: 'east_side', label: '东侧' },
  { value: 'west_side', label: '西侧' },
  { value: 'south_side', label: '南侧' },
  { value: 'north_side', label: '北侧' },
  { value: 'central_area', label: '中区' },
])

export const ENTRY_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'main_entry', label: '主入口', keywords: ['正门'] },
    { value: 'south_gate', label: '南门' },
    { value: 'north_gate', label: '北门' },
    { value: 'east_gate', label: '东门' },
    { value: 'west_gate', label: '西门' },
    { value: 'gate_1', label: '1号口' },
    { value: 'gate_2', label: '2号口' },
    { value: 'gate_3', label: '3号口' },
    { value: 'gate_4', label: '4号口' },
    { value: 'gate_5', label: '5号口' },
    { value: 'gate_6', label: '6号口' },
    { value: 'exit_a', label: 'A口' },
    { value: 'exit_b', label: 'B口' },
    { value: 'exit_c', label: 'C口' },
    { value: 'exit_d1', label: 'D1出口' },
    { value: 'exit_d2', label: 'D2出口' },
    { value: 'exit_d3', label: 'D3出口' },
    { value: 'exit_d4', label: 'D4出口' },
  ])
)

export const BUILDING_OPTIONS = Object.freeze(
  mergeOptionGroups(
    buildSequentialNumberOptions(1, 12, {
      valuePrefix: 'building_',
      labelSuffix: '号楼',
    }),
    buildPrefixedOptions([...LETTER_LABELS], {
      valuePrefix: 'tower_',
      labelSuffix: '栋',
    }),
    buildValueLabelOptions([
      { value: 'main_building', label: '主楼' },
      { value: 'annex_building', label: '附楼' },
      { value: 'east_building', label: '东楼' },
      { value: 'west_building', label: '西楼' },
      { value: 'south_building', label: '南楼' },
      { value: 'north_building', label: '北楼' },
    ])
  )
)

export const UNIT_OPTIONS = Object.freeze(
  mergeOptionGroups(
    buildSequentialNumberOptions(1, 8, {
      valuePrefix: 'unit_',
      labelSuffix: '单元',
    }),
    buildValueLabelOptions([
      { value: 'east_unit', label: '东单元' },
      { value: 'west_unit', label: '西单元' },
      { value: 'south_unit', label: '南单元' },
      { value: 'north_unit', label: '北单元' },
    ])
  )
)

export const FLOOR_OPTIONS = Object.freeze(buildFloorOptions(4, 12))

export const PARKING_FLOOR_OPTIONS = Object.freeze(buildFloorOptions(5, 6))

export const ZONE_OPTIONS = Object.freeze(
  mergeOptionGroups(
    buildPrefixedOptions([...LETTER_LABELS], {
      valuePrefix: 'zone_',
      labelSuffix: '区',
    }),
    DIRECTION_OPTIONS
  )
)

export const MARKER_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'near_elevator_lobby', label: '电梯厅旁' },
    { value: 'near_escalator', label: '扶梯旁' },
    { value: 'near_stairs', label: '楼梯口旁' },
    { value: 'near_toilet', label: '卫生间旁' },
    { value: 'near_service_desk', label: '服务台旁' },
    { value: 'near_exit', label: '出入口旁' },
    { value: 'near_turnstile', label: '闸机旁' },
    { value: 'near_column', label: '柱子旁' },
    { value: 'near_landmark_store', label: '显眼店铺旁' },
    { value: 'near_nurse_station', label: '护士站旁' },
    { value: 'near_cashier', label: '收费处旁' },
    { value: 'near_pharmacy', label: '取药处旁' },
    { value: 'near_shuttle_stop', label: '摆渡车点旁' },
    { value: 'near_visitor_center', label: '游客中心旁' },
    { value: 'near_viewpoint', label: '观景台旁' },
    { value: 'near_bridge', label: '桥旁' },
  ])
)

export const CODE_OPTIONS = Object.freeze(
  buildSequentialNumberOptions(1, 300, {
    padWidth: 3,
  })
)

export const PARKING_TYPE_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'underground', label: '地下停车场' },
    { value: 'surface', label: '地面停车场' },
    { value: 'mechanical', label: '立体停车场' },
    { value: 'roadside', label: '路侧停车位' },
  ])
)

export const DEPARTMENT_ZONE_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'pediatrics', label: '儿科' },
    { value: 'internal_medicine', label: '内科' },
    { value: 'surgery', label: '外科' },
    { value: 'emergency', label: '急诊' },
    { value: 'imaging', label: '影像检查' },
    { value: 'laboratory', label: '检验区' },
    { value: 'infusion', label: '输液区' },
    { value: 'cashier', label: '收费区' },
    { value: 'pharmacy', label: '药房' },
    { value: 'inpatient', label: '住院区' },
  ])
)

export const SERVICE_POINT_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'information_desk', label: '咨询台' },
    { value: 'service_desk', label: '服务台' },
    { value: 'nurse_station', label: '护士站' },
    { value: 'cashier', label: '收费处' },
    { value: 'pharmacy_pickup', label: '取药处' },
    { value: 'visitor_center', label: '游客中心' },
    { value: 'shuttle_stop', label: '摆渡车点' },
    { value: 'toilet', label: '卫生间' },
    { value: 'elevator_lobby', label: '电梯厅' },
  ])
)

export const ROUTE_SECTION_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'route_1', label: '1号线' },
    { value: 'route_2', label: '2号线' },
    { value: 'route_3', label: '3号线' },
    { value: 'route_a', label: 'A线' },
    { value: 'route_b', label: 'B线' },
    { value: 'route_c', label: 'C线' },
    { value: 'main_route', label: '主游线' },
    { value: 'branch_route', label: '支线' },
  ])
)

export const SPOT_TYPE_OPTIONS = Object.freeze(
  buildValueLabelOptions([
    { value: 'scenic_spot', label: '景点' },
    { value: 'viewpoint', label: '观景台' },
    { value: 'trail', label: '步道' },
    { value: 'cable_car_station', label: '索道站' },
    { value: 'pier', label: '码头' },
    { value: 'rest_stop', label: '休息点' },
    { value: 'parking_lot', label: '停车场' },
    { value: 'visitor_center', label: '游客中心' },
    { value: 'gate', label: '闸口' },
  ])
)

export type SceneFieldOptionSet = readonly SceneFieldOption[]
