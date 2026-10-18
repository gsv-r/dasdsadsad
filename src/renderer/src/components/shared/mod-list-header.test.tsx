/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ModListHeader from './mod-list-header'

function renderHeader(
  count: number,
  ready: boolean,
  loaded: boolean,
  modsPath: string,
  modsPathLoaded = false
): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <ModListHeader
        label="bikes"
        count={count}
        loaded={loaded}
        modsPathLoaded={modsPathLoaded}
        modsPath={modsPath}
        searchValue=""
        searchPlaceholder="Search bikes"
        searchDisabled={!ready}
        onSearchChange={() => undefined}
      />
    </MemoryRouter>
  )
  return container
}

describe('ModListHeader counter', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders an empty slot on first load without snapshot and path unknown', () => {
    const container = renderHeader(3, false, false, '/mods')
    expect(screen.getByText('bikes')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('3')).toBeNull()
    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge?.textContent).toBe('')
  })

  it('shows the count when loaded with items', () => {
    renderHeader(2, true, true, '/mods')
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('shows zero when loaded and empty', () => {
    renderHeader(0, true, true, '/mods')
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('shows zero when loaded and mods path is empty (post-reset)', () => {
    renderHeader(0, false, true, '')
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('shows zero when path is empty and snapshot is stale valid', () => {
    renderHeader(0, true, true, '')
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('shows zero on invalid mods (valid false, ready false)', () => {
    renderHeader(0, false, true, '/mods')
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('stays empty on first load when mods path is empty but not yet known', () => {
    const container = renderHeader(0, false, false, '', false)
    expect(screen.queryByText('0')).toBeNull()
    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge?.textContent).toBe('')
  })

  it('shows zero when mods path is empty and paths are already known (post-reset)', () => {
    renderHeader(0, false, false, '', true)
    expect(screen.getByText('0')).toBeTruthy()
  })
})
