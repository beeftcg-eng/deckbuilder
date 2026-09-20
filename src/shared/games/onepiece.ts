import type { Card, DeckRules, Deck, Format } from '../types'
import type { GameAdapter, FetchProgress, GuidedStage } from './types'
import { fetchJson } from './fetchUtil'

const API_BASE = 'https://www.optcgapi.com/api'

const KNOWN_COLORS = new Set(['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'])

interface OnePieceApiCard {
  card_name: string
  set_name: string
  card_text: string | null
  set_id: string
  rarity: string | null
  card_set_id: string
  // Unique per exact printing (base/reprint/foil/alt-art/full-art all get
  // their own suffix, e.g. "OP01-006" vs "OP01-006_p5") — unlike
  // card_set_id, which every reprint of the same official card shares.
  // Cards.id is built from this so lookalike reprints don't collide into
  // one browsable entry (see normalizeCard).
  card_image_id: string
  card_color: string | null
  card_type: string
  life: string | null
  card_cost: string | null
  card_power: string | null
  sub_types: string | null
  counter_amount: number | null
  attribute: string | null
  card_image: string | null
  market_price?: number | null
}

interface OnePieceSet {
  set_name: string
  set_id: string
}

function normalizeCard(raw: OnePieceApiCard): Card {
  const number = raw.card_set_id.includes('-')
    ? raw.card_set_id.slice(raw.card_set_id.lastIndexOf('-') + 1)
    : raw.card_set_id

  const infoParts: string[] = []
  if (raw.card_power) infoParts.push(`Power: ${raw.card_power}`)
  if (raw.life) infoParts.push(`Life: ${raw.life}`)
  if (raw.counter_amount) infoParts.push(`Counter: ${raw.counter_amount}`)
  if (raw.attribute) infoParts.push(`Attribute: ${raw.attribute}`)
  if (raw.card_text) infoParts.push(raw.card_text)

  return {
    // card_image_id (not card_set_id) so a reprint/foil/alt-art of the same
    // official card gets its own browsable entry, deck slot, and wishlist
    // star instead of colliding with every other printing of that number.
    // sourceId stays card_set_id — the official number reprints share, used
    // for the copy-limit pool and banned/restricted-card matching (see
    // legality.ts) and for decklist export text.
    id: `onepiece:${raw.card_image_id}`,
    gameId: 'onepiece',
    sourceId: raw.card_set_id,
    name: raw.card_name,
    imageUrl: raw.card_image,
    imageUrlSmall: raw.card_image,
    orientation: 'portrait',
    setId: raw.set_id,
    setName: raw.set_name,
    setCode: raw.set_id,
    number,
    rarity: raw.rarity,
    category: raw.card_type,
    subtypes: raw.sub_types ? [raw.sub_types] : [],
    // Dual-color cards (e.g. leaders) use a space, not a slash, to separate colors: "Purple Yellow".
    colors: raw.card_color
      ? raw.card_color
          .split(/[/\s]+/)
          .map((c) => c.trim())
          .filter((c) => KNOWN_COLORS.has(c))
      : [],
    cost: raw.card_cost,
    text: infoParts.length ? infoParts.join('\n') : null,
    legality: null,
    price: raw.market_price != null && raw.market_price > 0 ? raw.market_price : null,
  }
}

async function fetchAllCards(onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  const sets = await fetchJson<OnePieceSet[]>(`${API_BASE}/allSets/`)

  // Starter/structure decks (ST-01, ST-02, ...) live under a completely
  // separate endpoint namespace from numbered OP/EB/PRB sets — /allSets/ and
  // /sets/{id}/ never return them at all, which is why starter-exclusive
  // cards (e.g. ST34-003 Charlotte Brulee) were missing entirely. This one
  // request returns every starter deck card in one shot rather than needing
  // a per-deck fetch, so it's counted as a single extra "set" for progress.
  const totalSteps = sets.length + 1

  // One request per set used to run one at a time, which is what made this
  // sync noticeably slower than the other games — each request is small but
  // round-trip latency dominates, so fetching them sequentially pays that
  // latency once per set. Running them concurrently (fetchJson's own
  // 429/5xx retry/backoff still applies per-request) cuts a ~12s sync down
  // to ~2s. Cards are collected per-set-index rather than appended as each
  // request resolves, so set order in the results stays deterministic
  // regardless of which request finishes first.
  const bySet: Card[][] = new Array(sets.length)
  let stepsDone = 0
  await Promise.all([
    ...sets.map(async (set, i) => {
      const raw = await fetchJson<OnePieceApiCard[]>(`${API_BASE}/sets/${encodeURIComponent(set.set_id)}/`)
      bySet[i] = raw.map(normalizeCard)
      stepsDone += 1
      onProgress({ loaded: stepsDone, total: totalSteps })
    }),
    (async () => {
      const raw = await fetchJson<OnePieceApiCard[]>(`${API_BASE}/allSTCards/`)
      // The API lists a reprinted card once per starter deck it appears in,
      // so the same card_set_id can show up several times with identical
      // card data — de-duped here rather than left to produce duplicate
      // tiles (same key) in the browser.
      const seen = new Set<string>()
      const stCards: Card[] = []
      for (const c of raw) {
        if (seen.has(c.card_set_id)) continue
        seen.add(c.card_set_id)
        stCards.push(normalizeCard(c))
      }
      bySet.push(stCards)
      stepsDone += 1
      onProgress({ loaded: stepsDone, total: totalSteps })
    })(),
  ])

  return bySet.flat()
}

const deckRules: DeckRules = {
  defaultMaxCopiesPerCard: 4,
  // Official rule: the 4-copy limit is per card number, not name — e.g.
  // Monkey.D.Luffy (ST01-001) and Monkey.D.Luffy (OP01-003) are legally
  // separate cards for deckbuilding despite sharing a name, so a reprint
  // with its own card number (like ST34-003 vs OP08-066 Charlotte Brulee)
  // gets its own independent 4 copies rather than sharing a pool.
  copyLimitBy: 'sourceId',
  colorLocked: true,
  identityZoneId: 'leader',
  zones: [
    {
      id: 'leader',
      label: 'Leader',
      match: (card) => card.category === 'Leader',
      exactCount: 1,
      maxCopiesPerCard: 1,
    },
    {
      id: 'main',
      label: 'Main Deck',
      match: (card) => card.category !== 'Leader',
      exactCount: 50,
    },
  ],
}

const defaultFormats: Format[] = [
  {
    id: 'standard',
    label: 'Standard (current rotation + ban list)',
    description:
      'Block 2 onward (OP-05 and later) as of the April 2026 rotation, which retired Block 1 (OP-01–OP-04 and starter decks ST-01–ST-09). Also applies the current official banned/restricted list as a snapshot from onepiece.gg. Bandai rotates the legal block window each April 1st (next: April 2027) — re-check onepiece.gg periodically, neither list is auto-updated.',
    legalSetIds: [
      'EB-01',
      'EB-02',
      'EB-03',
      'OP-05',
      'OP-06',
      'OP-07',
      'OP-08',
      'OP-09',
      'OP-10',
      'OP-11',
      'OP-12',
      'OP-13',
      'OP-16',
      'OP-17',
      'OP14-EB04',
      'OP15-EB04',
      'PRB-01',
      'PRB-02',
      // Starter/structure decks: ST-01–ST-09 were Block 1 and rotated out
      // alongside OP-01–OP-04; ST-10 onward are Block 2+ and current.
      'ST-10',
      'ST-11',
      'ST-12',
      'ST-13',
      'ST-14',
      'ST-15',
      'ST-16',
      'ST-17',
      'ST-18',
      'ST-19',
      'ST-20',
      'ST-21',
      'ST-22',
      'ST-23',
      'ST-24',
      'ST-25',
      'ST-26',
      'ST-27',
      'ST-28',
      'ST-30',
      'ST-31',
      'ST-32',
      'ST-33',
      'ST-34',
      'ST-35',
      'ST-36',
    ],
    bannedCardIds: ['onepiece:OP06-116', 'onepiece:ST10-001', 'onepiece:OP06-086', 'onepiece:OP03-040', 'onepiece:OP06-047'],
    restrictedCardIds: [],
    bannedPairs: [
      ['onepiece:EB04-058', 'onepiece:OP07-115'],
      ['onepiece:OP11-040', 'onepiece:OP11-067'],
      ['onepiece:OP11-040', 'onepiece:OP08-069'],
    ],
  },
  {
    id: 'unrestricted',
    label: 'All Sets (no ban list)',
    bannedCardIds: [],
    restrictedCardIds: [],
    bannedPairs: [],
  },
]

function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const lines: string[] = []
  const leaderEntry = (deck.zones.leader ?? [])[0]
  const leaderCard = leaderEntry ? cardsById.get(leaderEntry.cardId) : undefined

  lines.push(`Leader: ${leaderCard ? `${leaderCard.sourceId} ${leaderCard.name}` : '(none selected)'}`)
  lines.push('')

  const mainEntries = deck.zones.main ?? []
  const total = mainEntries.reduce((sum, e) => sum + e.quantity, 0)
  lines.push(`Main Deck (${total}/50):`)
  for (const entry of mainEntries) {
    const card = cardsById.get(entry.cardId)
    if (!card) continue
    lines.push(`${entry.quantity}x ${card.sourceId} ${card.name}`)
  }
  lines.push('')
  lines.push('DON!!: 10 (standard)')

  return lines.join('\n')
}

function getGuidedStage(deck: Deck): GuidedStage | null {
  const hasLeader = (deck.zones.leader ?? []).length > 0
  if (!hasLeader) {
    return { label: 'Pick your Leader', filter: (card) => card.category === 'Leader', targetZoneId: 'leader' }
  }
  return null
}

export const onepieceAdapter: GameAdapter = {
  id: 'onepiece',
  name: 'One Piece Card Game',
  shortName: 'One Piece',
  deckRules,
  defaultFormats,
  legalitySource: 'local',
  hasPrices: true,
  openingHandSize: 5,
  fetchAllCards,
  formatDecklistText,
  getGuidedStage,
  mainDeckExcludedCategories: ['Leader', 'DON!!'],
}
