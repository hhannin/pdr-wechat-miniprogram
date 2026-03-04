import { MotionSample, Vector3 } from '../types/sensor'
import { GravitySample } from '../types/gravity'

interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

interface GravityOptions {
  accelCorrectionGain?: number
}

export class GravityEstimator {

  private q: Quaternion = { w: 1, x: 0, y: 0, z: 0 }
  private lastTimestamp = 0

  private initialized = false
  private locked = true   // 🔒 初始化锁

  private readonly accelCorrectionGain: number

  constructor(options: GravityOptions = {}) {
    this.accelCorrectionGain = options.accelCorrectionGain ?? 0.02
  }

  // =============================
  // 🔥 初始化入口（由校准模块调用）
  // =============================
  initializeFromGravity(initialGravity: Vector3) {

    const worldUp = { x: 0, y: 0, z: 1 }

    this.q = this.quaternionFromTwoVectors(
      worldUp,
      initialGravity
    )

    this.initialized = true
    this.locked = false
    this.lastTimestamp = 0
    console.log("gravity-estimator: initializeFromGravity: ", initialGravity, this.q)
    console.log('GravityEstimator initialized')
  }

  isInitialized(): boolean {
    return this.initialized
  }

  // =============================
  // 主更新入口
  // =============================
  update(sample: MotionSample): GravitySample {

    if (!this.initialized || this.locked) {
      return this.buildOutput(sample.timestamp)
    }

    const { gyro, accel, timestamp } = sample

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp
      return this.buildOutput(timestamp)
    }

    const dt = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp

    // 1️⃣ Mahony结构
    const correctedGyro = this.applyAccelCorrection(gyro, accel)

    // 2️⃣ 积分
    this.integrateGyro(correctedGyro, dt)

    return this.buildOutput(timestamp)
  }

  // =============================
  // Mahony修正
  // =============================
  private applyAccelCorrection(
    gyro: Vector3,
    accel: Vector3
  ): Vector3 {

    const norm = Math.sqrt(
      accel.x**2 + accel.y**2 + accel.z**2
    )

    if (norm < 0.5) return gyro

    const ax = accel.x / norm
    const ay = accel.y / norm
    const az = accel.z / norm

    const g = this.getGravityDirection()

    // 🔥 正确顺序：g × accel
    const ex = g.y * az - g.z * ay
    const ey = g.z * ax - g.x * az
    const ez = g.x * ay - g.y * ax

    const k = this.accelCorrectionGain

    return {
      x: gyro.x + k * ex,
      y: gyro.y + k * ey,
      z: gyro.z + k * ez
    }
  }

  // =============================
  // 四元数积分
  // =============================
  private integrateGyro(gyro: Vector3, dt: number) {

    const { x: gx, y: gy, z: gz } = gyro
    const q = this.q

    const halfDt = 0.5 * dt

    const qw = q.w + (-q.x * gx - q.y * gy - q.z * gz) * halfDt
    const qx = q.x + ( q.w * gx + q.y * gz - q.z * gy) * halfDt
    const qy = q.y + ( q.w * gy - q.x * gz + q.z * gx) * halfDt
    const qz = q.z + ( q.w * gz + q.x * gy - q.y * gx) * halfDt

    this.q = this.normalize({ w: qw, x: qx, y: qy, z: qz })
  }

  // =============================
  // 当前重力方向
  // =============================
  private getGravityDirection(): Vector3 {

    const { w, x, y, z } = this.q

    return {
      x: 2 * (x*z - w*y),
      y: 2 * (w*x + y*z),
      z: w*w - x*x - y*y + z*z
    }
  }

  // =============================
  // 输出
  // =============================
  private buildOutput(timestamp: number): GravitySample {

    const gDir = this.getGravityDirection()

    return {
      timestamp,
      gravity: {
        x: gDir.x * 9.81,
        y: gDir.y * 9.81,
        z: gDir.z * 9.81
      },
      gNormal: 9.81,
      gUnit: gDir
    }
  }

  // =============================
  // 工具函数
  // =============================
  private quaternionFromTwoVectors(
    v1: Vector3,
    v2: Vector3
  ): Quaternion {

    const dot =
      v1.x*v2.x + v1.y*v2.y + v1.z*v2.z

    const cross = {
      x: v2.y*v1.z - v2.z*v1.y,
      y: v2.z*v1.x - v2.x*v1.z,
      z: v2.x*v1.y - v2.y*v1.x
    }

    const q = {
      w: 1 + dot,
      x: cross.x,
      y: cross.y,
      z: cross.z
    }

    return this.normalize(q)
  }

  private normalize(q: Quaternion): Quaternion {
    const norm = Math.sqrt(
      q.w*q.w + q.x*q.x +
      q.y*q.y + q.z*q.z
    )

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
    this.initialized = false
    this.locked = true
  }
}