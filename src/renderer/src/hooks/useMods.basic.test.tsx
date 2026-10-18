/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import Bikes from '../screens/bikes'
import { deferred, makeBikeFixture, renderWithProviders, stubRendererWindow } from '../test-utils'
import { invalidateModsHydration, invalidateModsSnapshot, BIKES_FIXED_MESSAGE } from './useMods'
import type { ModsSnapshot } from '../../../types/mods'

function pendingMods(): Promise<ModsSnapshot> {
  return new Promise<ModsSnapshot>(() => undefined)
}

function stubModsGetAll(): ReturnType<typeof vi.fn> {
  const getAll = vi.fn((): Promise<ModsSnapshot> => pendingMods())
  window.mods.getAll = getAll
  return getAll
}

describe('useMods hydration invalidation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    invalidateModsSnapshot()
    stubRendererWindow()
  })

  afterEach(() => {
    cleanup()
  })

  it('(a) changing Mods Path valid A -> valid B triggers new fetch; old mods shown during transition, new mods appear after fetch', async () => {
    const getAll = stubModsGetAll()
    const gateA = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gateA.promise)

    const first = renderWithProviders(<Bikes />)
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy()

    gateA.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-a', name: 'Bike A' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike A')
    first.unmount()

    invalidateModsHydration()
    window.dispatchEvent(new Event('mods:revalidate'))

    const getAllB = stubModsGetAll()
    const gateB = deferred<ModsSnapshot>()
    getAllB.mockReturnValue(gateB.promise)

    const second = renderWithProviders(<Bikes />)
    // Old mods still visible during transition
    expect(screen.getByText('Bike A')).toBeTruthy()

    gateB.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike B')

    expect(getAllB).toHaveBeenCalled()
    expect(screen.queryByText('Bike A')).toBeNull()
    second.unmount()
  })

  it('(b) without mounted component, next mount does not use stale hydration', async () => {
    const getAll = stubModsGetAll()
    const gate = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gate.promise)

    const first = renderWithProviders(<Bikes />)
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy()

    gate.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-a', name: 'Bike A' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike A')
    first.unmount()

    invalidateModsHydration()

    const getAllFresh = stubModsGetAll()
    const gateFresh = deferred<ModsSnapshot>()
    getAllFresh.mockReturnValue(gateFresh.promise)

    const second = renderWithProviders(<Bikes />)
    // Old mods still visible (snapshot retained) until new fetch completes
    expect(screen.getByText('Bike A')).toBeTruthy()

    gateFresh.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike B')

    expect(getAllFresh).toHaveBeenCalled()
    second.unmount()
  })

  it('(c) invalid path: main invalidates cache, renderer receives valid=false snapshot', async () => {
    const getAll = stubModsGetAll()
    const gate = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gate.promise)

    const first = renderWithProviders(<Bikes />)
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy()

    gate.resolve({ valid: false, ready: true, mods: { bikes: [] } })
    await act(async () => {})

    expect(screen.queryByText(BIKES_FIXED_MESSAGE)).toBeNull()
    expect(screen.getByText('Mods folder is invalid. Check Mods Path in Settings.')).toBeTruthy()
    first.unmount()

    const seeded = stubModsGetAll()
    const second = renderWithProviders(<Bikes />)

    expect(screen.queryByText(BIKES_FIXED_MESSAGE)).toBeNull()
    expect(screen.getByText('Mods folder is invalid. Check Mods Path in Settings.')).toBeTruthy()
    expect(seeded).not.toHaveBeenCalled()
    second.unmount()
  })

  it('(d) focus (force=false) does not refetch when snapshot already valid', async () => {
    const getAll = stubModsGetAll()
    const gate = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gate.promise)

    const first = renderWithProviders(<Bikes />)
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy()

    gate.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-a', name: 'Bike A' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike A')
    first.unmount()

    const getAllCached = stubModsGetAll()
    const second = renderWithProviders(<Bikes />)
    expect(screen.getByText('Bike A')).toBeTruthy()
    expect(getAllCached).not.toHaveBeenCalled()
    second.unmount()

    const getAllFocus = stubModsGetAll()
    const third = renderWithProviders(<Bikes />)
    expect(screen.getByText('Bike A')).toBeTruthy()

    window.dispatchEvent(new Event('focus'))
    await act(async () => {})

    expect(getAllFocus).not.toHaveBeenCalled()
    third.unmount()
  })

  it('(f) the initial load refetches, and focus does not add a second fetch', async () => {
    const getAll = stubModsGetAll()
    const gate = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gate.promise)

    const first = renderWithProviders(<Bikes />)
    gate.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-a', name: 'Bike A' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike A')

    // The initial load is what hydrated the list: exactly one fetch so far.
    expect(getAll).toHaveBeenCalledTimes(1)
    first.unmount()

    // Focus asks the renderer nothing: main owns the focus refresh, so a
    // valid snapshot is a no-op here (pinned by (d)).
    window.dispatchEvent(new Event('focus'))
    await act(async () => {})
    expect(getAll).toHaveBeenCalledTimes(1)
  })

  it('(g) the refresh button scans without clearing the snapshot or refetching', async () => {
    const getAll = stubModsGetAll()
    const gate = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gate.promise)

    const refresh = vi.fn((): Promise<void> => Promise.resolve())
    window.mods.refresh = refresh

    renderWithProviders(<Bikes />)
    gate.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-a', name: 'Bike A' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike A')
    expect(getAll).toHaveBeenCalledTimes(1)

    const button = screen.getByRole('button', { name: 'Refresh' })
    await act(async () => {
      fireEvent.click(button)
    })

    // One explicit scan, and no extra mods:getAll: the scan lives in main.
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(getAll).toHaveBeenCalledTimes(1)
    // The list never emptied while the scan ran.
    expect(screen.getByText('Bike A')).toBeTruthy()
  })

  it('(h) a refresh in flight disables the button, then re-enables it', async () => {
    stubModsGetAll()
    const gate = deferred<void>()
    window.mods.refresh = vi.fn((): Promise<void> => gate.promise)

    renderWithProviders(<Bikes />)
    const button = screen.getByRole('button', { name: 'Refresh' })
    expect(button.hasAttribute('disabled')).toBe(false)

    await act(async () => {
      fireEvent.click(button)
    })
    // Disabled during the scan, so a double click cannot fire twice.
    expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(true)

    await act(async () => {
      gate.resolve()
    })
    expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(false)
  })

  it('(e) invalidateModsHydration clears only hydration state, not snapshot', async () => {
    const getAll = stubModsGetAll()
    const gate = deferred<ModsSnapshot>()
    getAll.mockReturnValue(gate.promise)

    const first = renderWithProviders(<Bikes />)
    gate.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-a', name: 'Bike A' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike A')
    first.unmount()

    invalidateModsHydration()

    const getAllFresh = stubModsGetAll()
    const gateFresh = deferred<ModsSnapshot>()
    getAllFresh.mockReturnValue(gateFresh.promise)

    const second = renderWithProviders(<Bikes />)
    // Old mods still visible (snapshot retained) until new fetch completes
    expect(screen.getByText('Bike A')).toBeTruthy()

    gateFresh.resolve({
      valid: true,
      ready: true,
      mods: { bikes: [makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] }
    })
    await act(async () => {})
    await screen.findByText('Bike B')

    expect(getAllFresh).toHaveBeenCalled()
    second.unmount()
  })
})
