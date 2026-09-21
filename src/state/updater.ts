import { useEffect } from 'react'
import { useAppStore } from './useAppStore'

/** Mirrors the main process's self-update status into the store (the current value on mount, then every change). */
export function useUpdaterListener() {
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus)
  useEffect(() => {
    let live = true
    window.api.updater
      .status()
      .then((status) => live && setUpdateStatus(status))
      .catch(() => undefined)
    const unsubscribe = window.api.updater.onStatus(setUpdateStatus)
    return () => {
      live = false
      unsubscribe()
    }
  }, [setUpdateStatus])
}
