import { createContext, useContext } from 'react'
import type { MessageType } from './message-modal'

export interface MessageAction {
  label: string
  to: string
}

export interface MessagePayload {
  title: string
  message: string
  type: MessageType
  action?: MessageAction
}

export interface MessageModalContextValue {
  showMessage: (payload: MessagePayload) => void
  closeMessage: () => void
}

export const MessageModalContext = createContext<MessageModalContextValue | null>(null)

export function useMessage(): MessageModalContextValue {
  const ctx = useContext(MessageModalContext)
  if (!ctx) throw new Error('useMessage must be used within MessageModalProvider')
  return ctx
}
