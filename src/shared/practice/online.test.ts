import { afterEach, describe, expect, it, vi } from 'vitest'
import { FACE_DOWN, dealOwn, hideSeat, fetchGame, flipState, hostGame, joinForClient, joinGame, kept, mergeOwnMove, privateOf, pushGame, savePrivate, seen, splitForServer } from './online'
import { applyTool, mulligan, newGame, pass, play, startOfTurn } from './riftbound'
import { makeCard } from '../testFixtures'

const unit = (name: string) => makeCard('riftbound', { name, category: 'Unit', cost: '1', might: 2, colors: ['Fury'] })
const cards = Array.from({ length: 10 }, (_, i) => unit(`U${i}`))
const bfs = ['A', 'B', 'C'].map((name) => makeCard('riftbound', { name, category: 'Battlefield' }))
const setup = () => ({ main: [...cards, ...cards, ...cards, ...cards], champion: null, legend: null, battlefields: bfs, runes: Array.from({ length: 12 }, () => 'Fury') })
const byId = new Map([...cards, ...bfs].map((c) => [c.id, c]))

/** The server's four functions, in memory, as the migration defines them. */
function fakeServer() {
  type G = { host_secret: string; guest_secret: string | null; host_name: string; guest_name: string | null; host_deck: unknown; guest_deck: unknown; seq: number; state: string | null; host_private: string | null; guest_private: string | null; host_gifts: string[]; guest_gifts: string[] }
  const games = new Map<string, G>()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const fn = url.split('/rpc/')[1]
      const b = JSON.parse(String(init.body))
      const g = games.get(b.p_code)
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
      const allowed = g && (g.host_secret === b.p_secret || g.guest_secret === b.p_secret)
      const host = g?.host_secret === b.p_secret
      switch (fn) {
        case 'deckbuilder_practice_create':
          games.set(b.p_code, { host_secret: b.p_secret, guest_secret: null, host_name: b.p_name, guest_name: null, host_deck: b.p_deck, guest_deck: null, seq: 0, state: null, host_private: null, guest_private: null, host_gifts: [], guest_gifts: [] })
          return ok(null)
        case 'deckbuilder_practice_join':
          if (!g) return new Response('{"message":"no such game"}', { status: 400 })
          Object.assign(g, { guest_secret: b.p_secret, guest_name: b.p_name, guest_deck: b.p_deck })
          return ok({ host_name: g.host_name, host_deck: g.host_deck })
        case 'deckbuilder_practice_get2': {
          if (!allowed) return new Response('{"message":"no such game"}', { status: 400 })
          const gifts = host ? g!.host_gifts : g!.guest_gifts
          if (host) g!.host_gifts = []
          else g!.guest_gifts = []
          return ok({ seq: g!.seq, state: g!.seq > b.p_since ? g!.state : null, private: host ? g!.host_private : g!.guest_private, gifts, host_name: g!.host_name, guest_name: g!.guest_name, guest_deck: g!.guest_deck })
        }
        case 'deckbuilder_practice_push2':
          if (!allowed) return new Response('{"message":"no such game"}', { status: 400 })
          if (g!.seq !== b.p_seq) return ok(-1)
          g!.seq += 1
          g!.state = b.p_state
          if (host) {
            g!.host_private = b.p_private
            g!.guest_gifts.push(...b.p_gifts)
          } else {
            g!.guest_private = b.p_private
            g!.host_gifts.push(...b.p_gifts)
          }
          return ok(g!.seq)
        case 'deckbuilder_practice_set_private':
          if (!allowed) return new Response('{"message":"no such game"}', { status: 400 })
          if (host) g!.host_private = b.p_private
          else g!.guest_private = b.p_private
          return ok(null)
      }
      return new Response('', { status: 404 })
    }),
  )
  return games
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

  it('a host and a guest each play their side with private hands, and a stale move is refused', async () => {
    const games = fakeServer()
    const host = await hostGame('Ann', { name: 'Fury', zones: {}, freeTextZones: {} })
    const { seat: guest, hostName } = await joinGame(host.code, 'Bo', { name: 'Fury too', zones: {}, freeTextZones: {} })
    expect(hostName).toBe('Ann')
    expect((await fetchGame(host, 0)).guestName).toBe('Bo')

    // The host starts it: on the server, every hand is face down.
    let s = hideSeat(newGame(setup(), setup(), { first: 0, random: () => 0.4, manual: 'both' }), 1)
    let seq = (await pushGame(host, 0, splitForServer(s, 0)))!
    for (const c of cards) expect(games.get(host.code)!.state).not.toContain(`"${c.id}"`)
    // The guest deals their own hand (the host never sees it) and keeps it.
    const snap = await fetchGame(guest, 0)
    let forGuest = joinForClient(snap.state!, snap.private, snap.gifts, 1, byId)!
    expect(forGuest.players[1].hand.every((c) => c.id === FACE_DOWN.id)).toBe(true)
    forGuest = dealOwn(forGuest, 1, setup().main)
    await savePrivate(guest, privateOf(forGuest, 1))
    const afterGuest = mulligan(seen(forGuest, 1), 0, [])
    seq = (await pushGame(guest, seq, splitForServer(kept(afterGuest, 1), 1)))!
    // The host only gets their own cards back, and the guest's face down.
    const forHost = await fetchGame(host, 0)
    s = joinForClient(forHost.state!, forHost.private, forHost.gifts, 0, byId)!
    expect(s.kept).toEqual([1])
    expect(s.players[0].hand.every((c) => c.id !== FACE_DOWN.id)).toBe(true)
    expect(s.players[1].hand.every((c) => c.id === FACE_DOWN.id)).toBe(true)
    expect(forHost.private).not.toBe(games.get(host.code)!.guest_private)
    s = mulligan(s, 0, [])
    s = startOfTurn(s, 0)
    s = play(s, 0, 0)
    seq = (await pushGame(host, seq, splitForServer(s, 0)))!
    // The guest sees the host's unit on the other side of the board, and still has their own hand.
    const g2 = await fetchGame(guest, 0)
    const onChain = seen(joinForClient(g2.state!, g2.private, g2.gifts, 1, byId)!, 1)
    // It's on the chain, the guest's to answer (seen from their side: they are side 0).
    expect(onChain.chain?.priority).toBe(0)
    expect(onChain.chain?.items[0].side).toBe(1)
    const g = pass(onChain, 0)
    expect(g.players[1].base).toHaveLength(1)
    expect(g.players[0].hand.every((c) => c.id !== FACE_DOWN.id)).toBe(true)
    // Returning the host's unit to their hand: a gift only the host receives.
    const returned = applyTool(g, { kind: 'toHand', unit: g.players[1].base[0].uid })
    seq = (await pushGame(guest, seq, splitForServer(kept(returned, 1), 1)))!
    const h = await fetchGame(host, 0)
    expect(h.gifts).toHaveLength(1)
    expect(joinForClient(h.state!, h.private, h.gifts, 0, byId)!.players[0].hand.at(-1)!.name).toBe(g.players[1].base[0].card.name)
    // A move made on an old state doesn't go in.
    expect(await pushGame(guest, seq - 1, splitForServer(kept(g, 1), 1))).toBeNull()
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
