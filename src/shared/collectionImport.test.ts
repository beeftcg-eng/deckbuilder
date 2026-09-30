import { describe, expect, it } from 'vitest'
import { collectionCsv, importCollectionCsv, parseCsv } from './collectionImport'
import { makeCard } from './testFixtures'

const boltSld = makeCard('mtg', { id: 'mtg:aaaa-1111', sourceId: 'oracle-bolt', name: 'Lightning Bolt', setId: 'sld', setCode: 'SLD', setName: 'Secret Lair Drop', number: '901', rarity: 'Rare' })
const bolt2xm = makeCard('mtg', { id: 'mtg:bbbb-2222', sourceId: 'oracle-bolt', name: 'Lightning Bolt', setId: '2xm', setCode: '2XM', setName: 'Double Masters', number: '129', rarity: 'Uncommon' })
const solRing = makeCard('mtg', { id: 'mtg:cccc-3333', sourceId: 'oracle-sol', name: 'Sol Ring', setId: 'ecc', setCode: 'ECC', setName: 'Edge of Eternities Commander', number: '57', rarity: 'Uncommon' })
const fable = makeCard('mtg', { id: 'mtg:dddd-4444', sourceId: 'oracle-fable', name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', setId: 'neo', setCode: 'NEO', setName: 'Kamigawa: Neon Dynasty', number: '141', rarity: 'Rare' })
const mtg = [boltSld, bolt2xm, solRing, fable]

const umbreon95 = makeCard('pokemon', { sourceId: 'swsh7-95', name: 'Umbreon VMAX', setId: 'swsh7', setCode: 'EVS', setName: 'Evolving Skies', number: '95', rarity: 'Rare Holo VMAX' })
const umbreon215 = makeCard('pokemon', { sourceId: 'swsh7-215', name: 'Umbreon VMAX', setId: 'swsh7', setCode: 'EVS', setName: 'Evolving Skies', number: '215', rarity: 'Rare Rainbow' })

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, CRLF, a BOM and Excel’s sep= line', () => {
    expect(parseCsv('﻿"sep=;"\r\nName;Qty\r\n"Say ""Hi""; now";2\r\n\r\n')).toEqual([
      ['Name', 'Qty'],
      ['Say "Hi"; now', '2'],
    ])
  })

  it('guesses the separator from the header line', () => {
    expect(parseCsv('Name\tQuantity\nSol Ring\t1')).toEqual([
      ['Name', 'Quantity'],
      ['Sol Ring', '1'],
    ])
  })
})

describe('importCollectionCsv', () => {
  it('reads a ManaBox export by Scryfall id, then by set and number', () => {
    const csv = `Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID
Lightning Bolt,SLD,Secret Lair Drop,901,foil,rare,2,1,aaaa-1111
"Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",NEO,Kamigawa: Neon Dynasty,141,normal,rare,1,2,
Made Up Card,XXX,Nope,1,normal,rare,3,3,`
    const result = importCollectionCsv(csv, 'mtg', mtg)
    expect(result.source).toBe('ManaBox')
    expect(result.items.map((i) => [i.card.id, i.quantity])).toEqual([
      [boltSld.id, 2],
      [fable.id, 1],
    ])
    expect(result.unmatched).toEqual(['3 Made Up Card (XXX 1)'])
    expect(result.byNameCopies).toBe(0)
  })

  it('reads Moxfield’s lowercase editions, a front-face-only name, and adds up repeated printings', () => {
    const csv = `"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Collector Number"
"4","0","Sol Ring","ecc","Near Mint","English","","57"
"1","0","Fable of the Mirror-Breaker","neo","Near Mint","English","foil","141"
"2","0","Sol Ring","ecc","Near Mint","English","foil","57"`
    const result = importCollectionCsv(csv, 'mtg', mtg)
    expect(result.source).toBe('Moxfield')
    expect(result.items.map((i) => [i.card.id, i.quantity])).toEqual([
      [solRing.id, 6],
      [fable.id, 1],
    ])
  })

  it('falls back to the name when the set isn’t in the data, and says so', () => {
    const csv = `"sep=,"
Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number
Binder,3,0,Sol Ring,C21,Commander 2021,263`
    const result = importCollectionCsv(csv, 'mtg', mtg)
    expect(result.source).toBe('Dragon Shield')
    expect(result.items.map((i) => [i.card.id, i.quantity])).toEqual([[solRing.id, 3]])
    expect(result.byNameCopies).toBe(3)
  })

  it('doesn’t take a set and number match whose name disagrees', () => {
    // Another app's "SLD 901" could be a different card; the name decides.
    const result = importCollectionCsv('Name,Set Code,Number,Qty\nSol Ring,SLD,901,1', 'mtg', mtg)
    expect(result.items.map((i) => i.card.id)).toEqual([solRing.id])
    expect(result.byNameCopies).toBe(1)
  })

  it('reads TCGplayer: set-name prefixes, "215/203" numbers, printing notes in the name, other games skipped', () => {
    const csv = `Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU,Product Line
1,Umbreon VMAX (Alternate Art Secret),Umbreon VMAX,SWSH07: Evolving Skies,215/203,SWSH07,Holofoil,Near Mint,English,Secret Rare,246723,1,Pokemon
1,Lightning Bolt,Lightning Bolt,Double Masters,129,2XM,Normal,Near Mint,English,Uncommon,1,3,Magic`
    const result = importCollectionCsv(csv, 'pokemon', [umbreon95, umbreon215])
    expect(result.source).toBe('TCGplayer')
    expect(result.items.map((i) => i.card.id)).toEqual([umbreon215.id])
    expect(result.otherGameRows).toBe(1)
    expect(result.byNameCopies).toBe(0)
  })

  it('matches Yu-Gi-Oh! set codes written as one code, picking the row’s rarity', () => {
    const ultra = makeCard('yugioh', { id: 'yugioh:89631139~CT13~Ultra Rare', sourceId: '89631139', name: 'Blue-Eyes White Dragon', setCode: 'CT13', setId: 'CT13', number: 'EN008', rarity: 'Ultra Rare' })
    const secret = makeCard('yugioh', { id: 'yugioh:89631139~CT13~Secret Rare', sourceId: '89631139', name: 'Blue-Eyes White Dragon', setCode: 'CT13', setId: 'CT13', number: 'EN008', rarity: 'Secret Rare' })
    const result = importCollectionCsv('Quantity,Name,Card Number,Rarity\n2,Blue-Eyes White Dragon,CT13-EN008,Secret Rare', 'yugioh', [ultra, secret])
    expect(result.items.map((i) => [i.card.id, i.quantity])).toEqual([[secret.id, 2]])
  })

  it('matches One Piece card numbers and Riftbound’s comma titles', () => {
    const perona = makeCard('onepiece', { sourceId: 'OP01-077', name: 'Perona', setCode: 'OP-01', setId: 'OP-01', number: '077' })
    expect(importCollectionCsv('Quantity,Name,Card Number\n4,Perona,OP01-077', 'onepiece', [perona]).items[0]).toMatchObject({ card: perona, quantity: 4 })
    const vi = makeCard('riftbound', { sourceId: 'unl-229-219', name: 'Vi - Piltover Enforcer', setCode: 'UNL', setId: 'UNL', setName: 'Unleashed', number: '229' })
    expect(importCollectionCsv('Quantity;Name;Set\n2;Vi, Piltover Enforcer;Unleashed', 'riftbound', [vi]).items[0]).toMatchObject({ card: vi, quantity: 2 })
  })

  it('counts a row with no quantity column as one copy and skips zero-quantity rows', () => {
    expect(importCollectionCsv('Name\nSol Ring\nSol Ring', 'mtg', mtg).copies).toBe(2)
    expect(importCollectionCsv('Name,Quantity\nSol Ring,0', 'mtg', mtg).copies).toBe(0)
  })

  it('says when there’s no header row it can use', () => {
    expect(importCollectionCsv('4 Sol Ring\n2 Lightning Bolt', 'mtg', mtg).recognised).toBe(false)
  })
})

describe('collectionCsv', () => {
  it('writes a file this importer reads back to the same printings and counts', () => {
    const entries = [
      { card: boltSld, copies: 2, forTrade: true },
      { card: fable, copies: 1, forTrade: false },
      { card: solRing, copies: 4, forTrade: false },
    ]
    const csv = collectionCsv(entries, 'Magic: The Gathering')
    expect(csv.split('\r\n')[0]).toBe('Quantity,Name,Set Code,Set Name,Collector Number,Rarity,Finish,Condition,Game,Price (USD),For Trade,Scryfall ID')
    expect(csv).toContain('1,Fable of the Mirror-Breaker // Reflection of Kiki-Jiki,NEO,Kamigawa: Neon Dynasty,141,Rare,normal,Near Mint')
    const back = importCollectionCsv(csv, 'mtg', mtg)
    expect(back.items.map((i) => [i.card.id, i.quantity]).sort()).toEqual(entries.map((e) => [e.card.id, e.copies]).sort())
    expect(back.unmatched).toEqual([])
    expect(back.byNameCopies).toBe(0)
  })

  it('writes a row per finish and condition, and reads them back', () => {
    const entries = [{ card: boltSld, copies: 3, forTrade: false, details: [{ finish: 'foil' as const, condition: 'LP' as const, quantity: 1 }] }]
    const csv = collectionCsv(entries, 'Magic: The Gathering')
    expect(csv).toContain('2,Lightning Bolt,SLD,Secret Lair Drop,901,Rare,normal,Near Mint')
    expect(csv).toContain('1,Lightning Bolt,SLD,Secret Lair Drop,901,Rare,foil,Lightly Played')
    const back = importCollectionCsv(csv, 'mtg', mtg)
    expect(back.items).toHaveLength(1)
    expect(back.items[0].quantity).toBe(3)
    expect(back.items[0].details).toEqual([{ finish: 'foil', condition: 'LP', quantity: 1 }])
  })
})

describe('finish and condition columns', () => {
  it("reads ManaBox's Foil column and TCGplayer's finish inside the condition", () => {
    const manabox = importCollectionCsv('Name,Set code,Collector number,Foil,Quantity,Condition\nSol Ring,ECC,57,foil,2,near_mint\nSol Ring,ECC,57,normal,1,played\n', 'mtg', mtg)
    expect(manabox.items[0].details).toEqual([{ finish: 'foil', condition: 'NM', quantity: 2 }, { finish: 'normal', condition: 'MP', quantity: 1 }])
    const tcg = importCollectionCsv('Quantity,Name,Set,Card Number,Condition\n1,Umbreon VMAX,Evolving Skies,215,Lightly Played Holofoil\n', 'pokemon', [umbreon95, umbreon215])
    expect(tcg.items[0].details).toEqual([{ finish: 'foil', condition: 'LP', quantity: 1 }])
  })
})
