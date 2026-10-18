import { useEffect, useState } from 'react'

// Syncs the window maximized state with the renderer.
// The first frame renders with the "maximize" icon (initial state when the
// window opens) and reconciles silently once the main process responds;
// it never flickers between states. The main listener is removed on
// component cleanup.
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
