export const MAP_ERROR_CODES = [
  'invalid_location_coordinates',
  'location_pick_cancelled',
  'location_permission_denied',
  'location_pick_failed',
  'location_result_invalid',
  'open_location_failed',
] as const

export type MapErrorCode = typeof MAP_ERROR_CODES[number]

export type MapOperation = 'pick_location' | 'open_location'

export class MapError extends Error {
  readonly code: MapErrorCode
  readonly operation: MapOperation
  readonly details?: unknown

  constructor(
    code: MapErrorCode,
    operation: MapOperation,
    message: string,
    details?: unknown
  ) {
    super(message)
    this.name = 'MapError'
    this.code = code
    this.operation = operation
    this.details = details
  }
}

export function isMapError(error: unknown): error is MapError {
  return error instanceof MapError
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

  return 'Unknown WeChat map error.'
}

export function isWechatCancelError(error: unknown): boolean {
  const normalizedMessage = getWechatErrorMessage(error).toLowerCase()

  return (
    normalizedMessage.includes('cancel') ||
    normalizedMessage.includes('canceled') ||
    normalizedMessage.includes('cancelled')
  )
}

export function isWechatPermissionError(error: unknown): boolean {
  const normalizedMessage = getWechatErrorMessage(error).toLowerCase()

  return (
    normalizedMessage.includes('auth deny') ||
    normalizedMessage.includes('permission') ||
    normalizedMessage.includes('scope.userlocation') ||
    normalizedMessage.includes('authorize')
  )
}
