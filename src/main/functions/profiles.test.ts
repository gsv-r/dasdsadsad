import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => {
  const appMock = {
    getPath: vi.fn((): string => os.tmpdir()),
    getVersion: vi.fn(() => '0.0.0-test')
  }
  const ipcMainMock = { on: vi.fn() }
  return { appMock, ipcMainMock }
})

vi.mock('electron', () => ({
  app: mocks.appMock,
  ipcMain: mocks.ipcMainMock,
  default: { app: mocks.appMock, ipcMain: mocks.ipcMainMock }
}))

async function makeProfilesTree(
  entries: Record<string, string | null>
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-profiles-'))
  for (const [folder, ini] of Object.entries(entries)) {
    const folderPath = path.join(dir, folder)
    await fs.promises.mkdir(folderPath, { recursive: true })
    if (ini !== null) await fs.promises.writeFile(path.join(folderPath, 'profile.ini'), ini, 'utf-8')
  }
  return {
    dir,
    cleanup: async () => {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }
}

async function makeTempHome(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-home-'))
  return {
    dir,
    cleanup: async () => {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }
}

function globalIniPathFor(homeDir: string): string {
  return path.join(homeDir, 'Documents', 'PiBoSo', 'GP Bikes', 'global.ini')
}

describe('parseProfileInfo', () => {
  it('reads name and race_number from the info section', async () => {
    const { parseProfileInfo } = await import('./profiles.js')
    const parsed = parseProfileInfo('[info]\nname = Valentino\nrace_number = 46\n')
    expect(parsed).toEqual({ name: 'Valentino', raceNumber: '46' })
  })

  it('ignores other sections and matches keys case-insensitively', async () => {
    const { parseProfileInfo } = await import('./profiles.js')
    const parsed = parseProfileInfo(
      '[gfx]\nname = Wrong\n[INFO]\nNAME = Rider\nRACE_NUMBER = 7\n'
    )
    expect(parsed).toEqual({ name: 'Rider', raceNumber: '7' })
  })

  it('returns no keys when the info section is missing', async () => {
    const { parseProfileInfo } = await import('./profiles.js')
    expect(parseProfileInfo('[gfx]\nname = Wrong\n')).toEqual({})
  })
})

describe('isValidProfilePath', () => {
  it('accepts a folder with at least one profile.ini, tolerating quotes', async () => {
    const { isValidProfilePath } = await import('./paths.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Unnamed Profile\nrace_number = 0\n'
    })
    try {
      expect(isValidProfilePath(tree.dir)).toBe(true)
      expect(isValidProfilePath(`"${tree.dir}"`)).toBe(true)
    } finally {
      await tree.cleanup()
    }
  })

  it('rejects missing, empty and profile-less folders', async () => {
    const { isValidProfilePath } = await import('./paths.js')
    expect(isValidProfilePath(null)).toBe(false)
    expect(isValidProfilePath('')).toBe(false)
    expect(isValidProfilePath('   ')).toBe(false)
    expect(isValidProfilePath(path.join(os.tmpdir(), 'knee-down-no-such-dir'))).toBe(false)
    const empty = await makeProfilesTree({})
    try {
      expect(isValidProfilePath(empty.dir)).toBe(false)
    } finally {
      await empty.cleanup()
    }
    const noIni = await makeProfilesTree({ 'Some Folder': null })
    try {
      expect(isValidProfilePath(noIni.dir)).toBe(false)
    } finally {
      await noIni.cleanup()
    }
  })
})

describe('listProfilesIn', () => {
  it('lists the default and renamed profiles with name and race number', async () => {
    const { listProfilesIn } = await import('./profiles.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Unnamed Profile\nrace_number = 0\n',
      MyRider: '[info]\nname = MyRider\nrace_number = 46\n'
    })
    try {
      expect(listProfilesIn(tree.dir)).toEqual([
        { id: 'MyRider', name: 'MyRider', raceNumber: '46' },
        { id: 'Unnamed Profile', name: 'Unnamed Profile', raceNumber: '0' }
      ])
    } finally {
      await tree.cleanup()
    }
  })

  it('falls back to the folder name when the ini has no name', async () => {
    const { listProfilesIn } = await import('./profiles.js')
    const tree = await makeProfilesTree({ Renamed: '[info]\nrace_number = 99\n' })
    try {
      expect(listProfilesIn(tree.dir)).toEqual([
        { id: 'Renamed', name: 'Renamed', raceNumber: '99' }
      ])
    } finally {
      await tree.cleanup()
    }
  })

  it('returns empty for a missing folder instead of throwing', async () => {
    const { listProfilesIn } = await import('./profiles.js')
    expect(listProfilesIn(null)).toEqual([])
    expect(listProfilesIn('')).toEqual([])
    expect(listProfilesIn(path.join(os.tmpdir(), 'knee-down-no-such-dir'))).toEqual([])
  })
})

describe('getResolvedProfilePath', () => {
  it('returns null for an invalid manual path without falling back to auto', async () => {
    const { getResolvedProfilePath, getStoredProfilePath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const valid = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Unnamed Profile\n'
    })
    const invalidDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-profile-invalid-'))
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', invalidDir)
      store.set('pathsAuto.profile', valid.dir)
      expect(getStoredProfilePath()).toBe(invalidDir)
      expect(getResolvedProfilePath()).toBeNull()
      store.set('paths.profile', valid.dir)
      expect(getResolvedProfilePath()).toBe(valid.dir)
    } finally {
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await valid.cleanup()
      await fs.promises.rm(invalidDir, { recursive: true, force: true })
    }
  })
})

describe('resolveActiveProfile', () => {
  it('prefers a renamed profile over the Unnamed Profile', async () => {
    const { resolveActiveProfile } = await import('./profiles.js')
    expect(
      resolveActiveProfile([
        { id: 'Unnamed Profile', name: 'Unnamed Profile', raceNumber: '0' },
        { id: 'MyRider', name: 'MyRider', raceNumber: '46' }
      ])
    ).toEqual({ id: 'MyRider', name: 'MyRider', raceNumber: '46' })
  })

  it('falls back to the Unnamed Profile when nothing was renamed', async () => {
    const { resolveActiveProfile } = await import('./profiles.js')
    expect(
      resolveActiveProfile([{ id: 'Unnamed Profile', name: 'Unnamed Profile', raceNumber: '0' }])
    ).toEqual({ id: 'Unnamed Profile', name: 'Unnamed Profile', raceNumber: '0' })
  })

  it('returns null when no profile exists', async () => {
    const { resolveActiveProfile } = await import('./profiles.js')
    expect(resolveActiveProfile([])).toBeNull()
  })

  it('selects exactly one profile when several were renamed', async () => {
    const { listProfilesIn, resolveActiveProfile } = await import('./profiles.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Unnamed Profile\nrace_number = 0\n',
      Zebra: '[info]\nname = Zebra\nrace_number = 1\n',
      Alpha: '[info]\nname = Alpha\nrace_number = 2\n'
    })
    try {
      // The listing is sorted, so the first renamed profile wins and the
      // launcher never selects more than one.
      expect(resolveActiveProfile(listProfilesIn(tree.dir))).toEqual({
        id: 'Alpha',
        name: 'Alpha',
        raceNumber: '2'
      })
    } finally {
      await tree.cleanup()
    }
  })
})

describe('updateProfileIniContent', () => {
  it('replaces name and race_number while preserving the rest', async () => {
    const { updateProfileIniContent } = await import('./profiles.js')
    const raw = '[info]\nname = Old\nrace_number = 1\n\n[gfx]\nvsync = 1 ; keep me\n'
    expect(updateProfileIniContent(raw, 'New', '46')).toBe(
      '[info]\nname=New\nrace_number=46\n\n[gfx]\nvsync = 1 ; keep me\n'
    )
  })

  it('inserts missing keys after the info header', async () => {
    const { updateProfileIniContent } = await import('./profiles.js')
    expect(updateProfileIniContent('[info]\nfoo = 1\n', 'Rider', '7')).toBe(
      '[info]\nname=Rider\nrace_number=7\nfoo = 1\n'
    )
  })

  it('keeps name before race_number when the pair is inverted', async () => {
    const { updateProfileIniContent } = await import('./profiles.js')
    expect(updateProfileIniContent('[info]\nrace_number = 1\nname = Old\n', 'New', '46')).toBe(
      '[info]\nname=New\nrace_number=46\n'
    )
  })

  it('inserts a missing key next to the other one, name first', async () => {
    const { updateProfileIniContent } = await import('./profiles.js')
    expect(updateProfileIniContent('[info]\nname = Old\n', 'New', '46')).toBe(
      '[info]\nname=New\nrace_number=46\n'
    )
    expect(updateProfileIniContent('[info]\nrace_number = 1\n', 'New', '46')).toBe(
      '[info]\nname=New\nrace_number=46\n'
    )
  })

  it('appends a missing info section', async () => {
    const { updateProfileIniContent } = await import('./profiles.js')
    expect(updateProfileIniContent('[gfx]\nvsync = 1\n', 'Rider', '7')).toBe(
      '[gfx]\nvsync = 1\n[info]\nname=Rider\nrace_number=7\n'
    )
  })
})

describe('updateGlobalIniContent', () => {
  it('replaces lastprofile and nickname while preserving the rest', async () => {
    const { updateGlobalIniContent } = await import('./profiles.js')
    const raw = '[profile]\nlastprofile = Old\nnickname = Old\n\n[core]\nreplay = 40 ; keep me\n'
    expect(updateGlobalIniContent(raw, 'New', 'New')).toBe(
      '[profile]\nlastprofile=New\nnickname=New\n\n[core]\nreplay = 40 ; keep me\n'
    )
  })

  it('inserts missing keys after the profile header', async () => {
    const { updateGlobalIniContent } = await import('./profiles.js')
    expect(updateGlobalIniContent('[profile]\nfoo = 1\n', 'Rider', 'Rider')).toBe(
      '[profile]\nlastprofile=Rider\nnickname=Rider\nfoo = 1\n'
    )
  })

  it('keeps lastprofile before nickname when the pair is inverted', async () => {
    const { updateGlobalIniContent } = await import('./profiles.js')
    expect(updateGlobalIniContent('[profile]\nnickname = Old\nlastprofile = Old\n', 'New', 'New')).toBe(
      '[profile]\nlastprofile=New\nnickname=New\n'
    )
  })

  it('creates a missing profile section', async () => {
    const { updateGlobalIniContent } = await import('./profiles.js')
    expect(updateGlobalIniContent('[core]\nreplay = 40\n', 'Rider', 'Rider')).toBe(
      '[core]\nreplay = 40\n[profile]\nlastprofile=Rider\nnickname=Rider\n'
    )
    expect(updateGlobalIniContent('', 'Rider', 'Rider')).toBe(
      '[profile]\nlastprofile=Rider\nnickname=Rider\n'
    )
  })
})

describe('updateProfileViewContent', () => {
  it('appends a [view] section when none exists', async () => {
    const { updateProfileViewContent } = await import('./profiles.js')
    const raw = '[info]\nname = Rider\n'
    const result = updateProfileViewContent(raw)
    expect(result).toContain('[view]')
    expect(result).toContain('curview=0')
    expect(result).toContain('fov=90.000000')
    expect(result).toContain('[info]')
    expect(result).toContain('name = Rider')
  })

  it('replaces a single [view] section with fixed values', async () => {
    const { updateProfileViewContent } = await import('./profiles.js')
    const raw = '[info]\nname = Rider\n\n[view]\ncurview=5\nfov=60\n'
    const result = updateProfileViewContent(raw)
    // Only one [view] section
    const viewCount = (result.match(/\[view\]/g) || []).length
    expect(viewCount).toBe(1)
    // Fixed values are present
    expect(result).toContain('curview=0')
    expect(result).toContain('fov=90.000000')
    expect(result).toContain('tilt=0.130000')
    // Other sections preserved
    expect(result).toContain('[info]')
    expect(result).toContain('name = Rider')
  })

  it('consolidates multiple [view] sections into one, preserving other content', async () => {
    const { updateProfileViewContent } = await import('./profiles.js')
    // Duplicate [view] sections with other content in between
    const raw = `[view]
curview=1
fov=80

[info]
name = Test Rider
race_number = 46

[view]
curview=2
fov=70

[gfx]
vsync = 1
`
    const result = updateProfileViewContent(raw)
    // Exactly one [view] section
    const viewCount = (result.match(/\[view\]/g) || []).length
    expect(viewCount).toBe(1)
    // Fixed values are present
    expect(result).toContain('curview=0')
    expect(result).toContain('fov=90.000000')
    expect(result).toContain('tilt=0.130000')
    expect(result).toContain('pitch=1.000000')
    expect(result).toContain('corner_anticipation=2')
    // Other sections preserved in order
    expect(result).toContain('[info]')
    expect(result).toContain('name = Test Rider')
    expect(result).toContain('race_number = 46')
    expect(result).toContain('[gfx]')
    expect(result).toContain('vsync = 1')
    // The [view] section should be at the position of the last [view] section
    const viewIndex = result.indexOf('[view]')
    const gfxIndex = result.indexOf('[gfx]')
    expect(viewIndex).toBeLessThan(gfxIndex)
  })

  it('is idempotent: running twice produces the same result', async () => {
    const { updateProfileViewContent } = await import('./profiles.js')
    const raw = `[view]
curview=1
fov=80

[info]
name = Test Rider

[view]
curview=2
fov=70
`
    const first = updateProfileViewContent(raw)
    const second = updateProfileViewContent(first)
    expect(second).toBe(first)
  })
})

describe('saveProfileInfo', () => {
  it('renames the folder to the new name and writes name and race_number', async () => {
    const { saveProfileInfo, listProfilesIn } = await import('./profiles.js')
    const { getGlobalIniPath, getResolvedProfilePath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Old\nrace_number = 1\n\n[gfx]\nvsync = 1\n'
    })
    const home = await makeTempHome()
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(home.dir)
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      expect(getResolvedProfilePath()).toBe(tree.dir)
      expect(getGlobalIniPath()).toBe(globalIniPathFor(home.dir))
      expect(saveProfileInfo('Unnamed Profile', 'New', '46')).toEqual({ ok: true })
      // The folder id follows the new name; the old folder is gone.
      expect(listProfilesIn(tree.dir)).toEqual([{ id: 'New', name: 'New', raceNumber: '46' }])
      expect(fs.existsSync(path.join(tree.dir, 'Unnamed Profile'))).toBe(false)
      const raw = await fs.promises.readFile(path.join(tree.dir, 'New', 'profile.ini'), 'utf-8')
      expect(raw).toContain('name=New')
      expect(raw).toContain('race_number=46')
      expect(raw).toContain('[gfx]')
      expect(raw).toContain('vsync = 1')
      // global.ini stays synchronized with the same profile name.
      const globalRaw = await fs.promises.readFile(getGlobalIniPath(), 'utf-8')
      expect(globalRaw).toContain('lastprofile=New')
      expect(globalRaw).toContain('nickname=New')
    } finally {
      homedirSpy.mockRestore()
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
      await home.cleanup()
    }
  })

  it('rewrites only the ini when the name is unchanged', async () => {
    const { saveProfileInfo, listProfilesIn } = await import('./profiles.js')
    const { getGlobalIniPath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const tree = await makeProfilesTree({
      MyRider: '[info]\nname = MyRider\nrace_number = 1\n\n[gfx]\nvsync = 1\n'
    })
    const home = await makeTempHome()
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(home.dir)
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      expect(saveProfileInfo('MyRider', 'MyRider', '46')).toEqual({ ok: true })
      expect(listProfilesIn(tree.dir)).toEqual([
        { id: 'MyRider', name: 'MyRider', raceNumber: '46' }
      ])
      const raw = await fs.promises.readFile(path.join(tree.dir, 'MyRider', 'profile.ini'), 'utf-8')
      expect(raw).toContain('race_number=46')
      expect(raw).toContain('vsync = 1')
      const globalRaw = await fs.promises.readFile(getGlobalIniPath(), 'utf-8')
      expect(globalRaw).toContain('lastprofile=MyRider')
      expect(globalRaw).toContain('nickname=MyRider')
    } finally {
      homedirSpy.mockRestore()
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
      await home.cleanup()
    }
  })

  it('rejects a rename to an already used name without changing anything', async () => {
    const { saveProfileInfo, listProfilesIn } = await import('./profiles.js')
    const { getGlobalIniPath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const beforeTaken = '[info]\nname = Taken\nrace_number = 46\n'
    const beforeOther = '[info]\nname = Other\nrace_number = 1\n'
    const tree = await makeProfilesTree({ Taken: beforeTaken, Other: beforeOther })
    const home = await makeTempHome()
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(home.dir)
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      // "Other" sorts first, so it is the active profile here.
      expect(saveProfileInfo('Other', 'Taken', '7')).toEqual({
        ok: false,
        reason: 'name-taken'
      })
      expect(
        await fs.promises.readFile(path.join(tree.dir, 'Taken', 'profile.ini'), 'utf-8')
      ).toBe(beforeTaken)
      expect(await fs.promises.readFile(path.join(tree.dir, 'Other', 'profile.ini'), 'utf-8')).toBe(
        beforeOther
      )
      expect(listProfilesIn(tree.dir)).toEqual([
        { id: 'Other', name: 'Other', raceNumber: '1' },
        { id: 'Taken', name: 'Taken', raceNumber: '46' }
      ])
      expect(fs.existsSync(getGlobalIniPath())).toBe(false)
    } finally {
      homedirSpy.mockRestore()
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
      await home.cleanup()
    }
  })

  it('rejects invalid values and traversal ids without writing', async () => {
    const { saveProfileInfo } = await import('./profiles.js')
    expect(saveProfileInfo('../escape', 'Rider', '7')).toEqual({ ok: false, reason: 'invalid-id' })
    expect(saveProfileInfo('Unnamed Profile', '  ', '7')).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
    // The name becomes the folder name, so folder-unsafe values are rejected.
    expect(saveProfileInfo('Unnamed Profile', 'Bad/Name', '7')).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
    expect(saveProfileInfo('Unnamed Profile', 'Bad:Name', '7')).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
    expect(saveProfileInfo('Unnamed Profile', 'CON', '7')).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
    expect(saveProfileInfo('Unnamed Profile', 'Rider', '')).toEqual({
      ok: false,
      reason: 'invalid-race-number'
    })
    // Race numbers are integers from 0 to 99.
    expect(saveProfileInfo('Unnamed Profile', 'Rider', 'abc')).toEqual({
      ok: false,
      reason: 'invalid-race-number'
    })
    expect(saveProfileInfo('Unnamed Profile', 'Rider', '100')).toEqual({
      ok: false,
      reason: 'invalid-race-number'
    })
  })

  it('reports profile-not-found when the target is missing', async () => {
    const { saveProfileInfo } = await import('./profiles.js')
    const { getGlobalIniPath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Old\nrace_number = 1\n'
    })
    const home = await makeTempHome()
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(home.dir)
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      expect(saveProfileInfo('Ghost', 'Rider', '7')).toEqual({
        ok: false,
        reason: 'profile-not-found'
      })
      expect(fs.existsSync(getGlobalIniPath())).toBe(false)
    } finally {
      homedirSpy.mockRestore()
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
      await home.cleanup()
    }
  })

  it('refuses a non-active profile without writing anything', async () => {
    const { saveProfileInfo } = await import('./profiles.js')
    const { getGlobalIniPath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const before = '[info]\nname = Old\nrace_number = 1\n'
    const tree = await makeProfilesTree({
      'Unnamed Profile': before,
      Other: '[info]\nname = Other\nrace_number = 46\n'
    })
    const home = await makeTempHome()
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(home.dir)
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      // "Unnamed Profile" exists but is not the active one: rejected, file untouched.
      expect(saveProfileInfo('Unnamed Profile', 'New', '7')).toEqual({
        ok: false,
        reason: 'profile-not-found'
      })
      expect(
        await fs.promises.readFile(path.join(tree.dir, 'Unnamed Profile', 'profile.ini'), 'utf-8')
      ).toBe(before)
      expect(fs.existsSync(getGlobalIniPath())).toBe(false)
      // The active profile still saves, renaming its folder to the new name.
      expect(saveProfileInfo('Other', 'Changed', '7')).toEqual({ ok: true })
      const { listProfilesIn: listAfter } = await import('./profiles.js')
      expect(listAfter(tree.dir)).toEqual([
        { id: 'Changed', name: 'Changed', raceNumber: '7' },
        { id: 'Unnamed Profile', name: 'Old', raceNumber: '1' }
      ])
      const globalRaw = await fs.promises.readFile(getGlobalIniPath(), 'utf-8')
      expect(globalRaw).toContain('lastprofile=Changed')
      expect(globalRaw).toContain('nickname=Changed')
    } finally {
      homedirSpy.mockRestore()
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
      await home.cleanup()
    }
  })

  it('preserves other global.ini settings when pointing at the new name', async () => {
    const { saveProfileInfo } = await import('./profiles.js')
    const { getGlobalIniPath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Old\nrace_number = 1\n'
    })
    const home = await makeTempHome()
    const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(home.dir)
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      const globalIniPath = getGlobalIniPath()
      await fs.promises.mkdir(path.dirname(globalIniPath), { recursive: true })
      await fs.promises.writeFile(
        globalIniPath,
        '[profile]\nlastprofile=Old\nnickname=Old\n\n[core]\nreplay = 40 ; keep me\n',
        'utf-8'
      )
      expect(saveProfileInfo('Unnamed Profile', 'Rider', '7')).toEqual({ ok: true })
      const globalRaw = await fs.promises.readFile(globalIniPath, 'utf-8')
      expect(globalRaw).toContain('lastprofile=Rider')
      expect(globalRaw).toContain('nickname=Rider')
      expect(globalRaw).toContain('[core]')
      expect(globalRaw).toContain('replay = 40 ; keep me')
      const profileRaw = await fs.promises.readFile(
        path.join(tree.dir, 'Rider', 'profile.ini'),
        'utf-8'
      )
      expect(profileRaw).toContain('name=Rider')
      expect(profileRaw).toContain('race_number=7')
    } finally {
      homedirSpy.mockRestore()
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
      await home.cleanup()
    }
  })
})

describe('resetActiveProfileInfo', () => {
  it('clears name and race_number while preserving the rest of the file', async () => {
    const { resetActiveProfileInfo, listProfilesIn } = await import('./profiles.js')
    const { store } = await import('../store.js')
    const tree = await makeProfilesTree({
      'Unnamed Profile': '[info]\nname = Custom\nrace_number = 42\n\n[gfx]\nvsync = 1\n'
    })
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', tree.dir)
      store.set('pathsAuto.profile', null)
      expect(resetActiveProfileInfo()).toBe(true)
      expect(listProfilesIn(tree.dir)).toEqual([
        { id: 'Unnamed Profile', name: 'Unnamed Profile', raceNumber: null }
      ])
      const raw = await fs.promises.readFile(
        path.join(tree.dir, 'Unnamed Profile', 'profile.ini'),
        'utf-8'
      )
      expect(raw).toContain('[gfx]')
      expect(raw).toContain('vsync = 1')
    } finally {
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
      await tree.cleanup()
    }
  })

  it('does nothing without a configured path or profile', async () => {
    const { resetActiveProfileInfo } = await import('./profiles.js')
    const { store } = await import('../store.js')
    const prevManual = store.get('paths.profile')
    const prevAuto = store.get('pathsAuto.profile')
    try {
      store.set('paths.profile', null)
      store.set('pathsAuto.profile', null)
      expect(resetActiveProfileInfo()).toBe(false)
    } finally {
      store.set('paths.profile', (prevManual as string | null) ?? null)
      store.set('pathsAuto.profile', (prevAuto as string | null) ?? null)
    }
  })
})
