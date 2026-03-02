import { MotionAdapter } from '../../infra/sensor/motion-adapter'
import { DataFlow } from '../../core/pipeline/data-flow'
import { GravityEstimator } from '../../core/gravity/gravity-estimator'
import { requestMotionPermission } from '../../infra/sensor/permission'
import { formatTimestamp } from '../../utils/format-util'  // 导入工具函数
import { drawGravity3D } from '../../utils/canvas-3d-util'      // 导入绘图函数

Page({
  // 页面响应式数据
  data: {
    running: false,
    ax: 0, ay: 0, az: 0,
    gx: 0, gy: 0, gz: 0,
    gravityX: 0, gravityY: 0, gravityZ: 0,
    timestamp: 0,
    timeString: ""
  },

  adapter: null as MotionAdapter | null,
  flow: null as DataFlow | null,
  gravityEstimator: null as GravityEstimator | null,
  canvasNode: null as any,  // Canvas Node
  ctx: null as any,         // Canvas 2D Context


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
    this.gravityEstimator = new GravityEstimator(0.8)

    this.flow?.addProcessor(sample => {
      const timeString = formatTimestamp(sample.timestamp)
      console.log("t:", sample.timestamp, timeString)

      const g = this.gravityEstimator!.update(sample)

      // 更新 UI
      this.setData({
        ax: sample.accel.x,
        ay: sample.accel.y,
        az: sample.accel.z,
        gx: sample.gyro.x,
        gy: sample.gyro.y,
        gz: sample.gyro.z,
        gravityX: g.gravity.x,
        gravityY: g.gravity.y,
        gravityZ: g.gravity.z,
        timestamp: sample.timestamp,
        timeString: timeString,
      })
      
      if (this.ctx) {
        drawGravity3D(this.ctx, g, 300)  // 调用导入的绘图函数
      }
    })
  },

  onReady() {
    const query = wx.createSelectorQuery()
    query.select('#gravityCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.error('Canvas Node not found!')
          return
        }
        this.canvasNode = res[0].node
        this.ctx = this.canvasNode.getContext('2d')
  
        // 设置画布内部像素大小
        this.canvasNode.width = 400
        this.canvasNode.height = 400
        console.log("gravityCanvas ready for 3D")
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
})