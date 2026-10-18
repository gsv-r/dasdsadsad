import { IconAlertCircle, IconAlertTriangle, IconInfoCircle, IconX } from '@tabler/icons-react'

import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Icon as UiIcon } from '../ui/icon'
import type { MessageAction } from './message-modal-context'

export type MessageType = 'error' | 'warning' | 'info'

const TYPE_CONFIG: Record<MessageType, { icon: typeof IconInfoCircle }> = {
  error: { icon: IconAlertCircle },
  warning: { icon: IconAlertTriangle },
  info: { icon: IconInfoCircle }
}

export default function MessageModal({
  open,
  title,
  message,
  type = 'info',
  action,
  confirmLabel = 'confirm',
  confirmVariant = 'default',
  onClose,
  onAction,
  onConfirm
}: {
  open: boolean
  title: string
  message: string
  type?: MessageType
  action?: MessageAction
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive'
  onClose: () => void
  onAction?: (action: MessageAction) => void
  onConfirm?: () => void
}): React.JSX.Element | null {
  if (!open) return null

  const { icon: TablerIcon } = TYPE_CONFIG[type]

  return (
    <div
      data-slot="message-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <Card
        data-slot="message-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md gap-4 border-border py-4"
      >
        <CardHeader className="flex flex-row items-center gap-2 pb-0">
          <UiIcon component={TablerIcon} size={16} aria-hidden="true" />
          <CardTitle className="flex-1 text-sm font-medium tracking-wide uppercase">
            {title}
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0"
          >
            <UiIcon component={IconX} size={16} aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground select-text">{message}</p>
          <div className="flex justify-end gap-2">
            {onConfirm ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="shrink-0 uppercase"
                >
                  cancel
                </Button>
                <Button
                  type="button"
                  variant={confirmVariant}
                  onClick={onConfirm}
                  className="shrink-0 uppercase"
                >
                  {confirmLabel}
                </Button>
              </>
            ) : (
              <>
                {action && onAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onAction(action)}
                    className="shrink-0 uppercase"
                  >
                    {action.label}
                  </Button>
                ) : null}
                <Button type="button" onClick={onClose} className="shrink-0 uppercase">
                  close
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
