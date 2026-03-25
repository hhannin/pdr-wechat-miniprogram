export const MEDIA_ERROR_CODES = [
  'invalid_capture_request',
  'photo_capture_cancelled',
  'photo_capture_failed',
  'photo_capture_empty',
  'photo_metadata_failed',
  'photo_file_info_failed',
  'photo_result_invalid',
] as const

export type MediaErrorCode = typeof MEDIA_ERROR_CODES[number]

export type MediaOperation =
  | 'capture_photo'
  | 'read_image_info'
  | 'read_file_info'

export class MediaError extends Error {
  readonly code: MediaErrorCode
  readonly operation: MediaOperation
  readonly details?: unknown

  constructor(
    code: MediaErrorCode,
    operation: MediaOperation,
    message: string,
    details?: unknown
  ) {
    super(message)
    this.name = 'MediaError'
    this.code = code
    this.operation = operation
    this.details = details
  }
}

export function isMediaError(error: unknown): error is MediaError {
  return error instanceof MediaError
}

export function getWechatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }

  if (
    error &&
    typeof error === 'object' &&
    'errMsg' in error &&
    typeof (error as { readonly errMsg?: unknown }).errMsg === 'string'
  ) {
    return (error as { readonly errMsg: string }).errMsg.trim()
  }

  return 'Unknown WeChat media error.'
}

export function isWechatCancelError(error: unknown): boolean {
  const normalizedMessage = getWechatErrorMessage(error).toLowerCase()

  return (
    normalizedMessage.includes('cancel') ||
    normalizedMessage.includes('canceled') ||
    normalizedMessage.includes('cancelled')
  )
}
