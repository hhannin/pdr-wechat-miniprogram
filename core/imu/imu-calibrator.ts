// core/imu/imu-calibrator.ts

import { Vector3 } from '../../core/types/sensor'
import { StaticDetector } from './static-detector'

export class IMUCalibrator {

  private staticDetector = new StaticDetector()

  private gyroSamples: Vector3[] = []
  private accelSamples: Vector3[] = []

  private readonly calibrationSampleCount = 75

  private calibrated = false
  private gyroBias: Vector3 = { x: 0, y: 0, z: 0 }
  private initialGravity: Vector3 = { x: 0, y: 0, z: -1 }

  update(accel: Vector3, gyro: Vector3) {
    if (this.calibrated) return

    this.staticDetector.update(accel, gyro)

    if (!this.staticDetector.isStatic()){
      console.log("imu-calibrator: return not static")
      return
    }

    this.gyroSamples.push(gyro)
    this.accelSamples.push(accel)
    if (this.gyroSamples.length >= this.calibrationSampleCount) {
      this.performCalibration()
    }else{
      console.log("imu-calibrator: return this.gyroSamples.length:", this.gyroSamples.length, this.calibrationSampleCount)
    }
  }

  private performCalibration() {
    this.gyroBias = {
      x: this.mean(this.gyroSamples.map(g => g.x)),
      y: this.mean(this.gyroSamples.map(g => g.y)),
      z: this.mean(this.gyroSamples.map(g => g.z)),
    }

    const avgAccel = {
      x: this.mean(this.accelSamples.map(a => a.x)),
      y: this.mean(this.accelSamples.map(a => a.y)),
      z: this.mean(this.accelSamples.map(a => a.z)),
    }

    const norm = Math.sqrt(
      avgAccel.x * avgAccel.x +
      avgAccel.y * avgAccel.y +
      avgAccel.z * avgAccel.z
    )

    this.initialGravity = {
      x: avgAccel.x / norm,
      y: avgAccel.y / norm,
      z: avgAccel.z / norm,
    }

    this.calibrated = true

    console.log('IMU calibrated')
    console.log('Gyro bias:', this.gyroBias)
    console.log('Initial gravity:', this.initialGravity)
  }

  getCorrectedGyro(gyro: Vector3): Vector3 {
    return {
      x: gyro.x - this.gyroBias.x,
      y: gyro.y - this.gyroBias.y,
      z: gyro.z - this.gyroBias.z,
    }
  }

  getInitialGravity(): Vector3 {
    return this.initialGravity
  }

  isCalibrated(): boolean {
    return this.calibrated
  }

  private mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }
}