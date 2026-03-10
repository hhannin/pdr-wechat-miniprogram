import { StepFeature, StepLengthSample } from '../types/steps'

export class StepLengthEstimator {

  // ---------- 用户参数 ----------
  private userHeight = 1.70 // m

  // ---------- Weinberg 系数 ----------
  private k = 0.42

  // ---------- cadence 修正 ----------
  private readonly cadenceGain = 0.18

  private readonly normalCadence = 1.8

  // ---------- 步长范围 ----------
  private readonly minStepLength = 0.25
  private readonly maxStepLength = 1.5

  // ---------- 平滑 ----------
  private readonly smoothAlpha = 0.25
  private lastStepLength = 0.7

  // ---------- 自适应 ----------
  private readonly adaptRate = 0.015

  private readonly minK = 0.25

  private readonly maxK = 0.7

  private stepIndex = 0

  constructor(height?: number) {
    if (height) {
      this.userHeight = height
    }
    // 根据身高初始化 k
    this.initializeFromHeight()
  }

  private initializeFromHeight() {
    const expectedStep = this.userHeight * 0.415
    // 经验估计
    this.k = 0.42 * (expectedStep / 0.7)
  }

  reset() {
    this.stepIndex = 0
    this.lastStepLength = this.userHeight * 0.415
  }


  update(feature: StepFeature): StepLengthSample {

    this.stepIndex++

    // ---------- 1 Weinberg model ----------

    const amplitude = Math.max(feature.accAmplitude, 0.01)

    let stepLength =
      this.k *
      Math.pow(amplitude, 0.25)


    // ---------- 2 cadence 修正 ----------

    const cadenceFactor =
      1 +
      this.cadenceGain *
      (feature.cadence - this.normalCadence)

    stepLength *= cadenceFactor


    // ---------- 3 身高约束 ----------

    const heightExpected =
      this.userHeight * 0.415

    stepLength =
      0.7 * stepLength +
      0.3 * heightExpected


    // ---------- 4 限制范围 ----------

    stepLength = this.clamp(stepLength)


    // ---------- 5 EMA 平滑 ----------

    const smoothed =
      this.smoothAlpha * stepLength +
      (1 - this.smoothAlpha) * this.lastStepLength

    this.lastStepLength = smoothed


    // ---------- 6 在线自适应 ----------

    this.adaptModel(stepLength)


    return {

      timestamp: feature.timestamp,

      stepIndex: this.stepIndex,

      stepLength,

      smoothedStepLength: smoothed,

      k: this.k
    }
  }


  private adaptModel(stepLength: number) {

    const expected =
      this.userHeight * 0.415

    const error =
      stepLength - expected

    this.k -=
      this.adaptRate *
      error

    this.k = this.clampK(this.k)
  }


  private clamp(v: number) {

    if (v < this.minStepLength)
      return this.minStepLength

    if (v > this.maxStepLength)
      return this.maxStepLength

    return v
  }


  private clampK(v: number) {

    if (v < this.minK)
      return this.minK

    if (v > this.maxK)
      return this.maxK

    return v
  }

}