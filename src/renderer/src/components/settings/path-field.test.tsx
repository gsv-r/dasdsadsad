/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PathField from './path-field'

function renderField(props: Partial<Parameters<typeof PathField>[0]> = {}): void {
  render(
    <PathField
      label="Steam Path"
      inputId="settings-steam-path"
      value=""
      placeholder="Steam not found"
      isManual={false}
      onCommit={() => true}
      onReset={() => undefined}
      {...props}
    />
  )
}

function errorSlot(): HTMLElement | null {
  return document.querySelector('[aria-live="polite"]')
}

describe('PathField error slot', () => {
  afterEach(() => {
    cleanup()
  })

  it('always mounts the slot with aria-live="polite"', () => {
    renderField()
    expect(errorSlot()?.getAttribute('aria-live')).toBe('polite')
  })

  it('without error the slot is empty and occupies no text', () => {
    renderField()
    expect(screen.queryByText(/invalid/i)).toBeNull()
    expect(screen.queryByText(/fix it above/i)).toBeNull()
    expect(errorSlot()?.textContent).toBe('')
  })

  it('without error the slot carries empty:hidden so it collapses', () => {
    renderField()
    expect(errorSlot()?.className).toContain('empty:hidden')
  })

  it('shows the commit error text when error is set', () => {
    renderField({ error: 'The mods folder was rejected.' })
    expect(screen.getByText('The mods folder was rejected.')).toBeTruthy()
    expect(errorSlot()?.getAttribute('aria-live')).toBe('polite')
  })

  it('shows the saved-path hint when invalid and no error', () => {
    renderField({ invalid: true })
    expect(
      screen.getByText('The saved path is invalid. Fix it above, or use reset / auto detect.')
    ).toBeTruthy()
  })

  it('error takes precedence over invalid hint', () => {
    renderField({ error: 'rejected', invalid: true })
    expect(screen.getByText('rejected')).toBeTruthy()
    expect(screen.queryByText('The saved path is invalid.')).toBeNull()
  })
})

describe('PathField manual badge', () => {
  afterEach(() => {
    cleanup()
  })

  it('valid manual uses the green class, not the red one', () => {
    renderField({ isManual: true })
    const badge = screen.getByText('manual')
    expect(badge.className).toContain('text-kd-lime')
    expect(badge.className).toContain('border-kd-lime')
    expect(badge.className).not.toContain('text-primary')
    expect(badge.className).not.toContain('border-primary')
  })

  it('invalid manual keeps the red class and shows the hint', () => {
    renderField({ isManual: true, invalid: true })
    const badge = screen.getByText('manual')
    expect(badge.className).toContain('text-primary')
    expect(badge.className).toContain('border-primary')
    expect(
      screen.getByText('The saved path is invalid. Fix it above, or use reset / auto detect.')
    ).toBeTruthy()
  })

  it('manual with a commit error keeps the red class and shows the error text', () => {
    renderField({ isManual: true, error: 'The mods folder was rejected.' })
    const badge = screen.getByText('manual')
    expect(badge.className).toContain('text-primary')
    expect(badge.className).toContain('border-primary')
    expect(screen.getByText('The mods folder was rejected.')).toBeTruthy()
  })
})
