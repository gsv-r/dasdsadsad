/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import Practice from './practice';
import {
  deferred,
  makeSetupFixture,
  renderWithProviders,
  stubRendererWindow,
  stubResizeObserver,
} from '../test-utils';
import { invalidateActiveSetupSnapshot } from '../hooks/useActiveSetup';
import { invalidateSetupsSnapshot } from '../hooks/useSetups';
import type { PlayerSetup } from '../../../types/setups';

const TEXT = 'Select a setup, or None for manual.';
// Regression guard: 'Setup Active' must never render.
const OLD_ACTIVE = 'Setup Active';

// Frame-0 mount tests for the Practice setup guidance: static copy, visible
// on the first render in any state and identical across selection changes.
describe('Practice frame 0', () => {
  beforeEach(() => {
    stubResizeObserver();
    window.localStorage.clear();
    invalidateSetupsSnapshot();
    invalidateActiveSetupSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the fixed guidance on frame 0 while setups are unconfirmed', () => {
    const { setupsList, storeGet } = stubRendererWindow();
    setupsList.mockReturnValue(deferred<PlayerSetup[]>().promise);
    storeGet.mockReturnValue(deferred<unknown>().promise);

    renderWithProviders(<Practice />);

    expect(screen.getByLabelText('Setup')).toBeTruthy();
    expect(screen.getByText(TEXT)).toBeTruthy();
    expect(screen.queryByText(OLD_ACTIVE)).toBeNull();
  });

  it('renders the fixed guidance on frame 0 when empty is confirmed', async () => {
    // First mount confirms the empty list and the None setup_id through IPC.
    const { setupsList, storeGet } = stubRendererWindow();
    const setupsGate = deferred<PlayerSetup[]>();
    const storeGate = deferred<unknown>();
    setupsList.mockReturnValue(setupsGate.promise);
    storeGet.mockReturnValue(storeGate.promise);
    const first = renderWithProviders(<Practice />);
    expect(screen.getByText(TEXT)).toBeTruthy();

    setupsGate.resolve([]);
    storeGate.resolve(null);
    await act(async () => {});
    first.unmount();

    // Second mount seeds from both confirmed snapshots: no fetch at all.
    const again = stubRendererWindow();
    again.setupsList.mockReturnValue(new Promise<PlayerSetup[]>(() => undefined));
    again.storeGet.mockReturnValue(new Promise<unknown>(() => undefined));
    renderWithProviders(<Practice />);

    expect(screen.getByLabelText('Setup')).toBeTruthy();
    expect(screen.getByText(TEXT)).toBeTruthy();
    expect(screen.queryByText(OLD_ACTIVE)).toBeNull();
    expect(again.setupsList).not.toHaveBeenCalled();
  });

  it('renders the fixed guidance on frame 0 with a setup selected', async () => {
    // First mount confirms a selected setup through IPC.
    const { setupsList, storeGet } = stubRendererWindow();
    const setupsGate = deferred<PlayerSetup[]>();
    const storeGate = deferred<unknown>();
    setupsList.mockReturnValue(setupsGate.promise);
    storeGet.mockReturnValue(storeGate.promise);
    const first = renderWithProviders(<Practice />);

    setupsGate.resolve([makeSetupFixture()]);
    storeGate.resolve('setup-a');
    await act(async () => {});
    first.unmount();

    // Second mount seeds the selection from the confirmed snapshots.
    const again = stubRendererWindow();
    again.setupsList.mockReturnValue(new Promise<PlayerSetup[]>(() => undefined));
    again.storeGet.mockReturnValue(new Promise<unknown>(() => undefined));
    renderWithProviders(<Practice />);

    expect(screen.getByLabelText('Setup')).toBeTruthy();
    expect(screen.getByText(TEXT)).toBeTruthy();
    expect(screen.queryByText(OLD_ACTIVE)).toBeNull();
    expect(again.setupsList).not.toHaveBeenCalled();
  });

  it('keeps the identical text across None, selected and deselected states', async () => {
    // None selected.
    const noneStubs = stubRendererWindow();
    noneStubs.storeGet.mockReturnValue(Promise.resolve(null));
    noneStubs.setupsList.mockReturnValue(Promise.resolve([]));
    const first = renderWithProviders(<Practice />);
    await act(async () => {});
    const noneText = screen.getByText(TEXT).textContent;
    first.unmount();

    // A setup selected.
    window.localStorage.clear();
    invalidateSetupsSnapshot();
    invalidateActiveSetupSnapshot();
    const selectedStubs = stubRendererWindow();
    selectedStubs.storeGet.mockReturnValue(Promise.resolve('setup-a'));
    selectedStubs.setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]));
    const second = renderWithProviders(<Practice />);
    await act(async () => {});
    const selectedText = screen.getByText(TEXT).textContent;
    second.unmount();

    // Back to None.
    window.localStorage.clear();
    invalidateSetupsSnapshot();
    invalidateActiveSetupSnapshot();
    const deselectedStubs = stubRendererWindow();
    deselectedStubs.storeGet.mockReturnValue(Promise.resolve(null));
    deselectedStubs.setupsList.mockReturnValue(Promise.resolve([]));
    renderWithProviders(<Practice />);
    await act(async () => {});
    const deselectedText = screen.getByText(TEXT).textContent;

    expect(noneText).toBe(selectedText);
    expect(selectedText).toBe(deselectedText);
  });
});
