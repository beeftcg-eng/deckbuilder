import { useMemo, useState } from 'react'
import { useAppStore } from '../../../state/useAppStore'
import { recordsFor } from '../../../shared/practice/results'
import { PracticeRecord } from '../PracticeRecord'
import { useCommunityLists } from '../../../state/communityLists'
import { communityGame } from '../../../shared/communityGames'
import { legendMeta, listDeck } from '../../../shared/communityMeta'
import { newGame, type GameState } from '../../../shared/practice/onepiece'
import { fullyRun } from '../../../shared/practice/onepieceEffects'
import { setupFromDeck, type Level } from '../../../shared/practice/onepieceBot'
import type { Card, Deck } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { Modal } from '../../Modal'
import { readSave, type GameMeta, type Opponent } from './saves'

export function Setup({ deck, cardsById, onStart, onClose }: { deck: Deck; cardsById: Map<string, Card>; onStart: (g: GameState, meta: GameMeta) => void; onClose: () => void }) {
  const { lists } = useCommunityLists('onepiece', true)
  const leaders = useMemo(() => legendMeta(lists ?? []).slice(0, 30), [lists])
  const myDecks = useAppStore((s) => s.decks).filter((d) => d.gameId === 'onepiece')
  const results = useAppStore((s) => s.settings.practiceResults)
  const records = useMemo(() => recordsFor(results, deck.id), [results, deck.id])
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'none' })
  const [first, setFirst] = useState<'random' | 'me' | 'them'>('random')
  const [level, setLevel] = useState<Level>('normal')
  const [manual, setManual] = useState(false)
  const saved = useMemo(() => readSave(deck.id, cardsById), [deck.id, cardsById])
  const mine = useMemo(() => setupFromDeck(deck, cardsById), [deck, cardsById])
  const coverage = useMemo(() => {
    const distinct = [...new Map(mine.main.map((c) => [c.id, c])).values()]
    return { auto: distinct.filter(fullyRun).length, total: distinct.length }
  }, [mine])
  const problems = [!mine.leader && t.opGame.needLeader, mine.main.length < 20 && t.opGame.needCards].filter(Boolean) as string[]
  const leaderLists = opponent.kind === 'leader' ? (lists ?? []).filter((l) => l.legendId === opponent.leaderId) : []
  const opponentId = opponent.kind === 'leader' ? opponent.leaderId : opponent.kind === 'deck' ? `deck:${opponent.deckId}` : null
  const record = opponentId ? records.find((r) => r.opponentId === opponentId) : undefined

  function start() {
    let them = null
    let name = ''
    if (opponent.kind === 'leader' && lists) {
      const index = communityGame('onepiece').index(cardsById.values())
      const pool = opponent.listId ? leaderLists.filter((l) => l.id === opponent.listId) : [...leaderLists].sort(() => Math.random() - 0.5)
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
    if (them && (!them.leader || them.main.length < 20)) them = null
    const g = newGame(mine, them, { first: first === 'me' ? 0 : first === 'them' ? 1 : undefined, manual, humans: [0] })
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
      <p className="text-dim">{t.opGame.intro}</p>
      {saved && (
        <div className="rb-prompt">
          <span>{t.opGame.resumeText(saved.meta.opponentName, saved.state.turn, saved.state.players[0].life.length, saved.state.players[1].life.length)}</span>
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
              value={opponent.kind === 'none' ? '' : opponent.kind === 'leader' ? `leader:${opponent.leaderId}` : `deck:${opponent.deckId}`}
              onChange={(e) => {
                const v = e.target.value
                setOpponent(v.startsWith('leader:') ? { kind: 'leader', leaderId: v.slice(7), listId: null } : v.startsWith('deck:') ? { kind: 'deck', deckId: v.slice(5) } : { kind: 'none' })
              }}
            >
              <option value="">{t.practiceGame.nobody}</option>
              {leaders.length > 0 && (
                <optgroup label={t.practiceGame.botLists}>
                  {leaders.map((m) => (
                    <option key={m.legendId} value={`leader:${m.legendId}`}>
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
          {opponent.kind === 'leader' && leaderLists.length > 0 && (
            <label className="rb-setup-row">
              <span>{t.practiceGame.whichList}</span>
              <select value={opponent.listId ?? ''} onChange={(e) => setOpponent({ ...opponent, listId: e.target.value || null })}>
                <option value="">{t.practiceGame.randomList}</option>
                {leaderLists.slice(0, 40).map((l) => (
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
                  <option value="easy">{t.opGame.easy}</option>
                  <option value="normal">{t.opGame.normal}</option>
                  <option value="hard">{t.opGame.hard}</option>
                </select>
              </label>
            </>
          )}
          <label className="rb-setup-row">
            <span>{t.opGame.cardText}</span>
            <select value={manual ? 'manual' : 'auto'} onChange={(e) => setManual(e.target.value === 'manual')}>
              <option value="auto">{t.opGame.textAuto}</option>
              <option value="manual">{t.opGame.textManual}</option>
            </select>
          </label>
          <p className="text-dim">{manual ? t.opGame.manualHelp : t.opGame.coverage(coverage.auto, coverage.total)}</p>
          <p className="text-dim">{opponent.kind === 'none' ? t.opGame.nobodyHelp : t.opGame.botHelp}</p>
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
