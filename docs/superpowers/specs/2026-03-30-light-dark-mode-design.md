# Light/Dark Mode + Visual Refresh — Design Spec

## Overview

Add a light/dark mode toggle to PromptForge with a visual refresh: fire-orange accent (from the logo) replacing purple, and glassmorphism surfaces for a modern AI-tool aesthetic. Theme preference persists across sessions.

## Approach

**CSS class on `<html>`** — the app already uses CSS custom properties for all colors. Add `html.light` that overrides every token. Toggle adds/removes the class. No React context or provider needed.

## Theme Toggle

- **Location:** top bar, before the gear icon (between model badge and gear)
- **Icon:** sun icon (☀) when in dark mode, moon icon (☾) when in light mode
- **Behavior:** click toggles between dark and light
- **Styling:** uses existing `icon-btn` class for consistency

## Persistence

- Store `theme` key in electron-store (`'dark'` | `'light'`, default `'dark'`)
- New IPC channels: `get-theme` / `save-theme`
- New promptService exports: `getTheme()` / `saveTheme(theme)`
- New preload bridge methods: `getTheme` / `saveTheme`
- On app load, preload reads theme from store and sets `html.light` class before the page paints (avoids flash of wrong theme)

## Flash Prevention

The preload script calls `ipcRenderer.sendSync('get-theme-sync')` and applies `document.documentElement.classList.add('light')` before the page paints. This sync IPC runs exactly once at startup and returns a single string — acceptable overhead.

## Visual Refresh — Accent Color Change

Replace purple `#7c6af7` accent with fire-orange from the logo throughout:

| Token | Old (purple) | New (dark) | New (light) |
|-------|-------------|------------|-------------|
| `--accent` | `#7c6af7` | `#f59e0b` | `#f59e0b` |
| `--accent-hover` | `#6a59e6` | `#ea580c` | `#ea580c` |
| `--accent-active` | `#5a4ad4` | `#d97706` | `#d97706` |
| `--accent-dim` | `rgba(124,106,247,0.12)` | `rgba(245,158,11,0.12)` | `rgba(245,158,11,0.10)` |
| `--accent-glow` | `rgba(124,106,247,0.22)` | `rgba(245,158,11,0.25)` | `rgba(245,158,11,0.15)` |

The Generate button uses a gradient: `linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)` with a warm glow shadow.

## Visual Refresh — Glassmorphism Surfaces

Replace opaque surface colors with semi-transparent glass:

### Dark Theme (`:root`)

| Token | Old | New |
|-------|-----|-----|
| `--bg` | `#181818` | `#141414` |
| `--surface` | `#222222` | `rgba(255,255,255,0.04)` |
| `--surface-2` | `#2a2a2a` | `rgba(255,255,255,0.06)` |
| `--surface-3` | `#323232` | `rgba(255,255,255,0.10)` |
| `--border` | `#2e2e2e` | `rgba(255,255,255,0.08)` |
| `--border-focus` | `#3d3d3d` | `rgba(255,255,255,0.14)` |

Add `backdrop-filter: blur(12px)` to key surfaces: `.top-bar`, `.settings-topbar`, `.tab-bar`, `.text-input`, `.task-textarea`, `.assembled-text`.

### Light Theme (`html.light`)

| Token | Value |
|-------|-------|
| `--bg` | `#f8f8f8` |
| `--surface` | `rgba(255,255,255,0.7)` |
| `--surface-2` | `rgba(255,255,255,0.5)` |
| `--surface-3` | `rgba(255,255,255,0.35)` |
| `--border` | `rgba(0,0,0,0.08)` |
| `--border-focus` | `rgba(0,0,0,0.14)` |
| `--text` | `#1a1a1a` |
| `--text-muted` | `#666666` |
| `--text-dim` | `#999999` |
| `--success` | `#16a34a` |
| `--error` | `#dc2626` |
| `--error-dim` | `rgba(220,38,38,0.08)` |
| `--error-border` | `rgba(220,38,38,0.2)` |

Light surfaces also use `backdrop-filter: blur(16px)`.

## CSS Changes — `index.css`

1. Update `:root` with new dark theme values (orange accent + glass surfaces)
2. Add `html.light` block overriding all custom properties
3. Add `backdrop-filter` and `-webkit-backdrop-filter` (both required for Electron's Chromium) to glass surfaces
4. Update `.btn-primary` to use gradient background
5. Update `.spinner` border colors to work on both themes (use `currentColor` or CSS variables)
6. Update hardcoded colors in specific components (`.win-btn-close:hover`, `.btn-copy.copied`, tier badges) to use CSS variables where they currently use raw hex
7. Add `.theme-toggle` button styling (reuses `icon-btn`)

## Component Changes — `App.jsx`

1. Add `IconSun` and `IconMoon` inline SVG icon components
2. Add `theme` state to `App` component, loaded from `promptService.getTheme()` on mount
3. Add `toggleTheme` callback that flips the theme, saves via `promptService.saveTheme()`, and updates `document.documentElement.classList`
4. Pass `theme` and `onToggleTheme` props to `MainView` and `SettingsView`
5. Add theme toggle button in the top bar right section of `MainView` (before gear icon)
6. Add theme toggle button in the settings topbar controls of `SettingsView`
7. Update hardcoded inline `style` colors in TIER_COLORS and tier badge JSX to use CSS variable-compatible values

## IPC Changes

### `electron/preload.js`

Add to `contextBridge.exposeInMainWorld`:
- `getTheme: () => ipcRenderer.invoke('get-theme')`
- `saveTheme: (theme) => ipcRenderer.invoke('save-theme', theme)`

Also add early theme application:
```js
const theme = ipcRenderer.sendSync('get-theme-sync');
if (theme === 'light') {
  document.documentElement.classList.add('light');
}
```

### `electron/main.js`

Add:
- `ipcMain.on('get-theme-sync', (event) => { event.returnValue = store.get('theme', 'dark'); })` — sync, for preload flash prevention
- `ipcMain.handle('get-theme', () => store.get('theme', 'dark'))` — async, for promptService
- `ipcMain.handle('save-theme', (_event, theme) => { store.set('theme', theme); return true; })` — async

### `src/lib/promptService.js`

Add:
- `export async function getTheme() { return getIPC().getTheme(); }`
- `export async function saveTheme(theme) { return getIPC().saveTheme(theme); }`

The preload exposes two theme methods: `sendSync` for early class application (used once before paint), and normal `invoke`-based `getTheme`/`saveTheme` for promptService (used by React).

## Tier Badge Colors

The tier badges currently use hardcoded colors. These should be updated to use the orange accent for `standard` tier (which was previously purple-accented) and adjusted for light mode contrast:

| Tier | Dark | Light |
|------|------|-------|
| simple | `#4ade80` (green, unchanged) | `#16a34a` (darker green) |
| standard | `#f59e0b` (accent orange) | `#d97706` (darker orange) |
| complex | `#fbbf24` (amber, unchanged) | `#b45309` (darker amber) |

The `TIER_COLORS` constant in `App.jsx` needs updating, and inline styles referencing the old purple for standard tier need to switch.

## Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Update `:root` dark values, add `html.light` block, add glass `backdrop-filter`, update `.btn-primary` gradient |
| `src/App.jsx` | Add `IconSun`/`IconMoon`, theme state, toggle button in top bars, update `TIER_COLORS` |
| `src/lib/promptService.js` | Add `getTheme()` / `saveTheme()` |
| `electron/preload.js` | Add `getTheme`/`saveTheme` bridge methods, early theme class application |
| `electron/main.js` | Add `get-theme-sync`, `get-theme`, `save-theme` IPC handlers |

## Testing

- Verify dark mode renders correctly (visual check)
- Verify light mode renders correctly (visual check)
- Verify toggle switches between modes
- Verify theme persists after app restart (hide + show from tray)
- Verify no flash of wrong theme on load
- Verify all tier badges have sufficient contrast in both themes
- Verify focus rings, error states, success states all work in both themes
- Verify glassmorphism `backdrop-filter` renders in Electron's Chromium

## Out of Scope

- System theme detection (`prefers-color-scheme`) — can be added later
- Per-view theme (e.g., settings always dark) — same theme everywhere
- Theme animation/transition between modes — instant swap is fine
- Custom theme colors beyond dark/light
