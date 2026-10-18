import * as React from 'react'

import { cn } from '@renderer/lib/utils'

function Input({ className, ...props }: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      data-slot="input"
      className={cn(
        'border-input flex h-9 w-full min-w-0 rounded-none border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none select-text placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Input }
