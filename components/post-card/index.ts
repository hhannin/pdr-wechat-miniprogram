type PhotoLoadDetail = {
  readonly width?: number
  readonly height?: number
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    view: {
      type: Object,
      value: {} as WechatMiniprogram.IAnyObject,
    },
    mode: {
      type: String,
      value: 'list',
    },
    fading: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    actionsExpanded: false,
    photoFallback: false,
  },
  methods: {
    handleCardTap(): void {
      if (this.data.mode !== 'list') {
        return
      }
      this.triggerEvent('cardtap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleTapPhoto(): void {
      this.triggerEvent('phototap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleNavigate(): void {
      this.triggerEvent('navigatetap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleShare(): void {
      this.triggerEvent('sharetap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleFavorite(): void {
      this.triggerEvent('favoritetap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleEdit(): void {
      this.triggerEvent('edittap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleDelete(): void {
      this.triggerEvent('deletetap', { id: (this.data.view as { id?: string } | null)?.id })
    },
    handleToggleMore(): void {
      this.setData({ actionsExpanded: !this.data.actionsExpanded })
    },
    handleCloseMore(): void {
      if (this.data.actionsExpanded) {
        this.setData({ actionsExpanded: false })
      }
    },
    handlePhotoLoad(event: WechatMiniprogram.CustomEvent<PhotoLoadDetail>): void {
      const width = event.detail.width ?? 0
      const height = event.detail.height ?? 0
      if (width <= 0 || height <= 0) {
        return
      }
      const isTall = height / width > 1.5
      if (isTall !== this.data.photoFallback) {
        this.setData({ photoFallback: isTall })
      }
    },
    handlePhotoError(): void {
      if (this.data.photoFallback) {
        this.setData({ photoFallback: false })
      }
    },
  },
})
