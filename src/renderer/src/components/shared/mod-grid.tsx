import type { ReactNode } from 'react'
import { Card, CardContent } from '../ui/card'

type ModGridProps = {
  isEmpty: boolean
  fixedMessage: string
  invalidMessage: string
  children: ReactNode
}

function ModGridEmpty({ fixedMessage, invalidMessage }: { fixedMessage: string; invalidMessage: string }): React.JSX.Element {
  return (
    <Card>
      <CardContent className="text-muted-foreground py-10 text-center text-sm tracking-wide uppercase">
        {invalidMessage ? (
          <p aria-live="polite" className="text-destructive">{invalidMessage}</p>
        ) : (
          <p>{fixedMessage}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function ModGrid({
  isEmpty,
  fixedMessage,
  invalidMessage,
  children
}: ModGridProps): React.JSX.Element {
  if (isEmpty) return <ModGridEmpty fixedMessage={fixedMessage} invalidMessage={invalidMessage} />

  return <div className="grid grid-cols-4 gap-2">{children}</div>
}
