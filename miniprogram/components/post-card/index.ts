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
    photoFallbackWidthRpx: 0,
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
      const fallbackHeightRpx = this.data.mode === 'list' ? 540 : 720
      const fallbackWidthRpx = isTall ? Math.max(1, Math.round((fallbackHeightRpx * width) / height)) : 0
      if (
        isTall !== this.data.photoFallback ||
        fallbackWidthRpx !== this.data.photoFallbackWidthRpx
      ) {
        this.setData({
          photoFallback: isTall,
          photoFallbackWidthRpx: fallbackWidthRpx,
        })
      }
    },
    handlePhotoError(): void {
      if (this.data.photoFallback || this.data.photoFallbackWidthRpx !== 0) {
        this.setData({
          photoFallback: false,
          photoFallbackWidthRpx: 0,
        })
      }
    },
  },
})
