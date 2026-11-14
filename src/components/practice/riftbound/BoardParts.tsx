import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useCardsById } from '../../../state/useAppStore'
import { abilitiesOf, allUnits, bfName, canPlay, combatMight, mightNow, costOf, isUnit, keywordsOf, runeCount, type GameState, type Side, type Tool, type Unit } from '../../../shared/practice/riftbound'
import { DOMAIN_COLORS } from '../../../lib/domainColors'
import type { Card } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { Modal } from '../../Modal'

/** The board's pieces (Board.tsx): units, bases, player bars, the hand menu, tools, the log, deck and trash. */


/** The plain rune card of each domain ("Fury" -> Fury Rune), for showing runes as cards. */
function useRuneArt(): Map<string, string> {
  const cardsById = useCardsById('riftbound')
  return useMemo(() => {
    const art = new Map<string, string>()
    for (const c of cardsById.values()) {
      const m = /^(\w+) Rune$/.exec(c.name)
      if (c.category !== 'Rune' || !m || !c.imageUrlSmall) continue
      // The game's own art (from the Brewhouse's card-art) over a store picture when both are there.
      if (!art.has(m[1]) || c.imageUrlSmall.includes('/card-art/')) art.set(m[1], c.imageUrlSmall)
    }
    return art
  }, [cardsById])
}

function RuneFace({ domain, art }: { domain: string; art: Map<string, string> }) {
  const src = art.get(domain)
  return src ? <img src={src} alt="" loading="lazy" /> : <span className="rb-rune-noart" style={{ background: DOMAIN_COLORS[domain] ?? 'var(--accent)' }} />
}

/** Using abilities: whether one can be used now, and using it (Board.tsx picks targets first). */
export type AbilityHandlers = { ready: (source: string, index: number) => boolean; use: (source: string, index: number) => void }

/** A button per ability of `card` you use by exhausting it. */
export function AbilityButtons({ card, source, handlers }: { card: Card; source: string; handlers?: AbilityHandlers }) {
  if (!handlers) return null
  return (
    <>
      {abilitiesOf(card).map((a, i) => {
        const short = a.text.length > 38 ? `${a.text.slice(0, 36)}…` : a.text
        return (
          <button key={i} className="btn rb-ability" disabled={!handlers.ready(source, i)} title={t.practiceGame.abilityTitle(a.text, a.energy, a.power, a.otherCost)} onClick={() => handlers.use(source, i)}>
            ⚡ {short}
          </button>
        )
      })}
    </>
  )
}

export function CardFace({ card }: { card: Card }) {
  return card.imageUrlSmall ? <img src={card.imageUrlSmall} alt={card.name} loading="lazy" /> : <span className="rb-card-name">{card.name}</span>
}

/** What a draggable thing gets: draggable, and its drag start and end. */
export type DragProps = { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }
/** What a drop zone gets: its drag handlers and a class while something hovers. */
export type DropProps = { onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void; className: string }

export function UnitChip({ unit, selected, targetable, aimed, drag, onClick, onDetail }: { unit: Unit; selected: boolean; targetable?: boolean; aimed?: boolean; drag?: DragProps; onClick: () => void; onDetail: () => void }) {
  const might = mightNow(unit)
  const kw = unit.keywords
  const tags = [kw.tank && 'Tank', kw.assault && `Assault ${kw.assault}`, kw.shield && `Shield ${kw.shield}`, kw.ganking && 'Ganking', kw.backline && 'Backline', kw.temporary && 'Temporary', unit.stunned && t.practiceGame.stunned, unit.buffed && t.practiceGame.buffed, unit.temp !== 0 && t.practiceGame.thisTurn(unit.temp), ...(unit.equipment ?? []).map((e) => `⚙ ${e.card.name}`)]
    .filter(Boolean)
    .join(' · ')
  const color = DOMAIN_COLORS[unit.card.colors[0]] ?? 'var(--accent)'
  const name = unit.card.name.replace(/\s*\([^)]*\)$/, '')
  return (
    <div className={`rb-unit ${unit.exhausted ? 'exhausted' : ''} ${selected ? 'selected' : ''} ${targetable ? 'targetable' : ''} ${aimed ? 'aimed' : ''} ${unit.owner === 0 ? 'mine' : 'theirs'}`} style={{ '--domain-a': color } as CSSProperties}>
      <button
        {...drag}
        className="rb-unit-main"
        aria-pressed={selected}
        aria-label={t.practiceGame.unitLabel(name, might, unit.damage, unit.exhausted ? t.practiceGame.exhausted : t.practiceGame.ready, tags)}
        onClick={onClick}
        title={unit.card.text ?? undefined}
      >
        <span className="rb-unit-art">
          {unit.card.imageUrlSmall ? <img src={unit.card.imageUrlSmall} alt="" loading="lazy" /> : <span className="rb-unit-noart">{name}</span>}
          <span className="rb-unit-might" aria-hidden>
            {might}
          </span>
          {unit.damage > 0 && (
            <span className="rb-unit-damage" aria-hidden>
              −{unit.damage}
            </span>
          )}
        </span>
        <span className="rb-unit-name" aria-hidden>
          {name}
        </span>
        {tags && (
          <span className="rb-unit-state text-dim" aria-hidden>
            {tags}
          </span>
        )}
      </button>
      <button className="rb-unit-info" aria-label={t.practiceGame.details(unit.card.name)} onClick={onDetail}>
        ⓘ
      </button>
    </div>
  )
}

export function Base({
  game,
  side,
  selected,
  targetable,
  aimed = [],
  onUnit,
  onDetail,
  onTool,
  dragFor,
  drop,
  opponentName,
  abilities,
}: {
  game: GameState
  side: Side
  selected: string[]
  targetable: string[]
  /** Units the cards on the chain point at. */
  aimed?: string[]
  onUnit: (u: Unit) => void
  onDetail: (c: Card) => void
  onTool?: (tl: Tool) => void
  dragFor?: (u: Unit) => DragProps
  drop?: DropProps
  opponentName?: string
  abilities?: AbilityHandlers
}) {
  const p = game.players[side]
  const { className: dropClassName = '', ...dropHandlers } = drop ?? { className: '' }
  const theirLabel = opponentName ? t.practiceGame.friendBase(opponentName) : t.practiceGame.theirBase
  return (
    <section className={`rb-base ${side === 0 ? 'mine' : 'theirs'} ${dropClassName}`} aria-label={side === 0 ? t.practiceGame.yourBase : theirLabel} {...dropHandlers}>
      <span className="rb-zone-label text-dim">{side === 0 ? t.practiceGame.yourBase : theirLabel}</span>
      <div className="rb-units">
        {p.base.map((u) => (
          <UnitChip key={u.uid} unit={u} drag={dragFor?.(u)} targetable={targetable.includes(u.uid)} aimed={aimed.includes(u.uid)} selected={selected.includes(u.uid)} onClick={() => onUnit(u)} onDetail={() => onDetail(u.card)} />
        ))}
        {p.gear.map((g) => (
          <span key={g.uid} className={`rb-gear ${g.exhausted ? 'exhausted' : ''}`}>
            {onTool ? (
              <button className="link-button" aria-pressed={g.exhausted} title={t.practiceGame.exhaustToggle} onClick={() => onTool({ kind: 'gear', side, gear: g.uid })}>
                ⚙ {g.card.name}
                {g.exhausted ? ` · ${t.practiceGame.exhausted}` : ''}
              </button>
            ) : (
              <span>⚙ {g.card.name}</span>
            )}
            <button className="rb-unit-info" aria-label={t.practiceGame.details(g.card.name)} onClick={() => onDetail(g.card)}>
              ⓘ
            </button>
            <AbilityButtons card={g.card} source={g.uid} handlers={abilities} />
            {onTool && allUnits(game, side).length > 0 && (
              <select className="rb-equip" aria-label={t.practiceGame.equipTo(g.card.name)} value="" onChange={(e) => e.target.value && onTool({ kind: 'equip', side, gear: g.uid, unit: e.target.value })}>
                <option value="">{t.practiceGame.equip}</option>
                {allUnits(game, side).map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.card.name.replace(/\s*\([^)]*\)$/, '')}
                  </option>
                ))}
              </select>
            )}
          </span>
        ))}
        {!p.base.length && !p.gear.length && <span className="text-dim">{t.practiceGame.empty}</span>}
      </div>
    </section>
  )
}

export function PlayerBar({
  game,
  side,
  onTool,
  onPlayChampion,
  onStartOfTurn,
  onZones,
  championDrag,
  trashDrop,
  abilities,
}: {
  game: GameState
  side: Side
  onTool: (tl: Tool) => void
  onPlayChampion?: () => void
  onStartOfTurn?: () => void
  onZones?: (kind: 'deck' | 'trash') => void
  championDrag?: DragProps
  trashDrop?: DropProps
  abilities?: AbilityHandlers
}) {
  const p = game.players[side]
  const runes = runeCount(game, side)
  const champion = p.champion
  const [makingToken, setMakingToken] = useState(false)
  const [pickedRune, setPickedRune] = useState<string | null>(null)
  const picked = p.runes.find((r) => r.uid === pickedRune)
  const runeArt = useRuneArt()
  const { className: trashClass = '', ...trashHandlers } = trashDrop ?? { className: '' }
  return (
    <div className={`rb-player ${side === 0 ? 'mine' : 'theirs'}`}>
      {p.legend?.imageUrlSmall && <img className={`rb-legend-art ${p.legendExhausted ? 'exhausted' : ''}`} src={p.legend.imageUrlSmall} alt="" loading="lazy" />}
      {side === 0 ? (
        <button className="link-button rb-legend" aria-pressed={p.legendExhausted} title={`${t.practiceGame.legendToggle}${p.legend?.text ? `\n\n${p.legend.text}` : ''}`} onClick={() => onTool({ kind: 'legend', side })}>
          {p.legend?.name ?? '—'}
          {p.legendExhausted ? ` · ${t.practiceGame.exhausted}` : ''}
        </button>
      ) : (
        <span className="rb-legend" title={p.legend?.text ?? undefined}>
          {p.legend?.name ?? '—'}
          {p.legendExhausted ? ` · ${t.practiceGame.exhausted}` : ''}
        </span>
      )}
      {side === 0 && p.legend && <AbilityButtons card={p.legend} source="legend" handlers={abilities} />}
      <span className="rb-counter rb-points" role="group" aria-label={t.practiceGame.pointsLabel(p.points)}>
        <span className="rb-counter-name">{t.practiceGame.pointsWord}</span>
        {side === 0 && (
          <button className="btn stepper-btn" aria-label={t.practiceGame.pointMinus} onClick={() => onTool({ kind: 'points', side, amount: -1 })}>
            −
          </button>
        )}
        <span className="rb-counter-value">★ {p.points}</span>
        {side === 0 && (
          <button className="btn stepper-btn" aria-label={t.practiceGame.pointPlus} onClick={() => onTool({ kind: 'points', side, amount: 1 })}>
            +
          </button>
        )}
      </span>
      <span className="rb-counter rb-xp" role="group" aria-label={t.practiceGame.xpLabel(p.xp ?? 0)} title={t.practiceGame.xpTitle}>
        <span className="rb-counter-name">XP</span>
        {side === 0 && (
          <button className="btn stepper-btn" aria-label={t.practiceGame.xpMinus} disabled={!p.xp} onClick={() => onTool({ kind: 'xp', side, amount: -1 })}>
            −
          </button>
        )}
        <span className="rb-counter-value">{p.xp ?? 0}</span>
        {side === 0 && (
          <button className="btn stepper-btn" aria-label={t.practiceGame.xpPlus} onClick={() => onTool({ kind: 'xp', side, amount: 1 })}>
            +
          </button>
        )}
      </span>
      <span className="rb-runes" role="group" aria-label={t.practiceGame.runesLabel(runes.ready, runes.total)}>
        {p.runes.map((r) =>
          side === 0 ? (
            <button
              key={r.uid}
              className={`rb-rune ${r.exhausted ? 'exhausted' : ''} ${pickedRune === r.uid ? 'picked' : ''}`}
              title={t.practiceGame.runeTitle(r.domain)}
              aria-label={t.practiceGame.runeLabel(r.domain, r.exhausted)}
              aria-pressed={pickedRune === r.uid}
              onClick={() => setPickedRune(pickedRune === r.uid ? null : r.uid)}
            >
              <RuneFace domain={r.domain} art={runeArt} />
            </button>
          ) : (
            <span key={r.uid} className={`rb-rune ${r.exhausted ? 'exhausted' : ''}`} title={t.practiceGame.runeLabel(r.domain, r.exhausted)} aria-hidden>
              <RuneFace domain={r.domain} art={runeArt} />
            </span>
          ),
        )}
        <span className="text-dim">
          {' '}
          {runes.ready}/{runes.total}
        </span>
        {side === 0 && picked && (
          <>
            <button className="btn" onClick={() => onTool({ kind: 'rune', side, rune: picked.uid, action: 'toggle' })}>
              {picked.exhausted ? t.practiceGame.readyIt : t.practiceGame.exhaustIt}
            </button>
            <button
              className="btn"
              title={t.practiceGame.recycleTitle}
              onClick={() => {
                onTool({ kind: 'rune', side, rune: picked.uid, action: 'recycle' })
                setPickedRune(null)
              }}
            >
              {t.practiceGame.recycle}
            </button>
          </>
        )}
      </span>
      <span className="text-dim rb-counts">{t.practiceGame.counts(p.hand.length, p.deck.length, p.trash.length)}</span>
      {onZones && (
        <>
          <button className="btn" onClick={() => onZones('deck')}>
            {t.practiceGame.deckButton}
          </button>
          <button className={`btn rb-trash ${trashClass}`} onClick={() => onZones('trash')} title={t.practiceGame.trashDropTitle} {...trashHandlers}>
            {t.practiceGame.trashButton(p.trash.length)}
          </button>
        </>
      )}
      <span className={`rb-champion ${champion ? '' : 'empty'}`} role="group" aria-label={t.practiceGame.championZone} {...(champion ? championDrag : {})}>
        <span className="rb-counter-name">{t.practiceGame.championZone}</span>
        {champion ? (
          <>
            {champion.imageUrlSmall ? <img className="rb-champion-art" src={champion.imageUrlSmall} alt={champion.name} title={champion.text ?? champion.name} loading="lazy" /> : <span>{champion.name}</span>}
            {onPlayChampion && (
              <button className="btn" disabled={!canPlay(game, side, champion)} onClick={onPlayChampion}>
                {t.practiceGame.play(costOf(champion).energy, costOf(champion).power)}
              </button>
            )}
          </>
        ) : (
          <span className="text-dim">{p.hadChampion === false ? t.practiceGame.championNone : t.practiceGame.championGone}</span>
        )}
      </span>
      {side === 0 && (
        <span className="rb-player-tools">
          {onStartOfTurn && (
            <button className="btn btn-primary" onClick={onStartOfTurn} title={t.practiceGame.startOfTurnTitle}>
              {t.practiceGame.startOfTurn}
            </button>
          )}
          {game.manual.includes(side) && (
            <button className="btn" onClick={() => onTool({ kind: 'readyAll', side })}>
              {t.practiceGame.readyAll}
            </button>
          )}
          <button className="btn" onClick={() => onTool({ kind: 'draw', side })}>
            {t.practiceGame.drawCard}
          </button>
          <button className="btn" onClick={() => onTool({ kind: 'channel', side })}>
            {t.practiceGame.channel}
          </button>
          <button className="btn" onClick={() => onTool({ kind: 'readyRune', side })}>
            {t.practiceGame.readyRune}
          </button>
          <button className="btn" aria-expanded={makingToken} onClick={() => setMakingToken((v) => !v)}>
            {t.practiceGame.makeToken}
          </button>
        </span>
      )}
      {makingToken && (
        <TokenForm
          game={game}
          onMake={(tl) => {
            onTool(tl)
            setMakingToken(false)
          }}
        />
      )}
    </div>
  )
}

/** Makes a unit token of any Might, in base or at a battlefield. */
export function TokenForm({ game, onMake }: { game: GameState; onMake: (tl: Tool) => void }) {
  const [name, setName] = useState('')
  const [might, setMight] = useState(1)
  const [where, setWhere] = useState('base')
  const [ready, setReady] = useState(false)
  return (
    <form
      className="rb-token-form"
      onSubmit={(e) => {
        e.preventDefault()
        onMake({ kind: 'token', side: 0, name, might, battlefield: where === 'base' ? null : Number(where), ready })
      }}
    >
      <input aria-label={t.practiceGame.tokenName} placeholder={t.practiceGame.tokenName} value={name} onChange={(e) => setName(e.target.value)} />
      <label>
        {t.practiceGame.tokenMight}{' '}
        <input type="number" min={0} max={20} value={might} onChange={(e) => setMight(Number(e.target.value))} />
      </label>
      <select aria-label={t.practiceGame.tokenWhere} value={where} onChange={(e) => setWhere(e.target.value)}>
        <option value="base">{t.practiceGame.yourBase}</option>
        {game.battlefields.map((_, i) => (
          <option key={i} value={i}>
            {bfName(game, i)}
          </option>
        ))}
      </select>
      <label>
        <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} /> {t.practiceGame.ready}
      </label>
      <button className="btn btn-primary" type="submit">
        {t.practiceGame.make}
      </button>
    </form>
  )
}

/** Your deck (the top cards, or all of it) and trash, to take cards from like at a table. */
export function ZonesWindow({ game, kind, onTool, onDetail, onClose }: { game: GameState; kind: 'deck' | 'trash'; onTool: (tl: Tool) => void; onDetail: (c: Card) => void; onClose: () => void }) {
  const [top, setTop] = useState(3)
  const [all, setAll] = useState(false)
  const p = game.players[0]
  const cards = kind === 'trash' ? p.trash : all ? p.deck : p.deck.slice(0, top)
  const title = kind === 'trash' ? t.practiceGame.trashTitle(p.trash.length) : t.practiceGame.deckTitle(p.deck.length)
  return (
    <Modal label={title} className="rb-zones-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{title}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      {kind === 'deck' && (
        <div className="rb-zones-controls">
          <label>
            {t.practiceGame.lookAtTop}{' '}
            <select value={all ? 'all' : String(top)} onChange={(e) => (e.target.value === 'all' ? setAll(true) : (setAll(false), setTop(Number(e.target.value))))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="all">{t.practiceGame.wholeDeck}</option>
            </select>
          </label>
          <button className="btn" onClick={() => onTool({ kind: 'shuffle', side: 0 })}>
            {t.practiceGame.shuffle}
          </button>
        </div>
      )}
      {!cards.length && <p className="text-dim">{t.practiceGame.empty}</p>}
      <ul className="rb-zones-list">
        {cards.map((card, i) => (
          <li key={`${card.id}-${i}`}>
            <button className="rb-zone-card" onClick={() => onDetail(card)} aria-label={t.practiceGame.details(card.name)}>
              <CardFace card={card} />
            </button>
            <span className="rb-zone-actions">
              {kind === 'deck' ? (
                <>
                  <button className="btn" onClick={() => onTool({ kind: 'fromDeck', side: 0, index: i, to: 'hand' })}>
                    {t.practiceGame.toHand}
                  </button>
                  <button className="btn" onClick={() => onTool({ kind: 'fromDeck', side: 0, index: i, to: 'bottom' })}>
                    {t.practiceGame.toBottom}
                  </button>
                  <button className="btn" onClick={() => onTool({ kind: 'fromDeck', side: 0, index: i, to: 'trash' })}>
                    {t.practiceGame.toTrash}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => onTool({ kind: 'fromTrash', side: 0, index: i, to: 'hand' })}>
                    {t.practiceGame.toHand}
                  </button>
                  <button className="btn" onClick={() => onTool({ kind: 'fromTrash', side: 0, index: i, to: 'bottom' })}>
                    {t.practiceGame.toBottom}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export function HandMenu({
  game,
  card,
  yourTurn,
  manual,
  onPlay,
  onDiscard,
  onHide,
  onDetail,
}: {
  game: GameState
  card: Card
  yourTurn: boolean
  manual: boolean
  onPlay: (o: { accelerate?: boolean; battlefield?: number; free?: boolean }) => void
  onDiscard: () => void
  onHide: (battlefield: number) => void
  onDetail: () => void
}) {
  const hidden = /\[hidden\]/i.test(card.text ?? '')
  const { energy, power } = costOf(card)
  const accel = keywordsOf(card).accelerate && isUnit(card)
  return (
    <div className="rb-hand-menu" role="group" aria-label={card.name}>
      <button className="btn btn-primary" disabled={!yourTurn || !canPlay(game, 0, card)} onClick={() => onPlay({})}>
        {t.practiceGame.play(energy, power)}
      </button>
      {accel && (
        <button className="btn" disabled={!yourTurn || !canPlay(game, 0, card, true)} onClick={() => onPlay({ accelerate: true })}>
          {t.practiceGame.accelerate}
        </button>
      )}
      {isUnit(card) &&
        game.battlefields.map((bf, i) =>
          bf.controller === 0 || manual ? (
            <button key={i} className="btn" disabled={!yourTurn || !canPlay(game, 0, card)} onClick={() => onPlay({ battlefield: i })}>
              {t.practiceGame.playTo(bfName(game, i))}
            </button>
          ) : null,
        )}
      <button className="btn" disabled={!yourTurn} onClick={() => onPlay({ free: true })} title={t.practiceGame.freeTitle}>
        {t.practiceGame.free}
      </button>
      {(hidden || manual) &&
        game.battlefields.map((bf, i) =>
          bf.controller === 0 || manual ? (
            <button key={`h${i}`} className="btn" onClick={() => onHide(i)} title={t.practiceGame.hideTitle}>
              {t.practiceGame.hideAt(bfName(game, i))}
            </button>
          ) : null,
        )}
      <button className="btn" onClick={onDiscard}>
        {t.practiceGame.discard}
      </button>
      <button className="btn" onClick={onDetail}>
        {t.practiceGame.read}
      </button>
    </div>
  )
}

export function UnitTools({ unit, onTool, onDone, abilities }: { unit: Unit; onTool: (tl: Tool) => void; onDone: () => void; abilities?: AbilityHandlers }) {
  const id = unit.uid
  return (
    <div className="rb-tools" role="group" aria-label={t.practiceGame.toolsFor(unit.card.name)}>
      <span className="text-dim">{t.practiceGame.toolsFor(unit.card.name)}</span>
      <AbilityButtons card={unit.card} source={unit.uid} handlers={abilities} />
      <button className="btn" onClick={() => onTool({ kind: 'damage', unit: id, amount: 1 })}>
        {t.practiceGame.damage}
      </button>
      <button className="btn" disabled={unit.damage <= 0} onClick={() => onTool({ kind: 'damage', unit: id, amount: -1 })}>
        {t.practiceGame.heal}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'buff', unit: id, amount: 1 })}>
        {t.practiceGame.mightUp}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'buff', unit: id, amount: -1 })}>
        {t.practiceGame.mightDown}
      </button>
      <button className="btn" onClick={() => onTool({ kind: unit.exhausted ? 'ready' : 'exhaust', unit: id })}>
        {unit.exhausted ? t.practiceGame.readyIt : t.practiceGame.exhaustIt}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'stun', unit: id })}>
        {t.practiceGame.stun}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'recall', unit: id })}>
        {t.practiceGame.recall}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'toHand', unit: id })}>
        {t.practiceGame.toHand}
      </button>
      <button
        className="btn"
        onClick={() => {
          onTool({ kind: 'kill', unit: id })
          onDone()
        }}
      >
        {t.practiceGame.kill}
      </button>
      <span className="text-dim">{t.practiceGame.mightNow(combatMight(unit, false) - unit.damage)}</span>
      {(unit.equipment ?? []).map((e) => (
        <span key={e.uid} className="rb-gear" title={e.card.text ?? undefined}>
          ⚙ {e.card.name}
          <button className="btn" onClick={() => onTool({ kind: 'unequip', unit: id, gear: e.uid })}>
            {t.practiceGame.unequip}
          </button>
        </span>
      ))}
      {(unit.equipment ?? []).length > 0 && <span className="text-dim">{t.practiceGame.equipMightHint}</span>}
    </div>
  )
}

/** The game so far, oldest first, kept scrolled to the newest. */
/** The log of a game (any practice game's: Riftbound's, One Piece's), newest at the bottom. */
export function GameLog({ game, onDetail }: { game: { log: readonly { kind: string; side: number; text: string; card?: Card }[] }; onDetail: (c: Card) => void }) {
  const start = Math.max(0, game.log.length - 120)
  const entries = game.log.slice(start)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [game.log.length])
  return (
    <aside className="rb-log" ref={ref} aria-label={t.practiceGame.log} aria-live="polite">
      <ol>
        {entries.map((e, i) => (
          <li key={start + i} className={`rb-log-${e.kind} ${e.side === 0 ? 'mine' : 'theirs'}`}>
            {e.text}
            {e.card && e.kind === 'spell' && (
              <>
                {' '}
                <button className="link-button" onClick={() => onDetail(e.card!)}>
                  {t.practiceGame.read}
                </button>
                {e.card.text && <div className="rb-log-text">{e.card.text}</div>}
              </>
            )}
          </li>
        ))}
      </ol>
    </aside>
  )
}
