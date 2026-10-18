import { useSyncExternalStore } from 'react'
import { IconLoader2, IconRefresh } from '@tabler/icons-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import ModSearchInput from './mod-search-input'
import { isRefreshingMods, refreshMods, subscribeModsRefresh } from '../../hooks/useMods'

type ModListHeaderProps = {
  label: string
  count: number
  loaded: boolean
  modsPathLoaded: boolean
  modsPath: string
  searchValue: string
  searchPlaceholder: string
  searchDisabled: boolean
  onSearchChange: (value: string) => void
}

export default function ModListHeader({
  label,
  count,
  loaded,
  modsPathLoaded,
  modsPath,
  searchValue,
  searchPlaceholder,
  searchDisabled,
  onSearchChange
}: ModListHeaderProps): React.JSX.Element {
  // `loaded` = a mods snapshot was already received (any `valid`/`ready`).
  // `modsPathLoaded && modsPath === ''` = the effective Mods Path is known to
  // be empty/not configured (e.g. post-reset), not merely not read yet.
  // Empty slot only on the first real load: no snapshot and Mods Path unknown.
  // Never depends on `ready`.
  const showCount = loaded || (modsPathLoaded && modsPath === '')
  // Same pattern as go-ride.tsx: the icon swaps in place, so the button keeps
  // a fixed size and the header never shifts while a scan runs.
  const refreshing = useSyncExternalStore(subscribeModsRefresh, isRefreshingMods, isRefreshingMods)
  return (
    <div className="flex min-w-0 items-center gap-2 pb-3">
      <span className="text-muted-foreground text-sm tracking-wide uppercase">{label}</span>
      <Badge variant="secondary" className="min-h-6 min-w-8 justify-center">
        {showCount ? count : ''}
      </Badge>
      <ModSearchInput
        value={searchValue}
        placeholder={searchPlaceholder}
        disabled={searchDisabled}
        onChange={onSearchChange}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void refreshMods()}
        disabled={refreshing}
        aria-label="Refresh"
        title="Refresh"
        className="shrink-0"
      >
        <Icon
          component={refreshing ? IconLoader2 : IconRefresh}
          size={16}
          aria-hidden="true"
          className={refreshing ? 'animate-spin' : undefined}
        />
      </Button>
    </div>
  )
}
