import { describe, expect, it } from 'vitest'
import { formatAppVersion } from './useAppVersion.js'

describe('formatAppVersion', () => {
  it('prefixes the installed version with v', () => {
    expect(formatAppVersion('0.1.4')).toBe('v0.1.4')
  })

  it('renders nothing while the version is unknown', () => {
    expect(formatAppVersion(null)).toBeNull()
  })

  it('never falls back to a hardcoded version', () => {
    expect(formatAppVersion('0.2.0')).toBe('v0.2.0')
    expect(formatAppVersion('')).toBeNull()
  })
})
