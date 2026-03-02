export interface StepEvent {
  timestamp: number; // ms
}

export interface GaitSample {
  timestamp: number; // ms
  accelNorm: number; // 加速度模长
}