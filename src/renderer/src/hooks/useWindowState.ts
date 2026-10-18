import { useEffect, useState } from 'react'

// Sincroniza o estado maximizado da janela com o renderer.
// O primeiro frame renderiza com o ícone de "maximizar" (estado inicial da
// janela ao abrir) e reconcilia em silêncio assim que o main responde;
// nunca pisca o ícone entre estados. O listener do main é desfeito no
// cleanup do componente.
export function useWindowState(): { isMaximized: boolean } {
  const [isMaximized, setIsMaximized] = useState<boolean>(false)

  useEffect((): (() => void) | void => {
    let cancelled = false

    void (async () => {
      if (cancelled) return
      try {
        setIsMaximized(await window.api.isMaximized())
      } catch {
        setIsMaximized(false)
      }
    })()

    const off = window.windowState.onChange((message) => {
      if (cancelled) return
      setIsMaximized(message.maximized)
    })

    return () => {
      cancelled = true
      off()
    }
  }, [])

  return { isMaximized }
}
