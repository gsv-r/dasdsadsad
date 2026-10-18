/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LoadingDots } from './loading-dots'

afterEach(() => {
  cleanup()
})

describe('LoadingDots', () => {
  it('renderiza três bolinhas com role de status e aria-label fixo', () => {
    render(<LoadingDots />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-label')).toBe('Reloading')
    const dots = status.querySelectorAll('span')
    expect(dots.length).toBe(3)
    dots.forEach((dot) => {
      expect(dot.classList.contains('w-2.5')).toBe(true)
      expect(dot.classList.contains('h-2.5')).toBe(true)
      expect(dot.classList.contains('rounded-full')).toBe(true)
      expect(dot.classList.contains('bg-kd-lime')).toBe(true)
    })
  })

  it('está fora do fluxo (position absolute) e sem pointer events', () => {
    render(<LoadingDots />)
    const container = screen.getByRole('status')
    expect(container.classList.contains('absolute')).toBe(true)
    expect(container.classList.contains('pointer-events-none')).toBe(true)
    expect(container.classList.contains('z-[51]')).toBe(true)
  })
})
