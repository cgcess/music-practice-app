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

## 2026-10-22 t005-today-timer: Today checklist + swipe timer
Data seam: `src/ui/ports.ts` defines `TodayPort` with UI-local types; `src/app/todayPort.ts` adapts the validated `Store` (all writes via `putTask`) and is wired in `main.ts`. `src/ui/` and `src/today/` never import `src/data/`. Prefs map Settings `timerSound/Vibrate/Overtime` to `{sound, vibrate, overtime}` via `getEffectiveConfig` (null settings fall back to `config.timer`).
`View` now returns `{el, dispose?}`; `mountShell(root, deps?)` calls the previous `dispose` before replacing `<main>` (and on unsubscribe), so Today's interval and wake lock cannot leak across routes.
The running timer is in memory only (start timestamp + injectable clock, `src/today/timer.ts`); nothing is persisted, no localStorage. Chime fires once per start and only if the tick is within `config.today.chimeGraceMs` of the target, so returning from the background never plays a missed chime. Undo (`src/today/undo.ts`) holds the previous `lastCompletedOn` in memory for `config.today.undoMs`. Tunables live in `config.today`. Audio: `audioSession.type="playback"`, AudioContext rebuilt on visible (no `resume()`). No schema change.

## 2026-10-22 t006-ios-look: iOS look and feel
Styling is token-based: `src/ui/base.css` defines light/dark CSS custom properties, safe areas, tab bar height and reduced-motion rules; views style only through tokens. Icons are SVG built in `src/ui/icons.ts` (SVG namespace, not `h()`).
Task colour is derived deterministically by `taskColor()` from a fixed palette, so it is not persisted and needs no schema change. Swipe now reports move/end; commit vibrates (feature-guarded, no-op on iOS) and `pointercancel` springs the row back. Add-task lives in a modal sheet (`src/ui/sheet.ts`, focus trap). Motion tunables live in `config.today`.

## 2026-10-22 t007-focus-view: full-screen focus view in Today
Superseded by t008-row-state-colors (focus view removed).
t006 iPhone device check passed 2026-10-22 (user report), so this reuses its tokens and swipe code. The focus view (`src/ui/focus.ts`) is a presenter inside `todayView`: the timer, tick, wake lock, finish and undo stay in Today and feed it `timer.snapshot()`. It opens on start when `config.today.autoOpenFocus` (default true; the one-line revert) and on tapping the running row; swipe down (`attachDragDown`, `focusCloseMinPx`), Escape or the close control close it with the timer running. Time's up keeps it open until Finish; it closes on its own only when the task stops running. Finish closes without restoring focus and moves focus to the Undo button. No Settings field, schema change or `src/data/` change. Rejected: app-level mini player, pause, "next up", swipe/hold finish. Known gap: the row-body tap that reopens the view has no keyboard equivalent (the row button finishes the task).

## 2026-10-23 t008-row-state-colors: row colours replace the focus view
Reverses t007: the full-screen focus view (`focus.ts`), `autoOpenFocus`, the drag-down gesture (`attachDragDown`) and the `focusCloseMinPx`/`focusMs` tunables are removed, because a future metronome on Today needs the screen free. The running row shows state by colour instead: `running` (under target) and `overtime` (target reached; "time's up" with overtime off also uses it, so two states only). Stopped or finished rows are normal. Finish stays on the row swipe / button with the Undo toast. Dropped with focus.test.ts: focus view render/ring/close/Escape/drag cases and the "today focus wiring" block; row-swipe Finish and Undo tests in today.test.ts remain.
Tokens `--row-running` (accent 14% over `--bg-elevated`) and `--row-overtime` (warning 28% over `--bg-elevated`) are defined in both the light and dark blocks of `base.css`. Row name and time use `--label`. State is not colour-only: the time text (`m:ss`, `+m:ss`, "0:00 time up") stays. Contrast of `--label` on the resolved tint: light running #e8e7f9 vs #000000 17.2:1; light overtime #ffe1b8 vs #000000 16.7:1; dark running #25253a vs #ffffff 15.0:1; dark overtime #5c4118 vs #ffffff 9.4:1 (inputs: light accent #5856d6, warning #ff9500, bg-elevated #ffffff; dark accent #5e5ce6, warning #ff9f0a, bg-elevated #1c1c1e). Manual device check in both themes pending.

## 2026-10-23 t009-edit-tasks: edit and delete tasks on Today
Each row has a trailing pencil `button.edit` (44px, aria-label "Edit <name>", also on done rows) that opens the add-task sheet as "Edit task", pre-filled, with Save and Delete (sheet is one form, `openForm(task?)`; every open resets all fields). It stops `pointerdown` propagation so the row swipe (finish) never starts on it; `swipe.ts` is unchanged. Port gains `updateTask` (name/minutes/days only; id, lastCompletedOn, createdAt preserved), `deleteTask` (returns the full record) and `restoreTask`; `TaskSnapshot` is declared structurally in `ports.ts`. No schema change.
Delete is recoverable by an Undo toast ("Deleted X · Undo", `config.today.undoMs`) that restores the exact record; there is one toast, so it replaces a pending "Done" toast and completion undo is dropped. Songs and history hold no task reference, so delete has no dependents. Rejected: soft-delete flag (schema change), `confirm()`, long-press or header edit mode.
Running task: delete stops the timer and releases the wake lock (Undo restores the task, not the running state). A minutes edit applies from the next start (`targetMs` is fixed at start; the running row hides `.mins`); a name edit shows at once.
