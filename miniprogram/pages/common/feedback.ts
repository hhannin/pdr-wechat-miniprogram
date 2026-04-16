export function formatErrorMessage(error: unknown): string {
  const sanitize = (message: string): string => {
    const trimmed = message.trim()
    if (trimmed.length === 0) {
      return '发生未知错误。'
    }

    const normalized = trimmed
      .replace(/^cloud\.callFunction:fail\s*/i, '')
      .replace(/^requestid:\s*[^ ]+\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .split('\n')[0]
      .trim()

    if (normalized.length === 0) {
      return '发生未知错误。'
    }

    if (/Item\s+"[^"]+"\s+does not exist\./.test(normalized)) {
      return '记录不存在或已删除。'
    }

    if (/wxfile:\/\//i.test(normalized) || /\/Users\//.test(normalized)) {
      return '本地文件处理失败，请重试。'
    }

    return normalized
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return sanitize(error.message)
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { readonly message?: unknown }).message === 'string'
  ) {
    return sanitize((error as { readonly message: string }).message)
  }

  if (
    error &&
    typeof error === 'object' &&
    'errMsg' in error &&
    typeof (error as { readonly errMsg?: unknown }).errMsg === 'string'
  ) {
    return sanitize((error as { readonly errMsg: string }).errMsg)
  }

  return '发生未知错误。'
}

export function showInfoToast(title: string, duration: number = 1800): void {
  wx.showToast({
    title,
    icon: 'none',
    duration,
  })
}

export function showSuccessToast(title: string, duration: number = 1400): void {
  wx.showToast({
    title,
    icon: 'success',
    duration,
  })
}

export function showErrorToast(error: unknown, prefix: string = ''): void {
  const message = formatErrorMessage(error)
  const composed = prefix.length > 0 ? `${prefix}${message}` : message
  wx.showToast({
    title: composed,
    icon: 'none',
    duration: 2200,
  })
}

export function showLoadingToast(title: string): void {
  wx.showLoading({
    title,
    mask: true,
  })
}

export function hideLoadingToast(): void {
  wx.hideLoading()
}

export async function previewLocalImage(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wx.previewImage({
      current: path,
      urls: [path],
      success: () => resolve(),
      fail: (error) => reject(error),
    })
  })
}
