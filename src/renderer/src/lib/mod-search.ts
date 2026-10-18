import { normalizeSearchText } from './search-text'

// Filters mods by name or id, accent- and case-insensitive. Empty query
// returns the input unchanged.
export function filterMods<T extends { id: string; name?: string }>(
  items: T[],
  query: string
): T[] {
  const needle = normalizeSearchText(query.trim())
  if (needle === '') return items
  return items.filter(
    (item) =>
      normalizeSearchText(item.name ?? '').includes(needle) ||
      normalizeSearchText(item.id).includes(needle)
  )
}
