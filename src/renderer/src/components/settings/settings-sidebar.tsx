import { cn } from '@renderer/lib/utils'

export type SettingsTabId = 'paths' | 'reset'

const ITEM_CLASSES =
  'flex w-full cursor-pointer flex-row items-center gap-2 rounded-none px-3 py-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const ITEM_ACTIVE_CLASSES = 'bg-sidebar-accent text-sidebar-accent-foreground'

export default function SettingsSidebar({
  active,
  onSelect
}: {
  active: SettingsTabId
  onSelect: (tab: SettingsTabId) => void
}): React.JSX.Element {
  return (
    <aside
      data-slot="settings-sidebar"
      className="flex min-h-0 w-48 shrink-0 flex-col gap-1 border-r border-sidebar-border pr-4"
    >
      <button
        type="button"
        data-slot="settings-tab-button"
        aria-current={active === 'paths' ? 'page' : undefined}
        onClick={() => onSelect('paths')}
        className={cn(ITEM_CLASSES, active === 'paths' && ITEM_ACTIVE_CLASSES)}
      >
        <span className="leading-none">paths</span>
      </button>
      <button
        type="button"
        data-slot="settings-tab-button"
        aria-current={active === 'reset' ? 'page' : undefined}
        onClick={() => onSelect('reset')}
        className={cn(ITEM_CLASSES, active === 'reset' && ITEM_ACTIVE_CLASSES)}
      >
        <span className="leading-none">reset</span>
      </button>
    </aside>
  )
}
