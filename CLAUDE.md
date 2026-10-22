# Music Practice PWA
Vanilla TypeScript + Vite, GitHub Pages, data in IndexedDB on the device. No framework.

## Rules
- Only `src/data/store.ts` touches IndexedDB; every write validates via `src/data/schema.ts` first.
- Schema changes need a `schemaVersion` bump plus a migration in `src/data/migrations/` and a fixture.
- Defaults live in `src/config.ts`; user overrides come from the Settings record.
- Dates are local "YYYY-MM-DD" (`src/dates.ts`); timestamps ISO-8601 with offset; IDs `crypto.randomUUID()`.
- No persisted logs; `log()` in `src/log.ts` is dev-only.

## Commands
`npm test`, `npm run typecheck`, `npm run build`, `bash install_requirements.sh`.

## Gates
Hooks in `.claude/settings.json`: no push/publish/release; `tests/fixtures/` and
`src/data/migrations/` frozen unless `.claude/unlock-data` exists (never commit it); no edits to `dist/`.

## Decisions
See `docs/decisions.md`. Skills in `.claude/skills/`; if a skill and the code disagree, the code wins.
