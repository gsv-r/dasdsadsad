import { describe, expect, it } from 'vitest'
import { isSetupLockedResult, saveFailureMessage } from './practice-save.js'

describe('isSetupLockedResult', () => {
  it.each([[null], [undefined], ['locked'], [0], [true], [{}], [{ ok: true }]])(
    'returns false for %s',
    (value) => {
      expect(isSetupLockedResult(value)).toBe(false)
    }
  )

  it('returns true only for an object with ok false', () => {
    expect(isSetupLockedResult({ ok: false })).toBe(true)
    expect(isSetupLockedResult({ ok: false, reason: 'setup-locked' })).toBe(true)
  })
})

describe('saveFailureMessage', () => {
  it('names the field in a fixed message', () => {
    expect(saveFailureMessage('Paint')).toBe('Could not save Paint. Try again.')
    expect(saveFailureMessage('Riding Style')).toBe('Could not save Riding Style. Try again.')
  })
})
