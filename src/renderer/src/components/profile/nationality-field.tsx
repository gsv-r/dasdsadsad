import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDown } from '@tabler/icons-react'
import { Icon } from '../ui/icon'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '@renderer/lib/utils'
import { COUNTRIES, filterCountries } from '@renderer/lib/countries'
import { placePanel, type PanelPosition } from '@renderer/lib/popover'

// Upper bound of the panel height (search input + full country list +
// padding): only used to decide whether it opens below or above.
const ESTIMATED_PANEL_HEIGHT = 320

export default function NationalityField({
  value,
  disabled,
  onChange
}: {
  value: string | null
  disabled?: boolean
  onChange: (code: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selected = value === null ? null : (COUNTRIES.find((country) => country.code === value) ?? null)
  const visible = filterCountries(COUNTRIES, query)

  function closePanel(): void {
    setOpen(false)
    setQuery('')
  }

  function handleSelect(code: string): void {
    onChange(code)
    closePanel()
  }

  // Fixed position anchored to the trigger, measured before paint so the
  // panel never flashes in the wrong place.
  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition(
      placePanel(
        { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        window.innerHeight,
        ESTIMATED_PANEL_HEIGHT
      )
    )
  }, [])

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  // Focus the search input as soon as the panel opens so the user can
  // type immediately without clicking it again.
  useEffect(() => {
    if (open && position) searchInputRef.current?.focus()
  }, [open, position])

  // The page may scroll or resize under the open panel: keep it glued to
  // the trigger. Scrolls inside the country list itself are ignored.
  // A pointer press outside the panel and the trigger dismisses it without
  // touching the selected nationality: only the open state and the search
  // filter are reset, never the saved value.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    const onScroll = (e: Event): void => {
      if (panelRef.current?.contains(e.target as Node)) return
      updatePosition()
    }
    const onResize = (): void => updatePosition()
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, updatePosition])

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor="profile-nationality">Nationality</Label>
      <Button
        type="button"
        id="profile-nationality"
        ref={anchorRef}
        variant="outline"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? closePanel() : setOpen(true))}
        className="w-full justify-between"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <img
              src={selected.flag}
              alt=""
              draggable={false}
              className="h-4 w-6 shrink-0 object-cover"
            />
            <span className="leading-none">{selected.name}</span>
          </span>
        ) : (
          <span className="leading-none text-muted-foreground">Select nationality</span>
        )}
        <Icon component={IconChevronDown} size={16} aria-hidden="true" />
      </Button>
      {open && !disabled && position
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 flex flex-col gap-2 border border-border bg-popover p-2 shadow-md"
              style={{
                top: position.top,
                bottom: position.bottom,
                left: position.left,
                width: position.width
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closePanel()
              }}
            >
              <Input
                id="profile-nationality-search"
                ref={searchInputRef}
                aria-label="Search countries"
                value={query}
                placeholder="Search countries"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="scroll flex max-h-64 flex-col gap-1 overflow-y-auto">
                {visible.length === 0 ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    No countries found.
                  </p>
                ) : (
                  visible.map((country) => (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => handleSelect(country.code)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground',
                        country.code === value && 'bg-accent'
                      )}
                    >
                      <img
                        src={country.flag}
                        alt=""
                        draggable={false}
                        className="h-4 w-6 shrink-0 object-cover"
                      />
                      <span className="leading-none">{country.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
