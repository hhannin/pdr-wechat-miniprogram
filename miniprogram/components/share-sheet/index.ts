Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    selectionItems: {
      type: Array,
      value: [],
    },
    prepareState: {
      type: String,
      value: 'idle',
    },
  },
  methods: {
    noop(): void {
      // Prevent backdrop taps from propagating through content.
    },
    handleClose(): void {
      this.triggerEvent('close')
    },
    handleToggle(
      event: WechatMiniprogram.BaseEvent<
        WechatMiniprogram.IAnyObject,
        { readonly selectionKey?: string }
      >
    ): void {
      const selectionKey = event.currentTarget.dataset.selectionKey
      if (typeof selectionKey !== 'string' || selectionKey.length === 0) {
        return
      }
      this.triggerEvent('toggle', { selectionKey })
    },
    handleRetry(): void {
      this.triggerEvent('retry')
    },
  },
})
