import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import { MessageModalContext } from './components/shared/message-modal-context';
import type { Bike, ModsSnapshot, Track } from '../../types/mods';
import type { PlayerProfile } from '../../types/profiles';
import type { PlayerSetup } from '../../types/setups';

// Shared harness for frame-0 mount tests (profile/setups/practice). Kept in
// one place so the three suites stub the same renderer bridge the same way.
// jsdom + Testing Library are dev-only; nothing here ships to production.

// Manually driven promise: keep it pending to freeze frame 0, then resolve +
// `waitFor` for the confirmed state.
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((inner) => {
    resolve = inner;
  });
  return { promise, resolve };
}

export const NEUTRAL_MODS_SNAPSHOT: ModsSnapshot = { valid: true, ready: true, mods: {} };

export function makeSetupFixture(overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return {
    id: 'setup-a',
    name: 'Setup A',
    bike_id: 'schwaben_m2_18',
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern',
    ...overrides,
  };
}

export function makeProfileFixture(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { id: 'Rider', name: 'Rider', raceNumber: '7', ...overrides };
}

export function makeBikeFixture(overrides: Partial<Bike> = {}): Bike {
  return {
    id: 'bike-a',
    name: 'Bike A',
    brand: 'Brand',
    class: 'Class',
    year: 2024,
    version: '1.0',
    author: 'Author',
    preview: null,
    paints: [],
    ...overrides,
  };
}

export function makeTrackFixture(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-a',
    name: 'Track A',
    country: 'Country',
    length: 4.2,
    version: '1.0',
    author: 'Author',
    preview: null,
    layouts: [],
    ...overrides,
  };
}

// Stubs the renderer bridge used on mount. Every entry is a `vi.fn` with a
// neutral default, so tests can `mockReturnValue(pending.promise)` to freeze
// frame 0 and resolve later to drive the confirmed state.
export function stubRendererWindow(): {
  profilesActive: ReturnType<typeof vi.fn>;
  storeGet: ReturnType<typeof vi.fn>;
  setupsList: ReturnType<typeof vi.fn>;
  setupsDelete: ReturnType<typeof vi.fn>;
} {
  const profilesActive = vi.fn((): Promise<PlayerProfile | null> => Promise.resolve(null));
  const storeGet = vi.fn((): Promise<unknown> => Promise.resolve(null));
  const setupsList = vi.fn((): Promise<PlayerSetup[]> => Promise.resolve([]));
  const setupsDelete = vi.fn(() => Promise.resolve({ ok: false, reason: 'write-failed' as const }));

  Object.assign(window, {
    profiles: {
      active: profilesActive,
      list: () => Promise.resolve([]),
      save: () => Promise.resolve({ ok: false, reason: 'write-failed' as const }),
    },
    store: {
      get: storeGet,
      set: () => Promise.resolve({ ok: true as const }),
    },
    setups: {
      list: setupsList,
      create: () => Promise.resolve({ ok: false, reason: 'write-failed' as const }),
      update: () => Promise.resolve({ ok: false, reason: 'write-failed' as const }),
      delete: setupsDelete,
      select: () => Promise.resolve({ ok: true as const }),
    },
    mods: {
      getAll: () => Promise.resolve(NEUTRAL_MODS_SNAPSHOT),
      refresh: () => Promise.resolve(undefined),
      onChanged: () => () => undefined,
    },
    api: {
      isRunning: () => Promise.resolve(false),
      launch: () => Promise.resolve(undefined),
      isMaximized: () => Promise.resolve(false),
    },
    windowState: {
      onChange: () => () => undefined,
    },
    practice: {
      validate: () => Promise.resolve({ repaired: [], modsMissing: false }),
      sync: () => Promise.resolve(true),
      selectBike: () => Promise.resolve({ ok: true as const }),
      selectTrack: () => Promise.resolve(undefined),
      setBikePaint: () => Promise.resolve({ ok: true as const }),
      setTrackLayout: () => Promise.resolve(undefined),
      selectHelmet: () => Promise.resolve({ ok: true as const }),
      setHelmetPaint: () => Promise.resolve({ ok: true as const }),
      selectRider: () => Promise.resolve({ ok: true as const }),
      setSuitPaint: () => Promise.resolve({ ok: true as const }),
      selectRidingStyle: () => Promise.resolve({ ok: true as const }),
    },
  });

  return { profilesActive, storeGet, setupsList, setupsDelete };
}

// jsdom lacks ResizeObserver (used by Radix Slider/Checkbox layout effects).
// A no-op stub is enough: tests never resize, they only need mount to work.
export function stubResizeObserver(): void {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    } as unknown as typeof ResizeObserver;
  }
}

// Mounts a screen the way the app does: inside the router (SidebarLeft/NavBar,
// NavLink) and the message-modal provider (SetupsCard/GoRide/OptionSelect).
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(
    <MemoryRouter>
      <MessageModalContext.Provider
        value={{ showMessage: () => undefined, closeMessage: () => undefined }}
      >
        {ui}
      </MessageModalContext.Provider>
    </MemoryRouter>,
  );
}
