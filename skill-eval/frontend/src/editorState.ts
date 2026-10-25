import type { SetVersion } from './types.ts'

type Snapshot = Pick<SetVersion, 'edit_number' | 'blob' | 'archived' | 'kind'>

export function shouldSyncVersion(current: Snapshot, incoming: Snapshot, dirty: boolean) {
  return !dirty && (!current.archived || incoming.archived) && incoming.edit_number >= current.edit_number &&
    (incoming.blob !== current.blob || incoming.archived !== current.archived || incoming.kind !== current.kind)
}
