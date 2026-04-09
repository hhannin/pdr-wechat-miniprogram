export const ITEM_ERROR_CODES = [
  'invalid_item_id',
  'item_not_found',
  'invalid_scene_type',
  'invalid_scene_fields',
  'invalid_location',
  'invalid_timestamp',
  'invalid_reminder_sync_state',
  'invalid_note',
  'invalid_photo',
  'photo_already_attached',
  'photo_limit_exceeded',
  'invalid_list_limit',
] as const

export type ItemErrorCode = typeof ITEM_ERROR_CODES[number]

export class ItemDomainError extends Error {
  readonly code: ItemErrorCode
  readonly details?: unknown

  constructor(code: ItemErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ItemDomainError'
    this.code = code
    this.details = details
  }
}

export function isItemDomainError(error: unknown): error is ItemDomainError {
  return error instanceof ItemDomainError
}
