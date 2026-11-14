import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGame, flipState, hostGame, joinGame, kept, mergeOwnMove, pushGame, seen } from './online'
import { applyTool, mulligan, newGame, play, startOfTurn } from './riftbound'
import { packState, unpackState } from './serialize'
import { makeCard } from '../testFixtures'

const unit = (name: string) => makeCard('riftbound', { name, category: 'Unit', cost: '1', might: 2, colors: ['Fury'] })
const cards = Array.from({ length: 10 }, (_, i) => unit(`U${i}`))
const bfs = ['A', 'B', 'C'].map((name) => makeCard('riftbound', { name, category: 'Battlefield' }))
const setup = () => ({ main: [...cards, ...cards, ...cards, ...cards], champion: null, legend: null, battlefields: bfs, runes: Array.from({ length: 12 }, () => 'Fury') })
const byId = new Map([...cards, ...bfs].map((c) => [c.id, c]))

/** The server's four functions, in memory, as the migration defines them. */
function fakeServer() {
  const games = new Map<string, { host_secret: string; guest_secret: string | null; host_name: string; guest_name: string | null; host_deck: unknown; guest_deck: unknown; seq: number; state: string | null }>()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const fn = url.split('/rpc/')[1]
      const b = JSON.parse(String(init.body))
      const g = games.get(b.p_code)
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
      const allowed = g && (g.host_secret === b.p_secret || g.guest_secret === b.p_secret)
      switch (fn) {
        case 'deckbuilder_practice_create':
          games.set(b.p_code, { host_secret: b.p_secret, guest_secret: null, host_name: b.p_name, guest_name: null, host_deck: b.p_deck, guest_deck: null, seq: 0, state: null })
          return ok(null)
        case 'deckbuilder_practice_join':
          if (!g) return new Response('{"message":"no such game"}', { status: 400 })
          Object.assign(g, { guest_secret: b.p_secret, guest_name: b.p_name, guest_deck: b.p_deck })
          return ok({ host_name: g.host_name, host_deck: g.host_deck })
        case 'deckbuilder_practice_get':
          if (!allowed) return new Response('{"message":"no such game"}', { status: 400 })
          return ok({ seq: g!.seq, state: g!.seq > b.p_since ? g!.state : null, host_name: g!.host_name, guest_name: g!.guest_name, guest_deck: g!.guest_deck })
        case 'deckbuilder_practice_push':
          if (!allowed) return new Response('{"message":"no such game"}', { status: 400 })
          if (g!.seq !== b.p_seq) return ok(-1)
          g!.seq += 1
          g!.state = b.p_state
          return ok(g!.seq)
      }
      return new Response('', { status: 404 })
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('online practice games', () => {
  it('flips a game to the other side and back', () => {
    let s = newGame(setup(), setup(), { first: 0, random: () => 0.4, manual: 'both' })
    s = mulligan(mulligan(s, 0, []), 1, [])
    s = applyTool(s, { kind: 'control', battlefield: 0, side: 0 })
    s = applyTool(s, { kind: 'points', side: 0, amount: 2 })
    const f = flipState(s)
    expect(f.players[1].points).toBe(2)
    expect(f.battlefields[0].controller).toBe(1)
    expect(f.active).toBe(1)
    expect(f.log.find((l) => l.text.startsWith('Your opponent goes first') || l.text === 'Your opponent goes first.')).toBeTruthy()
    expect(JSON.stringify(flipState(f))).toBe(JSON.stringify(s))
  })

  it('a host and a guest each play their side, and a stale move is refused', async () => {
    fakeServer()
    const host = await hostGame('Ann', { name: 'Fury', zones: {}, freeTextZones: {} })
    const { seat: guest, hostName } = await joinGame(host.code, 'Bo', { name: 'Fury too', zones: {}, freeTextZones: {} })
    expect(hostName).toBe('Ann')
    expect((await fetchGame(host, 0)).guestName).toBe('Bo')

    // The host starts it.
    let s = newGame(setup(), setup(), { first: 0, random: () => 0.4, manual: 'both' })
    let seq = (await pushGame(host, 0, packState(s)))!
    // The guest sees it from their side and keeps their hand (side 0 for them).
    const forGuest = seen(unpackState((await fetchGame(guest, 0)).state!, byId)!, 1)
    const afterGuest = mulligan(forGuest, 0, [])
    seq = (await pushGame(guest, seq, packState(kept(afterGuest, 1))))!
    // On the server it's the host's side 1 that kept.
    s = unpackState((await fetchGame(host, 0)).state!, byId)!
    expect(s.kept).toEqual([1])
    s = mulligan(s, 0, [])
    s = startOfTurn(s, 0)
    s = play(s, 0, 0)
    seq = (await pushGame(host, seq, packState(s)))!
    // The guest sees the host's unit on the other side of the board.
    const g = seen(unpackState((await fetchGame(guest, 0)).state!, byId)!, 1)
    expect(g.players[1].base).toHaveLength(1)
    expect(g.players[0].base).toHaveLength(0)
    // A move made on an old state doesn't go in.
    expect(await pushGame(guest, seq - 1, packState(kept(g, 1)))).toBeNull()
  })

  it('puts two hands kept at once together, and starts the game', () => {
    const start = newGame(setup(), setup(), { first: 0, random: () => 0.4, manual: 'both' })
    const hostKept = mulligan(start, 0, [])
    const guestView = seen(start, 1)
    const guestKept = mulligan(guestView, 0, [0])
    // The guest's keep arrives second: merged on top of the host's.
    const merged = mergeOwnMove(guestView, guestKept, seen(hostKept, 1))!
    expect(merged.phase).toBe('main')
    expect(kept(merged, 1).kept.sort()).toEqual([0, 1])
    // A move that touched the board can't be merged.
    const moved = applyTool(guestView, { kind: 'control', battlefield: 0, side: 0 })
    expect(mergeOwnMove(guestView, moved, seen(hostKept, 1))).toBeNull()
  })
})
