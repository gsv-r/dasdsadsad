# PR Audit Checklist (read-only)

Operational procedure for the normative rules in `AGENTS.md` (`Audit and PR verification`). This file is the `how`; `AGENTS.md` is the `what`. Read both before auditing.

## 0. Declare mode

State `audit (read-only)` at the start of the session. Allowed tools: `read`, `grep`, `glob`, read-only `shell` (`git status`, `git log`, `git diff`, `git rev-parse`, test/typecheck/lint runners).

Never in audit mode: `edit`, `write`, `commit`, `push`, `add`, `checkout -- .`, `checkout <branch>`, `reset --hard`, `clean -fd`, any filesystem mutation outside the tool sandbox. File follow-ups as separate implement tasks.

## 1. Strict HEAD check

1. Record `git rev-parse HEAD` and the base (`origin/main` or the PR base).
2. Record `git status --porcelain`. Stop if the tree is dirty unless the task explicitly allows it.
3. Re-record `HEAD` at the end. If it moved mid-audit, discard conclusions and restart.

## 2. Full diff, no truncation

1. Inspect `git diff <base>...HEAD` in full. Never rely on a summary, title, or partial hunk.
2. Quote `file:line` for every claim. Do not infer missing hunks.
3. On Windows PowerShell there is no `head`; page with `read` (`offset`/`limit`) or `git diff --stat` first, then full file diffs. If tool output is truncated to a file, read the remainder from that file instead of guessing.
4. Verify IPC changes on both ends (handler in `src/main/index.ts` + preload exposure + renderer caller), per `AGENTS.md` quality rules.

## 3. Typecheck, lint, tests (reconciled)

Run in this order:

```bash
bun run typecheck
bun run lint
bun run test
```

(`bun run build` runs `typecheck` internally; an audit still runs the explicit three so failures attribute correctly.)

Report five numbers: `expected / found / passed / failed / skipped`.

- `expected`: test files/cases the diff touches or should touch (colocated `*.test.ts`).
- `found`: cases the runner actually executed (read the full runner output, not the last line).
- Count expanded parameterized cases: one `test.each`/`it.each` table with N rows counts as N, never as 1.
- Treat `skipped`/`todo`/silent skips as failure unless the task explicitly allows them. An unreconciled count (`found != passed + failed + skipped`) is a failure.
- A red `typecheck` or `lint` fails the audit even when tests are green.

## 4. Semantics without modification

Verify behavior by reading current code plus existing `*.test.ts` only:

1. Trace each changed function to its callers with `grep`, not memory.
2. Confirm pure helpers preserve their contracts (e.g. profile `update*Content` helpers preserve comments/order; `resolveLocalFilePath` stays pure with no disk access).
3. Confirm store/IPC contracts still match `src/types/` schemas (`STORE_READ_KEYS`/`STORE_WRITE_KEYS`, Zod arg schemas).
4. Do not fix, refactor, or format what you find. Log each issue as `file:line` + expected vs. actual for a follow-up task.

## 5. Report format

End every audit with:

- HEAD SHA + clean/dirty state at start and end.
- Full diff scope (files changed, no summaries).
- Reconciled counts (`expected / found / passed / failed / skipped`, parameterized rows expanded).
- Verdict per check (pass/fail) with `file:line` evidence.
- Follow-ups as separate tasks; never as uncommitted edits.
- **Command + raw output:** reports must include the command and the raw output.
- **Isolation:** prefer separate worktree/branch for implementation; never mix audit output with uncommitted implementation changes.
- **Measure before reverting:** before reverting, measure scope and mixed commits.
