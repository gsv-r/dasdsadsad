import { store, DEFAULT_PRACTICE_STATE } from '../store'
import { getResolvedGamePath } from './paths'
import { writePracticeIni } from './practiceIni'
import { BASE_SELECTION_VALUES } from '../constants'

// Every selection below updates electron-store and rewrites practice.ini
// so the interface and the file the game loads never diverge.

export function persistPracticeIni(): boolean {
  const gamePath = getResolvedGamePath()
  if (!gamePath) {
    console.warn('practice.ini not written: game folder not found.')
    return false
  }
  try {
    writePracticeIni(gamePath)
    return true
  } catch (error) {
    console.error('Failed to write practice.ini:', error)
    return false
  }
}

function normalizeId(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined || BASE_SELECTION_VALUES.has(value)) return fallback
  return value
}

export function selectBike(bikeId: string, paints: string[]): void {
  const current = store.store.practice?.bike ?? DEFAULT_PRACTICE_STATE.bike
  store.set('practice.bike.bike_id', bikeId)
  if (!(paints ?? []).includes(current.paint)) {
    store.set('practice.bike.paint', DEFAULT_PRACTICE_STATE.bike.paint)
  }
  persistPracticeIni()
}

export function selectTrack(trackId: string, layouts: string[]): void {
  const current = store.store.practice?.track ?? DEFAULT_PRACTICE_STATE.track
  store.set('practice.track.track_id', trackId)
  if (!(layouts ?? []).includes(current.track_layout)) {
    store.set('practice.track.track_layout', DEFAULT_PRACTICE_STATE.track.track_layout)
  }
  persistPracticeIni()
}

export function setBikePaint(paint: string): void {
  store.set('practice.bike.paint', paint)
  persistPracticeIni()
}

export function setTrackLayout(layout: string): void {
  store.set('practice.track.track_layout', layout)
  persistPracticeIni()
}

function selectGear(kind: 'helmet' | 'rider', id: string, paints: string[]): void {
  const defaults = DEFAULT_PRACTICE_STATE.bike
  const current = store.store.practice?.bike ?? defaults
  const validPaints = paints ?? []

  if (kind === 'helmet') {
    const next = normalizeId(id, defaults.helmet)
    if (current.helmet !== next) {
      store.set('practice.bike.helmet', next)
      if (!validPaints.includes(current.helmet_paint)) {
        store.set('practice.bike.helmet_paint', defaults.helmet_paint)
      }
    }
  } else {
    const next = normalizeId(id, defaults.rider)
    if (current.rider !== next) {
      store.set('practice.bike.rider', next)
      if (!validPaints.includes(current.suit_paint)) {
        store.set('practice.bike.suit_paint', defaults.suit_paint)
      }
    }
  }
  persistPracticeIni()
}

export function selectHelmet(helmetId: string, paints: string[]): void {
  selectGear('helmet', helmetId, paints)
}

export function setHelmetPaint(paint: string): void {
  store.set('practice.bike.helmet_paint', paint)
  persistPracticeIni()
}

export function selectRider(suitId: string, paints: string[]): void {
  selectGear('rider', suitId, paints)
}

export function setSuitPaint(paint: string): void {
  store.set('practice.bike.suit_paint', paint)
  persistPracticeIni()
}

export function selectRidingStyle(styleId: string): void {
  store.set(
    'practice.bike.riding_style',
    normalizeId(styleId, DEFAULT_PRACTICE_STATE.bike.riding_style)
  )
  persistPracticeIni()
}
