import { describe, expect, it } from 'vitest'
import {
  COUNTRIES,
  countryName,
  filterCountries,
  normalizeNationality,
  normalizeSearchText,
  sortCountries,
  type Country
} from './countries'

const FIXTURE: Country[] = [
  { code: 'de', name: 'Alemanha', flag: 'de.png' },
  { code: 'br', name: 'Brasil', flag: 'br.png' },
  { code: 'pt', name: 'Portugal', flag: 'pt.png' }
]

describe('normalizeSearchText', () => {
  it('ignores accents and case', () => {
    expect(normalizeSearchText('Alemânha')).toBe('alemanha')
    expect(normalizeSearchText('ÉIRE')).toBe('eire')
    expect(normalizeSearchText('Brasil')).toBe('brasil')
  })
})

describe('countryName', () => {
  it('names countries in English like the Flagpedia index', () => {
    expect(countryName('br')).toBe('Brazil')
    expect(countryName('de')).toBe('Germany')
    expect(countryName('gb-eng')).toBe('England')
  })

  it('returns undefined without an English name', () => {
    expect(countryName('xx')).toBeUndefined()
  })
})

describe('filterCountries', () => {
  it('matches ignoring accents and case', () => {
    expect(filterCountries(FIXTURE, 'alemanha').map((c) => c.code)).toEqual(['de'])
    expect(filterCountries(FIXTURE, 'ALEMÂNHA').map((c) => c.code)).toEqual(['de'])
    expect(filterCountries(FIXTURE, '  brasil  ').map((c) => c.code)).toEqual(['br'])
  })

  it('returns everything on an empty query', () => {
    expect(filterCountries(FIXTURE, '')).toBe(FIXTURE)
    expect(filterCountries(FIXTURE, '   ').map((c) => c.code)).toEqual(['de', 'br', 'pt'])
  })

  it('returns an empty list with no matches', () => {
    expect(filterCountries(FIXTURE, 'xyz')).toEqual([])
  })
})

describe('sortCountries', () => {
  it('sorts by name without mutating the input', () => {
    expect(sortCountries(FIXTURE).map((c) => c.code)).toEqual(['de', 'br', 'pt'])
    expect(FIXTURE.map((c) => c.code)).toEqual(['de', 'br', 'pt'])
  })
})

describe('COUNTRIES', () => {
  it('embeds flags with English names', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200)
    expect(COUNTRIES.some((c) => c.code === 'br' && c.name === 'Brazil')).toBe(true)
    expect(COUNTRIES.some((c) => c.code === 'gb-eng' && c.name === 'England')).toBe(true)
  })

  it('is sorted alphabetically, first entry first', () => {
    expect(COUNTRIES[0]).toMatchObject({ code: 'af', name: 'Afghanistan' })
    for (let i = 1; i < COUNTRIES.length; i += 1) {
      expect(COUNTRIES[i - 1].name.localeCompare(COUNTRIES[i].name, 'en')).toBeLessThanOrEqual(0)
    }
  })
})

describe('normalizeNationality', () => {
  it('accepts embedded codes case-insensitively', () => {
    expect(normalizeNationality('BR')).toBe('br')
    expect(normalizeNationality('br')).toBe('br')
  })

  it('rejects unknown and non-string values', () => {
    expect(normalizeNationality('xx')).toBeNull()
    expect(normalizeNationality(null)).toBeNull()
    expect(normalizeNationality(42)).toBeNull()
  })
})
