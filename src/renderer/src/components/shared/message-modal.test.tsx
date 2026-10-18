/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

import MessageModal from './message-modal'

describe('MessageModal', () => {
  it('does not close on Escape: modals close only via their buttons', () => {
    const onClose = vi.fn()
    render(
      <MessageModal open title="Test" message="Test message" onClose={onClose} />,
    )

    fireEvent.keyDown(document.querySelector('[data-slot="message-modal-overlay"]')!, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alertdialog"]')).toBeTruthy()
  })

  it('does not render when closed', () => {
    const onClose = vi.fn()
    const { container } = render(
      <MessageModal open={false} title="Test" message="Test message" onClose={onClose} />,
    )

    expect(container.innerHTML).toBe('')
  })
})
