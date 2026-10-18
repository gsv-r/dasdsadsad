import { NavLink } from 'react-router-dom'
import { IconBrandDiscord, IconFlag, IconHeartHandshake, IconSettings } from '@tabler/icons-react'
import { Icon as UiIcon } from '@renderer/components/ui/icon'

import { cn } from '@renderer/lib/utils'
import { Badge } from '../ui/badge'
import GoRide from './go-ride'
import { DISCORD_INVITE_URL, SUPPORT_URL } from './constants'
import { formatAppVersion, useAppVersion } from '@renderer/hooks/useAppVersion'

const ITEM_CLASSES =
  'flex w-full cursor-pointer flex-row items-center gap-2.5 rounded-none px-4 py-3.5 text-sm font-medium tracking-wider text-nav-text uppercase transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// O acento ativo é --kd-lime (text-ring): o design system (§3) reserva o vermelho
// para o CTA principal (Go Ride) e o destaque do logotipo; o verde-lima é o
// acento seletivo para estados ativos, preservando a hierarquia de cor.
const ITEM_ACTIVE_CLASSES = 'text-ring'

const SECTION_CLASSES =
  'px-4 text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase'

function SidebarLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; end?: boolean }): React.JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      data-slot="sidebar-menu-button"
      className={({ isActive }): string => cn(ITEM_CLASSES, isActive && ITEM_ACTIVE_CLASSES)}
    >
      <UiIcon component={Icon} size={24} aria-hidden="true" />
      <span className="leading-none">{label}</span>
    </NavLink>
  )
}

export default function SidebarLeft(): React.JSX.Element {
  // Installed version comes from the main process at runtime, so the footer
  // always reflects the current build (including right after an update).
  const appVersion = useAppVersion()

  return (
    <aside
      data-slot="frame-sidebar"
      className="flex min-h-0 w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-2"
    >
      <nav aria-label="Primary" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className={SECTION_CLASSES}>launch</p>
          <GoRide />
        </div>
        <div className="flex flex-col gap-1">
          <p className={SECTION_CLASSES}>ride</p>
          <SidebarLink to="/" label="practice" icon={IconFlag} end />
        </div>
      </nav>

      <div className="mt-auto mb-2 flex flex-col gap-1">
        <p className={SECTION_CLASSES}>more</p>
        <button
          type="button"
          aria-label="discord"
          data-slot="sidebar-menu-button"
          onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
          className={ITEM_CLASSES}
        >
          <UiIcon component={IconBrandDiscord} size={24} aria-hidden="true" />
          <span className="leading-none">discord</span>
        </button>
        <button
          type="button"
          aria-label="support"
          data-slot="sidebar-menu-button"
          onClick={() => window.open(SUPPORT_URL, '_blank')}
          className={ITEM_CLASSES}
        >
          <UiIcon component={IconHeartHandshake} size={24} aria-hidden="true" />
          <span className="leading-none">support</span>
        </button>
      </div>

      <nav aria-label="Secondary" className="mb-2 flex flex-col gap-1 border-t border-sidebar-border pt-2">
        <SidebarLink to="/settings" label="settings" icon={IconSettings} />
        <div className="flex items-center justify-between px-3 pt-1">
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground/70">
            {formatAppVersion(appVersion) ?? ''}
          </p>
          <Badge
            variant="outline"
            className="border-primary px-2 py-0 text-[10px] font-medium tracking-widest text-primary uppercase"
          >
            Beta
          </Badge>
        </div>
      </nav>
    </aside>
  )
}
