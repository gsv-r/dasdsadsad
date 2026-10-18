/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SetupsCard from './setups-card'
import { MessageModalProvider } from '../shared/message-modal-provider'
import { AUTO_STORE_KEYS, STORE_KEYS } from '../../lib/path-utils'
import {
  deferred,
  makeSetupFixture,
  renderWithProviders,
  stubRendererWindow,
} from '../../test-utils'
import type { ModsSnapshot } from '../../../../types/mods'
import { invalidateSetupsSnapshot } from '../../hooks/useSetups'
import { invalidateModsSnapshot } from '../../hooks/useMods'

describe('SetupsCard modals', () => {
  beforeEach(() => {
    window.localStorage.clear()
    invalidateSetupsSnapshot()
    invalidateModsSnapshot()
    stubRendererWindow()
  })

  afterEach(() => {
    cleanup()
  })

  // Renders under the real shared-modal provider so showMessage actually
  // opens the MessageModal (the shared harness stubs it as a no-op).
  function renderCardWithModal(): void {
    render(
      <MemoryRouter>
        <MessageModalProvider>
          <SetupsCard />
        </MessageModalProvider>
      </MemoryRouter>,
    )
  }

  // Seeds the effective Mods Path (manual ?? auto) through the same store
  // keys usePaths reads, so valueForKey resolves to the configured string.
  // Without it an unconfigured path surfaces as '' (the post-reset case).
  function seedModsPath(path: string): void {
    const get = (key: string): Promise<string | null> =>
      Promise.resolve(
        key === STORE_KEYS.mods || key === AUTO_STORE_KEYS.mods ? path : null
      )
    window.store.get = vi.fn(get) as typeof window.store.get
  }

  it('does not close the editor on Escape: modals close only via their buttons', async () => {
    const { setupsList } = stubRendererWindow()
    seedModsPath('/mods')
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]))
    renderWithProviders(<SetupsCard />)

    await screen.findByText('Setup A')
    const createButton = screen.getByRole('button', { name: /create setup/i })
    await waitFor(() => expect(createButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(createButton)
    await screen.findByRole('dialog')

    fireEvent.keyDown(document.querySelector('[data-slot="message-modal-overlay"]')!, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('shows an inline error when the setup name exceeds 32 characters', async () => {
    const { setupsList } = stubRendererWindow()
    seedModsPath('/mods')
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]))
    renderWithProviders(<SetupsCard />)

    await screen.findByText('Setup A')
    const createButton = screen.getByRole('button', { name: /create setup/i })
    await waitFor(() => expect(createButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(createButton)

    const nameInput = await screen.findByPlaceholderText('Setup name')
    fireEvent.change(nameInput, { target: { value: 'A'.repeat(33) } })
    fireEvent.click(screen.getByRole('button', { name: 'create' }))

    expect(screen.getByText('Setup name must be 32 characters or less.')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('delete confirmation uses the shared MessageModal', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]))
    renderWithProviders(<SetupsCard />)

    await screen.findByText('Setup A')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Setup A' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText('Delete setup?')).toBeTruthy()
  })

  it('shows the shared modal and not the editor when mods are invalid', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([]))
    window.mods.getAll = vi.fn(
      (): Promise<ModsSnapshot> => Promise.resolve({ valid: false, ready: true, mods: {} }),
    )
    seedModsPath('/mods')
    renderCardWithModal()

    const createButton = screen.getByRole('button', { name: /create setup/i })
    await waitFor(() => expect(createButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(createButton)

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Mods folder not set')).toBeTruthy()
    expect(
      within(dialog).getByText('Set a valid Mods Path in Settings to create setups.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the shared modal and not the editor after Reset leaves no Mods Path', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([]))
    window.mods.getAll = vi.fn(
      (): Promise<ModsSnapshot> => Promise.resolve({ valid: true, ready: true, mods: {} }),
    )
    renderCardWithModal()

    const createButton = screen.getByRole('button', { name: /create setup/i })
    await waitFor(() => expect(createButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(createButton)

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Mods folder not set')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the editor without a modal when mods are valid and ready', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([]))
    seedModsPath('/mods')
    renderCardWithModal()

    const createButton = screen.getByRole('button', { name: /create setup/i })
    await waitFor(() => expect(createButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(createButton)

    await screen.findByRole('dialog')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('opens neither modal nor editor while mods are pending', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([]))
    const gate = deferred<ModsSnapshot>()
    window.mods.getAll = vi.fn((): Promise<ModsSnapshot> => gate.promise)
    seedModsPath('/mods')
    renderCardWithModal()

    gate.resolve({ valid: true, ready: false, mods: {} })
    const createButton = screen.getByRole('button', { name: /create setup/i })
    await waitFor(() => expect(createButton.hasAttribute('disabled')).toBe(false))
    fireEvent.click(createButton)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows the shared modal and not the editor when editing with invalid mods', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]))
    window.mods.getAll = vi.fn(
      (): Promise<ModsSnapshot> => Promise.resolve({ valid: false, ready: true, mods: {} }),
    )
    seedModsPath('/mods')
    renderCardWithModal()

    await screen.findByText('Setup A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Setup A' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Mods folder not set')).toBeTruthy()
    expect(
      within(dialog).getByText('Set a valid Mods Path in Settings to create setups.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the editor without a modal when editing with valid mods', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]))
    seedModsPath('/mods')
    renderCardWithModal()

    await screen.findByText('Setup A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Setup A' }))

    await screen.findByRole('dialog')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('opens neither modal nor editor when editing while mods are pending', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]))
    const gate = deferred<ModsSnapshot>()
    window.mods.getAll = vi.fn((): Promise<ModsSnapshot> => gate.promise)
    seedModsPath('/mods')
    renderCardWithModal()

    gate.resolve({ valid: true, ready: false, mods: {} })
    await act(async () => {})
    await screen.findByText('Setup A')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Setup A' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('SetupsCard list scroll', () => {
  beforeEach(() => {
    window.localStorage.clear()
    invalidateSetupsSnapshot()
    invalidateModsSnapshot()
    stubRendererWindow()
  })

  afterEach(() => {
    cleanup()
  })

  // With many setups the list is the only scrollable area: the header
  // (title + create) and the fixed guidance stay outside it, so the list can
  // never push them or grow past the available screen area.
  it('the Setups card inherits the primitive gap-3 without a divergent override', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(Promise.resolve([]))
    renderWithProviders(<SetupsCard />)
    await waitFor(() => expect(screen.getByText('Setups')).toBeTruthy())
    const card = screen.getByText('Setups').closest('[data-slot="card"]')!
    expect(card.className).toContain('gap-3')
    expect(card.className).not.toMatch(/gap-[0246]/)
  })

  it('scrolls the setups list internally while the header controls stay outside it', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(
      Promise.resolve(
        Array.from({ length: 40 }, (_, i) =>
          makeSetupFixture({ id: `setup-${i}`, name: `Setup ${i + 1}` })
        )
      )
    )
    renderWithProviders(<SetupsCard />)

    await screen.findByText('Setup 40')

    const list = screen.getByText('Setup 40').closest('[data-slot="card"]')!.parentElement!
    expect(list.className).toContain('overflow-y-auto')

    const createButton = screen.getByRole('button', { name: /create setup/i })
    expect(list.contains(createButton)).toBe(false)
    expect(list.contains(screen.getByText('Setups'))).toBe(false)
    expect(
      list.contains(screen.getByText('Create setups here and apply them from Practice.'))
    ).toBe(false)
  })
})

describe('SetupsCard list max 4 rows', () => {
  beforeEach(() => {
    window.localStorage.clear()
    invalidateSetupsSnapshot()
    invalidateModsSnapshot()
    stubRendererWindow()
  })

  afterEach(() => {
    cleanup()
  })

  it('with 4 setups the list has no active overflow', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(
      Promise.resolve(
        Array.from({ length: 4 }, (_, i) =>
          makeSetupFixture({ id: `setup-${i}`, name: `Setup ${i + 1}` })
        )
      )
    )
    renderWithProviders(<SetupsCard />)

    await screen.findByText('Setup 4')

    const list = screen.getByText('Setup 4').closest('[data-slot="card"]')!.parentElement!
    expect(list.className).not.toContain('overflow-y-auto')
    expect(list.className).toContain('max-h-[calc(4*var(--setup-row-h)+3*var(--setup-gap))]')

    const createButton = screen.getByRole('button', { name: /create setup/i })
    expect(list.contains(createButton)).toBe(false)
    expect(list.contains(screen.getByText('Setups'))).toBe(false)
    expect(
      list.contains(screen.getByText('Create setups here and apply them from Practice.'))
    ).toBe(false)
  })

  it('with 5 or more setups the list has overflow-y-auto and the 4-row limit', async () => {
    const { setupsList } = stubRendererWindow()
    setupsList.mockReturnValue(
      Promise.resolve(
        Array.from({ length: 5 }, (_, i) =>
          makeSetupFixture({ id: `setup-${i}`, name: `Setup ${i + 1}` })
        )
      )
    )
    renderWithProviders(<SetupsCard />)

    await screen.findByText('Setup 5')

    const list = screen.getByText('Setup 5').closest('[data-slot="card"]')!.parentElement!
    expect(list.className).toContain('overflow-y-auto')
    expect(list.className).toContain('scroll')
    expect(list.className).toContain('max-h-[calc(4*var(--setup-row-h)+3*var(--setup-gap))]')

    // Each setup row has a fixed height and does not shrink, so the list
    // content overflows the 4-row max-height and the scroll activates.
    const rows = Array.from(list.querySelectorAll('[data-slot="card"]'))
    expect(rows.length).toBe(5)
    for (const row of rows) {
      expect(row.className).toContain('shrink-0')
      expect(row.className).toContain('h-[var(--setup-row-h)]')
    }

    const createButton = screen.getByRole('button', { name: /create setup/i })
    expect(list.contains(createButton)).toBe(false)
    expect(list.contains(screen.getByText('Setups'))).toBe(false)
    expect(
      list.contains(screen.getByText('Create setups here and apply them from Practice.'))
    ).toBe(false)
  })
})
