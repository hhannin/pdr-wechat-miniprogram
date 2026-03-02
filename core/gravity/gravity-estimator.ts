import { MotionSample, Vector3 } from '../types/sensor'
import { GravitySample } from '../types/gravity'

export class GravityEstimator {
  private alpha: number
  private gravity?: Vector3  // 👈 改为可选，或者用 ! 断言
  private gravityInfo: GravitySample

  constructor(alpha = 0.8) {
    this.alpha = alpha
    this.gravityInfo = {
      timestamp: 0,
      gravity: { x: 0, y: 0, z: 0 },
      gNormal: 0,
      gUnit: { x: 0, y: 0, z: 0 }
    }
  }

  update(sample: MotionSample): GravitySample {
    const a = sample.accel

    // 检查 gravity 是否未初始化
    if (!this.gravity) {
      this.gravity = { ...a }  // 第一次调用时初始化
    } else {
      // 低通滤波
      this.gravity.x = this.alpha * this.gravity.x + (1 - this.alpha) * a.x
      this.gravity.y = this.alpha * this.gravity.y + (1 - this.alpha) * a.y
      this.gravity.z = this.alpha * this.gravity.z + (1 - this.alpha) * a.z
    }

    const gNormal = Math.sqrt(
      this.gravity.x ** 2 + 
      this.gravity.y ** 2 + 
      this.gravity.z ** 2
    )
    
    // 避免除零
    const safeNormal = gNormal < 0.001 ? 1 : gNormal

    // 更新并返回
    this.gravityInfo = {
      timestamp: sample.timestamp,
      gravity: { ...this.gravity },
      gNormal,
      gUnit: {
        x: this.gravity.x / safeNormal,
        y: this.gravity.y / safeNormal,
        z: this.gravity.z / safeNormal
      }
    }

    return this.gravityInfo
  }

  // 可选：重置方法
  reset(): void {
    this.gravity = undefined
    this.gravityInfo = {
      timestamp: 0,
      gravity: { x: 0, y: 0, z: 0 },
      gNormal: 0,
      gUnit: { x: 0, y: 0, z: 0 }
    }
  }
}