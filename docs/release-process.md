# Release Process

Reference for the `Release process` section of `AGENTS.md`. `AGENTS.md` is normative; this file is the procedure.

The application uses `electron-updater` with GitHub Releases as the update feed (configured in `electron-builder.yml`: `provider: github`, `owner: gsv-r`, `repo: knee-down`, `releaseType: release`). The production app performs anonymous GET requests to `latest.yml` and installer artifacts — no token is embedded in the build.

Publishing is done **exclusively via CI** (`.github/workflows/release.yml`). The workflow:

- Triggers on `git push` of a tag matching `v*`
- Runs on `windows-latest` with Bun
- Uses the secret `UPDATE_REPO_TOKEN` (PAT with `contents:write` on the **public** repo `gsv-r/knee-down`)
- Verifies tag version matches `package.json`
- Runs `bun run test` → `bun run build` → `electron-builder --win --publish always`
- Ensures a single idempotent release per tag on the public repo
- Updates release notes and the public repo README

The source repo is private; the public distribution repo is `gsv-r/knee-down`. The default `GITHUB_TOKEN` cannot cross repos, hence the dedicated `UPDATE_REPO_TOKEN` secret.

## Version bump (required files)

1. `package.json` — `version` field (source of truth for `app.getVersion()` and installer artifact names).
2. No other files reference the version directly. Tests mock `app.getVersion()` and must be updated when the version changes (e.g., `src/main/functions/updater.test.ts`).

## Pre-release checks (run locally)

```bash
bun run typecheck
bun run lint
bun run test
```

All must pass. `bun run build` runs `typecheck` internally; do not skip the explicit checks.

## Publish via CI (standard flow)

From a clean repository state on `main`:

```bash
# 1. Ensure you are on main and up to date
git status
git pull

# 2. Bump version in package.json (example: 0.1.3 -> 0.1.4)
#    Edit package.json manually. Do NOT use `npm version` (creates tag).
#    Update test mocks if needed (e.g., updater.test.ts).

# 3. Run pre-release checks
bun run typecheck && bun run lint && bun run test

# 4. Commit the version bump (if not already committed)
git add package.json
# (add any test file changes)
git commit -m "chore: bump version to 0.1.4"

# 5. Create and push the tag (triggers the release workflow)
git tag v0.1.4
git push origin main --tags
```

**What the CI does:**

1. Checks out code, sets up Bun, installs deps (`bun install --frozen-lockfile`)
2. Verifies `tag == package.json version`
3. Requires `UPDATE_REPO_TOKEN` secret
4. Runs tests and build
5. Creates/ensures single GitHub Release on `gsv-r/knee-down` for the tag
6. Runs `electron-builder --win --publish always` (uploads installer, `latest.yml`, `.blockmap`)
7. Updates release notes with download link and public README

## Post-publish verification

1. Open the release: `https://github.com/gsv-r/knee-down/releases/tag/v<version>`
2. Confirm `KneeDown-<version>-Setup.exe` and `latest.yml` are present.
3. Test the in-app updater on a test machine (Settings → Check for updates).

## Token security

- **Never** commit tokens or write them to any file in the repository.
- The `UPDATE_REPO_TOKEN` secret lives only in GitHub Actions (Settings → Secrets → Actions).
- The production app reads the public feed anonymously; no token is embedded.
- Local machines do **not** need a token; publishing is CI-only.

## Tagging

**You create the tag manually** (`git tag v<version>`). The CI workflow triggers on the tag push. `electron-builder` does **not** create the tag; it publishes to the existing release. Tag format: `v<version>` (matches artifact `KneeDown-${version}-Setup.${ext}`).

## Rolling back a bad release

If a published release has critical issues:

1. Delete the release **and** the tag on GitHub (both repos if needed).
2. Fix the issue, bump the version again (patch), commit, create new tag, push.
3. Users on the bad version will see the new one on next check (anonymous feed).
