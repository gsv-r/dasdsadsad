/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSetupActive } from './setup-active.js'

describe('isSetupActive', () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).store
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).setups
  })

  it('returns true when setup_id is a non-empty string present in setups', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).store = { get: vi.fn().mockResolvedValue('abc') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setups = { list: vi.fn().mockResolvedValue([{ id: 'abc' }]) }
    await expect(isSetupActive()).resolves.toBe(true)
  })

  it('returns false when setup_id is empty', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).store = { get: vi.fn().mockResolvedValue('') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setups = { list: vi.fn().mockResolvedValue([{ id: 'abc' }]) }
    await expect(isSetupActive()).resolves.toBe(false)
  })

  it('returns false when setup_id is not in setups', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).store = { get: vi.fn().mockResolvedValue('zzz') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setups = { list: vi.fn().mockResolvedValue([{ id: 'abc' }]) }
    await expect(isSetupActive()).resolves.toBe(false)
  })

  it('returns false when setups is not an array', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).store = { get: vi.fn().mockResolvedValue('abc') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setups = { list: vi.fn().mockResolvedValue(null) }
    await expect(isSetupActive()).resolves.toBe(false)
  })

  it('returns false when setup_id is not a string', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).store = { get: vi.fn().mockResolvedValue(42) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setups = { list: vi.fn().mockResolvedValue([{ id: 'abc' }]) }
    await expect(isSetupActive()).resolves.toBe(false)
  })

  it('returns false on IPC failure', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).store = { get: vi.fn().mockRejectedValue(new Error('boom')) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).setups = { list: vi.fn().mockResolvedValue([]) }
    await expect(isSetupActive()).resolves.toBe(false)
  })
})
