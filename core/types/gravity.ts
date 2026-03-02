import { Vector3 } from './sensor'

export interface GravitySample {
  timestamp: number        // ms
  gravity: Vector3         // 单位向量 g 方向
}