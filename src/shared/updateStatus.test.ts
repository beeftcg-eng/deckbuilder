import { describe, expect, it } from 'vitest'
import { canCheckForUpdates, describeUpdate, shortUpdateError, type UpdateStatus } from './updateStatus'

const v = '0.7.0'

describe('describeUpdate', () => {
  it('says nothing while idle, and explains a disabled updater', () => {
    expect(describeUpdate({ state: 'idle', version: v })).toBe('')
    expect(describeUpdate({ state: 'disabled', version: v, reason: 'Updates only work in the installed app.' })).toBe('Updates only work in the installed app.')
  })

  it('reports progress and readiness with the new version', () => {
    expect(describeUpdate({ state: 'downloading', version: v, newVersion: '0.8.0', percent: 41.6 })).toBe('Downloading 0.8.0… 42%')
    expect(describeUpdate({ state: 'ready', version: v, newVersion: '0.8.0' })).toBe('0.8.0 is ready to install.')
  })

  it('reports checking, up to date and errors', () => {
    expect(describeUpdate({ state: 'checking', version: v })).toBe('Checking for updates…')
    expect(describeUpdate({ state: 'uptodate', version: v })).toBe('You have the latest version.')
    expect(describeUpdate({ state: 'error', version: v, message: 'net::ERR_INTERNET_DISCONNECTED' })).toBe("Couldn't check for updates: net::ERR_INTERNET_DISCONNECTED")
  })
})

describe('canCheckForUpdates', () => {
  it('only offers a manual check when nothing is in flight or waiting', () => {
    const allowed = (s: UpdateStatus) => canCheckForUpdates(s)
    expect(allowed({ state: 'idle', version: v })).toBe(true)
    expect(allowed({ state: 'uptodate', version: v })).toBe(true)
    expect(allowed({ state: 'error', version: v, message: 'x' })).toBe(true)
    expect(allowed({ state: 'checking', version: v })).toBe(false)
    expect(allowed({ state: 'downloading', version: v, newVersion: '0.8.0', percent: 1 })).toBe(false)
    expect(allowed({ state: 'ready', version: v, newVersion: '0.8.0' })).toBe(false)
    expect(allowed({ state: 'disabled', version: v, reason: 'r' })).toBe(false)
  })
})

describe('shortUpdateError', () => {
  it('keeps just the first line, and caps its length', () => {
    expect(shortUpdateError(new Error('Cannot find latest.yml\n  at Foo.bar (file.js:1:1)\n  at ...'))).toBe('Cannot find latest.yml')
    expect(shortUpdateError('plain string')).toBe('plain string')
    expect(shortUpdateError(new Error('x'.repeat(300))).length).toBe(138)
    expect(shortUpdateError(new Error(''))).toBe('unknown error')
  })
})
