import { HeadingSample, TurnEvent } from '../types/heading'


interface TurnOptions {
  minTurnAngleDeg?: number
  uTurnMinDeg?: number
  uTurnMaxDeg?: number
}

export class TurnDetector {
  private lastStepHeading?: number
  private lastTurnTimestamp = 0

  private readonly minTurnAngleRad: number
  private readonly uTurnMinRad: number
  private readonly uTurnMaxRad: number

  constructor(options: TurnOptions = {}) {
    const minTurnDeg = options.minTurnAngleDeg ?? 10
    const uTurnMinDeg = options.uTurnMinDeg ?? 150
    const uTurnMaxDeg = options.uTurnMaxDeg ?? 210

    this.minTurnAngleRad = minTurnDeg * Math.PI / 180
    this.uTurnMinRad = uTurnMinDeg * Math.PI / 180
    this.uTurnMaxRad = uTurnMaxDeg * Math.PI / 180
  }

  update(heading: HeadingSample): TurnEvent | null {
    if (this.lastStepHeading === undefined) {
      this.lastStepHeading = heading.headingRad
      return null
    }

    const delta = this.normalizeDelta(
      heading.headingRad - this.lastStepHeading
    )

    this.lastStepHeading = heading.headingRad

    const absDelta = Math.abs(delta)

    // 1️⃣ 忽略小抖动
    if (absDelta < this.minTurnAngleRad) {
      return null
    }

    // 2️⃣ 掉头检测
    if (absDelta >= this.uTurnMinRad && absDelta <= this.uTurnMaxRad) {
      return {
        timestamp: heading.timestamp,
        direction: 'u-turn',
        angleDeg: absDelta * 180 / Math.PI
      }
    }

    // 3️⃣ 正常左右转
    return {
      timestamp: heading.timestamp,
      direction: delta > 0 ? 'left' : 'right',
      angleDeg: absDelta * 180 / Math.PI
    }
  }

  private normalizeDelta(delta: number): number {
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    return delta
  }

  reset() {
    this.lastStepHeading = undefined
    this.lastTurnTimestamp = 0
  }
}