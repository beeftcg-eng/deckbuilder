import { describe, expect, it } from 'vitest'
import { firstMerge, itemOps, itemRows, settingsFromItems, touchesItems } from './items'
import type { PackOpening } from '../packOpenings'

const opening = (id: string, date = '2026-09-29'): PackOpening => ({ id, gameId: 'riftbound', name: id, date, costUsd: 90, pulls: [{ cardId: 'riftbound:a', quantity: 1 }], addToCollection: true })

describe('synced items', () => {
  const before = {
    packOpenings: [opening('o1')],
    priceAlerts: { 'mtg:bolt': { target: 1 } },
    valueHistory: { riftbound: [{ d: '2026-09-28', v: 100 }] },
  }

  it('sends only what changed: new, edited and removed items', () => {
    const after = {
      packOpenings: [{ ...opening('o1'), costUsd: 95 }, opening('o2')],
      priceAlerts: {},
      valueHistory: { riftbound: [{ d: '2026-09-28', v: 100 }, { d: '2026-09-29', v: 110 }] },
    }
    expect(itemOps(before, after)).toEqual([
      { type: 'set_item', kind: 'pack_opening', key: 'o1', data: after.packOpenings[0] },
      { type: 'set_item', kind: 'pack_opening', key: 'o2', data: after.packOpenings[1] },
      { type: 'set_item', kind: 'value_point', key: 'riftbound:2026-09-29', data: { v: 110 } },
      { type: 'set_item', kind: 'price_alert', key: 'mtg:bolt', data: null },
    ])
    expect(itemOps(before, before)).toEqual([])
  })

  it('rebuilds the settings from rows, dropping broken ones', () => {
    const rows = [...itemRows(before), { kind: 'value_point' as const, key: 'riftbound:nope', data: { v: 1 } }, { kind: 'pack_opening' as const, key: 'bad', data: { id: 1 } }]
    expect(settingsFromItems(rows)).toEqual(before)
  })

  it('keeps this device’s items the first time, and uploads the ones the server lacks', () => {
    const server = itemRows({ packOpenings: [opening('fromPhone', '2026-09-30')], valueHistory: { riftbound: [{ d: '2026-09-28', v: 90 }] } })
    const { settings, upload } = firstMerge(before, server)
    expect(settings.packOpenings.map((o) => o.id)).toEqual(['fromPhone', 'o1'])
    expect(settings.valueHistory.riftbound).toEqual([{ d: '2026-09-28', v: 90 }]) // on both: the server's wins
    expect(settings.priceAlerts).toEqual({ 'mtg:bolt': { target: 1 } })
    expect(upload.map((o) => (o.type === 'set_item' ? o.key : ''))).toEqual(['o1', 'mtg:bolt'])
  })

  it('only diffs a save that touches a synced field', () => {
    expect(touchesItems({ theme: 'royal' })).toBe(false)
    expect(touchesItems({ valueHistory: {} })).toBe(true)
  })
})
