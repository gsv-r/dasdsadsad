import { describe, expect, it } from 'vitest'
import { filterMods } from './mod-search'

const FIXTURE = [
  { id: 'earth-mod', name: 'Earth Mod', preview: null },
  { id: 'earth-track', name: 'Earth Track', preview: null },
  { id: 'earth-park', name: 'Earth Park', preview: null },
  { id: 'moon', name: 'Moon', preview: null }
]

describe('filterMods', () => {
  it('matches by name ignoring case', () => {
    expect(filterMods(FIXTURE, 'earth').map((m) => m.id)).toEqual([
      'earth-mod',
      'earth-track',
      'earth-park'
    ])
    expect(filterMods(FIXTURE, 'EARTH').map((m) => m.id)).toEqual([
      'earth-mod',
      'earth-track',
      'earth-park'
    ])
  })

  it('matches ignoring accents', () => {
    const accented = [{ id: 'a', name: 'Terraço', preview: null }]
    expect(filterMods(accented, 'terraco').map((m) => m.id)).toEqual(['a'])
    expect(filterMods(accented, 'TERRAÇO').map((m) => m.id)).toEqual(['a'])
  })

  it('returns everything on an empty query', () => {
    expect(filterMods(FIXTURE, '')).toBe(FIXTURE)
    expect(filterMods(FIXTURE, '   ').map((m) => m.id)).toEqual([
      'earth-mod',
      'earth-track',
      'earth-park',
      'moon'
    ])
  })

  it('returns an empty list with no matches', () => {
    expect(filterMods(FIXTURE, 'xyz')).toEqual([])
  })

  it('matches by id ignoring case', () => {
    const items = [
      { id: 'Desert-Rally-01', name: 'Something Else', preview: null },
      { id: 'other', name: 'Other', preview: null }
    ]
    expect(filterMods(items, 'desert-rally').map((m) => m.id)).toEqual(['Desert-Rally-01'])
    expect(filterMods(items, 'DESERT-RALLY').map((m) => m.id)).toEqual(['Desert-Rally-01'])
  })

  it('matches by id when the name differs', () => {
    const items = [{ id: 'secret-earth-code', name: 'Moon', preview: null }]
    expect(filterMods(items, 'earth').map((m) => m.id)).toEqual(['secret-earth-code'])
    expect(filterMods(items, 'moon').map((m) => m.id)).toEqual(['secret-earth-code'])
  })

  it('matches accents and case in both name and id', () => {
    const items = [
      { id: 'plain-id', name: 'Terraço', preview: null },
      { id: 'pista-céu-2', name: 'Plain Name', preview: null }
    ]
    expect(filterMods(items, 'terraco').map((m) => m.id)).toEqual(['plain-id'])
    expect(filterMods(items, 'TERRAÇO').map((m) => m.id)).toEqual(['plain-id'])
    expect(filterMods(items, 'ceu').map((m) => m.id)).toEqual(['pista-céu-2'])
    expect(filterMods(items, 'CÉU').map((m) => m.id)).toEqual(['pista-céu-2'])
  })
})
