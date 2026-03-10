import { MotionSample, Vector3 } from '../../core/types/sensor'

type Listener = (data: MotionSample) => void

interface TimedVector3 extends Vector3 {
  timestamp: number
}

export class MotionAdapter {
  private latestAccel?: TimedVector3
  private listener?: Listener
  private running = false

  start(listener: Listener) {
    if (this.running) return

    this.listener = listener
    this.running = true

    wx.startGyroscope({ interval: 'game' })
    wx.startAccelerometer({ interval: 'game' })

    // 加速度计：只更新缓存
    wx.onAccelerometerChange(res => {
      if (!this.running) return

      this.latestAccel = {
        x: res.x,
        y: res.y,
        z: res.z,
        timestamp: Date.now()
      }
    })

    // 陀螺仪：驱动输出
    wx.onGyroscopeChange(res => {
      if (!this.running || !this.listener) return
      if (!this.latestAccel) return

      const timestamp = Date.now()
      const accUpdated = timestamp - this.latestAccel.timestamp < 30
      const motionSample: MotionSample = {
        timestamp,
        accel: {
          x: this.latestAccel.x,
          y: this.latestAccel.y,
          z: this.latestAccel.z
        },
        gyro: {
          x: res.x,
          y: res.y,
          z: res.z
        },
        accUpdated,
      }
      this.listener(motionSample)
    })
  }

  stop() {
    if (!this.running){
      return
    }

    this.running = false
    wx.stopAccelerometer()
    wx.stopGyroscope()
    this.latestAccel = undefined
    this.listener = undefined
  }
}