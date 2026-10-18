import { NavLink, useLocation } from 'react-router-dom'
import { IconUser } from '@tabler/icons-react'
import { Icon } from '@renderer/components/ui/icon'
import { cn } from '@renderer/lib/utils'

// Compact right rail with the profile entry point. It reuses the SidebarLeft
// hover/focus/transition pattern; the active state adds a border/surface
// indicator beyond the accent color so the route is not signaled by color alone.
export default function SidebarRight(): React.JSX.Element {
  const { pathname } = useLocation()
  const active = pathname === '/profile'

  return (
    <aside
      data-slot="frame-sidebar-right"
      className="flex min-h-0 w-24 shrink-0 flex-col items-center bg-sidebar px-2 py-2"
    >
      <NavLink
        to="/profile"
        aria-label="profile"
        data-slot="sidebar-menu-button"
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex size-14 items-center justify-center rounded-none border text-nav-text outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          active ? 'border-sidebar-border bg-sidebar-accent text-ring' : 'border-(--kd-border-button)'
        )}
      >
        <Icon component={IconUser} size={24} aria-hidden="true" />
      </NavLink>
    </aside>
  )
}
