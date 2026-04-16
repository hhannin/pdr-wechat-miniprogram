export const FRONTEND_ROUTES = Object.freeze({
  records: '/pages/records/index',
  record: '/pages/record/index',
  postView: '/pages/post-view/index',
  favorites: '/pages/favorites/index',
  share: '/pages/share/index',
})

export type RecordPageMode = 'create' | 'edit'
export type RecordsPageEntryState = 'created'
export type RecordPageSource = 'reminder'

function buildQueryString(params: Readonly<Record<string, string | undefined>>): string {
  const entries = Object.keys(params).reduce((queryEntries, key) => {
    const value = params[key]
    if (typeof value !== 'string' || value.length === 0) {
      return queryEntries
    }

    queryEntries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    return queryEntries
  }, [] as string[])

  return entries.length > 0 ? `?${entries.join('&')}` : ''
}

export function isRecordPageMode(value: string): value is RecordPageMode {
  return value === 'create' || value === 'edit'
}

export function buildCreateRecordUrl(): string {
  return `${FRONTEND_ROUTES.record}${buildQueryString({
    mode: 'create',
  })}`
}

export function buildEditRecordUrl(itemId: string): string {
  return `${FRONTEND_ROUTES.record}${buildQueryString({
    mode: 'edit',
    itemId,
  })}`
}

export function buildPostViewUrl(
  itemId: string,
  options: {
    readonly source?: RecordPageSource
  } = {}
): string {
  return `${FRONTEND_ROUTES.postView}${buildQueryString({
    itemId,
    source: options.source,
  })}`
}

export function buildRecordsUrl(options: {
  readonly focusItemId?: string
  readonly entryState?: RecordsPageEntryState
} = {}): string {
  return `${FRONTEND_ROUTES.records}${buildQueryString({
    focusItemId: options.focusItemId,
    entryState: options.entryState,
  })}`
}

export function buildFavoritesUrl(): string {
  return FRONTEND_ROUTES.favorites
}

export function buildShareUrl(shareId: string): string {
  return `${FRONTEND_ROUTES.share}${buildQueryString({
    shareId,
  })}`
}
