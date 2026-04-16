interface DateLabelView {
  readonly key: string
  readonly text: string
}

interface ScrubberTouchEvent {
  readonly touches: ReadonlyArray<{ readonly clientY: number }>
  readonly changedTouches?: ReadonlyArray<{ readonly clientY: number }>
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    dateKeys: {
      type: Array,
      value: [],
    },
  },
  data: {
    expanded: false,
    dateLabels: [] as readonly DateLabelView[],
    activeDateKey: '',
    activeLabel: '',
  },
  lifetimes: {
    attached() {
      this.rebuildLabels()
    },
  },
  observers: {
    dateKeys() {
      this.rebuildLabels()
    },
  },
  methods: {
    rebuildLabels(): void {
      const rawDateKeys = this.data.dateKeys as readonly string[]
      const seen = new Set<string>()
      const labels: DateLabelView[] = []
      for (const key of rawDateKeys) {
        if (typeof key !== 'string' || key.length === 0 || seen.has(key)) {
          continue
        }
        seen.add(key)
        labels.push({
          key,
          text: formatDateLabel(key),
        })
      }
      this.setData({ dateLabels: Object.freeze(labels) })
    },
    handleTouchStart(event: ScrubberTouchEvent): void {
      this.setData({ expanded: true })
      this.applyTouch(event)
    },
    handleTouchMove(event: ScrubberTouchEvent): void {
      this.applyTouch(event)
    },
    handleTouchEnd(): void {
      setTimeout(() => {
        this.setData({ expanded: false, activeLabel: '', activeDateKey: '' })
      }, 140)
    },
    applyTouch(event: ScrubberTouchEvent): void {
      const touch = event.touches?.[0] ?? event.changedTouches?.[0]
      if (!touch) {
        return
      }
      const query = this.createSelectorQuery().in(this)
      query.select('.date-scrubber').boundingClientRect()
      query.exec((results) => {
        const rect = results?.[0] as
          | { top: number; height: number }
          | undefined
        if (!rect || rect.height <= 0) {
          return
        }
        const labels = this.data.dateLabels as readonly DateLabelView[]
        if (labels.length === 0) {
          return
        }
        const relative = Math.max(0, Math.min(rect.height, touch.clientY - rect.top))
        const ratio = relative / rect.height
        const index = Math.min(
          labels.length - 1,
          Math.max(0, Math.floor(ratio * labels.length))
        )
        const nextLabel = labels[index]
        if (!nextLabel) {
          return
        }
        if (nextLabel.key === this.data.activeDateKey) {
          return
        }
        this.setData({
          activeDateKey: nextLabel.key,
          activeLabel: nextLabel.text,
        })
        this.triggerEvent('datechange', { dateKey: nextLabel.key })
      })
    },
  },
})

function formatDateLabel(dateKey: string): string {
  const parts = dateKey.split('-')
  if (parts.length < 3) {
    return dateKey
  }
  const [yearText, monthText, dayText] = parts
  return `${yearText}年${Number(monthText)}月${Number(dayText)}日`
}
