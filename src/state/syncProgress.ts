import { useEffect } from 'react'
import { useAppStore } from './useAppStore'
import type { SyncProgress } from '../shared/types'

export function useSyncProgressListener() {
  const applyProgress = useAppStore((s) => s.applySyncProgress)
  useEffect(() => {
    const unsubscribe = window.api.cards.onSyncProgress((progress: SyncProgress) => applyProgress(progress))
    return unsubscribe
  }, [applyProgress])
}
