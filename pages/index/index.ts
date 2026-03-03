import { MotionAdapter } from '../../infra/sensor/motion-adapter'
import { DataFlow } from '../../core/pipeline/data-flow'
import { GravityEstimator } from '../../core/gravity/gravity-estimator'
import { GaitDetector } from '../../core/gait/gait-detector'
import { requestMotionPermission } from '../../infra/sensor/permission'
import { formatTimestamp } from '../../utils/format-util'
import { drawGravity3D } from '../../core/gravity/gravity-visual'
import { HeadingEstimator } from '../../core/heading/heading-estimator'
import { TurnDetector } from '../../core/heading/turn-detector'
import { drawHeadingCompass } from '../../core/heading/heading-visual'

Page({
  // 页面响应式数据
  data: {
    running: false,
    ax: 0, ay: 0, az: 0,
    gx: 0, gy: 0, gz: 0,
    gravityX: 0, gravityY: 0, gravityZ: 0,
    timestamp: 0,timeString: "",
    stepCount: 0,stepFreq: 0,
    headingDeg: 0,yawRate: 0,
    turnDirection: '',turnAngle: 0,
  },

  adapter: null as MotionAdapter | null,
  flow: null as DataFlow | null,
  gravityEstimator: null as GravityEstimator | null,
  gaitDetector: null as GaitDetector | null,
  headingEstimator: null as HeadingEstimator | null,
  turnDetector: null as TurnDetector | null,
  gravityCanvas: null as any,  // Canvas Node
  gravityCtx: null as any,         // Canvas 2D Context
  headingCanvas: null as any,
  headingCtx: null as any,

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
    this.gravityEstimator = new GravityEstimator()
    this.headingEstimator = new HeadingEstimator()
    this.turnDetector = new TurnDetector()
    this.gaitDetector = new GaitDetector((stepCount, stepFreq) => {
      this.setData({ stepCount, stepFreq })
    })

    this.flow?.addProcessor(sample => {

      const timeString = formatTimestamp(sample.timestamp)
    
      const g = this.gravityEstimator!.update(sample)
    
      const heading = this.headingEstimator!.update(sample, g)
    
      const turnEvent = this.turnDetector!.update(heading)
    
      this.gaitDetector?.pushSample(sample, g)
    
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
    
        headingDeg: heading.headingDeg,
        yawRate: heading.yawRate,
    
        turnDirection: turnEvent?.direction ?? '',
        turnAngle: turnEvent?.angleDeg ?? 0,
    
        timestamp: sample.timestamp,
        timeString: timeString,
      })
      if (this.gravityCtx) {
        drawGravity3D(this.gravityCtx, g, 300)
      }
      if (this.headingCtx) {
        drawHeadingCompass(this.headingCtx, heading, 300)
      }
    })
  },

  onReady() {

    // ===== gravity canvas =====
    const gravityQuery = wx.createSelectorQuery()
    gravityQuery
      .select('#gravityCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res?.[0]?.node) {
          console.error('Gravity Canvas not found!')
          return
        }
  
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
  
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = 300 * dpr
        canvas.height = 300 * dpr
        ctx.scale(dpr, dpr)
  
        this.gravityCanvas = canvas
        this.gravityCtx = ctx
  
        console.log('gravityCanvas ready')
      })
  
  
    // ===== heading canvas =====
    const headingQuery = wx.createSelectorQuery()
    headingQuery
      .select('#headingCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res?.[0]?.node) {
          console.error('Heading Canvas not found!')
          return
        }
  
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
  
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = 300 * dpr
        canvas.height = 300 * dpr
        ctx.scale(dpr, dpr)
  
        this.headingCanvas = canvas
        this.headingCtx = ctx
  
        console.log('headingCanvas ready')
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