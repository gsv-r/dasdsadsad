/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import ResetTab from './reset-tab'
import { renderWithProviders, stubRendererWindow } from '../../test-utils'

describe('ResetTab', () => {
  beforeEach(() => {
    window.localStorage.clear()
    stubRendererWindow()
  })

  afterEach(() => {
    cleanup()
  })

  it('opens the modal on reset click', () => {
    renderWithProviders(<ResetTab />)

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))

    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('does not close on Escape: modals close only via their buttons', () => {
    renderWithProviders(<ResetTab />)

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    fireEvent.keyDown(document.querySelector('[data-slot="message-modal-overlay"]')!, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })
})
