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
  // 参数
  // =========================
  private readonly sampleRate = 50
  private readonly minStepInterval = 300
  private readonly maxStepInterval = 2000
  private readonly freqWindowMs = 3000
  private readonly bufferSize = 256

  private readonly lowCut = 0.5
  private readonly highCut = 4.0

  private readonly runningFreqThreshold = 2.5  // Hz

  // =========================
  // 状态
  // =========================
  private state: GaitState = GaitState.Idle
  private listener?: GaitListener

  private totalSteps = 0
  private lastStepTime = 0

  private recentSteps: StepEvent[] = []
  private candidateSteps = 0

  // 滤波缓存
  private filteredBuffer: number[] = []
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
    const vertical = this.computeVertical(sample, g)
    const filtered = this.bandpass(vertical)

    this.pushBuffer(this.filteredBuffer, filtered)
    this.pushBuffer(this.timeBuffer, t)

    if (this.filteredBuffer.length < 5) return

    const step = this.detectPeak()
    if (!step) return

    this.handleStep(step)

    const freq = this.computeStepFrequency()
    console.log(this.totalSteps, freq)
    if (this.listener) {
      this.listener(this.totalSteps, freq, this.state, [step])
    }
  }

  // =========================
  // 计算竖直分量
  // =========================
  private computeVertical(sample: MotionSample, g: GravitySample): number {
    const a = sample.accel
    const u = g.gUnit

    return a.x * u.x + a.y * u.y + a.z * u.z
  }

  // =========================
  // 峰值检测（因果）
  // =========================
  private detectPeak(): StepEvent | null {
    console.log(this.motionEnergy())
    if (this.motionEnergy() < 0.1) {
      this.resetFSM()
      return null
    }

    const n = this.filteredBuffer.length

    const prev = this.filteredBuffer[n - 3]
    const curr = this.filteredBuffer[n - 2]
    const next = this.filteredBuffer[n - 1]
    const currTime = this.timeBuffer[n - 2]

    const threshold = this.dynamicThreshold()
    console.log(curr, prev, next, threshold)
    if (!(curr > prev && curr > next && curr > threshold))
      return null

    const interval = this.lastStepTime === 0
      ? 0
      : currTime - this.lastStepTime

    console.log(interval, this.minStepInterval, this.maxStepInterval)
    // ===== 自动重启逻辑 =====
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

  // =========================
  // FSM处理
  // =========================
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

  // =========================
  // 步频计算（滑动窗口）
  // =========================
  private cleanupRecentSteps(now: number) {
    while (
      this.recentSteps.length > 0 &&
      now - this.recentSteps[0].timestamp > this.freqWindowMs
    ) {
      this.recentSteps.shift()
    }
  }

  private computeStepFrequency(): number {
    if (this.recentSteps.length < 2) return 0

    const duration =
      this.recentSteps[this.recentSteps.length - 1].timestamp -
      this.recentSteps[0].timestamp

    if (duration <= 0) return 0

    return (this.recentSteps.length - 1) * 1000 / duration
  }

  // =========================
  // 动态阈值
  // =========================
  private dynamicThreshold(): number {
    const n = this.filteredBuffer.length
    const window = Math.min(100, n)

    let sum = 0
    for (let i = n - window; i < n; i++) {
      sum += this.filteredBuffer[i] ** 2
    }

    return Math.sqrt(sum / window) * 0.6
  }

  // =========================
  // 带通滤波
  // =========================
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

  private motionEnergy(): number {
    const n = this.filteredBuffer.length
    const window = Math.min(50, n)
    let sum = 0
    for (let i = n - window; i < n; i++) {
      sum += Math.abs(this.filteredBuffer[i])
    }
    return sum / window
  }
}