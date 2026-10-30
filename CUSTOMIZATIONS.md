# WF/AIRI customizations

This tree tracks upstream [moeru-ai/airi](https://github.com/moeru-ai/airi) with a small set of
WF-specific changes. Keep custom work as commits on a branch. The patch files are review/export
artifacts, not the source of truth.

## Base

- Base branch: fork `main`, currently at commit `335f6cac7`
- Upstream line: `v0.13.1` plus three upstream commits
- Current custom branch: `main`
- Electron: upstream `43.8.4`

The `v0.13.1` tag is a version reference only. It is not the base branch. The previous custom
tree is preserved on `custom/wf-airi-v0.12`.

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
- **Cross-platform:** VRM animation fallback and lip sync, Aivis Speech SSML support, and the
  Beat Sync detector outside the Linux audio-capture path.

The About text should say "Linux/Wayland-focused" rather than "100% Linux only" unless the fork
actually removes the other platform builds.


## Custom changes

### Beat Sync and Linux audio

- Added Linux system-audio capture through `system-audio-capture.ts`, including source discovery
  and a selectable audio source.
- Added `audio-capture.ts`, `audio-sources.ts`, and `linux-audio.ts` under
  `packages/stage-shared/src/beat-sync/`.
- Reworked the beat detector and Beat Sync event payloads.
- Added the Beat Sync settings UI and the persisted audio-source setting.

Reason: Beat Sync needs a Linux desktop audio path and a user-selectable source before it can
react to the game.

### VRM animation fallback and lip sync

- Kept the upstream `idle_loop.vrma` as the only bundled VRM animation.
- Removed the Mixamo-derived `.vrma` assets from the source tree. They are user-local assets and
  must not be redistributed with the fork or its release artifacts.
- Added a Models > VRM Animations section for importing `.vrma` files, opening the local animation
  folder, and binding an animation to each supported emotion or to the looping idle.
- User animations live under `app.getPath('userData')/vrm-animations` and never enter the source
  tree or release artifacts.
- Imported animation names are added to the VRM system prompt as an ACT motion library. The agent
  can emit `<|ACT {"emotion":"angry","motion":"Standing Arguing"}|>` and the stage resolves the
  motion name to the local file.
- Explicit ACT `motion` requests take priority over emotion-bound body animations. The emotion still
  drives the face.
- VRMA expression and look-at tracks are removed before playback so body clips cannot fight the
  expression, blink, or eye-tracking controllers.
- Updated the VRM animation index to expose only the upstream idle animation.
- Updated `VRMModel.vue` so a missing requested animation logs
  `animation for "<name>" not found` and returns without throwing.
- Updated the VRM lip-sync composable and `Stage.vue` so speech activity is tracked and the
  vocal driver is cleared when audio ends or the source is disconnected.

Reason: the fork must not redistribute Mixamo animations, while the bundled AIRI idle animation
keeps the stage usable when no user animation is installed. Missing animation requests should fail
gracefully instead of breaking the scene.

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

- Added the Beat Sync English settings strings.

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
   pnpm --filter @proj-airi/stage-tamagotchi typecheck
   pnpm --filter @proj-airi/stage-tamagotchi build
   pnpm --filter @proj-airi/stage-ui exec vitest run src/stores/modules/airi-card.test.ts
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
