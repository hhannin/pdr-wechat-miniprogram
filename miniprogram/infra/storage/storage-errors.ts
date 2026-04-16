export const STORAGE_ERROR_CODES = [
  'unavailable_root_path',
  'invalid_storage_path',
  'path_conflict',
  'directory_create_failed',
  'directory_read_failed',
  'directory_delete_failed',
  'file_read_failed',
  'file_write_failed',
  'file_parse_failed',
  'file_copy_failed',
  'file_delete_failed',
  'file_move_failed',
  'invalid_stored_item',
  'invalid_stored_summary',
  'invalid_stored_index',
] as const

export type StorageErrorCode = typeof STORAGE_ERROR_CODES[number]

export type StorageOperation =
  | 'resolve_root_path'
  | 'ensure_directory'
  | 'read_json'
  | 'write_json'
  | 'copy_file'
  | 'delete_file'
  | 'delete_directory'
  | 'move_file'
  | 'list_directory'
  | 'rebuild_index'

export class StorageError extends Error {
  readonly code: StorageErrorCode
  readonly operation: StorageOperation
  readonly path?: string
  readonly details?: unknown

  constructor(
    code: StorageErrorCode,
    operation: StorageOperation,
    message: string,
    options: {
      readonly path?: string
      readonly details?: unknown
    } = {}
  ) {
    super(message)
    this.name = 'StorageError'
    this.code = code
    this.operation = operation
    this.path = options.path
    this.details = options.details
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError
}

export function wrapStorageError(
  error: unknown,
  code: StorageErrorCode,
  operation: StorageOperation,
  message: string,
  options: {
    readonly path?: string
    readonly details?: unknown
  } = {}
): StorageError {
  if (isStorageError(error)) {
    return error
  }

  return new StorageError(code, operation, message, {
    path: options.path,
    details: {
      cause: error,
      ...((options.details as Record<string, unknown> | undefined) ?? {}),
    },
  })
}
