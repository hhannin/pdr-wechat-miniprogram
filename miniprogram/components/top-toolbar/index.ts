Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    title: {
      type: String,
      value: '',
    },
    leftIcon: {
      type: String,
      value: '',
    },
    rightIcon: {
      type: String,
      value: '',
    },
  },
  methods: {
    handleLeftTap(): void {
      this.triggerEvent('lefttap')
    },
    handleRightTap(): void {
      this.triggerEvent('righttap')
    },
  },
})
