import type { TimestampMs } from './common'
import type { ItemId, ReminderSyncState } from './item'
import type { SceneType } from './scene'

export interface SyncReminderJobRequest {
  readonly itemId: ItemId
  readonly reminderAt?: TimestampMs
  readonly reminderDisplayText?: string
  readonly reminderSyncState: ReminderSyncState
  readonly sceneType: SceneType
  readonly locationTitle: string
  readonly locationSubtitle: string
}

export interface SyncReminderJobResult {
  readonly status: 'scheduled' | 'cancelled' | 'noop'
}
