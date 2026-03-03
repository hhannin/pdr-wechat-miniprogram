import { MotionSample } from '../types/sensor'
import { StepEvent } from '../types/gait'
import { GravitySample } from '../types/gravity'

export enum GaitState {
  Idle = 'idle',
  Candidate = 'candidate',
  Walking = 'walking',
  Running = 'running',
}

type GaitListener = (
  totalSteps: number,
  stepFreq: number,
  state: GaitState,
  steps: StepEvent[]
) => void

export class GaitDetector {
  // =========================
  // 参数 (50Hz专用)
  // =========================
  private readonly sampleRate = 50
  private readonly minStepInterval = 300
  private readonly maxStepInterval = 2000
  private readonly freqWindowMs = 3000
  private readonly bufferSize = 256

  private readonly lowCut = 0.5
  private readonly highCut = 4.0

  private readonly runningFreqThreshold = 2.5

  private readonly motionEnergyThreshold = 0.12
  private readonly absPeakThreshold = 0.18

  private readonly gyroWeight = 0.15

  // =========================
  // 状态
  // =========================
  private state: GaitState = GaitState.Idle
  private listener?: GaitListener

  private totalSteps = 0
  private lastStepTime = 0

  private recentSteps: StepEvent[] = []
  private candidateSteps = 0

  private fusedBuffer: number[] = []
  private timeBuffer: number[] = []

  // IIR状态
  private hpLast = 0
  private lpLast = 0
  private prevInput = 0

  constructor(listener?: GaitListener) {
    this.listener = listener
  }

  // =========================
  // 主入口
  // =========================
  pushSample(sample: MotionSample, g: GravitySample) {
    if (g.gNormal === 0) return

    const t = sample.timestamp

    const fused = this.computeFusion(sample, g)
    const filtered = this.bandpass(fused)

    this.pushBuffer(this.fusedBuffer, filtered)
    this.pushBuffer(this.timeBuffer, t)

    if (this.fusedBuffer.length < 5) return

    const avgMotionEnergy = this.motionEnergy()
    if (avgMotionEnergy < this.motionEnergyThreshold) {
      console.log("reset: ", avgMotionEnergy, this.motionEnergyThreshold)
      this.resetFSM()
      return
    }

    const step = this.detectPeak()
    if (!step) return

    this.handleStep(step)

    const freq = this.computeStepFrequency()

    if (this.listener) {
      console.log(this.totalSteps, freq, this.state, step)
      this.listener(this.totalSteps, freq, this.state, [step])
    }
  }

  // =========================
  // 双通道融合
  // =========================
  private computeFusion(sample: MotionSample, g: GravitySample): number {
    const a = sample.accel
    const u = g.gUnit

    // 1️⃣ 竖直分量
    const vertical = a.x * u.x + a.y * u.y + a.z * u.z

    // 2️⃣ 线性加速度模长
    const linX = a.x - g.gravity.x
    const linY = a.y - g.gravity.y
    const linZ = a.z - g.gravity.z
    const magnitude = Math.sqrt(linX * linX + linY * linY + linZ * linZ)

    // 3️⃣ 陀螺仪能量
    const gyro = sample.gyro
    const gyroEnergy = Math.sqrt(
      gyro.x * gyro.x +
      gyro.y * gyro.y +
      gyro.z * gyro.z
    )

    // 4️⃣ 融合
    return 0.5 * Math.abs(vertical) +
           0.5 * magnitude +
           this.gyroWeight * gyroEnergy
  }

  private detectPeak(): StepEvent | null {
    const n = this.fusedBuffer.length

    const prev = this.fusedBuffer[n - 3]
    const curr = this.fusedBuffer[n - 2]
    const next = this.fusedBuffer[n - 1]
    const currTime = this.timeBuffer[n - 2]
    console.log("value: ", prev, curr, next, this.absPeakThreshold)
    if (!(curr > prev && curr > next))
      return null

    if (curr < this.absPeakThreshold)
      return null

    const interval = this.lastStepTime === 0
      ? 0
      : currTime - this.lastStepTime
    console.log(interval, this.minStepInterval, this.maxStepInterval)
    if (this.lastStepTime !== 0 &&
        interval > this.maxStepInterval) {
      this.resetFSM()
    }

    if (this.lastStepTime === 0 ||
        interval > this.minStepInterval) {
      return { timestamp: currTime }
    }

    return null
  }

  private handleStep(step: StepEvent) {
    const t = step.timestamp

    this.lastStepTime = t
    this.totalSteps++

    this.recentSteps.push(step)
    this.cleanupRecentSteps(t)

    const freq = this.computeStepFrequency()

    switch (this.state) {

      case GaitState.Idle:
        this.state = GaitState.Candidate
        this.candidateSteps = 1
        break

      case GaitState.Candidate:
        this.candidateSteps++
        if (this.candidateSteps >= 2) {
          this.state = GaitState.Walking
        }
        break

      case GaitState.Walking:
        if (freq > this.runningFreqThreshold) {
          this.state = GaitState.Running
        }
        break

      case GaitState.Running:
        if (freq < this.runningFreqThreshold * 0.8) {
          this.state = GaitState.Walking
        }
        break
    }
  }

  private resetFSM() {
    this.state = GaitState.Idle
    this.candidateSteps = 0
  }

  private cleanupRecentSteps(now: number) {
    while (
      this.recentSteps.length > 0 &&
      now - this.recentSteps[0].timestamp > this.freqWindowMs
    ) {
      this.recentSteps.shift()
    }
  }

  // 步频
  private computeStepFrequency(): number {
    if (this.recentSteps.length < 2) return 0

    const duration =
      this.recentSteps[this.recentSteps.length - 1].timestamp -
      this.recentSteps[0].timestamp

    if (duration <= 0) return 0

    return (this.recentSteps.length - 1) * 1000 / duration
  }

  // 能量
  private motionEnergy(): number {
    const n = this.fusedBuffer.length
    const window = Math.min(50, n)

    let sum = 0
    for (let i = n - window; i < n; i++) {
      sum += Math.abs(this.fusedBuffer[i])
    }

    return sum / window
  }

  // 带通滤波
  private bandpass(x: number): number {
    const dt = 1 / this.sampleRate

    const rcHigh = 1 / (2 * Math.PI * this.lowCut)
    const alphaHigh = rcHigh / (rcHigh + dt)

    const hp = alphaHigh * (this.hpLast + x - this.prevInput)
    this.hpLast = hp
    this.prevInput = x

    const rcLow = 1 / (2 * Math.PI * this.highCut)
    const alphaLow = dt / (rcLow + dt)

    const lp = this.lpLast + alphaLow * (hp - this.lpLast)
    this.lpLast = lp

    return lp
  }

  private pushBuffer(arr: number[], value: number) {
    arr.push(value)
    if (arr.length > this.bufferSize) arr.shift()
  }
}