import type { DeckDiff } from '../shared/deckCompare'
import { t, zoneLabel } from '../shared/i18n'

/** The changes between two lists, zone by zone, with card pictures (compare decks, deck history). */
export function DeckDiffList({ diff }: { diff: DeckDiff }) {
  return (
    <div className="compare-body">
      {diff.added === 0 && diff.removed === 0 ? (
        <p className="text-dim">{t.compare.same}</p>
      ) : (
        diff.zones
          .filter((z) => z.changes.length)
          .map((zone) => (
            <section key={zone.zoneId} className="compare-zone">
              <h3>
                {zoneLabel(zone.label)}{' '}
                <span className="text-dim">
                  {zone.fromCount} → {zone.toCount}
                </span>
              </h3>
              <ul>
                {zone.changes.map((c) => (
                  <li key={c.name} className={c.to > c.from ? 'compare-add' : 'compare-remove'}>
                    <b>
                      {c.to > c.from ? '+' : '−'}
                      {Math.abs(c.to - c.from)}
                    </b>
                    {c.card?.imageUrlSmall ? <img src={c.card.imageUrlSmall} alt="" loading="lazy" /> : null}
                    <span className="compare-name">{c.name}</span>
                    <span className="text-dim">
                      {c.from} → {c.to}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  )
}
