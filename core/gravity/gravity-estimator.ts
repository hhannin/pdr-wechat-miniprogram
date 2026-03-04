import { MotionSample, Vector3 } from '../types/sensor'
import { GravitySample } from '../types/gravity'

interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

interface GravityOptions {
  kp?: number
  ki?: number
}

export class GravityEstimator {

  private q: Quaternion = { w: 1, x: 0, y: 0, z: 0 }
  private gyroBias: Vector3 = { x: 0, y: 0, z: 0 }

  private lastTimestamp = 0
  private initialized = false

  private readonly kp: number
  private readonly ki: number

  constructor(options: GravityOptions = {}) {
    this.kp = options.kp ?? 0.02
    this.ki = options.ki ?? 0.0005
  }

  // =============================
  // 初始化（静止时调用）
  // =============================
  initializeFromGravity(initialGravity: Vector3) {

    const norm = Math.sqrt(
      initialGravity.x**2 +
      initialGravity.y**2 +
      initialGravity.z**2
    )

    if (norm < 1e-6) return

    const gNorm = {
      x: initialGravity.x / norm,
      y: initialGravity.y / norm,
      z: initialGravity.z / norm
    }

    // 世界坐标中“重力方向”定义为 (0,0,-1)
    const worldGravity = { x: 0, y: 0, z: 1 }

    this.q = this.quaternionFromTwoVectors(
      worldGravity,
      gNorm
    )

    this.gyroBias = { x: 0, y: 0, z: 0 }
    this.initialized = true
    this.lastTimestamp = 0

    const testG = this.getGravityDirection()
    console.log("test: ", testG)

  }

  isInitialized() {
    return this.initialized
  }

  // =============================
  // 主更新
  // =============================
  update(sample: MotionSample): GravitySample {

    if (!this.initialized) {
      return this.buildOutput(sample.timestamp)
    }

    const { accel, gyro, timestamp } = sample

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp
      return this.buildOutput(timestamp)
    }

    const dt = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp

    // 1️⃣ 计算重力方向预测
    const gPred = this.getGravityDirection()

    // 2️⃣ accel 归一化
    const accNormVal = Math.sqrt(
      accel.x**2 + accel.y**2 + accel.z**2
    )

    let error = { x: 0, y: 0, z: 0 }

    if (accNormVal > 0.5) {

      const aNorm = {
        x: accel.x / accNormVal,
        y: accel.y / accNormVal,
        z: accel.z / accNormVal
      }

      // 误差 = gPred × aNorm   (标准 Mahony)
      error = {
        x: gPred.y * aNorm.z - gPred.z * aNorm.y,
        y: gPred.z * aNorm.x - gPred.x * aNorm.z,
        z: gPred.x * aNorm.y - gPred.y * aNorm.x
      }

      // 3️⃣ 更新 gyro bias (积分项)
      this.gyroBias.x += this.ki * error.x * dt
      this.gyroBias.y += this.ki * error.y * dt
      this.gyroBias.z += this.ki * error.z * dt
    }

    // 4️⃣ 修正 gyro
    const correctedGyro = {
      x: gyro.x - this.gyroBias.x + this.kp * error.x,
      y: gyro.y - this.gyroBias.y + this.kp * error.y,
      z: gyro.z - this.gyroBias.z + this.kp * error.z
    }

    // 5️⃣ 四元数积分
    this.integrateGyro(correctedGyro, dt)

    return this.buildOutput(timestamp)
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

    const gUnit = this.getGravityDirection()

    return {
      timestamp,
      gravity: {
        x: gUnit.x * 9.81,
        y: gUnit.y * 9.81,
        z: gUnit.z * 9.81
      },
      gNormal: 9.81,
      gUnit
    }
  }

  // =============================
  // v1 → v2 四元数（含180°特判）
  // =============================
  private quaternionFromTwoVectors(
    v1: Vector3,
    v2: Vector3
  ): Quaternion {

    const dot =
      v1.x*v2.x + v1.y*v2.y + v1.z*v2.z

    // 180° 特判
    if (dot < -0.9999) {

      let axis = { x: 1, y: 0, z: 0 }

      if (Math.abs(v1.x) > 0.9) {
        axis = { x: 0, y: 1, z: 0 }
      }

      const cross = {
        x: v1.z*axis.y - v1.y*axis.z,
        y: v1.x*axis.z - v1.z*axis.x,
        z: v1.y*axis.x - v1.x*axis.y,
      }

      return this.normalize({
        w: 0,
        x: cross.x,
        y: cross.y,
        z: cross.z
      })
    }

    const cross = {
      x: v2.y*v1.z - v2.z*v1.y,
      y: v2.z*v1.x - v2.x*v1.z,
      z: v2.x*v1.y - v2.y*v1.x
    }

    return this.normalize({
      w: 1 + dot,
      x: cross.x,
      y: cross.y,
      z: cross.z
    })
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
    this.gyroBias = { x: 0, y: 0, z: 0 }
    this.lastTimestamp = 0
    this.initialized = false
  }
}