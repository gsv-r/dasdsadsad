import { describe, expect, it } from 'vitest'
import { nextFlowAction } from './useAppUpdate.js'

describe('nextFlowAction', () => {
  it('does nothing unless the user started the flow', () => {
    expect(nextFlowAction('available', false, null)).toBeNull()
    expect(nextFlowAction('downloaded', false, null)).toBeNull()
    expect(nextFlowAction('checking', false, null)).toBeNull()
  })

  it('downloads once when a newer version is found', () => {
    expect(nextFlowAction('available', true, null)).toBe('download')
    // Already acted on this version: no duplicate download.
    expect(nextFlowAction('available', true, 'available')).toBeNull()
  })

  it('installs once the download finishes', () => {
    expect(nextFlowAction('downloaded', true, 'available')).toBe('install')
    // Already acted on this download: no duplicate install.
    expect(nextFlowAction('downloaded', true, 'downloaded')).toBeNull()
  })

  it('stops the flow when up to date, on error, or back to idle', () => {
    expect(nextFlowAction('up-to-date', true, null)).toBe('stop')
    expect(nextFlowAction('error', true, 'available')).toBe('stop')
    expect(nextFlowAction('idle', true, null)).toBe('stop')
  })

  it('waits through in-between states', () => {
    expect(nextFlowAction('checking', true, null)).toBeNull()
    expect(nextFlowAction('downloading', true, 'available')).toBeNull()
    expect(nextFlowAction('installing', true, 'downloaded')).toBeNull()
  })
})
