import { MotionSample } from '../types/sensor'
import { GravitySample } from '../types/gravity'
import { HeadingSample } from '../types/heading'

interface HeadingOptions {
  yawDriftCompensation?: number     // 零漂补偿系数
  staticYawThreshold?: number       // 静止时角速度阈值
  maxYawRate?: number               // 最大可信角速度
}

export class HeadingEstimator {
  private headingRad = 0
  private lastTimestamp = 0
  private driftBias = 0

  private readonly yawDriftCompensation: number
  private readonly staticYawThreshold: number
  private readonly maxYawRate: number

  constructor(options: HeadingOptions = {}) {
    this.yawDriftCompensation = options.yawDriftCompensation ?? 0.0005
    this.staticYawThreshold = options.staticYawThreshold ?? 0.01
    this.maxYawRate = options.maxYawRate ?? 6.0
  }

  update(
    sample: MotionSample,
    gravity: GravitySample
  ): HeadingSample {

    const { gyro, timestamp } = sample

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp
      return this.buildOutput(timestamp, 0)
    }

    const dt = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp

    // 1️⃣ 计算绕重力方向的角速度
    const yawRate =
      gyro.x * gravity.gUnit.x +
      gyro.y * gravity.gUnit.y +
      gyro.z * gravity.gUnit.z

    let filteredYawRate = yawRate

    // 2️⃣ 限幅防异常
    if (Math.abs(filteredYawRate) > this.maxYawRate) {
      filteredYawRate = 0
    }

    // 3️⃣ 静止零漂估计
    if (Math.abs(filteredYawRate) < this.staticYawThreshold) {
      this.driftBias =
        this.driftBias * (1 - this.yawDriftCompensation) +
        filteredYawRate * this.yawDriftCompensation
    }

    // 去漂移
    const correctedYawRate = filteredYawRate - this.driftBias

    // 4️⃣ 积分
    this.headingRad += correctedYawRate * dt

    // 5️⃣ 角度归一化
    this.headingRad = this.normalizeAngle(this.headingRad)

    return this.buildOutput(timestamp, correctedYawRate)
  }

  private buildOutput(timestamp: number, yawRate: number): HeadingSample {
    return {
      timestamp,
      headingRad: this.headingRad,
      headingDeg: this.headingRad * 180 / Math.PI,
      yawRate
    }
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
  }

  reset() {
    this.headingRad = 0
    this.lastTimestamp = 0
    this.driftBias = 0
  }

  getHeading(): number {
    return this.headingRad
  }
  
  getHeadingDeg(): number {
    return this.headingRad * 180 / Math.PI
  }
}