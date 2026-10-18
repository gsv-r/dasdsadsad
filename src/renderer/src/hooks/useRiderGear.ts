import { useEffect, useMemo, useState } from 'react'
import { useMods } from './useMods'
import { isBaseSelection } from '../lib/utils'
import { readCachedString, writeCachedString } from '../lib/cache-utils'
import { readGearSnapshot, writeGearSnapshot } from '../lib/practice-cache'
import { ensurePracticeValidated } from '../lib/practice-validate'
import type { Rider, Helmet, RidingStyle } from '../../../types/mods'

function paintsOf(items: { id: string; paints?: string[] }[], id: string): string[] {
  return items.find((item) => item.id === id)?.paints ?? []
}

function toSelection(stored: unknown): string {
  return isBaseSelection(stored) ? '' : String(stored)
}

function readCachedSelection(key: string): string | null {
  const raw = readCachedString(key)
  if (raw === null) return null
  return toSelection(raw)
}

function writeCachedSelection(key: string, value: string): void {
  writeCachedString(key, value)
}

function syncSelection(
  key: string,
  stored: string | undefined,
  cached: string | null,
  setSelection: React.Dispatch<React.SetStateAction<string | null>>
): void {
  if (typeof stored === 'string') {
    if (cached !== stored) {
      writeCachedSelection(key, stored)
      setSelection(toSelection(stored))
    }
  } else if (cached === null) {
    setSelection((prev) => prev ?? toSelection(stored))
  }
}

export function useRiderGear(refreshKey: number = 0): {
  helmets: string[]
  helmetPaints: string[]
  ridingStyles: string[]
  suits: string[]
  suitPaints: string[]
  onHelmetChange: (value: string) => void
  onSuitChange: (value: string) => void
  saveHelmet: (value: string) => Promise<unknown>
  saveSuit: (value: string) => Promise<unknown>
} {
  const { items: riders, isLoading: ridersLoading } = useMods<Rider>('riders')
  const { items: helmetsData, isLoading: helmetsLoading } = useMods<Helmet>('helmets')
  const { items: stylesData, isLoading: stylesLoading } = useMods<RidingStyle>('ridingStyles')

  // Read the cache synchronously: with saved state, open directly, no empty/default flash.
  // Option lists also come from cache so they never render empty.
  const [cachedGear] = useState(() => readGearSnapshot())
  const [selectedHelmet, setSelectedHelmet] = useState<string | null>(() =>
    readCachedSelection('practice.bike.helmet')
  )
  const [selectedSuit, setSelectedSuit] = useState<string | null>(() =>
    readCachedSelection('practice.bike.rider')
  )

  // A setup select writes the caches synchronously before bumping refreshKey.
  // Adopt the fresh cache during render (before paint) so the next paint
  // already shows the setup values instead of flashing the old ones.
  const [lastRefresh, setLastRefresh] = useState(refreshKey)
  if (lastRefresh !== refreshKey) {
    setLastRefresh(refreshKey)
    const freshHelmet = readCachedSelection('practice.bike.helmet')
    if (freshHelmet !== null && freshHelmet !== selectedHelmet) setSelectedHelmet(freshHelmet)
    const freshSuit = readCachedSelection('practice.bike.rider')
    if (freshSuit !== null && freshSuit !== selectedSuit) setSelectedSuit(freshSuit)
  }

  useEffect(() => {
    let cancelled = false
    ensurePracticeValidated()
      .then(() =>
        Promise.all([
          window.store.get<string>('practice.bike.helmet'),
          window.store.get<string>('practice.bike.rider')
        ])
      )
      .then(([helmet, suit]) => {
        if (cancelled) return
        syncSelection(
          'practice.bike.helmet',
          helmet,
          readCachedSelection('practice.bike.helmet'),
          setSelectedHelmet
        )
        syncSelection(
          'practice.bike.rider',
          suit,
          readCachedSelection('practice.bike.rider'),
          setSelectedSuit
        )
      })
      .catch((error) => {
        console.error('Failed to fetch rider selection:', error)
        if (cancelled) return
        setSelectedHelmet((prev) => prev ?? '')
        setSelectedSuit((prev) => prev ?? '')
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Keep the cache snapshot warm from the scan without clearing the current selection.
  // Only write on divergence; never recreate existing state.
  useEffect(() => {
    if (ridersLoading || helmetsLoading || stylesLoading) return
    writeGearSnapshot({
      helmets: helmetsData.map((h) => ({ id: h.id, paints: h.paints ?? [] })),
      suits: riders.map((r) => ({ id: r.id, paints: r.paints ?? [] })),
      styles: stylesData.map((s) => s.id)
    })
  }, [ridersLoading, helmetsLoading, stylesLoading, riders, helmetsData, stylesData])

  // Scanned data wins; the cache snapshot covers first paint with no empty state.
  const helmetsResolved = useMemo(
    () => (!helmetsLoading ? helmetsData : (cachedGear?.helmets ?? helmetsData)),
    [helmetsLoading, helmetsData, cachedGear]
  )
  const ridersResolved = useMemo(
    () => (!ridersLoading ? riders : (cachedGear?.suits ?? riders)),
    [ridersLoading, riders, cachedGear]
  )
  const stylesResolved = useMemo(
    () =>
      !stylesLoading
        ? stylesData.map((s) => s.id)
        : (cachedGear?.styles ?? stylesData.map((s) => s.id)),
    [stylesLoading, stylesData, cachedGear]
  )

  const helmets = useMemo(() => helmetsResolved.map((h) => h.id), [helmetsResolved])
  const suits = useMemo(() => ridersResolved.map((r) => r.id), [ridersResolved])
  const ridingStyles = useMemo(() => stylesResolved, [stylesResolved])

  // Paints come from the selected item only. An unknown selection yields
  // no paints and the paint select falls back to the base.
  const activeHelmet = selectedHelmet && helmets.includes(selectedHelmet) ? selectedHelmet : ''
  const activeSuit = selectedSuit && suits.includes(selectedSuit) ? selectedSuit : ''

  const helmetPaints = useMemo(
    () => paintsOf(helmetsResolved, activeHelmet),
    [helmetsResolved, activeHelmet]
  )
  const suitPaints = useMemo(
    () => paintsOf(ridersResolved, activeSuit),
    [ridersResolved, activeSuit]
  )

  return {
    helmets,
    helmetPaints,
    ridingStyles,
    suits,
    suitPaints,
    onHelmetChange: setSelectedHelmet,
    onSuitChange: setSelectedSuit,
    saveHelmet: (value) => {
      const paints = paintsOf(helmetsData, value)
      const cachedPaint = readCachedString('practice.bike.helmet_paint')
      if (cachedPaint !== null && cachedPaint !== '' && !paints.includes(cachedPaint)) {
        writeCachedString('practice.bike.helmet_paint', '')
      }
      return window.practice.selectHelmet(value, paintsOf(helmetsData, value))
    },
    saveSuit: (value) => {
      const paints = paintsOf(riders, value)
      const cachedPaint = readCachedString('practice.bike.suit_paint')
      if (cachedPaint !== null && cachedPaint !== '' && !paints.includes(cachedPaint)) {
        writeCachedString('practice.bike.suit_paint', '')
      }
      return window.practice.selectRider(value, paintsOf(riders, value))
    }
  }
}
