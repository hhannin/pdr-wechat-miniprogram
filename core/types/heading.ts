export interface HeadingSample {
  timestamp: number
  headingRad: number
  headingDeg: number
  yawRate: number
}

export interface TurnEvent {
  timestamp: number
  direction: 'left' | 'right' | 'u-turn'
  angleDeg: number
}