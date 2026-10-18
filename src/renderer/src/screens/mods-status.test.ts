import { describe, expect, it } from 'vitest';
import { getBikesEmptyMessage, getTracksEmptyMessage } from '../hooks/useMods.js';
import { INVALID_MODS_FOLDER_MESSAGE } from '../lib/mods-errors.js';

describe('mods empty messages', () => {
  it('renders a blank slot unless main validation confirms an invalid folder', () => {
    expect(getBikesEmptyMessage(false)).toBe('');
    expect(getTracksEmptyMessage(false)).toBe('');
  });

  it('shows invalid only when main validation confirms it', () => {
    expect(getBikesEmptyMessage(true)).toBe(INVALID_MODS_FOLDER_MESSAGE);
    expect(getTracksEmptyMessage(true)).toBe(INVALID_MODS_FOLDER_MESSAGE);
  });
});
