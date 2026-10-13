import { useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { matchupsOf } from '../shared/pairingsRecord'
import type { Card, Deck, DeckCardEntry, MatchupPlan } from '../shared/types'
import { t } from '../shared/i18n'

/** Zones whose cards don't come out for sideboarding: the deck's Legend, Leader or Commander. */
const FIXED_ZONES = new Set(['legend', 'leader', 'commander', 'sideboard'])

const total = (entries: readonly DeckCardEntry[]) => entries.reduce((n, e) => n + e.quantity, 0)

/**
 * 🛡 Sideboard plans, in a deck's view (for games with a sideboard): per opponent, the copies that
 * come in from the sideboard and go out of the deck, plus a note, to read between rounds. Saved on
 * the deck (synced like notes, and like notes never on a share link: the app reads share links field
 * by field, and Pawmodoro's deckbuilder_shared_deck strips it). Works on locked decks.
 */
export function MatchupPlans({ deck, cardsById }: { deck: Deck; cardsById: Map<string, Card> }) {
  const setMatchupPlans = useAppStore((s) => s.setMatchupPlans)
  const results = useAppStore((s) => s.pairingsRecords?.[deck.id])
  const plans = deck.matchupPlans ?? []
  const [open, setOpen] = useState(plans.length > 0)
  const [editing, setEditing] = useState<MatchupPlan | null>(null)
  const rules = rulesForFormat(getAdapter(deck.gameId), deck.formatId)
  const hasSideboard = rules.zones.some((z) => z.id === 'sideboard')
  // Opponents you've logged with this deck in Pairings, offered as you type.
  const opponents = useMemo(() => matchupsOf(results ?? []).map((m) => m.opponent), [results])

  if (!hasSideboard) return null
  const name = (cardId: string) => cardsById.get(cardId)?.name ?? cardId
  const save = (plan: MatchupPlan) => {
    const note = plan.note?.trim()
    const clean: MatchupPlan = { id: plan.id, opponent: plan.opponent.trim(), in: plan.in.filter((e) => e.quantity > 0), out: plan.out.filter((e) => e.quantity > 0), ...(note ? { note } : {}) }
    const exists = plans.some((p) => p.id === plan.id)
    void setMatchupPlans(deck.id, exists ? plans.map((p) => (p.id === plan.id ? clean : p)) : [...plans, clean])
    setEditing(null)
  }
  const summary = (entries: readonly DeckCardEntry[]) => (entries.length ? entries.map((e) => `${e.quantity} ${name(e.cardId)}`).join(', ') : t.matchupPlans.none)

  return (
    <section className="deck-notes matchup-plans">
      <div className="deck-notes-head">
        <button className="deck-notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t.matchupPlans.title} <span className="text-dim">{open ? '▾' : '▸'}</span>
        </button>
        {open && !editing && (
          <button className="btn" onClick={() => setEditing({ id: crypto.randomUUID(), opponent: '', in: [], out: [] })}>
            {t.matchupPlans.add}
          </button>
        )}
      </div>
      {open && (
        <>
          {!plans.length && !editing && <div className="text-dim">{t.matchupPlans.empty}</div>}
          {plans.map((plan) =>
            editing?.id === plan.id ? null : (
              <div key={plan.id} className="matchup-plan">
                <div className="matchup-plan-head">
                  <b>{t.matchupPlans.vs(plan.opponent)}</b>
                  <span>
                    <button className="btn" onClick={() => setEditing(plan)}>
                      {t.matchupPlans.edit}
                    </button>{' '}
                    <button className="btn" onClick={() => void setMatchupPlans(deck.id, plans.filter((p) => p.id !== plan.id))}>
                      {t.matchupPlans.remove}
                    </button>
                  </span>
                </div>
                <div className="matchup-plan-line">
                  <span className="matchup-in">{t.matchupPlans.in}</span> {summary(plan.in)}
                </div>
                <div className="matchup-plan-line">
                  <span className="matchup-out">{t.matchupPlans.out}</span> {summary(plan.out)}
                </div>
                {plan.note && <div className="matchup-plan-note text-dim">{plan.note}</div>}
              </div>
            ),
          )}
          {editing && <PlanEditor deck={deck} plan={editing} cardsById={cardsById} opponents={opponents} onSave={save} onCancel={() => setEditing(null)} />}
        </>
      )}
    </section>
  )
}

function PlanEditor({
  deck,
  plan,
  cardsById,
  opponents,
  onSave,
  onCancel,
}: {
  deck: Deck
  plan: MatchupPlan
  cardsById: Map<string, Card>
  opponents: string[]
  onSave: (plan: MatchupPlan) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(plan)
  const sideboard = deck.zones.sideboard ?? []
  const outCandidates = Object.entries(deck.zones)
    .filter(([zoneId]) => !FIXED_ZONES.has(zoneId))
    .flatMap(([, entries]) => entries)
  const counts = (side: 'in' | 'out') => new Map(draft[side].map((e) => [e.cardId, e.quantity]))
  const step = (side: 'in' | 'out', cardId: string, max: number, by: number) => {
    const current = counts(side).get(cardId) ?? 0
    const quantity = Math.max(0, Math.min(max, current + by))
    const rest = draft[side].filter((e) => e.cardId !== cardId)
    setDraft({ ...draft, [side]: quantity ? [...rest, { cardId, quantity }] : rest })
  }
  const inN = total(draft.in)
  const outN = total(draft.out)

  const picker = (side: 'in' | 'out', entries: readonly DeckCardEntry[]) => (
    <ul className="matchup-picker">
      {entries.map((e) => {
        const n = counts(side).get(e.cardId) ?? 0
        const cardName = cardsById.get(e.cardId)?.name ?? e.cardId
        return (
          <li key={e.cardId} className={n ? 'picked' : undefined}>
            <button type="button" className="btn" aria-label={`− ${cardName}`} disabled={!n} onClick={() => step(side, e.cardId, e.quantity, -1)}>
              −
            </button>
            <span className="matchup-count">
              {n}/{e.quantity}
            </span>
            <button type="button" className="btn" aria-label={`+ ${cardName}`} disabled={n >= e.quantity} onClick={() => step(side, e.cardId, e.quantity, 1)}>
              +
            </button>
            <span className="matchup-name">{cardName}</span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <form
      className="matchup-editor"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.opponent.trim()) onSave(draft)
      }}
    >
      <label>
        <span className="text-dim">{t.matchupPlans.opponent}</span>
        <input autoFocus list="matchup-opponents" value={draft.opponent} placeholder={t.matchupPlans.opponentPlaceholder} onChange={(e) => setDraft({ ...draft, opponent: e.target.value })} />
        <datalist id="matchup-opponents">
          {opponents.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </label>
      <div className="matchup-columns">
        <div>
          <div className="community-section-title matchup-in">
            {t.matchupPlans.in} {inN}
          </div>
          {sideboard.length ? picker('in', sideboard) : <div className="text-dim">{t.matchupPlans.noSideboard}</div>}
        </div>
        <div>
          <div className="community-section-title matchup-out">
            {t.matchupPlans.out} {outN}
          </div>
          {picker('out', outCandidates)}
        </div>
      </div>
      {inN !== outN && <div className="matchup-warning">{t.matchupPlans.unbalanced(inN, outN)}</div>}
      <label>
        <span className="text-dim">{t.matchupPlans.note}</span>
        <textarea rows={2} value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </label>
      <div className="community-actions">
        <button className="btn btn-primary" type="submit" disabled={!draft.opponent.trim()}>
          {t.matchupPlans.save}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          {t.matchupPlans.cancel}
        </button>
      </div>
    </form>
  )
}
