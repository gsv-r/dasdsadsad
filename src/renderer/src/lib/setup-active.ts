// Single source of truth for "is a valid setup active?".
// A setup is active only when practice.setup_id is a non-empty string that
// exists in the setups list. Reads the main store via IPC (same mechanism
// everywhere else); returns false on any IPC failure.
export async function isSetupActive(): Promise<boolean> {
  try {
    const [setupId, setups] = await Promise.all([
      window.store.get<string>('practice.setup_id'),
      window.setups.list()
    ])
    return (
      typeof setupId === 'string' &&
      setupId !== '' &&
      Array.isArray(setups) &&
      setups.some((s) => s.id === setupId)
    )
  } catch {
    return false
  }
}
