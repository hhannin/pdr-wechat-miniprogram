import { MotionSample, Vector3 } from '../types/sensor'
import { GravitySample } from '../types/gravity'

/**
 * 低通滤波估计重力方向
 */
export class GravityEstimator {
  private alpha: number       // 低通滤波系数
  private gravity: Vector3 | null = null

  constructor(alpha = 0.8) {
    this.alpha = alpha
  }

  /**
   * 更新重力向量
   * @param sample MotionSample
   * @returns GravitySample
   */
  update(sample: MotionSample): GravitySample {
    const a = sample.accel

    if (!this.gravity) {
      // 初始化重力向量
      this.gravity = { ...a }
    } else {
      // 低通滤波
      this.gravity.x = this.alpha * this.gravity.x + (1 - this.alpha) * a.x
      this.gravity.y = this.alpha * this.gravity.y + (1 - this.alpha) * a.y
      this.gravity.z = this.alpha * this.gravity.z + (1 - this.alpha) * a.z
    }

    return {
      timestamp: sample.timestamp,
      gravity: { ...this.gravity }
    }
  }
}