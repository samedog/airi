# WF/AIRI customizations

This tree tracks upstream [moeru-ai/airi](https://github.com/moeru-ai/airi) with a small set of
WF-specific changes. Keep custom work as commits on a branch. The patch files are review/export
artifacts, not the source of truth.

## Base and current line

- Fork remote: `origin` → `https://github.com/samedog/airi.git`
- Upstream remote: `upstream` → `https://github.com/moeru-ai/airi`
- Original custom line base: `335f6cac7` (`v0.13.1` plus three upstream commits)
- Current custom branch: `main`
- Electron: upstream `43.8.4`
- Upstream sync branch: `code-rebase/upstream-main-2026-11-03`
- Upstream merge target: `upstream/main` at `d1eb6fe18` (2026-11-03)
- Current patch baseline: `upstream/main` at `d1eb6fe18`
- Current patch artifact: `patches/airi-custom-upstream-main.patch`

The `v0.13.1` and `v0.14.1` tags are version references only. They are not patch bases;
`v0.14.1` was already 31 commits behind `upstream/main` when the current patch was generated.
The previous custom tree is preserved on `custom/wf-airi-v0.12`. Upstream is merged deliberately
on a sync branch; `main` remains the published fork branch until that sync branch is reviewed and
accepted.

## Fork highlights

- **Beat Sync:** Linux `parec`/PipeWire system-audio capture, selectable sources, HIT/Vibe analysis,
  HIT-driven VRM dance speed, dance energy tiers, and a recoverable hidden detector window.
- **VRM animations:** user-local `.vrma` library, multiple clips per slot, dance energy tags, idle
  rotation, preview/delete, model-scoped bindings, and ACT motion resolution.
- **VRM parts and attachments:** per-model mesh visibility, categorized radial menu, manual
  recategorization, and a global GLB/VRM attachment library with humanoid bone sockets.
- **Desktop behavior:** tray-first close, KDE/Wayland shortcut defaults, and the Linux screen-capture
  source-cache workaround.
- **Tamagotchi/Kirie parity:** the Kirie renderer mirrors Beat Sync, the VRM preview bridge, and
  model-settings runtime behavior.

## Merged upstream PRs

These fork-originated changes are now upstream. The fork consumes the upstream implementation and
does not carry a local copy.

- [#3350](https://github.com/moeru-ai/airi/pull/3350) `fix(stage-ui-three): clear stale VRM
  visemes after speech` — merged upstream at `2d7a8fa09`.

## Platform scope

This is a Linux/Wayland-focused fork, not a Linux-only source tree. The custom code remains
cross-platform unless a feature is explicitly gated below.

- **Linux-only:** Beat Sync system audio capture through `parec`, including source discovery and
  selection. The detector chooses this path only when `window.platform === 'linux'`.
- **Linux-focused, cross-platform code:** the `electron-screen-capture` source cache works around
  Linux desktop-capture failures but does not remove other platform paths.
- **KDE/Wayland-focused, cross-platform behavior:** hide-to-tray close behavior and the changed
  shortcut defaults. They are useful on KDE and Wayland, but the implementations are platform
  neutral.
- **Cross-platform:** VRM animation fallback, Aivis Speech SSML support, and the HIT/Vibe Beat Sync
  detector outside the Linux audio-capture path. The same detector and settings code runs in Stage
  Web, Stage Tamagotchi, and the Kirie renderer.

The About text should say "Linux/Wayland-focused" rather than "100% Linux only" unless the fork
actually removes the other platform builds.


## Custom changes

### Beat Sync and Linux audio

- Added Linux system-audio capture through `system-audio-capture.ts`, including source discovery
  and a selectable audio source. The Linux path uses `parec` and the selected PulseAudio/PipeWire
  monitor or input; it deliberately does not fall back to microphone or all-system capture.
- Added `audio-capture.ts`, `audio-sources.ts`, and `linux-audio.ts` under
  `packages/stage-shared/src/beat-sync/`.
- Replaced the Tempora BPM detector with the local HIT/Vibe tracker:
  - `BeatSyncVibe` exposes smoothed `energy`, decaying `punch`, and transient `hit`.
  - `BEAT_SYNC_HIT_THRESHOLD` and `BEAT_SYNC_HIT_COOLDOWN_MS` are shared constants.
  - The detector emits Vibe frames at roughly 30 Hz and synthetic beat ticks for Live2D.
  - The old Tempora dependency, worklet analyser, spectrum polling API, and Beat Sync spectrum
    visualizer were removed.
- Added HIT-driven VRM dance behavior:
  - The last 4–32 HITs are kept in a rolling window, default 12.
  - Dance speed follows HIT density, then applies the 0.75 VRM speed trim with a 0.5x floor.
  - Dance clips can be tagged Calm (0.2), Medium (0.5), or Intense (0.78). Vibe energy selects the
    clip tier and the matching face expression, while ACT and speech expressions override it.
  - No HIT for 1.5s damps the pulse; no Vibe for 2s resets energy and expression.
- Added the Beat Sync settings UI with persisted audio source, Vibe sensitivity, and HIT window.
- Removed `@nekopaw/tempora` from package manifests, the workspace catalog, and the lockfile. The
  Beat Sync path no longer depends on Tempora or an AudioWorklet analyser.
- Added a recoverable hidden Beat Sync window manager:
  - `backgroundThrottling: false` keeps the 30 Hz detector timer alive.
  - The hidden window is recreated after `closed` or `render-process-gone`.
  - Toggle requests use a 10s timeout, longer than Linux capture startup.
  - The settings page has a pending-start state and ignores duplicate starts.
  - Source attempts are generation-guarded; a stale Web capture `ended` event cannot stop a newer
    graph.
- Removed obsolete Beat Sync settings keys (`settings/beat-sync/parameters` and
  `spectrum-scale`) on store initialization.
- The generic `AudioSpectrumVisualizer` remains in the component library because voice cards still
  use it; it is no longer part of the Beat Sync page.

Reason: Beat Sync needs a Linux desktop audio path, a selectable source, and a speed signal that
responds to musical transients without the Tempora worklet dependency.

### VRM animation library and speech playback

- Kept the upstream `idle_loop.vrma` as the only bundled VRM animation.
- Imported animations are user-local assets. They live under
  `app.getPath('userData')/vrm-animations` and never enter the source tree or release artifacts.
- Added a Models > VRM Animations library with import, open-folder, refresh, preview, stop-preview,
  and delete actions.
- Each slot supports multiple clips instead of one ID:
  - slots are idle, dance, happy, sad, angry, think, surprised, awkward, question, and curious;
  - legacy string/array bindings are normalized on read;
  - duplicate IDs are removed, with the last valid energy tag winning;
  - selection avoids the previous clip when another choice exists;
  - idle clips rotate after at least 20 seconds, and only on completed loops.
- Dance clips can be tagged Calm, Medium, or Intense. Beat Sync Vibe energy selects the tier; dance
  speed follows the HIT pulse, not a BPM estimate. Dance face expressions are relaxed, happy, or
  angry by tier, with ACT and speech expressions taking precedence.
- Bindings are model-scoped:
  - the live settings window stores them under `settings/vrm/animation-bindings`;
  - a BroadcastChannel keeps Tamagotchi and Kirie windows in sync;
  - the card stores a fallback copy;
  - card-removal and asset-removal clean every model and card reference;
  - in-flight URL reads are deduplicated, and empty live bindings fall back to the card copy.
- Added a persisted animation catalog so chat/stage windows can list motion names without an
  Electron IPC round trip.
- Imported animation names are added to the VRM system prompt as an ACT motion library. The agent
  can emit `<|ACT {"emotion":"angry","motion":"Standing Arguing"}|>` and the stage resolves the
  motion name to the local file.
- Explicit ACT `motion` requests take priority over emotion-bound body animations. The emotion still
  drives the face.
- VRMA expression and look-at tracks are removed before playback so body clips cannot fight the
  expression, blink, or eye-tracking controllers.
- `reAnchorRootPositionTrack` anchors to the normalized rest-pose hips instead of the current hips
  node, preventing dance-clip swaps from accumulating positional drift.
- `VRMModel.vue` now:
  - keeps one idle-loop listener per mixer, replacing it safely on cache reuse;
  - tracks gesture request generations so a stale `.vrma` load cannot steal a newer gesture;
  - stops a gesture before stashing a mixer;
  - restores idle loop/clamp state when a cached action is reused;
  - logs a missing animation and returns instead of throwing.
- `Stage.vue` serializes voice playback groups so replies and notifications wait for the current
  group to finish or stop instead of talking over each other.

Reason: imported clips stay user-local, while the bundled AIRI idle animation keeps the stage usable
when no user animation is installed. The library is more useful when a slot can hold several clips
and dance intensity can select among them.

### VRM parts, radial menu, and attachments

- Added per-model mesh visibility for loaded VRM models:
  - right-click the stage or use the eye button to open the radial menu;
  - Body, Outfit, Accessories, Extras, and Attachments categories;
  - each category shows the number of available items and opens a second ring;
  - interaction raycaster colliders and spring-bone colliders are excluded;
  - visibility is stored under `settings/vrm/mesh-visibility`.
- Added manual category overrides:
  - Move mode and right-click on a part open the category picker;
  - Auto restores automatic classification;
  - overrides are stored under `settings/vrm/mesh-categories`;
  - automatic classification uses mesh and material names, including names sanitized by Three.js.
- Added a global attachment library for `.glb` and `.vrm` files:
  - files live in IndexedDB under the `airi-vrm-attachments` store;
  - metadata is stored under `settings/vrm/attachment-assets`;
  - per-model bindings are stored under `settings/vrm/attachment-bindings`;
  - a BroadcastChannel keeps settings and stage windows in sync.
- Added a Models > VRM > Attachments tab:
  - import and remove assets;
  - bind an asset to the active model;
  - choose a VRM humanoid bone socket;
  - edit position, Euler rotation in degrees, and uniform scale;
  - show or hide a binding;
  - hide selected mesh IDs while the attachment is visible.
- Added runtime attachment placement:
  - rigid and skinned assets are cloned with `SkeletonUtils`;
  - assets are attached to raw VRM humanoid bones;
  - source assets are cached and stale async loads are generation-guarded;
  - hidden mesh IDs are restored when the attachment is removed or hidden.
- Added an Attachments category to the radial menu for quick show/hide.

Boundaries: attachment skeletons are not retargeted to the avatar limbs, and masking uses explicit
mesh IDs rather than per-vertex bone-weight masks.

### Stage and Kirie parity

- `Stage.vue` owns the HIT pulse state, dance-tier expressions, expression priority, and the 2s Vibe
  watchdog. It ignores stale Vibe frames after shutdown and clamps incoming HIT values.
- The Kirie renderer mirrors the Beat Sync renderer, VRM preview bridge, and model-settings runtime
  changes. Keep `apps/stage-tamagotchi` and `apps/stage-tamagotchi-kirie` in sync for these files.
- The shared `vrm-idle-loop-registry` keeps idle-loop listeners attached to the mixer, not to a
  component instance, so cached mixer reuse stays observable and gesture-safe.

### Tray and window close

- `controls-island/index.vue` now invokes `electronWindowClose` instead of `electronAppQuit`.
- The existing main-window `hideOnClose()` handler then hides AIRI to the tray.

Reason: the Stage close button should close the UI, not terminate the app. Quit remains in the tray
menu.

### Shortcut defaults

- Spotlight: `Ctrl+Alt+Shift+A`.
- Push to Talk: `Ctrl+Alt+Shift+Space`.
- Added a one-time PTT migration from the old `Ctrl+Shift+Space` default.
- Updated associated browser-test expectations.

Reason: the old shortcuts collide with KDE's Deselect and common editor bindings.

### Auto-updates are disabled

- The ergosphere launcher updater is disabled in `ergo.config.ts`.
- The main-process updater service is also disabled in `src/main/index.ts`.
- Upstream's signed feed and public key could otherwise replace a custom build with upstream AIRI.
- `electron-builder` publish metadata now points at `samedog/airi`, but no signed update feed exists yet.
- To enable updates later, host a fork-owned signed feed, replace the public key, and only then turn the
  launcher updater back on.

### Screen capture

- `electron-screen-capture` keeps source objects from the latest successful source query and falls
  back to a fresh query.
- This avoids Linux desktop-capture failures when source IDs change between calls.

### Speech

- Aivis Speech is treated as an SSML-capable provider.

### Localization

- Added the Beat Sync HIT/Vibe, sensitivity, hit-window, and action strings in English.
- Removed the obsolete Tempora parameter and Beat Sync visualizer strings from the translated
  locale files. Missing new strings fall back to English.
- Removed the stale `tempora` cspell entry and updated the generated UI audit row for the Beat Sync
  settings page.

## Validation for the Beat Sync update

- Full workspace typecheck: 60/60 tasks pass.
- Lint: 0 errors, 676 warnings.
- Beat Sync and VRM shared tests: 33 pass.
- Stage UI related tests: 54 pass.
- Stage UI Three animation tests: 9 pass.
- `build:unpack` passes.
- The rebuilt `app.asar` contains the HIT/Vibe, recovery, expression, and shared tier code.
- The rebuilt `app.asar` contains no Tempora, worklet analyser, spectrum polling, or removed Beat
  Sync visualizer references.
- Full `stage-shared` and `stage-ui` suites still need `jsdom` and the Playwright Chromium binary
  installed in the test environment.

## Updating to a new upstream release

1. Fetch the upstream main branch:
   ```bash
   git fetch upstream main
   ```
2. Switch to `main` and merge the upstream branch:
   ```bash
   git switch main
   git merge upstream/main
   ```
3. Resolve conflicts by preserving the intent described above. Prefer upstream implementations when
   they supersede a custom change.
4. Install and validate:
   ```bash
   pnpm install
   pnpm typecheck
   pnpm --filter @proj-airi/stage-shared exec vitest run src/beat-sync src/vrm-animations.test.ts
   pnpm --filter @proj-airi/stage-ui exec vitest run src/constants/beat-sync-pulse.test.ts src/stores/modules/airi-card.test.ts src/constants/prompts/vrm-act.test.ts --project node
   pnpm --filter @proj-airi/stage-ui-three exec vitest run src/composables/vrm/animation.test.ts
   pnpm --filter @proj-airi/stage-tamagotchi build:unpack
   ```
5. Package and test the desktop app before pushing `main`.
6. Regenerate the portable patch from the new upstream branch.

## Guardrails

- Do not commit `dist/`, `out/`, `node_modules/`, user configuration, or absolute launcher paths.
- Let upstream own `pnpm-lock.yaml` unless a custom dependency change requires an update; then
  regenerate it with `pnpm install`.
- Do not carry a custom Electron version unless upstream is missing a required fix.
- Keep user-specific desktop entries under `~/.local/share/applications`, not in this repository.
- Record future custom behavior in this file before or alongside the code change.
