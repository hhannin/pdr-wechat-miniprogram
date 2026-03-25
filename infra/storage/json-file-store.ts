import { StorageError, wrapStorageError } from './storage-errors'

const JSON_ENCODING: 'utf8' = 'utf8'
type PathKind = 'missing' | 'file' | 'directory' | 'other'

function createTempToken(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function splitPathPrefix(path: string): {
  readonly prefix: string
  readonly body: string
} {
  const schemeSeparatorIndex = path.indexOf('://')
  if (schemeSeparatorIndex <= 0) {
    return Object.freeze({
      prefix: '',
      body: path,
    })
  }

  return Object.freeze({
    prefix: path.slice(0, schemeSeparatorIndex + 3),
    body: path.slice(schemeSeparatorIndex + 3),
  })
}

function getParentDirectoryPath(path: string): string | undefined {
  const { prefix, body } = splitPathPrefix(path)
  const normalizedBody = body.replace(/\/+$/g, '')
  const lastSlashIndex = normalizedBody.lastIndexOf('/')

  if (lastSlashIndex < 0) {
    return undefined
  }

  const parentBody = normalizedBody.slice(0, lastSlashIndex)
  if (parentBody.length === 0) {
    return undefined
  }

  return `${prefix}${parentBody}`
}

function getFileName(path: string): string {
  const { body } = splitPathPrefix(path)
  const normalizedBody = body.replace(/\/+$/g, '')
  const lastSlashIndex = normalizedBody.lastIndexOf('/')

  if (lastSlashIndex < 0) {
    return normalizedBody
  }

  return normalizedBody.slice(lastSlashIndex + 1)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim().toLowerCase()
  }

  if (
    error &&
    typeof error === 'object' &&
    'errMsg' in error &&
    typeof (error as { readonly errMsg?: unknown }).errMsg === 'string'
  ) {
    return (error as { readonly errMsg: string }).errMsg.trim().toLowerCase()
  }

  return ''
}

function isPathNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error)

  return (
    message.includes('no such file or directory') ||
    message.includes('not found') ||
    message.includes('enoent')
  )
}

export class JsonFileStore {
  private readonly fs: WechatMiniprogram.FileSystemManager

  constructor(fs?: WechatMiniprogram.FileSystemManager) {
    this.fs = fs ?? wx.getFileSystemManager()
  }

  exists(path: string): boolean {
    return this.getPathKind(path) !== 'missing'
  }

  fileExists(path: string): boolean {
    return this.getPathKind(path) === 'file'
  }

  directoryExists(path: string): boolean {
    return this.getPathKind(path) === 'directory'
  }

  ensureDirectory(path: string): void {
    try {
      this.fs.mkdirSync(path, true)
    } catch (error) {
      const pathKind = this.getPathKind(path)
      if (pathKind === 'directory') {
        return
      }

      if (pathKind === 'file') {
        throw new StorageError(
          'path_conflict',
          'ensure_directory',
          'Expected a directory path, but found a file.',
          { path }
        )
      }

      throw wrapStorageError(
        error,
        'directory_create_failed',
        'ensure_directory',
        `Failed to create directory "${path}".`,
        { path }
      )
    }
  }

  ensureParentDirectory(path: string): void {
    const parentDirectoryPath = getParentDirectoryPath(path)
    if (!parentDirectoryPath) {
      return
    }

    this.ensureDirectory(parentDirectoryPath)
  }

  readJsonOrNull<T>(path: string): T | null {
    const pathKind = this.getPathKind(path)

    if (pathKind === 'missing') {
      return null
    }

    if (pathKind !== 'file') {
      throw new StorageError(
        'path_conflict',
        'read_json',
        'Expected a file path, but found a directory.',
        { path }
      )
    }

    let fileContents: string

    try {
      const rawContents = this.fs.readFileSync(path, JSON_ENCODING)
      fileContents = typeof rawContents === 'string' ? rawContents : ''
    } catch (error) {
      throw wrapStorageError(
        error,
        'file_read_failed',
        'read_json',
        `Failed to read JSON file "${path}".`,
        { path }
      )
    }

    try {
      return JSON.parse(fileContents) as T
    } catch (error) {
      throw wrapStorageError(
        error,
        'file_parse_failed',
        'read_json',
        `Failed to parse JSON file "${path}".`,
        {
          path,
          details: { fileContents },
        }
      )
    }
  }

  writeJsonAtomic(path: string, data: unknown): void {
    this.ensureParentDirectory(path)

    const existingPathKind = this.getPathKind(path)
    if (existingPathKind === 'directory') {
      throw new StorageError(
        'path_conflict',
        'write_json',
        'Expected a file path, but found a directory.',
        { path }
      )
    }

    const serializedJson = JSON.stringify(data, null, 2)
    const token = createTempToken()
    const tempFilePath = `${path}.tmp-${token}`
    const backupFilePath = `${path}.bak-${token}`
    let backupCreated = false

    try {
      this.fs.writeFileSync(tempFilePath, serializedJson, JSON_ENCODING)

      if (existingPathKind === 'file') {
        this.fs.renameSync(path, backupFilePath)
        backupCreated = true
      }

      this.fs.renameSync(tempFilePath, path)

      if (backupCreated) {
        this.deleteFileIfExists(backupFilePath)
      }
    } catch (error) {
      this.cleanupTempWriteFailure(path, tempFilePath, backupFilePath, backupCreated)

      throw wrapStorageError(
        error,
        'file_write_failed',
        'write_json',
        `Failed to write JSON file "${path}".`,
        {
          path,
          details: {
            tempFilePath,
            backupFilePath,
          },
        }
      )
    }
  }

  copyFile(sourcePath: string, targetPath: string): void {
    if (this.getPathKind(sourcePath) !== 'file') {
      throw new StorageError(
        'file_read_failed',
        'copy_file',
        `Source file "${sourcePath}" does not exist.`,
        { path: sourcePath }
      )
    }

    this.ensureParentDirectory(targetPath)

    const targetPathKind = this.getPathKind(targetPath)
    if (targetPathKind === 'directory') {
      throw new StorageError(
        'path_conflict',
        'copy_file',
        'Expected a file path, but found a directory.',
        { path: targetPath }
      )
    }

    if (sourcePath === targetPath) {
      return
    }

    const token = createTempToken()
    const tempFilePath = `${targetPath}.tmp-${token}`
    const backupFilePath = `${targetPath}.bak-${token}`
    let backupCreated = false

    try {
      this.fs.copyFileSync(sourcePath, tempFilePath)

      if (targetPathKind === 'file') {
        this.fs.renameSync(targetPath, backupFilePath)
        backupCreated = true
      }

      this.fs.renameSync(tempFilePath, targetPath)

      if (backupCreated) {
        this.deleteFileIfExists(backupFilePath)
      }
    } catch (error) {
      this.cleanupTempWriteFailure(
        targetPath,
        tempFilePath,
        backupFilePath,
        backupCreated
      )

      throw wrapStorageError(
        error,
        'file_copy_failed',
        'copy_file',
        `Failed to copy file from "${sourcePath}" to "${targetPath}".`,
        {
          path: targetPath,
          details: {
            sourcePath,
            tempFilePath,
            backupFilePath,
          },
        }
      )
    }
  }

  deleteFileIfExists(path: string): void {
    const pathKind = this.getPathKind(path)
    if (pathKind === 'missing') {
      return
    }

    if (pathKind !== 'file') {
      throw new StorageError(
        'path_conflict',
        'delete_file',
        'Expected a file path, but found a directory.',
        { path }
      )
    }

    try {
      this.fs.unlinkSync(path)
    } catch (error) {
      throw wrapStorageError(
        error,
        'file_delete_failed',
        'delete_file',
        `Failed to delete file "${path}".`,
        { path }
      )
    }
  }

  deleteDirectoryIfExists(path: string, recursive: boolean = true): void {
    const pathKind = this.getPathKind(path)
    if (pathKind === 'missing') {
      return
    }

    if (pathKind !== 'directory') {
      throw new StorageError(
        'path_conflict',
        'delete_directory',
        'Expected a directory path, but found a file.',
        { path }
      )
    }

    try {
      this.fs.rmdirSync(path, recursive)
    } catch (error) {
      throw wrapStorageError(
        error,
        'directory_delete_failed',
        'delete_directory',
        `Failed to delete directory "${path}".`,
        { path }
      )
    }
  }

  listDirectoryNames(path: string): readonly string[] {
    const pathKind = this.getPathKind(path)
    if (pathKind === 'missing') {
      return Object.freeze([])
    }

    if (pathKind !== 'directory') {
      throw new StorageError(
        'path_conflict',
        'list_directory',
        'Expected a directory path, but found a file.',
        { path }
      )
    }

    try {
      return Object.freeze([...this.fs.readdirSync(path)])
    } catch (error) {
      throw wrapStorageError(
        error,
        'directory_read_failed',
        'list_directory',
        `Failed to list directory "${path}".`,
        { path }
      )
    }
  }

  private cleanupTempWriteFailure(
    targetFilePath: string,
    tempFilePath: string,
    backupFilePath: string,
    backupCreated: boolean
  ): void {
    if (this.getPathKind(tempFilePath) === 'file') {
      try {
        this.fs.unlinkSync(tempFilePath)
      } catch {
        // Best effort cleanup.
      }
    }

    if (
      backupCreated &&
      this.getPathKind(targetFilePath) === 'missing' &&
      this.getPathKind(backupFilePath) === 'file'
    ) {
      try {
        this.fs.renameSync(backupFilePath, targetFilePath)
      } catch {
        // Best effort restore.
      }
    }
  }

  private getPathKind(path: string): PathKind {
    const parentDirectoryPath = getParentDirectoryPath(path)
    const fileName = getFileName(path)

    if (parentDirectoryPath && fileName.length > 0) {
      const parentStats = this.tryGetStats(parentDirectoryPath)
      if (!parentStats) {
        return 'missing'
      }

      if (!parentStats.isDirectory()) {
        throw new StorageError(
          'path_conflict',
          'read_json',
          'Expected a directory path, but found a file.',
          { path: parentDirectoryPath }
        )
      }

      try {
        const childNames = this.fs.readdirSync(parentDirectoryPath)
        if (!childNames.includes(fileName)) {
          return 'missing'
        }
      } catch (error) {
        throw wrapStorageError(
          error,
          'directory_read_failed',
          'list_directory',
          `Failed to list directory "${parentDirectoryPath}".`,
          { path: parentDirectoryPath }
        )
      }
    }

    const stats = this.tryGetStats(path)
    if (!stats) {
      return 'missing'
    }

    if (stats.isFile()) {
      return 'file'
    }

    if (stats.isDirectory()) {
      return 'directory'
    }

    return 'other'
  }

  private tryGetStats(path: string): WechatMiniprogram.Stats | null {
    try {
      return this.fs.statSync(path) as WechatMiniprogram.Stats
    } catch (error) {
      if (isPathNotFoundError(error)) {
        return null
      }

      throw wrapStorageError(
        error,
        'file_read_failed',
        'read_json',
        `Failed to read file stats for "${path}".`,
        { path }
      )
    }
  }
}
