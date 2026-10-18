/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MessageModalContext } from '../components/shared/message-modal-context';
import Bikes from './bikes';
import Tracks from './tracks';
import {
  deferred,
  makeBikeFixture,
  makeTrackFixture,
  renderWithProviders,
  stubRendererWindow,
} from '../test-utils';
import { invalidateModsSnapshot } from '../hooks/useMods';
import { BIKES_FIXED_MESSAGE, TRACKS_FIXED_MESSAGE } from '../hooks/useMods';
import { INVALID_MODS_FOLDER_MESSAGE } from '../lib/mods-errors';
import type { ModsSnapshot } from '../../../types/mods';

function pendingMods(): Promise<ModsSnapshot> {
  return new Promise<ModsSnapshot>(() => undefined);
}

function stubModsGetAll(): ReturnType<typeof vi.fn> {
  const getAll = vi.fn((): Promise<ModsSnapshot> => pendingMods());
  window.mods.getAll = getAll;
  return getAll;
}

// Frame-0 mount tests for the bikes/tracks screens: the fixed guidance is
// visible on the first render in any state, rows only ever show confirmed
// data, and the invalid warning only shows on confirmed main validation.
describe('Bikes frame 0', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateModsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the fixed guidance with no rows on a cache miss', () => {
    stubModsGetAll();

    renderWithProviders(<Bikes />);

    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Bike A')).toBeNull();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
  });

  it('shows the fixed guidance with no rows when empty is confirmed', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    const first = renderWithProviders(<Bikes />);
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy();

    gate.resolve({ valid: true, ready: true, mods: { bikes: [] } });
    await act(async () => {});
    first.unmount();

    // Second mount seeds from the confirmed snapshot: no fetch at all.
    const seeded = stubModsGetAll();
    renderWithProviders(<Bikes />);

    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Bike A')).toBeNull();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
    expect(screen.getByText('0')).toBeTruthy();
    expect(seeded).not.toHaveBeenCalled();
  });

  it('shows ONLY the error (no fixed guidance) when invalid is confirmed', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    const first = renderWithProviders(<Bikes />);
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy();

    gate.resolve({ valid: false, ready: true, mods: { bikes: [] } });
    await act(async () => {});
    first.unmount();

    // Second mount seeds from the confirmed invalid snapshot.
    const seeded = stubModsGetAll();
    renderWithProviders(<Bikes />);

    expect(screen.queryByText(BIKES_FIXED_MESSAGE)).toBeNull();
    expect(screen.getByText(INVALID_MODS_FOLDER_MESSAGE)).toBeTruthy();
    expect(seeded).not.toHaveBeenCalled();
  });

  it('does NOT show error while pending (ready:false)', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    renderWithProviders(<Bikes />);

    // First snapshot: valid but not ready (pending scan)
    gate.resolve({ valid: true, ready: false, mods: { bikes: [] } });
    await act(async () => {});

    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
    expect(screen.queryByText('Bike A')).toBeNull();
  });

  it('shows the confirmed rows on frame 0 with a seeded list', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: { bikes: [makeBikeFixture(), makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] },
      }),
    );
    const first = renderWithProviders(<Bikes />);
    await screen.findByText('Bike A');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    expect(screen.getByText('Bike A')).toBeTruthy();
    expect(screen.getByText('Bike B')).toBeTruthy();
    expect(screen.getByText('bikes')).toBeTruthy();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
    expect(screen.queryByText(BIKES_FIXED_MESSAGE)).toBeNull();
  });
});

describe('Tracks frame 0', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateModsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the fixed guidance with no rows on a cache miss', () => {
    stubModsGetAll();

    renderWithProviders(<Tracks />);

    expect(screen.getByText(TRACKS_FIXED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Track A')).toBeNull();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
  });

  it('shows the fixed guidance with no rows when empty is confirmed', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    const first = renderWithProviders(<Tracks />);
    expect(screen.getByText(TRACKS_FIXED_MESSAGE)).toBeTruthy();

    gate.resolve({ valid: true, ready: true, mods: { tracks: [] } });
    await act(async () => {});
    first.unmount();

    // Second mount seeds from the confirmed snapshot: no fetch at all.
    const seeded = stubModsGetAll();
    renderWithProviders(<Tracks />);

    expect(screen.getByText(TRACKS_FIXED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Track A')).toBeNull();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
    expect(screen.getByText('0')).toBeTruthy();
    expect(seeded).not.toHaveBeenCalled();
  });

  it('shows ONLY the error (no fixed guidance) when invalid is confirmed', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    const first = renderWithProviders(<Tracks />);
    expect(screen.getByText(TRACKS_FIXED_MESSAGE)).toBeTruthy();

    gate.resolve({ valid: false, ready: true, mods: { tracks: [] } });
    await act(async () => {});
    first.unmount();

    // Second mount seeds from the confirmed invalid snapshot.
    const seeded = stubModsGetAll();
    renderWithProviders(<Tracks />);

    expect(screen.queryByText(TRACKS_FIXED_MESSAGE)).toBeNull();
    expect(screen.getByText(INVALID_MODS_FOLDER_MESSAGE)).toBeTruthy();
    expect(seeded).not.toHaveBeenCalled();
  });

  it('does NOT show error while pending (ready:false)', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    renderWithProviders(<Tracks />);

    // First snapshot: valid but not ready (pending scan)
    gate.resolve({ valid: true, ready: false, mods: { tracks: [] } });
    await act(async () => {});

    expect(screen.getByText(TRACKS_FIXED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
    expect(screen.queryByText('Track A')).toBeNull();
  });

  it('shows the confirmed rows on frame 0 with a seeded list', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: { tracks: [makeTrackFixture(), makeTrackFixture({ id: 'track-b', name: 'Track B' })] },
      }),
    );
    const first = renderWithProviders(<Tracks />);
    await screen.findByText('Track A');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Tracks />);

    expect(screen.getByText('Track A')).toBeTruthy();
    expect(screen.getByText('Track B')).toBeTruthy();
    expect(screen.getByText('tracks')).toBeTruthy();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
    expect(screen.queryByText(TRACKS_FIXED_MESSAGE)).toBeNull();
  });
});

describe('Bikes search', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateModsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the search input mounted and disabled on a cache miss with an empty counter slot', () => {
    stubModsGetAll();
    renderWithProviders(<Bikes />);

    const input = screen.getByPlaceholderText('Search bikes') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(true);
    expect(screen.queryByText('0')).toBeNull();
    const badge = screen.getByText('bikes').parentElement?.querySelector('[data-slot="badge"]');
    expect(badge?.textContent).toBe('');
  });

  it('keeps the search input mounted when empty is confirmed', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    const first = renderWithProviders(<Bikes />);
    expect(screen.getByPlaceholderText('Search bikes')).toBeTruthy();
    gate.resolve({ valid: true, ready: true, mods: { bikes: [] } });
    await act(async () => {});
    first.unmount();

    stubModsGetAll();
    renderWithProviders(<Bikes />);

    const input = screen.getByPlaceholderText('Search bikes') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(false);
    expect(screen.getByText(BIKES_FIXED_MESSAGE)).toBeTruthy();
  });

  it('keeps the search input mounted with a seeded list and a ready counter', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: { bikes: [makeBikeFixture(), makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] },
      }),
    );
    const first = renderWithProviders(<Bikes />);
    await screen.findByText('Bike A');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    const input = screen.getByPlaceholderText('Search bikes') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(false);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows zero with an empty Mods Path after Reset', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    await waitFor(() => expect(screen.getByText('0')).toBeTruthy());
    expect(screen.queryByText('Bike A')).toBeNull();
  });

  it('filters the list by name ignoring case', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: {
          bikes: [
            makeBikeFixture({ id: 'earth-mod', name: 'Earth Mod' }),
            makeBikeFixture({ id: 'earth-park', name: 'Earth Park' }),
            makeBikeFixture({ id: 'moon', name: 'Moon' }),
          ],
        },
      }),
    );
    const first = renderWithProviders(<Bikes />);
    await screen.findByText('Earth Mod');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    fireEvent.change(screen.getByPlaceholderText('Search bikes'), { target: { value: 'earth' } });
    expect(screen.getByText('Earth Mod')).toBeTruthy();
    expect(screen.getByText('Earth Park')).toBeTruthy();
    expect(screen.queryByText('Moon')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('filters the list by id when the name differs', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: {
          bikes: [
            makeBikeFixture({ id: 'secret-earth-code', name: 'Moon' }),
            makeBikeFixture({ id: 'bike-b', name: 'Bike B' }),
          ],
        },
      }),
    );
    const first = renderWithProviders(<Bikes />);
    await screen.findByText('Moon');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    fireEvent.change(screen.getByPlaceholderText('Search bikes'), { target: { value: 'earth' } });
    expect(screen.getByText('Moon')).toBeTruthy();
    expect(screen.queryByText('Bike B')).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows an empty grid with counter 0 and no new message on zero results', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: { bikes: [makeBikeFixture(), makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] },
      }),
    );
    const first = renderWithProviders(<Bikes />);
    await screen.findByText('Bike A');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    fireEvent.change(screen.getByPlaceholderText('Search bikes'), { target: { value: 'xyz' } });
    expect(screen.queryByText('Bike A')).toBeNull();
    expect(screen.queryByText('Bike B')).toBeNull();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText(BIKES_FIXED_MESSAGE)).toBeNull();
    expect(screen.queryByText(INVALID_MODS_FOLDER_MESSAGE)).toBeNull();
  });

  it('resets the term on remount', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: { bikes: [makeBikeFixture(), makeBikeFixture({ id: 'bike-b', name: 'Bike B' })] },
      }),
    );
    const first = renderWithProviders(<Bikes />);
    await screen.findByText('Bike A');
    fireEvent.change(screen.getByPlaceholderText('Search bikes'), { target: { value: 'Bike A' } });
    expect(screen.queryByText('Bike B')).toBeNull();
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Bikes />);

    expect((screen.getByPlaceholderText('Search bikes') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Bike A')).toBeTruthy();
    expect(screen.getByText('Bike B')).toBeTruthy();
  });
});

describe('Tracks search', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateModsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the search input mounted on a cache miss', () => {
    stubModsGetAll();
    renderWithProviders(<Tracks />);

    const input = screen.getByPlaceholderText('Search tracks') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(true);
  });

  it('keeps the search input mounted when empty is confirmed', async () => {
    const getAll = stubModsGetAll();
    const gate = deferred<ModsSnapshot>();
    getAll.mockReturnValue(gate.promise);
    const first = renderWithProviders(<Tracks />);
    expect(screen.getByPlaceholderText('Search tracks')).toBeTruthy();
    gate.resolve({ valid: true, ready: true, mods: { tracks: [] } });
    await act(async () => {});
    first.unmount();

    stubModsGetAll();
    renderWithProviders(<Tracks />);

    expect(screen.getByPlaceholderText('Search tracks')).toBeTruthy();
  });

  it('keeps the search input mounted with a seeded list', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: { tracks: [makeTrackFixture(), makeTrackFixture({ id: 'track-b', name: 'Track B' })] },
      }),
    );
    const first = renderWithProviders(<Tracks />);
    await screen.findByText('Track A');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Tracks />);

    expect(screen.getByPlaceholderText('Search tracks')).toBeTruthy();
    expect(screen.getByText('Track A')).toBeTruthy();
  });

  it('shows zero with an empty Mods Path after Reset', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Tracks />);

    await waitFor(() => expect(screen.getByText('0')).toBeTruthy());
    expect(screen.queryByText('Track A')).toBeNull();
  });

  it('filters the list by name', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: {
          tracks: [
            makeTrackFixture({ id: 'earth-track', name: 'Earth Track' }),
            makeTrackFixture({ id: 'moon', name: 'Moon' }),
          ],
        },
      }),
    );
    const first = renderWithProviders(<Tracks />);
    await screen.findByText('Earth Track');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Tracks />);

    fireEvent.change(screen.getByPlaceholderText('Search tracks'), { target: { value: 'earth' } });
    expect(screen.getByText('Earth Track')).toBeTruthy();
    expect(screen.queryByText('Moon')).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('filters the list by id when the name differs', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({
        valid: true,
        ready: true,
        mods: {
          tracks: [
            makeTrackFixture({ id: 'night-oval-99', name: 'Sunset Oval' }),
            makeTrackFixture({ id: 'track-b', name: 'Track B' }),
          ],
        },
      }),
    );
    const first = renderWithProviders(<Tracks />);
    await screen.findByText('Sunset Oval');
    first.unmount();

    getAll.mockReturnValue(pendingMods());
    renderWithProviders(<Tracks />);

    fireEvent.change(screen.getByPlaceholderText('Search tracks'), { target: { value: 'night-oval' } });
    expect(screen.getByText('Sunset Oval')).toBeTruthy();
    expect(screen.queryByText('Track B')).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();
  });
});

describe('Bikes/Tracks selection navigates to Practice', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateModsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  function Probe(): React.JSX.Element {
    const { pathname } = useLocation();
    return <p>path:{pathname}</p>;
  }

  it('selecting a bike navigates to /', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({ valid: true, ready: true, mods: { bikes: [makeBikeFixture()] } }),
    );
    render(
      <MemoryRouter initialEntries={['/bikes']}>
        <MessageModalContext.Provider value={{ showMessage: () => undefined, closeMessage: () => undefined }}>
          <Bikes />
          <Probe />
        </MessageModalContext.Provider>
      </MemoryRouter>,
    );
    await screen.findByText('Bike A');
    fireEvent.click(screen.getByText('Bike A'));
    await waitFor(() => expect(screen.getByText('path:/')).toBeTruthy());
  });

  it('selecting a track navigates to /', async () => {
    const getAll = stubModsGetAll();
    getAll.mockReturnValue(
      Promise.resolve({ valid: true, ready: true, mods: { tracks: [makeTrackFixture()] } }),
    );
    render(
      <MemoryRouter initialEntries={['/tracks']}>
        <MessageModalContext.Provider value={{ showMessage: () => undefined, closeMessage: () => undefined }}>
          <Tracks />
          <Probe />
        </MessageModalContext.Provider>
      </MemoryRouter>,
    );
    await screen.findByText('Track A');
    fireEvent.click(screen.getByText('Track A'));
    await waitFor(() => expect(screen.getByText('path:/')).toBeTruthy());
  });
});
