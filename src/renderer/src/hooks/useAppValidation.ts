import { useCallback } from 'react'
import { useMessage } from '@renderer/components/shared/message-modal-context'
import { validateAppOrNotify } from '../lib/app-validation'

// Reusable hook for any flow that requires a valid configuration.
export function useAppValidation(): {
  ensureValid: () => Promise<boolean>
} {
  const { showMessage } = useMessage()

  const ensureValid = useCallback(() => validateAppOrNotify(showMessage), [showMessage])

  return { ensureValid }
}
