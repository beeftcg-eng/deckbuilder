import type { Card, Deck, DeckZoneRule, Format, LegalityIssue, LegalityResult } from './types'
import type { GameAdapter } from './games/types'

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

function isCardLegalInFormat(card: Card, format: Format): { legal: boolean; reason?: string } {
  if (card.gameId === 'pokemon') {
    const legal = card.legality?.[format.id] === 'legal'
    return legal ? { legal: true } : { legal: false, reason: `is not legal in ${format.label}` }
  }
  if (format.legalSetIds && !format.legalSetIds.includes(card.setId)) {
    return { legal: false, reason: `is from a set not legal in ${format.label}` }
  }
  if (format.bannedCardIds.includes(card.id)) {
    return { legal: false, reason: 'is banned' }
  }
  return { legal: true }
}

const BASIC_ENERGY_UNLIMITED = (card: Card) => card.gameId === 'pokemon' && card.category === 'Energy' && card.subtypes.includes('Basic')

export function checkDeckLegality(deck: Deck, adapter: GameAdapter, format: Format, cardsById: Map<string, Card>): LegalityResult {
  const issues: LegalityIssue[] = []
  const rules = adapter.deckRules

  // Combined copy-limit pool: zones that don't override maxCopiesPerCard share the deck-wide limit.
  const pooledCounts = new Map<string, number>()

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
        pooledCounts.set(card.name, (pooledCounts.get(card.name) ?? 0) + entry.quantity)
      }

      const legality = isCardLegalInFormat(card, format)
      if (!legality.legal) {
        issues.push({ severity: 'error', message: `${card.name} ${legality.reason}.` })
      }
      if (format.restrictedCardIds.includes(card.id) && entry.quantity > 1) {
        issues.push({ severity: 'error', message: `${card.name} is restricted to 1 copy in ${format.label}.` })
      }
    }
  }

  for (const [name, count] of pooledCounts) {
    if (count > rules.defaultMaxCopiesPerCard) {
      const anyCard = [...cardsById.values()].find((c) => c.name === name && c.gameId === adapter.id)
      if (anyCard && BASIC_ENERGY_UNLIMITED(anyCard)) continue
      issues.push({
        severity: 'error',
        message: `${name}: ${count} copies exceeds the ${rules.defaultMaxCopiesPerCard}-copy limit.`,
      })
    }
  }

  if (format.bannedPairs.length > 0) {
    const includedCardIds = new Set<string>()
    for (const zoneEntries of Object.values(deck.zones)) {
      for (const e of zoneEntries) includedCardIds.add(e.cardId)
    }
    for (const [a, b] of format.bannedPairs) {
      if (includedCardIds.has(a) && includedCardIds.has(b)) {
        const cardA = cardsById.get(a)?.name ?? a
        const cardB = cardsById.get(b)?.name ?? b
        issues.push({ severity: 'error', message: `${cardA} and ${cardB} cannot be in the same deck together (banned pair).` })
      }
    }
  }

  if (rules.colorLocked && rules.identityZoneId) {
    const identityEntry = (deck.zones[rules.identityZoneId] ?? [])[0]
    const identityCard = identityEntry ? cardsById.get(identityEntry.cardId) : undefined
    if (identityCard) {
      const identityColors = new Set(identityCard.colors)
      for (const [zoneId, zoneEntries] of Object.entries(deck.zones)) {
        if (zoneId === rules.identityZoneId) continue
        for (const entry of zoneEntries) {
          const card = cardsById.get(entry.cardId)
          if (!card) continue
          const outOfColor = card.colors.length > 0 && card.colors.some((c) => c !== 'Colorless' && !identityColors.has(c))
          if (outOfColor) {
            issues.push({ severity: 'error', message: `${card.name} (${card.colors.join('/')}) doesn't match your ${identityCard.name} colors.` })
          }
        }
      }
      for (const [zoneId, entries] of Object.entries(deck.freeTextZones)) {
        for (const entry of entries) {
          if (!identityColors.has(entry.label)) {
            issues.push({ severity: 'error', message: `"${entry.label}" in ${zoneId} doesn't match your ${identityCard.name} domains.` })
          }
        }
      }
    }
  }

  return { legal: issues.filter((i) => i.severity === 'error').length === 0, issues }
}
