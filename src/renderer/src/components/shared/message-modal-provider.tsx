import { useCallback, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

import MessageModal from './message-modal'
import {
  MessageModalContext,
  type MessageAction,
  type MessagePayload
} from './message-modal-context'

export function MessageModalProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [current, setCurrent] = useState<MessagePayload | null>(null)

  const showMessage = useCallback((payload: MessagePayload) => {
    // Last message wins, so simultaneous failures collapse into a single modal.
    setCurrent(payload)
  }, [])

  const closeMessage = useCallback(() => {
    setCurrent(null)
  }, [])

  const handleAction = useCallback((action: MessageAction) => {
    setCurrent(null)
    // The router lives below this provider, so navigate via hash.
    // Only absolute in-app routes are honored.
    const to = action.to.startsWith('/') ? action.to : `/${action.to}`
    window.location.hash = `#${to}`
  }, [])

  const value = useMemo(() => ({ showMessage, closeMessage }), [showMessage, closeMessage])

  return (
    <MessageModalContext.Provider value={value}>
      {children}
      <MessageModal
        open={current !== null}
        title={current?.title ?? ''}
        message={current?.message ?? ''}
        type={current?.type ?? 'info'}
        action={current?.action}
        onClose={closeMessage}
        onAction={handleAction}
      />
    </MessageModalContext.Provider>
  )
}
