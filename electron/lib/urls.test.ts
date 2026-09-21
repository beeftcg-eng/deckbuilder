import { describe, expect, it } from 'vitest'
import { isWebUrl } from './urls'

describe('isWebUrl', () => {
  it('accepts web addresses', () => {
    expect(isWebUrl('https://dpaste.com/ABC123')).toBe(true)
    expect(isWebUrl('http://example.com/a?b=c')).toBe(true)
  })

  it('refuses anything that could launch a local program or read a local file', () => {
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'ms-msdt:/id', 'steam://run/1', 'data:text/html,hi', 'dbimg://ygo/small/1.jpg', 'not a url', '']) {
      expect(isWebUrl(bad), bad).toBe(false)
    }
  })
})
