# WF/AIRI 0.13.1-r2

Linux/Wayland-focused fork of Project AIRI, based on upstream `main` at `v0.13.1`.

## Highlights

- Clean rebuild of `0.13.1-r1` without Mixamo-derived VRM animations. Only the upstream AIRI
  `idle_loop.vrma` is bundled with the app.
- Beat Sync now uses a selected PipeWire/PulseAudio monitor source through `parec`, instead of
  the desktop screen-capture loopback. Choose the audio source in Settings > Beat Sync. There is
  no implicit default source.
- VRM playback uses the upstream `idle_loop.vrma` as the bundled fallback. Custom VRM animations
  are user-local and are not distributed with this release. Import `.vrma` files in Models > VRM
  Animations and bind them to each emotion or the looping idle. Missing animation requests fail with
  a console warning instead of breaking the stage.
- Closing the Stage window now hides AIRI to the tray instead of quitting the process.
- Shortcut defaults changed to `Ctrl+Alt+Shift+A` for Spotlight and `Ctrl+Alt+Shift+Space` for
  Push to Talk. Existing PTT settings migrate once from the old default.
- Screen-capture source caching prevents Linux source-ID changes from breaking capture.
- Electron 43.8.4 is included, with the Linux tray registration fix.
- Auto-updates are disabled for this fork. Updates are manual until a fork-owned signed feed exists.

## Platform scope

- Linux-only: Beat Sync `parec` audio capture.
- Linux-focused but cross-platform: screen-capture source caching.
- KDE/Wayland-focused but cross-platform: tray behavior and shortcut defaults.
- Cross-platform: VRM playback, lip sync, Aivis Speech SSML support, and Beat Sync detection
  outside the Linux audio-capture path.

## Install

Download the AppImage, mark it executable, and run it. The AppImage is not automatically integrated
into the desktop. Use AppImageLauncher or create a desktop entry if you want a menu entry and
desktop identity.

## Notes

- Native Wayland global shortcuts can still depend on desktop integration and KDE shortcut
  permissions. Use `--ozone-platform=x11` if the portal path is unreliable.
- This fork does not replace upstream AIRI and does not remove support for other platforms.
