/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import SetupsCard from './setups-card';
import {
  deferred,
  makeSetupFixture,
  renderWithProviders,
  stubRendererWindow,
} from '../../test-utils';
import { invalidateSetupsSnapshot } from '../../hooks/useSetups';
import type { PlayerSetup } from '../../../../types/setups';

const GUIDANCE = 'Create setups here and apply them from Practice.';

function pendingSetups(): Promise<PlayerSetup[]> {
  return new Promise<PlayerSetup[]>(() => undefined);
}

// Frame-0 mount tests for the setups card: the fixed guidance is visible on
// the first render in any state, while setup rows only ever show confirmed
// data. There is no count or status line anymore.
describe('SetupsCard frame 0', () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateSetupsSnapshot();
    stubRendererWindow();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the fixed guidance with no rows on a cache miss', () => {
    const { setupsList } = stubRendererWindow();
    setupsList.mockReturnValue(deferred<PlayerSetup[]>().promise);

    renderWithProviders(<SetupsCard />);

    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(screen.queryByText('Setup A')).toBeNull();
  });

  it('shows the fixed guidance with no rows when empty is confirmed', async () => {
    // First mount confirms the empty list through IPC.
    const { setupsList } = stubRendererWindow();
    const listGate = deferred<PlayerSetup[]>();
    setupsList.mockReturnValue(listGate.promise);
    const first = renderWithProviders(<SetupsCard />);
    expect(screen.getByText(GUIDANCE)).toBeTruthy();

    listGate.resolve([]);
    await act(async () => {});
    first.unmount();

    // Second mount seeds from the confirmed snapshot: no fetch at all.
    const again = stubRendererWindow();
    again.setupsList.mockReturnValue(pendingSetups());
    renderWithProviders(<SetupsCard />);

    expect(screen.getByText(GUIDANCE)).toBeTruthy();
    expect(screen.queryByText('Setup A')).toBeNull();
    expect(again.setupsList).not.toHaveBeenCalled();
  });

  it('shows the confirmed rows on frame 0 with a seeded list', async () => {
    const { setupsList } = stubRendererWindow();
    setupsList.mockReturnValue(
      Promise.resolve([makeSetupFixture(), makeSetupFixture({ id: 'setup-b', name: 'Setup B' })]),
    );
    const first = renderWithProviders(<SetupsCard />);
    await screen.findByText('Setup A');
    first.unmount();

    setupsList.mockReturnValue(pendingSetups());
    renderWithProviders(<SetupsCard />);

    expect(screen.getByText('Setup A')).toBeTruthy();
    expect(screen.getByText('Setup B')).toBeTruthy();
    expect(screen.getByText(GUIDANCE)).toBeTruthy();
  });

  it('removes the row with no text swap on delete', async () => {
    const { setupsDelete, setupsList } = stubRendererWindow();
    setupsList.mockReturnValue(Promise.resolve([makeSetupFixture()]));
    renderWithProviders(<SetupsCard />);

    await screen.findByText('Setup A');
    expect(screen.getByText(GUIDANCE)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Setup A' }));
    const dialog = screen.getByRole('alertdialog');

    const deleteGate = deferred<{ ok: true }>();
    setupsDelete.mockReturnValue(deleteGate.promise);
    setupsList.mockReturnValue(Promise.resolve([]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete' }));
    deleteGate.resolve({ ok: true });

    await waitFor(() => {
      expect(screen.queryByText('Setup A')).toBeNull();
    });
    expect(screen.getByText(GUIDANCE)).toBeTruthy();
  });
});
