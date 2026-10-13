import { describe, expect, it } from 'vitest'
import { en } from './en'
import { pt } from './pt'
import { getLanguage, loadLanguage, setLanguage, t } from '.'

describe('languages that load when first used', () => {
  it('stays in English until the language is loaded, then switches', async () => {
    setLanguage('pt')
    expect(getLanguage()).toBe('en')
    expect(t).toBe(en)
    await loadLanguage('pt')
    setLanguage('pt')
    expect(getLanguage()).toBe('pt')
    expect(t).toEqual(pt)
  })
})
