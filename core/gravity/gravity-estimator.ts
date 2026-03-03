import { MotionSample, Vector3 } from '../types/sensor'
import { GravitySample } from '../types/gravity'

interface GravityOptions {
  accelCorrectionGain?: number   // 重力修正强度
  gravityClamp?: boolean
}

interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

export class GravityEstimator {
  private q: Quaternion = { w: 1, x: 0, y: 0, z: 0 }
  private lastTimestamp = 0

  private readonly accelCorrectionGain: number
  private readonly gravityClamp: boolean

  constructor(options: GravityOptions = {}) {
    this.accelCorrectionGain = options.accelCorrectionGain ?? 0.02
    this.gravityClamp = options.gravityClamp ?? true
  }

  update(sample: MotionSample): GravitySample {
    const { accel, gyro, timestamp } = sample

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp
      return this.buildOutput(timestamp)
    }

    const dt = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp

    // 1️⃣ Gyro积分更新姿态
    this.integrateGyro(gyro, dt)

    // 2️⃣ Accel修正倾斜漂移（仅roll/pitch）
    this.correctWithAccel(accel)

    // 3️⃣ 输出重力方向
    return this.buildOutput(timestamp)
  }

  private integrateGyro(gyro: Vector3, dt: number) {
    const gx = gyro.x
    const gy = gyro.y
    const gz = gyro.z

    const q = this.q

    const halfDt = 0.5 * dt

    const qw = q.w + (-q.x * gx - q.y * gy - q.z * gz) * halfDt
    const qx = q.x + ( q.w * gx + q.y * gz - q.z * gy) * halfDt
    const qy = q.y + ( q.w * gy - q.x * gz + q.z * gx) * halfDt
    const qz = q.z + ( q.w * gz + q.x * gy - q.y * gx) * halfDt

    this.q = this.normalize({ w: qw, x: qx, y: qy, z: qz })
  }

  private correctWithAccel(accel: Vector3) {
    const norm = Math.sqrt(accel.x**2 + accel.y**2 + accel.z**2)
    if (norm < 0.5) return  // 动态太大不修正

    const ax = accel.x / norm
    const ay = accel.y / norm
    const az = accel.z / norm

    // 当前姿态预测的重力方向
    const g = this.getGravityDirection()

    // 叉积误差
    const ex = ay * g.z - az * g.y
    const ey = az * g.x - ax * g.z
    const ez = ax * g.y - ay * g.x

    const gain = this.accelCorrectionGain

    // 用误差修正四元数（小角度近似）
    this.q.w += 0
    this.q.x += gain * ex
    this.q.y += gain * ey
    this.q.z += gain * ez

    this.q = this.normalize(this.q)
  }

  private getGravityDirection(): Vector3 {
    const { w, x, y, z } = this.q

    return {
      x: 2 * (x*z - w*y),
      y: 2 * (w*x + y*z),
      z: w*w - x*x - y*y + z*z
    }
  }

  private buildOutput(timestamp: number): GravitySample {
    const gDir = this.getGravityDirection()

    let gNormal = 9.81
    let gravity = {
      x: gDir.x * 9.81,
      y: gDir.y * 9.81,
      z: gDir.z * 9.81
    }

    if (this.gravityClamp) {
      const norm = Math.sqrt(
        gravity.x**2 + gravity.y**2 + gravity.z**2
      )
      if (norm > 1e-6) {
        const scale = 9.81 / norm
        gravity.x *= scale
        gravity.y *= scale
        gravity.z *= scale
      }
    }

    return {
      timestamp,
      gravity,
      gNormal,
      gUnit: {
        x: gDir.x,
        y: gDir.y,
        z: gDir.z
      }
    }
  }

  private normalize(q: Quaternion): Quaternion {
    const norm = Math.sqrt(q.w*q.w + q.x*q.x + q.y*q.y + q.z*q.z)
    return {
      w: q.w / norm,
      x: q.x / norm,
      y: q.y / norm,
      z: q.z / norm
    }
  }

  reset() {
    this.q = { w: 1, x: 0, y: 0, z: 0 }
    this.lastTimestamp = 0
  }
}