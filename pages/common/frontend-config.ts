import type { SceneType } from '../../core/types/index'

export const FRONTEND_ROUTES = Object.freeze({
  scene: '/pages/scene/index',
  records: '/pages/records/index',
  record: '/pages/record/index',
  share: '/pages/share/index',
})

export type RecordPageMode = 'create' | 'view' | 'edit'
export type RecordsPageEntryState = 'created'
export type ScenePageEntryState = 'missing_reminder_item'
export type RecordPageSource = 'reminder'

export interface FrontendPrimaryNavItem {
  readonly key: 'scene' | 'records'
  readonly label: string
  readonly subtitle: string
  readonly path: string
}

export const FRONTEND_PRIMARY_NAV: readonly FrontendPrimaryNavItem[] = Object.freeze([
  {
    key: 'scene',
    label: '记这里',
    subtitle: '',
    path: FRONTEND_ROUTES.scene,
  },
  {
    key: 'records',
    label: '找回去',
    subtitle: '',
    path: FRONTEND_ROUTES.records,
  },
])

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
  return value === 'create' || value === 'view' || value === 'edit'
}

export function buildCreateRecordUrl(sceneType: SceneType): string {
  return `${FRONTEND_ROUTES.record}${buildQueryString({
    mode: 'create',
    sceneType,
  })}`
}

export function buildSceneUrl(options: {
  readonly entryState?: ScenePageEntryState
} = {}): string {
  return `${FRONTEND_ROUTES.scene}${buildQueryString({
    entryState: options.entryState,
  })}`
}

export function buildRecordDetailUrl(
  itemId: string,
  mode: Extract<RecordPageMode, 'view' | 'edit'> = 'view',
  options: {
    readonly source?: RecordPageSource
  } = {}
): string {
  return `${FRONTEND_ROUTES.record}${buildQueryString({
    mode,
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

export function buildShareUrl(shareId: string): string {
  return `${FRONTEND_ROUTES.share}${buildQueryString({
    shareId,
  })}`
}
