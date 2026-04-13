export interface ConfirmOptions {
  readonly title: string
  readonly content: string
  readonly confirmText?: string
  readonly cancelText?: string
  readonly confirmColor?: string
}

const DEFAULT_CONFIRM_COLOR = '#1f6a46'

export async function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: options.title,
      content: options.content,
      confirmText: options.confirmText ?? '确定',
      cancelText: options.cancelText ?? '取消',
      confirmColor: options.confirmColor ?? DEFAULT_CONFIRM_COLOR,
      success: (result) => resolve(result.confirm),
      fail: (error) => reject(error),
    })
  })
}

export async function confirmDestructive(
  title: string,
  content: string,
  confirmText: string
): Promise<boolean> {
  return confirmAction({
    title,
    content,
    confirmText,
    confirmColor: '#b34040',
  })
}
