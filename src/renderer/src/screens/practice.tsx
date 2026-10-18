import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/frame/layout'
import ModPreview from '../components/shared/mod-preview'
import OptionSelect from '../components/practice/option-select'
import Rider from '../components/practice/rider'
import Weather from '../components/practice/weather/weather'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { useRiderGear } from '../hooks/useRiderGear'
import { useMods } from '../hooks/useMods'
import { useActiveSetup } from '../hooks/useActiveSetup'
import SetupSelect from '../components/setups/setup-select'
import { readBikeSnapshot, readTrackSnapshot, writeSetupFieldCaches } from '../lib/practice-cache'
import { readCachedString, readJsonSnapshot, writeCachedString, writeJsonSnapshot } from '../lib/cache-utils'
import { ensurePracticeValidated } from '../lib/practice-validate'
import { isBaseSelection } from '../lib/utils'
import type { AppliedSetupValues } from '../../../types/setups'

import type { Bike, Track } from '../../../types/mods'

const FALLBACK_BIKE_ID = 'schwaben_m2_18'
const FALLBACK_TRACK_ID = 'Adriatic'

function updateSnapshot<T extends Record<string, unknown>>(key: string, data: T): void {
  const prev = readJsonSnapshot<Partial<T>>(key)
  const changed =
    !prev ||
    Object.entries(data).some(([k, v]) => JSON.stringify(prev[k as keyof T]) !== JSON.stringify(v))
  if (changed) {
    writeJsonSnapshot(key, data)
  }
}

function readStoredId(key: string): string | null {
  const raw = readCachedString(key)
  if (raw === null || isBaseSelection(raw)) return null
  return raw
}

function usePracticeSetup(refreshKey: number = 0): { bike: Bike | null; track: Track | null } {
  const [storedBikeId, setStoredBikeId] = useState<string | null>(() =>
    readStoredId('practice.bike.bike_id')
  )
  const [storedTrackId, setStoredTrackId] = useState<string | null>(() =>
    readStoredId('practice.track.track_id')
  )
  const [cachedBikeSnapshot] = useState(() => readBikeSnapshot())
  const [cachedTrackSnapshot] = useState(() => readTrackSnapshot())
  const { items: bikes } = useMods<Bike>('bikes')
  const { items: tracks } = useMods<Track>('tracks')

  // A setup select writes the caches synchronously before bumping refreshKey.
  // Adopt the fresh cache during render (before paint) so the next paint
  // already shows the setup bike instead of flashing the old one.
  const [lastRefresh, setLastRefresh] = useState(refreshKey)
  if (lastRefresh !== refreshKey) {
    setLastRefresh(refreshKey)
    const freshBike = readStoredId('practice.bike.bike_id')
    if (freshBike !== storedBikeId) setStoredBikeId(freshBike)
    const freshTrack = readStoredId('practice.track.track_id')
    if (freshTrack !== storedTrackId) setStoredTrackId(freshTrack)
  }

  useEffect(() => {
    let cancelled = false
    ensurePracticeValidated()
      .then(() => {
        return Promise.all([
          window.store.get<string>('practice.bike.bike_id'),
          window.store.get<string>('practice.track.track_id')
        ])
      })
      .then(([practiceBikeId, practiceTrackId]) => {
        if (cancelled) return
        const nextBikeId =
          typeof practiceBikeId === 'string' && !isBaseSelection(practiceBikeId) ? practiceBikeId : null
        const nextTrackId =
          typeof practiceTrackId === 'string' && !isBaseSelection(practiceTrackId) ? practiceTrackId : null
        if (nextBikeId) {
          writeCachedString('practice.bike.bike_id', nextBikeId)
          setStoredBikeId((prev) => (prev === nextBikeId ? prev : nextBikeId))
        }
        if (nextTrackId) {
          writeCachedString('practice.track.track_id', nextTrackId)
          setStoredTrackId((prev) => (prev === nextTrackId ? prev : nextTrackId))
        }
      })
      .catch((error) => console.error('Failed to load practice selection:', error))
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Keep the cache snapshot warm from the scan without clearing the current selection.
  useEffect(() => {
    if (!storedBikeId) return
    const found = bikes.find((b) => b.id === storedBikeId)
    if (!found) return
    updateSnapshot('practice.bike.snapshot', {
      id: found.id,
      name: found.name ?? found.id,
      preview: found.preview ?? null,
      paints: found.paints ?? []
    })
  }, [bikes, storedBikeId])

  useEffect(() => {
    if (!storedTrackId) return
    const found = tracks.find((t) => t.id === storedTrackId)
    if (!found) return
    updateSnapshot('practice.track.snapshot', {
      id: found.id,
      name: found.name ?? found.id,
      preview: found.preview ?? null,
      layouts: found.layouts ?? []
    })
  }, [tracks, storedTrackId])

  // Scanned data wins; the cache snapshot covers first paint with no empty state.
  const bike = useMemo(() => {
    const found = bikes.find((b) => b.id === storedBikeId)
    if (found) return found
    if (cachedBikeSnapshot && cachedBikeSnapshot.id === storedBikeId) {
      return {
        id: cachedBikeSnapshot.id,
        name: cachedBikeSnapshot.name,
        preview: cachedBikeSnapshot.preview,
        paints: cachedBikeSnapshot.paints
      } as unknown as Bike
    }
    if (storedBikeId) {
      return { id: storedBikeId, name: storedBikeId, preview: null, paints: [] } as unknown as Bike
    }
    return null
  }, [storedBikeId, bikes, cachedBikeSnapshot])
  const track = useMemo(() => {
    const found = tracks.find((t) => t.id === storedTrackId)
    if (found) return found
    if (cachedTrackSnapshot && cachedTrackSnapshot.id === storedTrackId) {
      return {
        id: cachedTrackSnapshot.id,
        name: cachedTrackSnapshot.name,
        preview: cachedTrackSnapshot.preview,
        layouts: cachedTrackSnapshot.layouts
      } as unknown as Track
    }
    if (storedTrackId) {
      return { id: storedTrackId, name: storedTrackId, preview: null, layouts: [] } as unknown as Track
    }
    return null
  }, [storedTrackId, tracks, cachedTrackSnapshot])

  return { bike, track }
}

export default function Practice(): React.JSX.Element {
  // Single owner of the active-setup state: SetupSelect receives
  // setupId/setups/applySetup as props so `locked` updates in the same tick.
  const { setupId, setups, loading: setupLoading, applySetup } = useActiveSetup()
  const locked = setupId !== null

  // Bumped after setups:select writes the 7 field caches synchronously.
  // usePracticeSetup, useRiderGear and the OptionSelects adopt the fresh
  // cache during render (before paint): no stale flash, no loader, no remount.
  const [practiceRefresh, setPracticeRefresh] = useState(0)
  const handleSetupApplied = useCallback((applied: AppliedSetupValues) => {
    writeSetupFieldCaches(applied)
    setPracticeRefresh((n) => n + 1)
  }, [])

  const { bike, track } = usePracticeSetup(practiceRefresh)

  const paints = useMemo(() => bike?.paints ?? [], [bike])
  const layouts = useMemo(() => track?.layouts ?? [], [track])

  const gear = useRiderGear(practiceRefresh)

  return (
    <Layout>
      <div className="grid h-full grid-cols-[20vw_20vw_1fr] grid-rows-[minmax(0,1fr)_auto] items-stretch gap-2 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto">
          <ModPreview
            src={bike?.preview}
            name={bike?.name || bike?.id || FALLBACK_BIKE_ID}
            badge="BIKE"
            to="/bikes"
            className="max-h-[50%] w-full shrink-0"
            disabled={locked}
          />
          <OptionSelect
            label="Paint"
            inputId="bike-paint"
            options={paints}
            storeKey="practice.bike.paint"
            save={(v) => window.practice.setBikePaint(v)}
            disabled={locked}
            refreshKey={practiceRefresh}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto">
          <ModPreview
            src={track?.preview}
            name={track?.name || track?.id || FALLBACK_TRACK_ID}
            badge="TRACK"
            to="/tracks"
            cover
            className="max-h-[50%] w-full shrink-0"
          />
          <OptionSelect
            label="Layout"
            inputId="track-layout"
            options={layouts}
            storeKey="practice.track.track_layout"
            save={(v) => window.practice.setTrackLayout(v)}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto row-span-2">
          <Card className="flex-1 border-dashed border-border py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium tracking-wide uppercase">Weather</CardTitle>
            </CardHeader>
            <CardContent>
              <Weather />
            </CardContent>
          </Card>
          <Card className="flex-1 border-dashed border-border py-4">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium tracking-wide uppercase">Rider</CardTitle>
            </CardHeader>
            <CardContent>
              <Rider
                helmets={gear.helmets}
                helmetPaints={gear.helmetPaints}
                ridingStyles={gear.ridingStyles}
                suits={gear.suits}
                suitPaints={gear.suitPaints}
                onHelmetChange={gear.onHelmetChange}
                onSuitChange={gear.onSuitChange}
                onHelmetSave={gear.saveHelmet}
                onSuitSave={gear.saveSuit}
                locked={locked}
                refreshKey={practiceRefresh}
              />
            </CardContent>
          </Card>
        </div>
        <Card className="col-start-2 row-start-2 border-dashed border-border py-4">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium tracking-wide uppercase">Setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <SetupSelect
              setupId={setupId}
              setups={setups}
              loading={setupLoading}
              applySetup={applySetup}
              onApplied={handleSetupApplied}
            />
            {/* Static guidance, always visible: identical with or without a
                setup selected, so switching selection never moves layout. */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Select a setup, or None for manual.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
