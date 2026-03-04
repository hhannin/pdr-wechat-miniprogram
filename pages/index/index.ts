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
import { IMUCalibrator } from '../../core/imu/imu-calibrator'
import { MotionSample } from '../../core/types/sensor'

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
  calibrator: null as IMUCalibrator | null,
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
    this.calibrator = new IMUCalibrator()
    this.gravityEstimator = new GravityEstimator()
    this.headingEstimator = new HeadingEstimator()
    this.turnDetector = new TurnDetector()
    this.gaitDetector = new GaitDetector((stepCount, stepFreq) => {
      this.setData({ stepCount, stepFreq })
    })

    this.flow?.addProcessor(sample => {
      // UI显示原始数据
      this.setData({
        ax: sample.accel.x,
        ay: sample.accel.y,
        az: sample.accel.z,
        gx: sample.gyro.x,
        gy: sample.gyro.y,
        gz: sample.gyro.z,
        timestamp: sample.timestamp,
        timeString: formatTimestamp(sample.timestamp),
      })

      // 1️⃣ 先做校准（静止阶段）
      this.calibrator!.update(sample.accel, sample.gyro)
    
      // 2️⃣ 如果刚完成校准，初始化重力
      if (
        this.calibrator!.isCalibrated() &&
        !this.gravityEstimator!.isInitialized()
      ) {
        const initG = this.calibrator!.getInitialGravity()
        this.gravityEstimator!.initializeFromGravity(initG)
      }
      // 4️⃣ 只有校准完成才做姿态估计
      if (this.calibrator!.isCalibrated()) {
        console.log("index: porcess ...: ", formatTimestamp(sample.timestamp))

        const correctedGyro =
          this.calibrator!.getCorrectedGyro(sample.gyro)
        const correctSample: MotionSample = {
          ...sample,
          gyro: correctedGyro
        }
        console.log("index: correct gyro: ", sample.gyro, correctSample.gyro)

        // 3️⃣ 重力更新
        const g = this.gravityEstimator!.update(correctSample)
        console.log("index: gravity: ", g)

        const heading =
          this.headingEstimator!.update(correctSample, g)
        const turnEvent =
          this.turnDetector!.update(heading)
        console.log("index: yawRate: ", heading.yawRate, " heading: ", heading.headingDeg)
        console.log("index turn: ", turnEvent?.direction, turnEvent?.angleDeg)

        this.setData({
          gravityX: g.gravity.x,
          gravityY: g.gravity.y,
          gravityZ: g.gravity.z,
  
          headingDeg: heading.headingDeg,
          yawRate: heading.yawRate,
          turnDirection: turnEvent?.direction ?? '',
          turnAngle: turnEvent?.angleDeg ?? 0,
        })
        if (this.gravityCtx) {
          drawGravity3D(this.gravityCtx, g, 300)
        }
        if (this.headingCtx) {
          drawHeadingCompass(this.headingCtx, heading, 300)
        }
    
        // 5️⃣ 步态检测放在姿态之后
        this.gaitDetector?.pushSample(correctSample, g)
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