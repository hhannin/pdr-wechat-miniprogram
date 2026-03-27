import type { SceneType } from '../../core/types/index'

export const USE_NEW_FRONTEND = true

export const FRONTEND_ROUTES = Object.freeze({
  debug: '/pages/index/index',
  scene: '/pages/scene/index',
  records: '/pages/records/index',
  record: '/pages/record/index',
})

export type RecordPageMode = 'create' | 'view' | 'edit'
export type RecordsPageEntryState = 'created'

export interface FrontendPrimaryNavItem {
  readonly key: 'scene' | 'records'
  readonly label: string
  readonly subtitle: string
  readonly path: string
}

export const FRONTEND_PRIMARY_NAV: readonly FrontendPrimaryNavItem[] = Object.freeze([
  {
    key: 'scene',
    label: '新建',
    subtitle: '',
    path: FRONTEND_ROUTES.scene,
  },
  {
    key: 'records',
    label: '记录',
    subtitle: '',
    path: FRONTEND_ROUTES.records,
  },
])

export function getConfiguredFrontendEntryPath(): string {
  return USE_NEW_FRONTEND ? FRONTEND_ROUTES.scene : FRONTEND_ROUTES.debug
}

export function isRecordPageMode(value: string): value is RecordPageMode {
  return value === 'create' || value === 'view' || value === 'edit'
}

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

export function buildCreateRecordUrl(sceneType: SceneType): string {
  return `${FRONTEND_ROUTES.record}${buildQueryString({
    mode: 'create',
    sceneType,
  })}`
}

export function buildRecordDetailUrl(
  itemId: string,
  mode: Extract<RecordPageMode, 'view' | 'edit'> = 'view'
): string {
  return `${FRONTEND_ROUTES.record}${buildQueryString({
    mode,
    itemId,
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
