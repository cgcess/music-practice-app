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

## 2026-10-22 t002-ui-shell: hash routing + h() for UI
UI lives in `src/ui/`; views are built with `h()` (text via text nodes, never `innerHTML`) and routed by `#/path` with `:param` segments.
`src/ui/` never imports `src/data/` directly. DOM tests use happy-dom via a per-file pragma; focus moves to `<main>` on navigation, not on initial load.

## 2026-10-22 t003-pwa: installable, offline, self-updating
vite-plugin-pwa 2.0.0 (generateSW, autoUpdate, `injectRegister: false`) builds the SW and manifest at build time; no runtime framework. Registration is hand-written in `src/pwa.ts` with `updateViaCache: "none"` (GitHub Pages serves `max-age=600`) and scope = app path; reload on `controllerchange` only when a previous controller existed. Shared origin: `cacheId: "music-practice"`; workbox cleanup deletes only `-precache-` caches containing this SW's scope, so other apps' caches are untouched. Theme colors, cache id and manifest values are build constants in `pwa-manifest.ts`/`vite.config.ts`, not tunable defaults, so outside `src/config.ts`. `navigator.storage.persist()` is requested at each startup. Deploy workflow uses Node 22 (plugin needs >=20.19).
Follow-up (t004): precache duplicates removed via `globIgnores` (icons and manifest come from the plugin's own entries); theme color is injected into `index.html` from `THEME_COLOR` via a `transformIndexHtml` plugin (single literal); `workbox-precaching` is pinned as a devDependency because a test imports its internals - bump together with vite-plugin-pwa.
