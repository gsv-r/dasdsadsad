/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import Profile from './profile';
import {
  deferred,
  makeProfileFixture,
  renderWithProviders,
  stubRendererWindow,
} from '../test-utils';
import {
  invalidateProfileScreenSnapshot,
  writeCachedActiveProfile,
  writeProfileScreenSnapshot,
  invalidateProfileCache,
} from '../lib/profile-cache';
import { invalidateSetupsSnapshot } from '../hooks/useSetups';
import type { PlayerProfile } from '../../../types/profiles';
import type { PlayerSetup } from '../../../types/setups';

const GUIDANCE = 'The active profile is read from Profile Path in Settings.';
const LOAD_ERROR = 'Could not load the profile. Check Profile Path in Settings.';

function nameValue(): string {
  return (screen.getByLabelText('Name') as HTMLInputElement).value;
}

function raceValue(): string {
  return (screen.getByLabelText('Race number') as HTMLInputElement).value;
}

// Frame-0 mount tests for the Profile screen. The "Editing <id>" status line
// is gone: the inputs themselves show the active profile from the first
// render, the guidance is static copy, and only a confirmed load failure
// renders an error.
describe('Profile frame 0', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateProfileScreenSnapshot();
    invalidateSetupsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('the Profile card inherits the primitive gap-3 without a divergent override', () => {
    writeProfileScreenSnapshot(null)
    renderWithProviders(<Profile />)
    const card = screen.getByText('Profile').closest('[data-slot="card"]')!
    expect(card.className).toContain('gap-3')
    expect(card.className).not.toMatch(/gap-[0246]/)
  })

  it('shows the fixed guidance with empty inputs on a cache miss', () => {
    const activeGate = deferred<PlayerProfile | null>();
    const setupsGate = deferred<PlayerSetup[]>();
    const { profilesActive, setupsList } = stubRendererWindow();
    profilesActive.mockReturnValue(activeGate.promise);
    setupsList.mockReturnValue(setupsGate.promise);

    renderWithProviders(<Profile />);

    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(nameValue()).toBe('');
    expect(raceValue()).toBe('');
    expect(screen.queryByText(/^Editing /)).toBeNull();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });

  it('shows the fixed guidance with empty inputs when empty is confirmed', () => {
    writeProfileScreenSnapshot(null);

    renderWithProviders(<Profile />);

    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(nameValue()).toBe('');
    expect(raceValue()).toBe('');
    expect(screen.queryByText(/^Editing /)).toBeNull();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });

  it('shows the active profile in the inputs on frame 0 when found', () => {
    writeProfileScreenSnapshot(makeProfileFixture());

    renderWithProviders(<Profile />);

    expect(nameValue()).toBe('Rider');
    expect(raceValue()).toBe('7');
    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(screen.queryByText(/^Editing /)).toBeNull();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });

  it('tracks the active profile in the inputs when the load resolves', async () => {
    const stale = makeProfileFixture();
    writeProfileScreenSnapshot(stale);
    writeCachedActiveProfile(stale);
    const activeGate = deferred<PlayerProfile | null>();
    const { profilesActive } = stubRendererWindow();
    profilesActive.mockReturnValue(activeGate.promise);

    renderWithProviders(<Profile />);

    expect(nameValue()).toBe('Rider');

    activeGate.resolve(null);

    await waitFor(() => {
      expect(nameValue()).toBe('');
    });
    expect(raceValue()).toBe('');
    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(screen.queryByText(/^Editing /)).toBeNull();
  });

  it('renders the confirmed load error conditionally', async () => {
    const { profilesActive } = stubRendererWindow();
    profilesActive.mockRejectedValue(new Error('ipc failed'));

    renderWithProviders(<Profile />);

    await screen.findByText(LOAD_ERROR);
    expect(screen.getByText(GUIDANCE)).toBeTruthy();
  });

  it('changing Profile Path invalidates cache: next mount does not seed stale profile', () => {
    // Seed the cache with a profile from the old path
    const oldProfile = makeProfileFixture({ id: 'old-rider', name: 'Old Rider', raceNumber: '7' });
    writeProfileScreenSnapshot(oldProfile);
    writeCachedActiveProfile(oldProfile);

    // Simulate Profile Path change by invalidating the profile cache
    invalidateProfileCache();

    // Next mount should NOT show the stale profile - inputs should be empty
    // (cache was cleared, no confirmed snapshot to seed from)
    renderWithProviders(<Profile />);

    expect(nameValue()).toBe('');
    expect(raceValue()).toBe('');
    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });
});
