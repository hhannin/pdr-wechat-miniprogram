// core/imu/static-detector.ts

import { Vector3 } from '../../core/types/sensor'

export class StaticDetector {

  private accelBuffer: number[] = []
  private gyroBuffer: number[] = []

  private readonly accelWindow = 10   // 10 * 5Hz = 2s
  private readonly gyroWindow = 50    // 50 * 50Hz = 1s

  private readonly accelStdThreshold = 0.03
  private readonly gyroStdThreshold = 0.02
  private readonly gyroMeanThreshold = 0.05
  private readonly accelMeanThreshold = 0.15

  update(accel: Vector3, gyro: Vector3, accUpdated: boolean) {
    const gyroNorm = Math.sqrt(
      gyro.x * gyro.x +
      gyro.y * gyro.y +
      gyro.z * gyro.z
    )
    this.gyroBuffer.push(gyroNorm)
    if (this.gyroBuffer.length > this.gyroWindow) {
      this.gyroBuffer.shift()
    }

    if (accUpdated) {
      const accNorm = Math.sqrt(
        accel.x * accel.x +
        accel.y * accel.y +
        accel.z * accel.z
      )
      this.accelBuffer.push(accNorm)
      if (this.accelBuffer.length > this.accelWindow) {
        this.accelBuffer.shift()
      }
    }
  }

  isStatic(): boolean {
    if (this.accelBuffer.length < this.accelWindow) {
      return false
    }
    if (this.gyroBuffer.length < this.gyroWindow) {
      return false
    }

    const accelMean = this.mean(this.accelBuffer)
    const accelStd = this.std(this.accelBuffer)

    const gyroMean = this.mean(this.gyroBuffer)
    const gyroStd = this.std(this.gyroBuffer)

    const accelCloseTo1G =
      Math.abs(accelMean - 1) < this.accelMeanThreshold
    const accelStable =
      accelStd < this.accelStdThreshold

    const gyroSmall =
      gyroMean < this.gyroMeanThreshold
    const gyroStable =
      gyroStd < this.gyroStdThreshold

    console.log(
      "static-detector: ",
      "accel:", Math.abs(accelMean - 1), this.accelMeanThreshold, accelStd, this.accelStdThreshold,
      "gyro", gyroMean, this.gyroMeanThreshold, gyroStd, this.gyroStdThreshold,
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
    const m = this.mean(arr)

    const v = arr.reduce((a, b) => {
      const d = b - m
      return a + d * d
    }, 0) / arr.length

    return Math.sqrt(v)
  }
}