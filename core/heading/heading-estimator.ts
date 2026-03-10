import { MotionSample } from '../types/sensor'
import { GravitySample, Quaternion } from '../types/gravity'
import { HeadingSample } from '../types/heading'

export class HeadingEstimator {

  private headingRad = 0
  private lastYaw = 0
  private lastTimestamp = 0
  private yawOffset = 0

  update(
    sample: MotionSample,
    gravity: GravitySample,
    quaternion: Quaternion
  ): HeadingSample {

    const { timestamp } = sample

    const yaw = this.computeYaw(quaternion)

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp
      this.lastYaw = yaw
      this.yawOffset = yaw      // ← 记录初始偏置
      this.headingRad = 0       // ← 初始 heading 为 0
      return this.buildOutput(timestamp, 0)
    }

    const dt = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp

    let yawDelta = yaw - this.lastYaw

    // wrap
    if (yawDelta > Math.PI) yawDelta -= 2 * Math.PI
    if (yawDelta < -Math.PI) yawDelta += 2 * Math.PI

    const yawRate = yawDelta / dt

    // 当前 heading = yaw - 初始偏置
    this.headingRad = yaw - this.yawOffset
    // wrap heading 到 [-π, π]
    if (this.headingRad > Math.PI) this.headingRad -= 2 * Math.PI
    if (this.headingRad < -Math.PI) this.headingRad += 2 * Math.PI

    this.lastYaw = yaw

    return this.buildOutput(timestamp, yawRate)
  }

  private computeYaw(q: Quaternion): number {

    const { w, x, y, z } = q

    return Math.atan2(
      2 * (w * z + x * y),
      1 - 2 * (y * y + z * z)
    )
  }

  private buildOutput(timestamp: number, yawRate: number): HeadingSample {
    return {
      timestamp,
      headingRad: this.headingRad,
      headingDeg: this.headingRad * 180 / Math.PI,
      yawRate
    }
  }

  reset() {
    this.headingRad = 0
    this.lastYaw = 0
    this.lastTimestamp = 0
    this.yawOffset = 0
  }

  getHeading(): number {
    return this.headingRad
  }

  getHeadingDeg(): number {
    return this.headingRad * 180 / Math.PI
  }
}