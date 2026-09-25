import { afterEach, describe, expect, it } from 'vitest'
import { en } from './en'
import { es } from './es'
import { languageFromLocale, setLanguage, t, zoneLabel } from '.'
import { GAME_LIST } from '../games/registry'
import { rulesForFormat } from '../games/rules'
import { checkDeckLegality } from '../legality'
import { formatDescription, formatLabel } from '../formatText'
import type { Deck } from '../types'

/** Every key path in a dictionary, e.g. "sidebar.newDeck" or "zones.Main Deck". */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
}

afterEach(() => setLanguage('en'))

describe('dictionaries', () => {
  it('have the same keys in English and Spanish, including the keyed lists TypeScript can’t check', () => {
    // English formats use the games' own wording, so only Spanish lists them (checked below).
    const withoutFormats = (paths: string[]) => paths.filter((p) => !p.startsWith('formats.')).sort()
    expect(withoutFormats(keyPaths(es))).toEqual(withoutFormats(keyPaths(en)))
  })

  it('only translate formats and fields that exist', () => {
    for (const [key, text] of Object.entries(es.formats)) {
      const [gameId, formatId] = key.split(':')
      const format = GAME_LIST.find((a) => a.id === gameId)?.defaultFormats.find((f) => f.id === formatId)
      expect(format, key).toBeDefined()
      if (text.description) expect(format?.description, key).toBeDefined()
    }
  })

  it('take the same arguments for every message built from values', () => {
    const functions = (dict: object) =>
      keyPaths(dict).flatMap((path) => {
        const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dict)
        return typeof value === 'function' ? [[path, value.length] as const] : []
      })
    expect(functions(es)).toEqual(expect.arrayContaining(functions(en)))
    expect(functions(es)).toHaveLength(functions(en).length)
  })

  it('translate every deck zone the games define', () => {
    for (const adapter of GAME_LIST) {
      for (const format of adapter.defaultFormats) {
        for (const zone of rulesForFormat(adapter, format.id).zones) expect(es.zones, `${adapter.id} ${zone.label}`).toHaveProperty([zone.label])
      }
    }
  })
})

describe('switching language', () => {
  it('swaps the live `t` binding and the helpers that read it', () => {
    expect(t.common.close).toBe('Close')
    setLanguage('es')
    expect(t.common.close).toBe('Cerrar')
    expect(zoneLabel('Main Deck')).toBe('Mazo principal')
    expect(zoneLabel('Some Future Zone')).toBe('Some Future Zone')
    setLanguage('en')
    expect(zoneLabel('Main Deck')).toBe('Main Deck')
  })

  it('picks Spanish for any Spanish locale', () => {
    expect(languageFromLocale('es')).toBe('es')
    expect(languageFromLocale('es-MX')).toBe('es')
    expect(languageFromLocale('ES-419')).toBe('es')
    expect(languageFromLocale('en-US')).toBe('en')
    expect(languageFromLocale('pt-BR')).toBe('en')
    expect(languageFromLocale(undefined)).toBe('en')
  })

  it('translates a format only while it still has the app’s own wording', () => {
    const onepiece = GAME_LIST.find((a) => a.id === 'onepiece')!
    const standard = onepiece.defaultFormats.find((f) => f.id === 'standard')!
    setLanguage('es')
    expect(formatLabel('onepiece', standard)).toBe('Standard (rotación actual + lista de prohibidas)')
    expect(formatDescription('onepiece', standard)).toMatch(/^Del Bloque 2/)
    expect(formatLabel('onepiece', { ...standard, label: 'My local meta' })).toBe('My local meta')
    const mtg = GAME_LIST.find((a) => a.id === 'mtg')!
    expect(formatLabel('mtg', mtg.defaultFormats[0])).toBe('Standard')
  })

  it('writes legality issues in the chosen language', () => {
    const pokemon = GAME_LIST.find((a) => a.id === 'pokemon')!
    const deck: Deck = { id: 'd', gameId: 'pokemon', name: 'Test', formatId: 'standard', zones: {}, freeTextZones: {}, createdAt: '', updatedAt: '' }
    setLanguage('es')
    const result = checkDeckLegality(deck, pokemon, pokemon.defaultFormats[0], new Map())
    expect(result.issues.map((i) => i.message)).toContain('Mazo: debe tener exactamente 60 cartas (ahora tiene 0).')
  })
})
