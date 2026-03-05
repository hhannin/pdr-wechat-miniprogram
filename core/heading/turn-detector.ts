import { TurnEvent } from "../types/heading"

interface TurnOptions {

  // 普通转弯阈值
  minTurnAngleDeg?: number

  // U-turn 范围
  uTurnMinDeg?: number
  uTurnMaxDeg?: number

  // 单步最小转角（过滤抖动）
  minStepTurnDeg?: number

  // turn cooldown
  cooldownMs?: number
}

export class TurnDetector {

  private lastStepHeading?: number
  private cumulativeDelta = 0

  private lastTurnTime = 0

  private readonly minTurnRad: number
  private readonly uTurnMinRad: number
  private readonly uTurnMaxRad: number
  private readonly minStepTurnRad: number
  private readonly cooldownMs: number

  constructor(options: TurnOptions = {}) {

    const minTurnDeg = options.minTurnAngleDeg ?? 30
    const uTurnMinDeg = options.uTurnMinDeg ?? 150
    const uTurnMaxDeg = options.uTurnMaxDeg ?? 210
    const minStepTurnDeg = options.minStepTurnDeg ?? 2
    const cooldownMs = options.cooldownMs ?? 800

    this.minTurnRad = this.deg2rad(minTurnDeg)
    this.uTurnMinRad = this.deg2rad(uTurnMinDeg)
    this.uTurnMaxRad = this.deg2rad(uTurnMaxDeg)
    this.minStepTurnRad = this.deg2rad(minStepTurnDeg)
    this.cooldownMs = cooldownMs
  }

  /**
   * 在每次 StepEvent 时调用
   */
  onStep(
    stepHeading: number,
    timestamp: number
  ): TurnEvent | null {

    if (this.lastStepHeading === undefined) {
      this.lastStepHeading = stepHeading
      return null
    }

    // step heading change
    const delta =
      this.normalizeAngle(
        stepHeading - this.lastStepHeading
      )

    this.lastStepHeading = stepHeading

    // 忽略极小变化
    if (Math.abs(delta) < this.minStepTurnRad)
      return null

    // 累积转角
    this.cumulativeDelta += delta

    const absAngle = Math.abs(this.cumulativeDelta)

    // 未达到turn阈值
    if (absAngle < this.minTurnRad)
      return null

    // cooldown
    if (
      timestamp - this.lastTurnTime <
      this.cooldownMs
    ) {
      return null
    }

    let direction: 'left' | 'right' | 'u-turn'

    // U-turn
    if (
      absAngle >= this.uTurnMinRad &&
      absAngle <= this.uTurnMaxRad
    ) {
      direction = 'u-turn'
    }
    else {
      direction =
        this.cumulativeDelta > 0
          ? 'left'
          : 'right'
    }

    const event: TurnEvent = {
      timestamp,
      direction,
      angleDeg: this.rad2deg(absAngle)
    }

    this.lastTurnTime = timestamp

    // reset cumulative
    this.cumulativeDelta = 0

    return event
  }

  reset() {
    this.lastStepHeading = undefined
    this.cumulativeDelta = 0
    this.lastTurnTime = 0
  }

  // =========================
  // utils
  // =========================

  private normalizeAngle(rad: number): number {

    while (rad > Math.PI)
      rad -= 2 * Math.PI

    while (rad < -Math.PI)
      rad += 2 * Math.PI

    return rad
  }

  private deg2rad(deg: number) {
    return deg * Math.PI / 180
  }

  private rad2deg(rad: number) {
    return rad * 180 / Math.PI
  }
}