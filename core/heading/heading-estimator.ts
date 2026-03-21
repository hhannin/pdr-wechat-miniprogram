import { MotionSample, Vector3 } from '../types/sensor'
import { GravitySample, Quaternion } from '../types/gravity'
import { HeadingSample } from '../types/heading'

interface HeadingOptions {
  minAxisRatio?: number        // 绕重力轴占比阈值，越大越严格
  minGyroNorm?: number         // 太小当静止（rad/s）
  maxDt?: number               // dt 上限，防止异常
}

export class HeadingEstimator {
  private headingRad = 0
  private lastYaw = 0
  private lastTimestamp = 0
  private yawOffset = 0

  private readonly minAxisRatio: number
  private readonly minGyroNorm: number
  private readonly maxDt: number

  constructor(options: HeadingOptions = {}) {
    this.minAxisRatio = options.minAxisRatio ?? 0.65
    this.minGyroNorm = options.minGyroNorm ?? 0.05
    this.maxDt = options.maxDt ?? 0.08
  }

  update(
    sample: MotionSample,
    gravity: GravitySample,
    quaternion: Quaternion
  ): HeadingSample {
    const timestamp = sample.timestamp
    console.log("dt: ", sample.dt, 0.005, this.maxDt)
    const dt = clamp(sample.dt, 0.005, this.maxDt)

    const yaw = this.computeYaw(quaternion)

    const gUnit = gravity.gUnit
    const gyro = sample.gyro

    // --- 计算绕重力轴占比 ---
    let axisRatio = 1
    let yawRateFromGyro = 0
    let gated = false

    const gyroNorm = norm3(gyro)
    console.log("gyro: ", gyroNorm, this.minGyroNorm)
    if (gyroNorm < this.minGyroNorm) {
      // 几乎静止：不需要更新（也可以允许）
      gated = true
    } else {
      const parallel = dot3(gyro, gUnit)    // 这是绕重力轴的分量（yaw 轴分量）
      const perp = {                        // 这是垂直重力轴的分量（pitch/roll 分量）
        x: gyro.x - parallel * gUnit.x,
        y: gyro.y - parallel * gUnit.y,
        z: gyro.z - parallel * gUnit.z
      }
      const perpNorm = norm3(perp)
      axisRatio = Math.abs(parallel) / (gyroNorm + 1e-8)

      yawRateFromGyro = parallel

      // 主要不是绕重力轴 => 认为是在翻转/晃动/抬手机
      if (axisRatio < this.minAxisRatio && perpNorm > Math.abs(parallel)) {
        gated = true
      }
      console.log("axisRatio: ", axisRatio, this.minAxisRatio, gyroNorm, perpNorm, Math.abs(parallel), gated)
    }


    // 初始化
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp
      this.lastYaw = yaw
      this.yawOffset = yaw
      this.headingRad = 0
      return this.buildOutput(timestamp, 0, axisRatio, gated)
    }

    // 用四元数 yaw 差分算一个“表观 yawRate”（可用于调试）
    let yawDelta = yaw - this.lastYaw
    if (yawDelta > Math.PI) yawDelta -= 2 * Math.PI
    if (yawDelta < -Math.PI) yawDelta += 2 * Math.PI
    const yawRateFromQuat = yawDelta / dt

    // --- 门控：不满足“主要绕重力轴”就不更新 heading ---
    if (!gated) {
      this.headingRad = yaw - this.yawOffset
      if (this.headingRad > Math.PI) this.headingRad -= 2 * Math.PI
      if (this.headingRad < -Math.PI) this.headingRad += 2 * Math.PI
    }else{
      this.yawOffset = yaw - this.headingRad
    }
    // 即使 gated，也要更新 lastYaw/lastTimestamp，避免下一次 delta 爆炸
    this.lastTimestamp = timestamp
    this.lastYaw = yaw

    // yawRate 你可以选择输出 gyro 的（更贴近“绕重力轴”），或输出 quat 的
    // 这里建议输出 gyro 的 parallel 分量：更符合你的门控定义
    const yawRateOut = gUnit ? yawRateFromGyro : yawRateFromQuat

    return this.buildOutput(timestamp, yawRateOut, axisRatio, gated)
  }

  private computeYaw(q: Quaternion): number {
    const { w, x, y, z } = q
    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
  }

  private buildOutput(
    timestamp: number,
    yawRate: number,
    axisRatio: number,
    gated: boolean
  ): HeadingSample & { axisRatio: number; gated: boolean } {
    return {
      timestamp,
      headingRad: this.headingRad,
      headingDeg: (this.headingRad * 180) / Math.PI,
      yawRate,
      axisRatio,
      gated
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
    return (this.headingRad * 180) / Math.PI
  }
}

/* ---------- helpers ---------- */
function dot3(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
function norm3(v: Vector3): number {
  return Math.hypot(v.x, v.y, v.z)
}
function normalize(v: Vector3): Vector3 | null {
  const n = norm3(v)
  if (n < 1e-8) return null
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}
