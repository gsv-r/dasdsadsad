/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { consumeReloadFlag, setReloadFlag } from './reload-flag'

describe('reload-flag', () => {
  beforeEach(() => {
    // Limpa o storage entre testes
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('setReloadFlag grava a flag no sessionStorage', () => {
    setReloadFlag()
    expect(sessionStorage.getItem('kd:reload-pending')).toBe('1')
  })

  it('consumeReloadFlag lê e limpa a flag', () => {
    sessionStorage.setItem('kd:reload-pending', '1')
    expect(consumeReloadFlag()).toBe(true)
    expect(sessionStorage.getItem('kd:reload-pending')).toBeNull()
  })

  it('consumeReloadFlag retorna false quando não há flag', () => {
    expect(consumeReloadFlag()).toBe(false)
  })

  it('setReloadFlag não quebra quando sessionStorage está indisponível', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is unavailable')
    })
    expect(() => setReloadFlag()).not.toThrow()
  })

  it('consumeReloadFlag não quebra quando sessionStorage está indisponível', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage is unavailable')
    })
    expect(() => consumeReloadFlag()).not.toThrow()
    expect(consumeReloadFlag()).toBe(false)
  })
})
