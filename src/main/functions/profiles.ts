import fs from 'fs'
import path from 'path'
import { getGlobalIniPath, getResolvedProfilePath } from './paths'
import type { PlayerProfile, ProfileSaveResult } from '../../types/profiles'
import { isValidProfileFolderName, profileNameSchema, raceNumberSchema } from '../../types/profiles'

const PROFILE_INI_FILENAME = 'profile.ini'
const UNNAMED_PROFILE_ID = 'Unnamed Profile'

// Fixed [view] section applied to all profiles on every edit.
const VIEW_SECTION_CONTENT = `[view]
curview=0
fov=90.000000
tilt=0.130000
pitch=1.000000
corner_anticipation=2
corner_anticipation_scale=1.000000
lean_heading_scale=33.200001
free_look=0
free_look_input=0
mode=1
show_HUD=0
dynamic_shift=1
shiftmul_lat=1.5
shiftmul_vert=4.2
shiftmul_long=1.0
`

function isDir(target: string): boolean {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function isFile(target: string): boolean {
  try {
    return fs.existsSync(target) && fs.statSync(target).isFile()
  } catch {
    return false
  }
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim()
    }
  }
  return trimmed
}

// Reads the `[info]` section of a profile.ini and returns the real field
// values. Keys are matched case-insensitively (`name`, `race_number`);
// anything else in the file is ignored. Missing keys stay undefined so the
// caller can fall back to the folder name.
export function parseProfileInfo(content: string): {
  name?: string
  raceNumber?: string
} {
  let inInfo = false
  let name: string | undefined
  let raceNumber: string | undefined
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue
    const section = line.match(/^\[(.+)\]$/)
    if (section) {
      inInfo = section[1].trim().toLowerCase() === 'info'
      continue
    }
    if (!inInfo) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = stripQuotes(line.slice(separator + 1))
    if (value === '') continue
    if (key === 'name' && name === undefined) name = value
    else if (key === 'race_number' && raceNumber === undefined) raceNumber = value
  }
  return { name, raceNumber }
}

function readOneProfile(profilesPath: string, folder: string): PlayerProfile | null {
  const iniPath = path.join(profilesPath, folder, PROFILE_INI_FILENAME)
  if (!isFile(iniPath)) return null
  try {
    const parsed = parseProfileInfo(fs.readFileSync(iniPath, 'utf-8'))
    return {
      id: folder,
      name: parsed.name ?? folder,
      raceNumber: parsed.raceNumber ?? null
    }
  } catch {
    return { id: folder, name: folder, raceNumber: null }
  }
}

// Lists every valid profile inside `dir`: a direct subfolder containing a
// `profile.ini`. A missing folder is empty, not an exception. Read-only:
// never writes to `profile.ini`.
export function listProfilesIn(dir: string | null | undefined): PlayerProfile[] {
  if (!dir || typeof dir !== 'string') return []
  const trimmed = stripQuotes(dir.trim())
  if (trimmed === '' || !isDir(trimmed)) return []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(trimmed, { withFileTypes: true })
  } catch {
    return []
  }
  const profiles: PlayerProfile[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profile = readOneProfile(trimmed, entry.name)
    if (profile) profiles.push(profile)
  }
  profiles.sort((a, b) => a.id.localeCompare(b.id))
  return profiles
}

// Lists profiles under the resolved Profile Path (manual ?? auto).
export function listProfiles(): PlayerProfile[] {
  return listProfilesIn(getResolvedProfilePath())
}

// The active profile is a renamed one when it exists, otherwise the
// default "Unnamed Profile". Pure: operates on an already listed array.
export function resolveActiveProfile(profiles: PlayerProfile[]): PlayerProfile | null {
  if (profiles.length === 0) return null
  return (
    profiles.find((profile) => profile.id !== UNNAMED_PROFILE_ID) ??
    profiles.find((profile) => profile.id === UNNAMED_PROFILE_ID) ??
    null
  )
}

// The active profile under the resolved Profile Path. A missing path is
// empty, not an exception.
export function getActiveProfile(): PlayerProfile | null {
  return resolveActiveProfile(listProfiles())
}

// Rewrites the `[info]` section of a profile.ini with the new `name` and
// `race_number`, preserving every other line exactly (comments, other
// sections, key order). The `name` line always comes before `race_number`:
// an inverted pair is swapped, a missing key is inserted next to the other
// one, and a missing section is appended. Pure: no disk access.
export function updateProfileIniContent(content: string, name: string, raceNumber: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const hasTrailing = /(\r?\n)$/.test(content)
  const rawLines = content.split(/\r?\n/)
  const lines = hasTrailing ? rawLines.slice(0, -1) : rawLines
  const body = lines.length === 1 && lines[0] === '' ? [] : lines

  let infoHeader = -1
  let lastHeader = -1
  let nameLine = -1
  let nameHeader = -1
  let raceLine = -1
  let raceHeader = -1
  let inInfo = false
  for (let index = 0; index < body.length; index += 1) {
    const trimmed = body[index].trim()
    const section = trimmed.match(/^\[(.+)\]$/)
    if (section) {
      inInfo = section[1].trim().toLowerCase() === 'info'
      lastHeader = index
      if (inInfo && infoHeader === -1) infoHeader = index
      continue
    }
    if (!inInfo) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim().toLowerCase()
    if (key === 'name' && nameLine === -1) {
      body[index] = `name=${name}`
      nameLine = index
      nameHeader = lastHeader
    } else if (key === 'race_number' && raceLine === -1) {
      body[index] = `race_number=${raceNumber}`
      raceLine = index
      raceHeader = lastHeader
    }
  }

  if (infoHeader === -1) {
    body.push('[info]', `name=${name}`, `race_number=${raceNumber}`)
  } else if (nameLine === -1 && raceLine === -1) {
    body.splice(infoHeader + 1, 0, `name=${name}`, `race_number=${raceNumber}`)
  } else if (nameLine === -1) {
    // Only race_number exists: name goes right before it.
    body.splice(raceLine, 0, `name=${name}`)
  } else if (raceLine === -1) {
    // Only name exists: race_number goes right after it.
    body.splice(nameLine + 1, 0, `race_number=${raceNumber}`)
  } else if (nameHeader === raceHeader && raceLine < nameLine) {
    // Both exist in the same section but inverted: swap so name comes first.
    const nameText = body[nameLine]
    body[nameLine] = body[raceLine]
    body[raceLine] = nameText
  }

  return body.join(eol) + (hasTrailing || infoHeader === -1 ? eol : '')
}

// Rewrites the `[view]` section of a profile.ini with the fixed values,
// preserving every other line exactly (comments, other sections, key order).
// If one or more [view] sections exist, they are all removed and a single
// new [view] section is inserted at the position of the last one.
// If no [view] section exists, one is appended. The operation is idempotent:
// running it multiple times never creates duplicates. Pure: no disk access.
export function updateProfileViewContent(content: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const hasTrailing = /(\r?\n)$/.test(content)
  const rawLines = content.split(/\r?\n/)
  const lines = hasTrailing ? rawLines.slice(0, -1) : rawLines
  const body = lines.length === 1 && lines[0] === '' ? [] : lines

  // Find all [view] sections and their line ranges
  const viewSections: Array<{ start: number; end: number }> = []
  let inView = false
  let sectionStart = -1

  for (let index = 0; index < body.length; index += 1) {
    const trimmed = body[index].trim()
    const section = trimmed.match(/^\[(.+)\]$/)
    if (section) {
      // If we were in a view section, close it
      if (inView) {
        viewSections.push({ start: sectionStart, end: index - 1 })
        inView = false
      }
      // Check if this is a new view section
      if (section[1].trim().toLowerCase() === 'view') {
        inView = true
        sectionStart = index
      }
    }
  }
  // Close the last section if we're still in one
  if (inView) {
    viewSections.push({ start: sectionStart, end: body.length - 1 })
  }

  // Build the new [view] section lines (VIEW_SECTION_CONTENT already includes [view])
  const newViewSection = VIEW_SECTION_CONTENT.trim().split(/\r?\n/)

  let result: string[]

  if (viewSections.length === 0) {
    // No [view] section: append it at the end
    result = [...body]
    if (result.length > 0 && result[result.length - 1] !== '') {
      result.push('')
    }
    result.push(...newViewSection)
  } else {
    // One or more [view] sections exist: remove ALL view sections,
    // preserve all other content, and insert the new [view] section
    // at the position of the last view section.
    const last = viewSections[viewSections.length - 1]

    // Collect all lines that are NOT part of any [view] section
    const nonViewLines: string[] = []
    for (let index = 0; index < body.length; index += 1) {
      let inAnyView = false
      for (const vs of viewSections) {
        if (index >= vs.start && index <= vs.end) {
          inAnyView = true
          break
        }
      }
      if (!inAnyView) {
        nonViewLines.push(body[index])
      }
    }

    // Find where to insert the new [view] section:
    // at the position where the last view section started,
    // adjusted for the removed view sections before it.
    let insertIndex = last.start
    for (const vs of viewSections) {
      if (vs.start < last.start) {
        insertIndex -= vs.end - vs.start + 1
      }
    }

    // Insert the new view section at the calculated position
    result = [
      ...nonViewLines.slice(0, insertIndex),
      ...newViewSection,
      ...nonViewLines.slice(insertIndex)
    ]
  }

  return result.join(eol) + (hasTrailing || viewSections.length === 0 ? eol : '')
}

export function updateGlobalIniContent(
  content: string,
  lastprofile: string,
  nickname: string
): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const hasTrailing = /(\r?\n)$/.test(content)
  const rawLines = content.split(/\r?\n/)
  const lines = hasTrailing ? rawLines.slice(0, -1) : rawLines
  const body = lines.length === 1 && lines[0] === '' ? [] : lines

  let profileHeader = -1
  let lastHeader = -1
  let lastprofileLine = -1
  let lastprofileSection = -1
  let nicknameLine = -1
  let nicknameSection = -1
  let inProfile = false
  for (let index = 0; index < body.length; index += 1) {
    const trimmed = body[index].trim()
    const section = trimmed.match(/^\[(.+)\]$/)
    if (section) {
      inProfile = section[1].trim().toLowerCase() === 'profile'
      lastHeader = index
      if (inProfile && profileHeader === -1) profileHeader = index
      continue
    }
    if (!inProfile) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim().toLowerCase()
    if (key === 'lastprofile' && lastprofileLine === -1) {
      body[index] = `lastprofile=${lastprofile}`
      lastprofileLine = index
      lastprofileSection = lastHeader
    } else if (key === 'nickname' && nicknameLine === -1) {
      body[index] = `nickname=${nickname}`
      nicknameLine = index
      nicknameSection = lastHeader
    }
  }

  if (profileHeader === -1) {
    body.push('[profile]', `lastprofile=${lastprofile}`, `nickname=${nickname}`)
  } else if (lastprofileLine === -1 && nicknameLine === -1) {
    body.splice(profileHeader + 1, 0, `lastprofile=${lastprofile}`, `nickname=${nickname}`)
  } else if (lastprofileLine === -1) {
    body.splice(nicknameLine, 0, `lastprofile=${lastprofile}`)
  } else if (nicknameLine === -1) {
    body.splice(lastprofileLine + 1, 0, `nickname=${nickname}`)
  } else if (lastprofileSection === nicknameSection && nicknameLine < lastprofileLine) {
    const lastprofileText = body[lastprofileLine]
    body[lastprofileLine] = body[nicknameLine]
    body[nicknameLine] = lastprofileText
  }

  return body.join(eol) + (hasTrailing || profileHeader === -1 ? eol : '')
}

// Points global.ini at the given profile, preserving every other setting.
// A missing file is treated as empty and created; the parent folder is
// created as needed. Returns false on failure without throwing.
function syncGlobalProfile(lastprofile: string, nickname: string): boolean {
  const iniPath = getGlobalIniPath()
  try {
    let raw = ''
    try {
      raw = fs.readFileSync(iniPath, 'utf-8')
    } catch {
      raw = ''
    }
    fs.mkdirSync(path.dirname(iniPath), { recursive: true })
    fs.writeFileSync(iniPath, updateGlobalIniContent(raw, lastprofile, nickname), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to write global.ini at "${iniPath}":`, error)
    return false
  }
}

// Saves `name` and `race_number` into the `[info]` section of the given
// profile's `profile.ini`, preserving the rest of the file. When the new
// name differs from the current folder, the profile folder is renamed to
// the new name first and the ini is written inside the renamed folder, so
// the folder id, the ini `name` field and the renderer selection stay the
// same profile. The game-owned global.ini in Documents/PiBoSo/GP Bikes is
// then pointed at the same name (`[profile] lastprofile` and `nickname`),
// preserving its other settings, so both files stay synchronized. The folder
// id is never trusted blindly: separators and dot segments are rejected so
// a crafted id can never escape the Profile Path, and the new name must
// itself be a valid folder name.
export function saveProfileInfo(
  profileId: string,
  name: string,
  raceNumber: string
): ProfileSaveResult {
  const id = profileId.trim()
  const cleanName = name.trim()
  const cleanRace = raceNumber.trim()
  if (id === '' || id === '.' || id === '..' || /[/\\]/.test(id)) {
    return { ok: false, reason: 'invalid-id' }
  }
  if (!profileNameSchema.safeParse(cleanName).success || !isValidProfileFolderName(cleanName)) {
    return { ok: false, reason: 'invalid-name' }
  }
  // Race numbers are integers from 0 to 99: at most 2 digits, mirroring the
  // renderer pre-check.
  if (!raceNumberSchema.safeParse(cleanRace).success) {
    return { ok: false, reason: 'invalid-race-number' }
  }
  const profilesPath = getResolvedProfilePath()
  if (!profilesPath) return { ok: false, reason: 'profile-not-found' }
  // Single-profile rule: the launcher only ever edits the active profile
  // (renamed when it exists, otherwise "Unnamed Profile"). Any other id —
  // e.g. a stale one from an earlier listing — is rejected instead of
  // writing a second profile.
  const active = resolveActiveProfile(listProfilesIn(profilesPath))
  if (active === null || active.id !== id) return { ok: false, reason: 'profile-not-found' }
  const oldDir = path.join(profilesPath, id)
  if (!isFile(path.join(oldDir, PROFILE_INI_FILENAME))) {
    return { ok: false, reason: 'profile-not-found' }
  }
  let targetDir = oldDir
  let renamed = false
  if (cleanName !== id) {
    const nextDir = path.join(profilesPath, cleanName)
    // A case-only change resolves to the same folder on case-insensitive
    // filesystems; only a genuinely occupied name blocks the rename.
    if (fs.existsSync(nextDir) && oldDir.toLowerCase() !== nextDir.toLowerCase()) {
      return { ok: false, reason: 'name-taken' }
    }
    try {
      fs.renameSync(oldDir, nextDir)
    } catch (error) {
      console.error(`Failed to rename profile folder "${oldDir}" to "${nextDir}":`, error)
      return { ok: false, reason: 'write-failed' }
    }
    targetDir = nextDir
    renamed = true
  }
  const iniPath = path.join(targetDir, PROFILE_INI_FILENAME)
  let previousProfileRaw: string
  try {
    previousProfileRaw = fs.readFileSync(iniPath, 'utf-8')
    fs.writeFileSync(
      iniPath,
      updateProfileIniContent(previousProfileRaw, cleanName, cleanRace),
      'utf-8'
    )
  } catch (error) {
    console.error(`Failed to write profile.ini at "${iniPath}":`, error)
    // The folder was already renamed: best-effort rollback so a failed
    // write never leaves the caller pointing at a stale folder id.
    if (renamed) {
      try {
        fs.renameSync(targetDir, oldDir)
      } catch {
        // Keep the renamed folder: losing the profile entirely would be worse.
      }
    }
    return { ok: false, reason: 'write-failed' }
  }
  // Both files carry the same profile name: the folder id and the ini
  // `name` field already match cleanName, so global.ini follows them.
  if (!syncGlobalProfile(cleanName, cleanName)) {
    // Roll back the profile.ini write (and rename) so a failed global.ini
    // never leaves the two files pointing at different profiles.
    try {
      fs.writeFileSync(iniPath, previousProfileRaw, 'utf-8')
    } catch (error) {
      console.error(`Failed to roll back profile.ini at "${iniPath}":`, error)
    }
    if (renamed) {
      try {
        fs.renameSync(targetDir, oldDir)
      } catch {
        // Keep the renamed folder: losing the profile entirely would be worse.
      }
    }
    return { ok: false, reason: 'write-failed' }
  }
  // Apply the fixed [view] section to all profiles in the path.
  for (const profile of listProfilesIn(profilesPath)) {
    const profileIniPath = path.join(profilesPath, profile.id, PROFILE_INI_FILENAME)
    if (isFile(profileIniPath)) {
      try {
        const raw = fs.readFileSync(profileIniPath, 'utf-8')
        fs.writeFileSync(profileIniPath, updateProfileViewContent(raw), 'utf-8')
      } catch (error) {
        console.error(`Failed to update [view] section in "${profileIniPath}":`, error)
      }
    }
  }
  return { ok: true }
}

// Clears the `[info]` name and race_number of the active profile, preserving
// every other line exactly (same rewrite as saveProfileInfo, with empty
// values that listProfilesIn reads back as the folder fallback and null).
// A missing path or profile is empty, not an exception: returns false with
// nothing to do. True when a profile.ini was rewritten. Never deletes files
// or folders.
export function resetActiveProfileInfo(): boolean {
  const profilesPath = getResolvedProfilePath()
  if (!profilesPath) return false
  const active = resolveActiveProfile(listProfilesIn(profilesPath))
  if (active === null) return false
  const iniPath = path.join(profilesPath, active.id, PROFILE_INI_FILENAME)
  if (!isFile(iniPath)) return false
  const raw = fs.readFileSync(iniPath, 'utf-8')
  fs.writeFileSync(iniPath, updateProfileIniContent(raw, '', ''), 'utf-8')
  return true
}

// Updates the [view] section of the active profile's profile.ini with the
// fixed values, preserving all other settings. Returns false if no active
// profile or profile.ini is found; never throws.
export function updateActiveProfileView(): boolean {
  const profilesPath = getResolvedProfilePath()
  if (!profilesPath) return false
  const active = resolveActiveProfile(listProfilesIn(profilesPath))
  if (active === null) return false
  const iniPath = path.join(profilesPath, active.id, PROFILE_INI_FILENAME)
  if (!isFile(iniPath)) return false
  try {
    const raw = fs.readFileSync(iniPath, 'utf-8')
    fs.writeFileSync(iniPath, updateProfileViewContent(raw), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to update [view] section in "${iniPath}":`, error)
    return false
  }
}
