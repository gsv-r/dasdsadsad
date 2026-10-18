// Shared localStorage + in-memory snapshot primitives for the renderer.
// Every helper is a small pure-ish function (no classes, no DI): safe access
// swallows cache failures because electron-store stays the source of truth,
// and writes happen only on divergence so unchanged values never churn.
//
// Consolidated from the duplicated try/catch + getItem/setItem blocks in
// practice-cache.ts, practice.tsx, useRiderGear.ts, option-select.tsx and
// use-weather-settings.ts, plus the module-level snapshot pattern shared by
// useMods/useSetups.

// Raw string read. Returns null when missing or when storage throws.
export function readCachedString(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

// String write that skips unchanged values. Never throws.
export function writeCachedString(key: string, value: string): void {
  try {
    if (window.localStorage.getItem(key) !== value) {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // Ignore cache failures.
  }
}

// Key removal. Never throws.
export function removeCachedKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore cache failures.
  }
}

// Raw JSON read. Returns null on missing key, parse failure or storage error.
// Validation stays with the caller (see practice-cache.ts).
export function readJsonSnapshot<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// JSON write that skips unchanged values (stringify compare). Never throws.
export function writeJsonSnapshot(key: string, data: unknown): void {
  try {
    const next = JSON.stringify(data)
    if (window.localStorage.getItem(key) !== next) {
      window.localStorage.setItem(key, next)
    }
  } catch {
    // Ignore cache failures.
  }
}

// Removes the cached key only when it currently holds `id`. Used to clear a
// stale active id without touching an unrelated fresh value.
export function clearCachedKeyIf(key: string, id: string): void {
  try {
    if (window.localStorage.getItem(key) === id) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore cache failures.
  }
}

// Minimal in-memory snapshot for module-level lists (e.g. setups). Keeps the
// "hydrate once, render instantly on remount, invalidate on reset" pattern in
// one place without forcing useMods' subscription/diff machinery into a
// shared abstraction. Closure-based: no classes.
export function createMemorySnapshot<T>(): {
  get: () => T | null
  set: (value: T | null) => void
  clear: () => void
} {
  let current: T | null = null
  return {
    get: () => current,
    set: (value: T | null) => {
      current = value
    },
    clear: () => {
      current = null
    }
  }
}
