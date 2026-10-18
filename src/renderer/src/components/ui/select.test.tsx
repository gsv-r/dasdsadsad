/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Select, SelectContent, SelectItem, SelectTrigger } from './select'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
  }
})

describe('Select primitive hover', () => {
  it('trigger exposes hover classes', () => {
    render(
      <Select>
        <SelectTrigger>pick</SelectTrigger>
      </Select>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).toContain('hover:bg-accent')
  })

  it('disabled trigger has no hover reaction', () => {
    render(
      <Select>
        <SelectTrigger disabled>pick</SelectTrigger>
      </Select>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).toContain('disabled:opacity-50')
    expect(trigger.className).toContain('disabled:cursor-not-allowed')
  })

  it('select item exposes hover and highlighted classes', async () => {
    render(
      <Select>
        <SelectTrigger>pick</SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
        </SelectContent>
      </Select>
    )
    fireEvent.click(screen.getByRole('combobox'))
    await waitFor(() => expect(screen.getByText('Option A')).toBeTruthy())
    const item = screen.getByText('Option A').closest('[data-slot="select-item"]')!
    expect(item.className).toContain('hover:bg-accent')
    expect(item.className).toContain('data-[highlighted]:bg-accent')
  })

  it('no hover uses lime or green', () => {
    render(
      <Select>
        <SelectTrigger>pick</SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
        </SelectContent>
      </Select>
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).not.toContain('lime')
    expect(trigger.className).not.toContain('green')
  })
})
