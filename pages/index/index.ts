import { MotionAdapter } from '../../infra/sensor/motion-adapter'
import { DataFlow } from '../../core/pipeline/data-flow'
import { requestMotionPermission } from '../../infra/sensor/permission'

Page({
  // 页面响应式数据
  data: {
    running: false,
    ax: 0,
    ay: 0,
    az: 0,
    gx: 0,
    gy: 0,
    gz: 0,
    timestamp: 0,
    timeString: "",
  },

  adapter: null as MotionAdapter | null,
  flow: null as DataFlow | null,

  async onLoad() {
    // 1️⃣ 先申请运动权限
    const granted = await requestMotionPermission()
    console.log("granted:", granted)
    if (!granted) {
      wx.showToast({ title: '请允许运动权限', icon: 'none', duration: 3000 })
      return
    }

    // 2️⃣ 初始化适配器和数据流
    this.adapter = new MotionAdapter()
    this.flow = new DataFlow()

    this.flow.addProcessor(sample => {
      const date = new Date(sample.timestamp)
      const timeString = `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())} `
        + `${this.pad(date.getHours())}:${this.pad(date.getMinutes())}:${this.pad(date.getSeconds())}.${date.getMilliseconds()}`
      console.log("t:", sample.timestamp, timeString)

      // 更新 UI
      this.setData({
        ax: sample.accel.x,
        ay: sample.accel.y,
        az: sample.accel.z,
        gx: sample.gyro.x,
        gy: sample.gyro.y,
        gz: sample.gyro.z,
        timestamp: sample.timestamp,
        timeString: timeString,
      })
    })
  },

  toggle() {
    const running = !this.data.running
    this.setData({ running })

    if (running) {
      this.adapter?.start(sample => this.flow?.push(sample))
    } else {
      this.adapter?.stop()
    }
  },

  onUnload() {
    this.adapter?.stop()
  },

  // 辅助函数：个位数补零
  pad(num: number) {
    return num.toString().padStart(2, '0')
  }
})