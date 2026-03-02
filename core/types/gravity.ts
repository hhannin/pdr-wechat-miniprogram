import { Vector3 } from './sensor'

export interface GravitySample {
  timestamp: number        // ms
  gravity: Vector3         // 原始向量 g 方向
  gNormal: number          // 模长
  gUnit: Vector3           // 单位向量
}