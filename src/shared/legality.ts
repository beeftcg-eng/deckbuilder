import type { Card, Deck, DeckZoneRule, Format, LegalityIssue, LegalityResult } from './types'
import type { GameAdapter } from './games/types'
import { rulesForFormat } from './games/rules'
import { identityColors } from './cardColors'
import { isRotationLegalPromo } from './games/onepiecePromos'

function checkCount(zone: DeckZoneRule, total: number, issues: LegalityIssue[]) {
  if (zone.allowedCounts && !zone.allowedCounts.includes(total)) {
    issues.push({
      severity: 'error',
      message: `${zone.label} must have ${zone.allowedCounts.join(' or ')} cards (currently ${total}).`,
    })
    return
  }
  if (zone.exactCount != null && total !== zone.exactCount) {
    issues.push({
      severity: 'error',
      message: `${zone.label} must have exactly ${zone.exactCount} cards (currently ${total}).`,
    })
  }
  if (zone.minCount != null && total < zone.minCount) {
    issues.push({ severity: 'error', message: `${zone.label} must have at least ${zone.minCount} cards (currently ${total}).` })
  }
  if (zone.maxCount != null && total > zone.maxCount) {
    issues.push({ severity: 'error', message: `${zone.label} must have at most ${zone.maxCount} cards (currently ${total}).` })
  }
}

// Banned/restricted lists and banned pairs are authored against
// `${gameId}:${sourceId}` — the official card number, not `card.id` (which
// for a game like One Piece is unique *per printing*, so a reprint/foil/
// alt-art of a banned card would otherwise slip through a card.id check
// with a different id despite being the same banned card).
function gameSourceKey(card: Card): string {
  return `${card.gameId}:${card.sourceId}`
}

export function isCardLegalInFormat(card: Card, format: Format): { legal: boolean; reason?: string } {
  // Games whose source data carries per-format legality (Pokémon, Magic) use it as-is; the rest use the local ban list below.
  if (card.legality) {
    const status = card.legality[format.id]
    if (status === 'legal' || status === 'restricted' || status === 'semi-restricted') return { legal: true }
    return { legal: false, reason: status === 'banned' ? `is banned in ${format.label}` : `is not legal in ${format.label}` }
  }
  // One Piece promos all share one set but rotate by their own block icon, so a Block 2+ promo passes here.
  if (format.legalSetIds && !format.legalSetIds.includes(card.setId) && !isRotationLegalPromo(card)) {
    return { legal: false, reason: `is from a set not legal in ${format.label}` }
  }
  if (format.bannedCardIds.includes(gameSourceKey(card))) {
    return { legal: false, reason: 'is banned' }
  }
  return { legal: true }
}

export function checkDeckLegality(deck: Deck, adapter: GameAdapter, format: Format, cardsById: Map<string, Card>): LegalityResult {
  const issues: LegalityIssue[] = []
  const rules = rulesForFormat(adapter, format.id)

  // Combined copy-limit pool: zones that don't override maxCopiesPerCard share the deck-wide limit.
  // Pooled by name or by sourceId depending on the game's actual rules — see DeckRules.copyLimitBy.
  const poolKeyFor = (card: Card) => (rules.copyLimitBy === 'sourceId' ? card.sourceId : card.name)
  const pooledCounts = new Map<string, number>()
  const pooledCards = new Map<string, Card>()

  for (const zone of rules.zones) {
    if (zone.freeText) {
      const entries = deck.freeTextZones[zone.id] ?? []
      const total = entries.reduce((sum, e) => sum + e.quantity, 0)
      checkCount(zone, total, issues)
      for (const entry of entries) {
        if (!zone.freeText.options.includes(entry.label)) {
          issues.push({ severity: 'error', message: `"${entry.label}" is not a valid option for ${zone.label}.` })
        }
      }
      continue
    }

    const entries = deck.zones[zone.id] ?? []
    const total = entries.reduce((sum, e) => sum + e.quantity, 0)
    checkCount(zone, total, issues)

    const namesSeen = new Set<string>()
    for (const entry of entries) {
      const card = cardsById.get(entry.cardId)
      if (!card) {
        issues.push({ severity: 'error', message: `Unknown card in ${zone.label} (${entry.cardId}).` })
        continue
      }
      if (!zone.match(card)) {
        issues.push({ severity: 'error', message: `${card.name} does not belong in ${zone.label}.` })
      }

      if (zone.uniqueNames) {
        if (namesSeen.has(card.name)) {
          issues.push({ severity: 'error', message: `${zone.label} cards must have unique names (duplicate: ${card.name}).` })
        }
        namesSeen.add(card.name)
      }

      const zoneMaxCopies = zone.maxCopiesPerCard
      if (zoneMaxCopies != null) {
        if (entry.quantity > zoneMaxCopies) {
          issues.push({ severity: 'error', message: `${card.name}: only ${zoneMaxCopies} allowed in ${zone.label}.` })
        }
      } else {
        const poolKey = poolKeyFor(card)
        pooledCounts.set(poolKey, (pooledCounts.get(poolKey) ?? 0) + entry.quantity)
        if (!pooledCards.has(poolKey)) pooledCards.set(poolKey, card)
      }

      const legality = isCardLegalInFormat(card, format)
      if (!legality.legal) {
        issues.push({ severity: 'error', message: `${card.name} ${legality.reason}.` })
      }
      if (format.restrictedCardIds.includes(gameSourceKey(card)) && entry.quantity > 1) {
        issues.push({ severity: 'error', message: `${card.name} is restricted to 1 copy in ${format.label}.` })
      }
    }
  }

  if (rules.totalCount != null) {
    let total = 0
    for (const zone of rules.zones) {
      if (zone.freeText) continue
      total += (deck.zones[zone.id] ?? []).reduce((sum, e) => sum + e.quantity, 0)
    }
    if (total !== rules.totalCount) {
      issues.push({ severity: 'error', message: `The deck must have exactly ${rules.totalCount} cards in total (currently ${total}).` })
    }
  }

  for (const [key, count] of pooledCounts) {
    const card = pooledCards.get(key)
    if (!card) continue
    const limit = adapter.copyLimitFor?.(card) ?? rules.defaultMaxCopiesPerCard
    if (count > limit) {
      issues.push({ severity: 'error', message: `${card.name}: ${count} copies exceeds the ${limit}-copy limit.` })
    }
    // Vintage's restricted list / Yu-Gi-Oh!'s Limited: legal, but a single copy across every zone.
    if (card.legality?.[format.id] === 'restricted' && count > 1) {
      issues.push({ severity: 'error', message: `${card.name} is restricted to 1 copy in ${format.label}.` })
    }
    // Yu-Gi-Oh!'s Semi-Limited: two copies.
    if (card.legality?.[format.id] === 'semi-restricted' && count > 2) {
      issues.push({ severity: 'error', message: `${card.name} is limited to 2 copies in ${format.label}.` })
    }
  }

  if (format.bannedPairs.length > 0) {
    const includedSourceKeys = new Set<string>()
    for (const zoneEntries of Object.values(deck.zones)) {
      for (const e of zoneEntries) {
        const card = cardsById.get(e.cardId)
        if (card) includedSourceKeys.add(gameSourceKey(card))
      }
    }
    const nameForSourceKey = (key: string) => [...cardsById.values()].find((c) => gameSourceKey(c) === key)?.name ?? key
    for (const [a, b] of format.bannedPairs) {
      if (includedSourceKeys.has(a) && includedSourceKeys.has(b)) {
        const cardA = nameForSourceKey(a)
        const cardB = nameForSourceKey(b)
        issues.push({ severity: 'error', message: `${cardA} and ${cardB} cannot be in the same deck together (banned pair).` })
      }
    }
  }

  if (rules.colorLocked && rules.identityZoneId) {
    // Every card in the identity zone counts (a Commander deck can have two Partners).
    const identityCards = (deck.zones[rules.identityZoneId] ?? []).flatMap((e) => {
      const card = cardsById.get(e.cardId)
      return card ? [card] : []
    })
    if (identityCards.length > 0) {
      const identityColorSet = new Set(identityCards.flatMap(identityColors))
      const identityNames = identityCards.map((c) => c.name).join(' + ')
      for (const [zoneId, zoneEntries] of Object.entries(deck.zones)) {
        if (zoneId === rules.identityZoneId) continue
        for (const entry of zoneEntries) {
          const card = cardsById.get(entry.cardId)
          if (!card) continue
          const cardColors = identityColors(card)
          const outOfColor = cardColors.length > 0 && cardColors.some((c) => c !== 'Colorless' && !identityColorSet.has(c))
          if (outOfColor) {
            issues.push({ severity: 'error', message: `${card.name} (${cardColors.join('/')}) doesn't match your ${identityNames} colors.` })
          }
        }
      }
      for (const [zoneId, entries] of Object.entries(deck.freeTextZones)) {
        for (const entry of entries) {
          if (!identityColorSet.has(entry.label)) {
            issues.push({ severity: 'error', message: `"${entry.label}" in ${zoneId} doesn't match your ${identityNames} domains.` })
          }
        }
      }
    }
  }

  if (adapter.id === 'riftbound') {
    const hasChampion = (deck.zones.main ?? []).some((e) => cardsById.get(e.cardId)?.subtypes.includes('Champion'))
    if (!hasChampion) {
      issues.push({ severity: 'error', message: 'Main Deck must include exactly 1 chosen Champion.' })
    }
  }

  return { legal: issues.filter((i) => i.severity === 'error').length === 0, issues }
}
