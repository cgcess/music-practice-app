# Decisions (kickoff interview, 2026-10-22)
1. Installable PWA, vanilla TS + Vite, GitHub Pages; IndexedDB; Vitest. No framework.
2. Single validated store; versioned schema + migrations; UUIDs; JSON export/import backup.
3. No logs/history: SR state lives on the Song; Task keeps lastCompletedOn; dev-only console log.
4. Config in src/config.ts; user-facing values overridable via Settings record.
5. Invariants: Task minutes int 1-240; days "daily" or non-empty unique 0-6; Song title non-empty,
   intervalDays >= 1, ease within bounds, dueDate >= lastReviewed. (SR determinism/monotonicity
   tests come with the SR task.)
6. Gates: push/publish blocked; fixtures + migrations frozen behind .claude/unlock-data.
7. auto_commit: true. Evaluation and experiment loop skipped (not applicable).

## 2026-10-22 t001-conventions: conventions baseline
Store/schema/backup in src/data is the only IndexedDB path; fixtures + migrations frozen behind
.claude/unlock-data. Known limit: the bash freeze hook (R3) can be bypassed by quoted paths; Write/Edit deny is the real guard.
