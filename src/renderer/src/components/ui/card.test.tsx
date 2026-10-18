/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Card } from './card'

afterEach(() => {
  cleanup()
})

describe('Card primitive', () => {
  it('uses gap-3 between header and content', () => {
    render(<Card>content</Card>)
    const card = screen.getByText('content').closest('[data-slot="card"]')!
    expect(card.className).toContain('gap-3')
    expect(card.className).not.toContain('gap-6')
  })
})
