import { useMemo, useState } from 'react'
import { useAppStore } from '../../../state/useAppStore'
import { recordsFor } from '../../../shared/practice/results'
import { PracticeRecord } from '../PracticeRecord'
import { useCommunityLists } from '../../../state/communityLists'
import { communityGame } from '../../../shared/communityGames'
import { legendMeta, listDeck } from '../../../shared/communityMeta'
import { isUnit, newGame, type GameState } from '../../../shared/practice/riftbound'
import { botMulligan, setupFromDeck, type Level } from '../../../shared/practice/riftboundBot'
import { scriptOf } from '../../../shared/practice/riftboundEffects'
import type { Card, Deck } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { Modal } from '../../Modal'
import { readSave, type GameMeta, type Opponent } from './saves'

// ---------- choosing the opponent ----------

export function Setup({ deck, cardsById, onStart, onOnline, onClose }: { deck: Deck; cardsById: Map<string, Card>; onStart: (g: GameState, meta: GameMeta) => void; onOnline: () => void; onClose: () => void }) {
  const { lists } = useCommunityLists('riftbound', true)
  const legends = useMemo(() => legendMeta(lists ?? []).slice(0, 30), [lists])
  const myDecks = useAppStore((s) => s.decks).filter((d) => d.gameId === 'riftbound')
  const results = useAppStore((s) => s.settings.practiceResults)
  const records = useMemo(() => recordsFor(results, deck.id), [results, deck.id])
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'none' })
  const [first, setFirst] = useState<'random' | 'me' | 'them'>('random')
  const [level, setLevel] = useState<Level>('normal')
  const [manual, setManual] = useState(true)
  const saved = useMemo(() => readSave(deck.id, cardsById), [deck.id, cardsById])
  const mine = useMemo(() => setupFromDeck(deck, cardsById), [deck, cardsById])
  // How many of the deck's different cards the game runs by itself.
  const coverage = useMemo(() => {
    const distinct = [...new Map([...mine.main, ...(mine.champion ? [mine.champion] : [])].map((c) => [c.name, c])).values()]
    return { auto: distinct.filter((c) => scriptOf(c).full).length, total: distinct.length }
  }, [mine])
  const noMight = useMemo(() => mine.main.filter(isUnit).length > 0 && mine.main.filter(isUnit).every((c) => c.might == null), [mine])
  const problems = [
    !mine.legend && t.practiceGame.needLegend,
    mine.main.length + (mine.champion ? 1 : 0) < 20 && t.practiceGame.needCards,
    mine.runes.length === 0 && t.practiceGame.needRunes,
  ].filter(Boolean) as string[]
  const legendLists = opponent.kind === 'legend' ? (lists ?? []).filter((l) => l.legendId === opponent.legendId) : []
  const opponentId = opponent.kind === 'legend' ? opponent.legendId : opponent.kind === 'deck' ? `deck:${opponent.deckId}` : null
  const record = opponentId ? records.find((r) => r.opponentId === opponentId) : undefined

  function start() {
    let them = null
    let name = ''
    if (opponent.kind === 'legend' && lists) {
      const index = communityGame('riftbound').index(cardsById.values())
      const pool = opponent.listId ? legendLists.filter((l) => l.id === opponent.listId) : [...legendLists].sort(() => Math.random() - 0.5)
      for (const list of pool) {
        const d = listDeck(list, index)
        if (d) {
          them = setupFromDeck(d, cardsById)
          name = list.legendName
          break
        }
      }
    } else if (opponent.kind === 'deck') {
      const theirs = myDecks.find((d) => d.id === opponent.deckId)
      if (theirs) {
        them = setupFromDeck(theirs, cardsById)
        name = theirs.name
      }
    }
    let g = newGame(mine, them, { first: first === 'me' ? 0 : first === 'them' ? 1 : undefined, manual })
    if (them) g = botMulligan(g)
    onStart(g, { opponentId: them && opponentId ? opponentId : 'nobody', opponentName: them ? name : t.practiceGame.nobody, level, byHand: manual })
  }

  return (
    <Modal label={t.practiceGame.setupTitle} className="rb-setup-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{t.practiceGame.setupTitle}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      <p className="text-dim">{t.practiceGame.intro}</p>
      {saved && (
        <div className="rb-prompt">
          <span>{t.practiceGame.resumeText(saved.meta.opponentName, saved.state.turn, saved.state.players[0].points, saved.state.players[1].points)}</span>
          <button className="btn btn-primary" onClick={() => onStart(saved.state, saved.meta)}>
            {t.practiceGame.resume}
          </button>
        </div>
      )}
      {problems.length > 0 ? (
        <ul className="sync-error">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <>
          <label className="rb-setup-row">
            <span>{t.practiceGame.opponent}</span>
            <select
              value={opponent.kind === 'none' ? '' : opponent.kind === 'legend' ? `legend:${opponent.legendId}` : `deck:${opponent.deckId}`}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'online') return onOnline()
                setOpponent(v.startsWith('legend:') ? { kind: 'legend', legendId: v.slice(7), listId: null } : v.startsWith('deck:') ? { kind: 'deck', deckId: v.slice(5) } : { kind: 'none' })
              }}
            >
              <option value="">{t.practiceGame.nobody}</option>
              <option value="online">{t.practiceGame.online}</option>
              {legends.length > 0 && (
                <optgroup label={t.practiceGame.botLists}>
                  {legends.map((m) => (
                    <option key={m.legendId} value={`legend:${m.legendId}`}>
                      {t.practiceGame.botWith(m.legendName, m.lists)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t.practiceGame.botDecks}>
                {myDecks.map((d) => (
                  <option key={d.id} value={`deck:${d.id}`}>
                    {d.id === deck.id ? t.practiceGame.mirror(d.name) : d.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {opponent.kind === 'legend' && legendLists.length > 0 && (
            <label className="rb-setup-row">
              <span>{t.practiceGame.whichList}</span>
              <select value={opponent.listId ?? ''} onChange={(e) => setOpponent({ ...opponent, listId: e.target.value || null })}>
                <option value="">{t.practiceGame.randomList}</option>
                {legendLists.slice(0, 40).map((l) => (
                  <option key={l.id} value={l.id}>
                    {[l.eventName, l.rank != null ? `#${l.rank}` : null, l.player].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            </label>
          )}
          {record && <p className="rb-record">{t.practiceGame.recordAgainst(record.wins, record.losses)}</p>}
          {!lists && <p className="text-dim">{t.communityLists.loading}</p>}
          {opponent.kind !== 'none' && (
            <>
              <label className="rb-setup-row">
                <span>{t.practiceGame.goesFirst}</span>
                <select value={first} onChange={(e) => setFirst(e.target.value as typeof first)}>
                  <option value="random">{t.practiceGame.firstRandom}</option>
                  <option value="me">{t.practiceGame.firstMe}</option>
                  <option value="them">{t.practiceGame.firstThem}</option>
                </select>
              </label>
              <label className="rb-setup-row">
                <span>{t.practiceGame.level}</span>
                <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                  <option value="easy">{t.practiceGame.easy}</option>
                  <option value="normal">{t.practiceGame.normal}</option>
                  <option value="hard">{t.practiceGame.hard}</option>
                </select>
              </label>
            </>
          )}
          <label className="rb-setup-row">
            <span>{t.practiceGame.rules}</span>
            <select value={manual ? 'manual' : 'auto'} onChange={(e) => setManual(e.target.value === 'manual')}>
              <option value="manual">{t.practiceGame.rulesManual}</option>
              <option value="auto">{t.practiceGame.rulesAuto}</option>
            </select>
          </label>
          <p className="text-dim">{manual ? t.practiceGame.manualHelp : t.practiceGame.coverage(coverage.auto, coverage.total)}</p>
          {noMight && <p className="text-dim">{t.practiceGame.noMight}</p>}
          <p className="text-dim">{opponent.kind === 'none' ? t.practiceGame.nobodyHelp : t.practiceGame.botHelp}</p>
          {records.length > 0 && <PracticeRecord records={records} />}
          <div className="announcement-actions">
            <button className="btn btn-primary" onClick={start}>
              {t.practiceGame.start}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
