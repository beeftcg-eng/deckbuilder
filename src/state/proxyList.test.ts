import { beforeEach, describe, expect, it } from 'vitest'
import { useProxyList } from './proxyList'
import { makeCard } from '../shared/testFixtures'

const bolt = makeCard('mtg', { name: 'Lightning Bolt' })
const boltAlt = makeCard('mtg', { name: 'Lightning Bolt', setCode: 'SLD' })
const list = () => useProxyList.getState().lists.mtg?.map((e) => [e.cardId, e.quantity])

describe('proxy print list', () => {
  beforeEach(() => useProxyList.getState().clear('mtg'))

  it('adds copies to a card already listed', () => {
    useProxyList.getState().add(bolt)
    useProxyList.getState().add(bolt, 3)
    expect(list()).toEqual([[bolt.id, 4]])
  })

  it('switches a card to another printing, merging with that printing’s copies', () => {
    useProxyList.getState().add(bolt, 2)
    useProxyList.getState().swap('mtg', bolt.id, boltAlt.id)
    expect(list()).toEqual([[boltAlt.id, 2]])
    useProxyList.getState().add(bolt, 1)
    useProxyList.getState().swap('mtg', bolt.id, boltAlt.id)
    expect(list()).toEqual([[boltAlt.id, 3]])
  })

  it('drops a card whose copies go to 0', () => {
    useProxyList.getState().add(bolt)
    useProxyList.getState().setQuantity('mtg', bolt.id, 0)
    expect(list()).toEqual([])
  })
})
