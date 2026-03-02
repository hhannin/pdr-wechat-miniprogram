import { MotionSample, Vector3 } from '../../core/types/sensor'

type Listener = (data: MotionSample) => void

interface TimedVector3 extends Vector3 {
  timestamp: number
}

export class MotionAdapter {
  private accelBuffer: TimedVector3[] = []
  private gyroBuffer: TimedVector3[] = []
  private listener?: Listener
  private running = false
  private maxBufferSize = 10 // 缓冲区长度，防止无限增长

  start(listener: Listener) {
    if (this.running) return

    this.listener = listener
    this.running = true

    wx.startAccelerometer({ interval: 'game' })
    wx.startGyroscope({ interval: 'game' })

    wx.onAccelerometerChange(res => {
      if (!this.running) return

      const sample: TimedVector3 = { ...res, timestamp: Date.now() }
      this.accelBuffer.push(sample)
      if (this.accelBuffer.length > this.maxBufferSize) this.accelBuffer.shift()

      this.tryEmit()
    })

    wx.onGyroscopeChange(res => {
      if (!this.running) return

      const sample: TimedVector3 = { ...res, timestamp: Date.now() }
      this.gyroBuffer.push(sample)
      if (this.gyroBuffer.length > this.maxBufferSize) this.gyroBuffer.shift()

      this.tryEmit()
    })
  }

  stop() {
    this.running = false
    wx.stopAccelerometer()
    wx.stopGyroscope()
    this.accelBuffer = []
    this.gyroBuffer = []
  }

  private tryEmit() {
    if (!this.listener || !this.accelBuffer.length || !this.gyroBuffer.length) return

    // 对齐最近时间戳
    const accelSample = this.accelBuffer[0]
    let closestGyro = this.gyroBuffer.reduce((prev, curr) =>
      Math.abs(curr.timestamp - accelSample.timestamp) < Math.abs(prev.timestamp - accelSample.timestamp)
        ? curr
        : prev
    )

    // 如果时间差超过阈值（如 20ms）就不发，等待下次对齐
    const dt = Math.abs(accelSample.timestamp - closestGyro.timestamp)
    if (dt > 20) return

    // 生成同步 MotionSample
    const motionSample: MotionSample = {
      timestamp: Math.round((accelSample.timestamp + closestGyro.timestamp) / 2),
      accel: { x: accelSample.x, y: accelSample.y, z: accelSample.z },
      gyro: { x: closestGyro.x, y: closestGyro.y, z: closestGyro.z }
    }

    // 推送给 listener
    this.listener(motionSample)

    // 移除已经使用的样本
    this.accelBuffer.shift()
    this.gyroBuffer = this.gyroBuffer.filter(g => g.timestamp > closestGyro.timestamp)
  }
}