import { useEffect, useState } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import Practice from './screens/practice'
import Bikes from './screens/bikes'
import Tracks from './screens/tracks'
import Profile from './screens/profile'
import Settings from './screens/settings'
import { MessageModalProvider } from './components/shared/message-modal-provider'
import { LoadingDots } from './components/shared/loading-dots'

// eslint-disable-next-line react-refresh/only-export-components
export const router = createHashRouter([
  { path: '/', element: <Practice /> },
  { path: '/bikes', element: <Bikes /> },
  { path: '/tracks', element: <Tracks /> },
  { path: '/profile', element: <Profile /> },
  { path: '/settings', element: <Settings /> }
])

export default function App({ reloadPending }: { reloadPending: boolean }): React.JSX.Element {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    if (!reloadPending) return
    const timer = setTimeout(() => setMinTimeElapsed(true), 1500)
    return () => clearTimeout(timer)
  }, [reloadPending])

  useEffect(() => {
    if (!reloadPending) return
    ;(document.fonts?.ready ?? Promise.resolve()).then(() => setFontsReady(true))
  }, [reloadPending])

  const showOverlay = reloadPending && (!minTimeElapsed || !fontsReady)

  return (
    <MessageModalProvider>
      {showOverlay && (
        <div className="fixed inset-0 bg-background z-[50] flex items-center justify-center">
          <LoadingDots centered />
        </div>
      )}
      <RouterProvider router={router} />
    </MessageModalProvider>
  )
}
