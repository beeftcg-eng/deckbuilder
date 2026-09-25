import { useAppStore } from '../state/useAppStore'
import { PAIRINGS_APP_URL } from '../shared/pairingsRecord'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'

/**
 * Shown on a deck that's linked in Pairings when its card list has changed since Pairings last
 * synced it (its summary.listHash vs the hash brewhouse_deck_records reports). Pairings splits a
 * deck's stats by version and starts a new one when it sees the change, so results logged before
 * syncing would count toward the old list. Opening Pairings at ?open=decks syncs it; the reminder
 * goes away the next time results are fetched (coming back to this window, or "Check again").
 * `inset` adds side margins for the full-width deck view; the editor's panel has its own padding.
 */
export function PairingsSyncReminder({ deck, inset }: { deck: Deck; inset?: boolean }) {
  const link = useAppStore((s) => s.pairingsLinks?.[deck.id])
  const connected = useAppStore((s) => s.pairingsConfig.connected)
  const cloudConnected = useAppStore((s) => s.pawmodoroConfig.connected)
  const loading = useAppStore((s) => s.pairingsLoading)
  const loadRecords = useAppStore((s) => s.loadPairingsRecords)

  const current = deck.summary?.listHash
  if (!connected || !link?.syncedHash || !current || current === link.syncedHash) return null

  return (
    <div className={`pr-sync-banner${inset ? ' inset' : ''}`} role="status">
      <span>
        🏆 <b>{t.pairingsSync.changed}</b>{' '}
        <span className="text-dim">
          {t.pairingsSync.help}
          {!cloudConnected && t.pairingsSync.logInFirst}
        </span>
      </span>
      <span className="pr-sync-actions">
        <button
          className="btn btn-primary"
          onClick={() => void window.api.system.openExternal(`${PAIRINGS_APP_URL}/?open=decks`)}
          title={t.pairingsSync.openTitle}
        >
          {t.pairingsSync.open}
        </button>
        <button className="btn" onClick={() => void loadRecords()} disabled={loading} title={t.pairingsSync.checkTitle}>
          {loading ? t.pairingsSync.checking : t.pairingsSync.checkAgain}
        </button>
      </span>
    </div>
  )
}
