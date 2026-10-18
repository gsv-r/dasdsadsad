import type { PropsWithChildren } from 'react'
import { cn } from '@renderer/lib/utils'
import NavBar from './navbar'
import SidebarLeft from './sidebar-left'
import SidebarRight from './sidebar-right'
import TitleBar from './titlebar'

export default function Layout({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <div
      data-slot="frame-layout"
      className="flex h-screen flex-col overflow-hidden bg-background text-foreground"
    >
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <SidebarLeft />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <NavBar />

          <main
            data-slot="frame-content"
            className={cn('min-h-0 min-w-0 flex-1 overflow-hidden px-4 pb-4')}
          >
            {children}
          </main>
        </div>

        <SidebarRight />
      </div>
    </div>
  )
}
