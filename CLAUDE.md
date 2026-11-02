# Task Bar: notes for Claude

Read this first in any new thread. It's the handoff, so a fresh session can pick up without re-asking.

## Who and how
- Task Bar belongs to **Nick**, like Command Deck. He builds by talking with Claude and doesn't read or edit code: explain changes in plain words.
- **Mock up before building.** New looks and features go on the design board first; build only after his yes.
- One question at a time; short replies; competent, a little dry, warm.
- He decides when a session ends and how much to take on. Offer the next step; don't wrap up for him.

## What it is
A separate Windows 11 app (Electron) that puts a themed taskbar on Nick's **side monitor without changing which monitor is the main display**.
- Start button (opens an all-apps panel), search box (apps, Windows settings pages, files from the Windows search index, web), pinned apps, open windows (icons only by default, one per window), a tray area for apps like Command Deck, weather, Wi-Fi / volume / notifications buttons, clock, show-desktop strip.
- Seven looks from the Command Deck board: Command (default), Horizon, Hi-Vis, Overclock, Afterhours, Moonbase '79, Skydock.
- Theme picker in Settings › Theme with **wallpaper match**: when the desktop background changes, the bar reads its colors, ranks the themes and shows a "Use …" chip. Optional **tint**: keep the theme, swap its accent for the wallpaper's most vivid color. Suggest only; nothing changes until he picks.
- Tucks Windows' own taskbar away (Windows' auto-hide) while running; puts it back on Quit and on uninstall.
- Design board: "Task Bar Concepts", https://claude.ai/artifact/9QCt2Etp2rwt2mEdrVdzhp (Main = default bar, Bar* = themes, ThemePicker). The Claude Project "Task Bar" has a decisions note.

## Code map
- `main.js`: windows (bar, panel, settings), screen space (AppBar), open-windows polling, search, wallpaper match, weather, menus, updates, the `--smoke` and `--restore-taskbar` modes.
- `src/win32.js`: every Windows call, through koffi (HWNDs are plain numbers). `src/windows.js`: pure helpers (which windows count, bar rectangle, full-screen check, display pick).
- `src/color.js`: palette from the wallpaper, theme ranking, tint colors. `src/search.js`: ranking + result groups + settings pages list. `src/search-host.ps1`: a background PowerShell that answers file searches (Windows index) and lists Start apps (`Get-StartApps`); unpacked from the asar so PowerShell can read it.
- `src/weather.js` (Open-Meteo, default Los Angeles, °F), `src/store.js` (settings.json in the app data folder).
- `shared/themes.js`: theme colors, used by matching and the settings cards. `renderer/themes.css`: the same colors as CSS, plus `bar.css` / `panel.css` theme details.
- Fonts are bundled in `renderer/fonts` (Latin subsets made with fonttools from the Google Fonts repo; Jura copied from Command Deck), OFL licenses alongside.
- `build/installer.nsh`: on uninstall (not on updates) runs the app with `--restore-taskbar`.

## Test, build, release
- `node test/run-tests.js`: unit tests (no Windows needed).
- `node tools/shots.mjs [theme]`: screenshots of bar, panel and settings with stand-in data → `tools/out/`.
- The npm registry is blocked in cloud sessions; nothing is installed locally. CI installs.
- **Release:** `node scripts/bump.js X.Y.Z`, commit, `git push origin main`. The "Release" workflow runs the tests, `tools/win-check.js` (loads every Windows call on a real Windows machine), builds the installer, starts the built app with `--smoke` (bar placed, windows listed, search helper, apps, wallpaper) and, for a new version, publishes the GitHub Release the app updates from. Every push builds and smoke-tests; only new versions publish.
- Commit as `Claude <noreply@anthropic.com>`.

## Where things stand
- v1.0.0 (Nov 2, 2026): first release, everything above.
- v1.0.1: file search falls back to a plain name match when the index rejects a word search; smoke test reports the Windows Search service.
- v1.0.2: open windows as icons only (titles on hover; Settings › Bar brings titles back); tray area beside Wi-Fi for apps on the tray list (Command Deck by default; right-click a window › Move to the tray). Windows of the same app aren't grouped.
- v1.0.3: fixed the bar crashing when a window button was clicked. Cause: window messages (WM_ACTIVATE, the AppBar callback) arrive while a Windows call such as SetForegroundWindow is still running; calling koffi again from inside them crashed. Hooks now defer their work with setImmediate. **Rule: never call into win32 synchronously from a hookWindowMessage callback.** Smoke test now switches to a window and back.
- Parked list: only what Nick parks himself goes here. (Nothing yet.)
