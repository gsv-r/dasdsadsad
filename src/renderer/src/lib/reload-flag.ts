const KEY = 'kd:reload-pending'

export function setReloadFlag(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // Storage indisponível não quebra o fluxo.
  }
}

export function consumeReloadFlag(): boolean {
  try {
    const value = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return value === '1'
  } catch {
    return false
  }
}
