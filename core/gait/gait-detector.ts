import { MotionSample } from '../types/sensor'
import { StepEvent } from '../types/gait'
import { GravitySample } from '../types/gravity'

type GaitListener = (stepCount: number, stepFreq: number, steps: StepEvent[]) => void

export class GaitDetector {
  private samples: MotionSample[] = []
  private listener?: GaitListener
  private maxSamples: number = 200 // 保存最近200个采样
  private lastStepTime: number = 0
  private totalStepCount: number = 0

  constructor(listener?: GaitListener) {
    this.listener = listener
  }

  pushSample(sample: MotionSample, g : GravitySample) {
    this.samples.push(sample)

    // 限制缓存大小
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples)
    }

    // 检测步数
    const steps = this.detectPeaksHorizontal(this.samples, g, this.lastStepTime)
    const stepFreq = this.computeStepFrequency(steps)
    // 更新
    this.lastStepTime = steps.length ?
                        steps[steps.length - 1].timestamp :
                        this.lastStepTime
    this.totalStepCount += steps.length

    if (this.listener) {
      this.listener(this.totalStepCount, stepFreq, steps)
    }
  }
  
  detectPeaksHorizontal(
    samples: MotionSample[], g: GravitySample, lastStepTime: number,
    threshold = 0.5, minInterval = 300,
  ): StepEvent[] {
    const steps: StepEvent[] = []

    const gNorm = g.gNormal
    if (gNorm === 0){
       return steps
    }

    const gUnit = g.gUnit
    for (let i = 1; i < samples.length - 1; i++) {
      const a = samples[i].accel

      // 去重力方向投影
      const dot = a.x * gUnit.x + a.y * gUnit.y + a.z * gUnit.z
      const aHorizontal = {
        x: a.x - dot * gUnit.x,
        y: a.y - dot * gUnit.y,
        z: a.z - dot * gUnit.z,
      }

      // 水平加速度模长
      const norm = Math.sqrt(
        aHorizontal.x * aHorizontal.x +
        aHorizontal.y * aHorizontal.y +
        aHorizontal.z * aHorizontal.z
      )

      // 局部峰值检测
      const prev = samples[i - 1].accel
      const next = samples[i + 1].accel

      // 对比模长而不是原始分量
      const prevNorm = Math.sqrt(
        Math.pow(prev.x - g.gravity.x, 2) + 
        Math.pow(prev.y - g.gravity.y, 2) + 
        Math.pow(prev.z - g.gravity.z, 2)
      )
      const nextNorm = Math.sqrt(
        Math.pow(next.x - g.gravity.x, 2) + 
        Math.pow(next.y - g.gravity.y, 2) + 
        Math.pow(next.z - g.gravity.z, 2)
      )
      if (norm > prevNorm && norm > nextNorm && norm > threshold) {
        if (samples[i].timestamp - lastStepTime >= minInterval) {
          steps.push({ timestamp: samples[i].timestamp })
          lastStepTime = samples[i].timestamp
        }
      }
    }
    return steps
  }
  
  computeStepFrequency(steps: StepEvent[]): number {
    if (steps.length < 2) return 0
    const intervals: number[] = []
    for (let i = 1; i < steps.length; i++) {
      intervals.push(steps[i].timestamp - steps[i - 1].timestamp)
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    return 1000 / avgInterval
  }
}