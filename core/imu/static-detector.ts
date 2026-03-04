// core/imu/static-detector.ts

import { Vector3 } from '../../core/types/sensor'

export class StaticDetector {
  private accelBuffer: number[] = []
  private gyroBuffer: number[] = []

  private readonly windowSize = 25
  private readonly accelThreshold = 0.1   // g 允许偏差
  private readonly gyroThreshold = 0.1   // rad/s
  private readonly accelStdThreshold = 0.02
  private readonly gyroStdThreshold = 0.02

  update(accel: Vector3, gyro: Vector3) {
    const accelNorm = Math.sqrt(
      accel.x * accel.x +
      accel.y * accel.y +
      accel.z * accel.z
    )

    const gyroNorm = Math.sqrt(
      gyro.x * gyro.x +
      gyro.y * gyro.y +
      gyro.z * gyro.z
    )

    this.accelBuffer.push(accelNorm)
    this.gyroBuffer.push(gyroNorm)

    if (this.accelBuffer.length > this.windowSize)
      this.accelBuffer.shift()

    if (this.gyroBuffer.length > this.windowSize)
      this.gyroBuffer.shift()
  }

  isStatic(): boolean {
    if (this.accelBuffer.length < this.windowSize){
      console.log("static-detector: return this.accelBuffer.length:", this.accelBuffer.length, this.windowSize)
      return false
    }

    const accelMean = this.mean(this.accelBuffer)
    const accelStd  = this.std(this.accelBuffer)

    const gyroMean = this.mean(this.gyroBuffer)
    const gyroStd   = this.std(this.gyroBuffer)

    const accelCloseTo1G = Math.abs(accelMean - 1) < this.accelThreshold
    const accelStable    = accelStd < this.accelStdThreshold
    const gyroSmall = gyroMean < this.gyroThreshold
    const gyroStable     = gyroStd < this.gyroStdThreshold

    console.log(
      "static-detector: ",
      "accel:", Math.abs(accelMean - 1), this.accelThreshold, accelStd, this.accelStdThreshold,
      "gyro", gyroMean, this.gyroThreshold, gyroStd, this.gyroStdThreshold,
      "accelCloseTo1G=", accelCloseTo1G, 
      "accelStable=", accelStable,
      "gyroSmall=", gyroSmall,
      "gyroStable=", gyroStable,
    )
    return accelCloseTo1G && accelStable && gyroSmall && gyroStable
  }

  private mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  private std(arr: number[]): number {
    const mean = this.mean(arr)
    const squaredDiffs = arr.map(value => Math.pow(value - mean, 2))
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length
    return Math.sqrt(variance)
  }
}