// Launcher-only country data for the nationality selector. Flag images are
// embedded at build time (see nationality-field); names come from the static
// English list matching the Flagpedia index. No game integration.
import { COUNTRY_NAMES } from './country-names'
import { normalizeSearchText } from './search-text'

export { normalizeSearchText }

export interface Country {
  /** Lowercase ISO code matching the embedded flag file (e.g. 'br'). */
  code: string
  /** English display name (e.g. 'Brazil'). */
  name: string
  /** Bundled flag image URL. */
  flag: string
}

// Flag images embedded at build time: no web request at runtime.
const flagModules = import.meta.glob('../assets/flags/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
})

// English name for a lowercase ISO code, or undefined when the static list
// has none.
export function countryName(code: string): string | undefined {
  return COUNTRY_NAMES[code.toLowerCase()] ?? undefined
}

export function filterCountries(countries: Country[], query: string): Country[] {
  const needle = normalizeSearchText(query.trim())
  if (needle === '') return countries
  return countries.filter((country) => normalizeSearchText(country.name).includes(needle))
}

export function sortCountries(countries: Country[]): Country[] {
  return [...countries].sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

function buildCountries(): Country[] {
  const countries: Country[] = []
  for (const [file, flag] of Object.entries(flagModules)) {
    const code = file.slice(file.lastIndexOf('/') + 1, -'.png'.length)
    const name = countryName(code)
    if (name === undefined || typeof flag !== 'string') continue
    countries.push({ code, name, flag })
  }
  return sortCountries(countries)
}

// Every embedded flag with an English name, sorted by name.
export const COUNTRIES: Country[] = buildCountries()

// Stored raw value validated against the embedded flags.
export function normalizeNationality(raw: unknown): string | null {
  const code = typeof raw === 'string' ? raw.toLowerCase() : null
  return code !== null && COUNTRIES.some((country) => country.code === code) ? code : null
}
