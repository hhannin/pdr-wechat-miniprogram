export interface StepFeature {

  timestamp: number

  // 两步时间间隔 (s)
  stepInterval: number

  // 步频 (steps/s)
  cadence: number

  // 加速度峰值
  accPeak: number

  // 加速度谷值
  accValley: number

  // 峰谷差
  accAmplitude: number
}


export interface StepLengthSample {

  timestamp: number

  stepIndex: number

  // 原始步长
  stepLength: number

  // 平滑后步长
  smoothedStepLength: number

  // 当前模型系数（调试用）
  k: number
}