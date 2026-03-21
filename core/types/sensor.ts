export interface Vector3 {
  x: number
  y: number
  z: number
}

export interface MotionSample {
  timestamp: number     // ms
  dt: number            // s
  accel: Vector3        // m/s²
  gyro: Vector3         // rad/s
  accUpdated: boolean
}