import type { DeckStats as Stats } from '../shared/deckStats'
import { formatPrice, type PriceTotal } from '../shared/collection'

interface Props {
  stats: Stats
  /** Cost of the cards still missing from your collection, or null if you aren't tracking one. */
  toBuy: PriceTotal | null
  /** This game has prices in its data source. */
  gameHasPrices: boolean
  /** Show the per-subtype breakdown (see GameAdapter.showSubtypeStats for why it's opt-in). */
  showSubtypeStats: boolean
}

function priceNote(price: PriceTotal): string {
  return price.unpricedCopies > 0 ? ` (${price.unpricedCopies} card${price.unpricedCopies === 1 ? '' : 's'} unpriced)` : ''
}

export function DeckStats({ stats, toBuy, gameHasPrices, showSubtypeStats }: Props) {
  const maxCurve = Math.max(1, ...stats.curve.map((c) => c.count))
  const anyPriced = stats.totalCards > stats.price.unpricedCopies

  return (
    <div className="deck-stats">
      <div className="deck-stats-summary">
        <span>{stats.totalCards} cards</span>
        {stats.averageCost != null && <span className="text-dim">avg cost {stats.averageCost.toFixed(1)}</span>}
      </div>

      {stats.curve.length > 0 && (
        <div className="cost-curve" title="Main deck by cost">
          {stats.curve.map(({ cost, count }) => (
            <div className="cost-curve-col" key={cost}>
              <span className="cost-curve-count">{count > 0 ? count : ''}</span>
              <div className="cost-curve-bar" style={{ height: `${(count / maxCurve) * 100}%` }} />
              <span className="cost-curve-label">{cost}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stat-chips">
        {stats.byCategory.map(([category, count]) => (
          <span className="stat-chip" key={category}>
            {category} <b>{count}</b>
          </span>
        ))}
        {stats.byColor.map(([color, count]) => (
          <span className="stat-chip stat-chip-color" key={color}>
            {color} <b>{count}</b>
          </span>
        ))}
        {showSubtypeStats &&
          stats.bySubtype.map(([subtype, count]) => (
            <span className="stat-chip stat-chip-subtype" key={subtype}>
              {subtype} <b>{count}</b>
            </span>
          ))}
      </div>

      {anyPriced && (
        <div className="deck-stats-price">
          Deck value ≈ {formatPrice(stats.price.total)}
          <span className="text-dim">{priceNote(stats.price)}</span>
          {toBuy && toBuy.total > 0 && (
            <>
              {' · '}To buy ≈ {formatPrice(toBuy.total)}
              <span className="text-dim">{priceNote(toBuy)}</span>
            </>
          )}
        </div>
      )}
      {!anyPriced && gameHasPrices && stats.totalCards > 0 && (
        <div className="text-dim deck-stats-price">No prices yet — “Update card data” in the sidebar loads them.</div>
      )}
    </div>
  )
}
