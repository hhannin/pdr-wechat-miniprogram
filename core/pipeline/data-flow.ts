import { MotionSample } from '../types/sensor'

type Processor = (data: MotionSample) => void

export class DataFlow {
  private processors: Processor[] = []

  addProcessor(p: Processor) {
    this.processors.push(p)
  }

  push(sample: MotionSample) {
    this.processors.forEach(p => p(sample))
  }
}