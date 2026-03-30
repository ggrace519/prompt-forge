# Light/Dark Mode + Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark mode toggle with a fire-orange accent and glassmorphism surfaces.

**Architecture:** CSS class on `<html>` toggles between dark (default `:root`) and light (`html.light`) theme tokens. Theme persists via electron-store. Preload applies the class synchronously before paint to prevent flash.

**Tech Stack:** Electron (main + preload), React 18, CSS custom properties, electron-store, Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-light-dark-mode-design.md`

---

### Task 1: Theme IPC — Main Process Handlers

**Files:**
- Modify: `electron/main.js` (inside `app.whenReady().then(...)` IPC section, after the `resize-window` handler around line 667)

- [ ] **Step 1: Add sync theme handler for preload flash prevention**

Add this immediately after the `resize-window` handler (line 671) in `electron/main.js`:

```js
  // ── Theme ──────────────────────────────────────────────────────────────────
  ipcMain.on('get-theme-sync', (event) => {
    event.returnValue = store.get('theme', 'dark');
  });

  ipcMain.handle('get-theme', () => store.get('theme', 'dark'));

  ipcMain.handle('save-theme', (_event, theme) => {
    store.set('theme', theme);
    return true;
  });
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "feat: add theme IPC handlers (get-theme-sync, get-theme, save-theme)"
```

---

### Task 2: Theme IPC — Preload Bridge + Flash Prevention

**Files:**
- Modify: `electron/preload.js`

- [ ] **Step 1: Add early theme application before contextBridge**

Add this block at the top of `preload.js`, after the `require` line (line 3) and before the `contextBridge.exposeInMainWorld` call (line 5):

```js
// Apply saved theme class before first paint to prevent flash
const savedTheme = ipcRenderer.sendSync('get-theme-sync');
if (savedTheme === 'light') {
  document.documentElement.classList.add('light');
}
```

- [ ] **Step 2: Add getTheme and saveTheme to the contextBridge**

Add these two methods inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` object, after the `resizeWindow` entry (line 62):

```js
  // Theme
  getTheme: () =>
    ipcRenderer.invoke('get-theme'),
  saveTheme: (theme) =>
    ipcRenderer.invoke('save-theme', theme),
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.js
git commit -m "feat: add theme bridge methods and flash-prevention in preload"
```

---

### Task 3: Theme IPC — promptService Layer

**Files:**
- Modify: `src/lib/promptService.js`
- Test: `tests/promptService.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests at the end of `tests/promptService.test.js`:

```js
// ── Theme ────────────────────────────────────────────────────────────────────

describe('getTheme', () => {
  it('returns stored theme from IPC', async () => {
    mockIPC.getTheme = vi.fn().mockResolvedValue('light');
    const result = await promptService.getTheme();
    expect(result).toBe('light');
  });
});

describe('saveTheme', () => {
  it('calls saveTheme on IPC bridge', async () => {
    mockIPC.saveTheme = vi.fn().mockResolvedValue(true);
    const result = await promptService.saveTheme('dark');
    expect(mockIPC.saveTheme).toHaveBeenCalledWith('dark');
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `promptService.getTheme is not a function`

- [ ] **Step 3: Write the implementation**

Add at the end of `src/lib/promptService.js`, before the Window controls section (before line 107):

```js
// ── Theme ──────────────────────────────────────────────────────────────────

export async function getTheme() {
  return getIPC().getTheme();
}

export async function saveTheme(theme) {
  return getIPC().saveTheme(theme);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/promptService.js tests/promptService.test.js
git commit -m "feat: add getTheme/saveTheme to promptService with tests"
```

---

### Task 4: CSS Visual Refresh — Dark Theme (`:root`) Update

**Files:**
- Modify: `src/index.css`

This task updates the existing `:root` block to use fire-orange accent and glassmorphism surfaces.

- [ ] **Step 1: Replace the `:root` custom properties block**

Replace lines 5–29 of `src/index.css` (the `:root { ... }` block) with:

```css
:root {
  --bg:            #141414;
  --surface:       rgba(255, 255, 255, 0.04);
  --surface-2:     rgba(255, 255, 255, 0.06);
  --surface-3:     rgba(255, 255, 255, 0.10);
  --border:        rgba(255, 255, 255, 0.08);
  --border-focus:  rgba(255, 255, 255, 0.14);
  --accent:        #f59e0b;
  --accent-hover:  #ea580c;
  --accent-active: #d97706;
  --accent-dim:    rgba(245, 158, 11, 0.12);
  --accent-glow:   rgba(245, 158, 11, 0.25);
  --text:          #e2e2e2;
  --text-muted:    #808080;
  --text-dim:      #4a4a4a;
  --success:       #4ade80;
  --error:         #f87171;
  --error-dim:     rgba(248, 113, 113, 0.1);
  --error-border:  rgba(248, 113, 113, 0.25);
  --radius:        4px;
  --radius-lg:     6px;
  --font-ui:       system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono:     'Consolas', 'Cascadia Code', 'Courier New', monospace;
  --transition:    0.12s ease;
}
```

- [ ] **Step 2: Update `.btn-primary` to use gradient**

Replace the `.btn-primary` rule (around line 367–371):

```css
.btn-primary {
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
  color: #ffffff;
  border-color: transparent;
}
```

Replace the `.btn-primary:not(:disabled):hover` rule (around line 373–377):

```css
.btn-primary:not(:disabled):hover {
  background: linear-gradient(135deg, #ea580c 0%, #d97706 100%);
  border-color: transparent;
  box-shadow: 0 2px 12px var(--accent-glow);
}
```

Replace the `.btn-primary:not(:disabled):active` rule (around line 379–383):

```css
.btn-primary:not(:disabled):active {
  background: var(--accent-active);
  border-color: transparent;
  box-shadow: none;
}
```

- [ ] **Step 3: Update `.spinner` to use CSS variables**

Replace the `.spinner` rule (around lines 83–90):

```css
.spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 0.65s linear infinite;
}
```

Replace the `.btn-spinner` rule (around lines 92–99):

```css
.btn-spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  border-top-color: #ffffff;
  animation: spin 0.65s linear infinite;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Add glassmorphism backdrop-filter to key surfaces**

Add this new rule block right after the `body` rule (after line 50):

```css
/* ── Glassmorphism ─────────────────────────────────────────────────────────── */

.top-bar,
.settings-topbar,
.tab-bar,
.card-header,
.history-header,
.assembled-actions {
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.text-input,
.task-textarea {
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
```

- [ ] **Step 5: Update `.select-input option` and `.override-select option` backgrounds**

The `.select-input option` rule (around line 314) currently uses `background: var(--surface-2)` which is now rgba and won't work in `<option>` elements. Replace with a solid fallback:

```css
.select-input option {
  background: #1e1e1e;
  color: var(--text);
}
```

Similarly for `.override-select option` (around line 1051):

```css
.override-select option {
  background: #1e1e1e;
  color: var(--text);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "feat: update dark theme to fire-orange accent + glassmorphism surfaces"
```

---

### Task 5: CSS — Add Light Theme (`html.light`)

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add the `html.light` custom property overrides**

Add this block right after the `:root { ... }` block (after the closing `}`):

```css
html.light {
  --bg:            #f8f8f8;
  --surface:       rgba(255, 255, 255, 0.7);
  --surface-2:     rgba(255, 255, 255, 0.5);
  --surface-3:     rgba(255, 255, 255, 0.35);
  --border:        rgba(0, 0, 0, 0.08);
  --border-focus:  rgba(0, 0, 0, 0.14);
  --accent:        #f59e0b;
  --accent-hover:  #ea580c;
  --accent-active: #d97706;
  --accent-dim:    rgba(245, 158, 11, 0.10);
  --accent-glow:   rgba(245, 158, 11, 0.15);
  --text:          #1a1a1a;
  --text-muted:    #666666;
  --text-dim:      #999999;
  --success:       #16a34a;
  --error:         #dc2626;
  --error-dim:     rgba(220, 38, 38, 0.08);
  --error-border:  rgba(220, 38, 38, 0.2);
}

html.light .top-bar,
html.light .settings-topbar,
html.light .tab-bar,
html.light .card-header,
html.light .history-header,
html.light .assembled-actions {
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}

html.light .select-input option,
html.light .override-select option {
  background: #ffffff;
  color: #1a1a1a;
}

html.light .btn-copy.copied {
  color: var(--success);
  border-color: rgba(22, 163, 74, 0.3);
  background: rgba(22, 163, 74, 0.08);
}

html.light .tier-simple {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
  border-color: rgba(22, 163, 74, 0.25);
}

html.light .tier-standard {
  color: #d97706;
  background: rgba(217, 119, 6, 0.1);
  border-color: rgba(217, 119, 6, 0.25);
}

html.light .tier-complex {
  color: #b45309;
  background: rgba(180, 83, 9, 0.1);
  border-color: rgba(180, 83, 9, 0.25);
}

html.light .tier-dot.tier-simple   { background: #16a34a; }
html.light .tier-dot.tier-standard { background: #d97706; }
html.light .tier-dot.tier-complex  { background: #b45309; }

html.light .toast {
  background: #ffffff;
  color: #1a1a1a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
```

- [ ] **Step 2: Update the dark `.tier-standard` CSS class to use orange**

The existing `.tier-standard` rule (around line 910) references the old purple. Replace it:

```css
.tier-standard {
  color: var(--accent);
  background: var(--accent-dim);
  border-color: rgba(245, 158, 11, 0.3);
}
```

- [ ] **Step 3: Update `.tier-dot.tier-standard` to use accent**

Replace (around line 969):

```css
.tier-dot.tier-standard { background: var(--accent); }
```

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: add html.light theme overrides + update tier-standard to orange"
```

---

### Task 6: React — Icon Components + Theme State + Toggle Button

**Files:**
- Modify: `src/App.jsx`
- Test: `tests/App.test.jsx`

- [ ] **Step 1: Write failing test for theme toggle**

Add `getTheme` and `saveTheme` to the mock in `tests/App.test.jsx`.

In the `vi.mock` block (around line 10), add these two lines inside the mock object:

```js
  getTheme:           vi.fn(),
  saveTheme:          vi.fn(),
```

In the `setupDefaultMocks` function (around line 40), add:

```js
  promptService.getTheme.mockResolvedValue('dark');
  promptService.saveTheme.mockResolvedValue(true);
```

Add the following test at the end of the file:

```js
// ── Theme toggle ─────────────────────────────────────────────────────────────

describe('App — theme toggle', () => {
  it('renders a theme toggle button in main view', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument();
    });
  });

  it('toggles theme class on html element when clicked', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    const toggle = await waitFor(() => screen.getByTitle('Switch to light mode'));
    fireEvent.click(toggle);

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(promptService.saveTheme).toHaveBeenCalledWith('light');
  });

  it('toggles back to dark when clicked again', async () => {
    promptService.getApiKey.mockResolvedValue('sk-ant-real-key');

    render(<App />);

    const toggle = await waitFor(() => screen.getByTitle('Switch to light mode'));
    fireEvent.click(toggle);

    // Now should show "Switch to dark mode"
    const darkToggle = screen.getByTitle('Switch to dark mode');
    fireEvent.click(darkToggle);

    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(promptService.saveTheme).toHaveBeenCalledWith('dark');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getTheme` not in mock, toggle button not found

- [ ] **Step 3: Add IconSun and IconMoon components**

Add these two components in `src/App.jsx` after the `IconTrash` component (after line 171, before the `// ── Shared components` comment):

```jsx
function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}
```

- [ ] **Step 4: Add theme state and toggle callback to App component**

In the `App` function (around line 209), add `theme` state after the `history` state line:

```jsx
  const [theme,        setTheme]        = useState('dark');
```

In the `useEffect` that loads initial data (the `Promise.all` block around line 217), add `promptService.getTheme()` to the promise array and destructure it:

Change the `Promise.all` from:
```js
    Promise.all([
      promptService.getApiKey(),
      promptService.getSlotConfig(),
      promptService.getOllamaUrl(),
      promptService.getOllamaApiKey(),
      promptService.getSendTargets(),
      promptService.getHistory(),
    ]).then(([key, slots, oUrl, oKey, targets, hist]) => {
```

To:
```js
    Promise.all([
      promptService.getApiKey(),
      promptService.getSlotConfig(),
      promptService.getOllamaUrl(),
      promptService.getOllamaApiKey(),
      promptService.getSendTargets(),
      promptService.getHistory(),
      promptService.getTheme(),
    ]).then(([key, slots, oUrl, oKey, targets, hist, savedTheme]) => {
```

Add after `setHistory(hist || []);`:
```js
      setTheme(savedTheme || 'dark');
```

- [ ] **Step 5: Add toggleTheme callback**

Add this after the `handleSettingsSaved` callback (after line 253):

```jsx
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    promptService.saveTheme(next);
  }, [theme]);
```

- [ ] **Step 6: Pass theme and onToggleTheme to MainView and SettingsView**

Update the `SettingsView` render (around line 269) to add the props:

```jsx
      <SettingsView
        apiKey={apiKey}
        slotConfig={slotConfig}
        ollamaUrl={ollamaUrl}
        ollamaApiKey={ollamaApiKey}
        sendTargets={sendTargets}
        onSave={handleSettingsSaved}
        onBack={canGoBack ? () => setView('main') : null}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
```

Update the `MainView` render (around line 282) to add the props:

```jsx
    <MainView
      slotConfig={slotConfig}
      setSlotConfig={setSlotConfig}
      ollamaUrl={ollamaUrl}
      ollamaApiKey={ollamaApiKey}
      sendTargets={sendTargets}
      history={history}
      setHistory={setHistory}
      onOpenSettings={() => setView('settings')}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
```

- [ ] **Step 7: Add theme toggle button to MainView top bar**

Update the `MainView` function signature (around line 619) to accept the new props:

```jsx
function MainView({ slotConfig, setSlotConfig, ollamaUrl, ollamaApiKey, sendTargets, history, setHistory, onOpenSettings, theme, onToggleTheme }) {
```

Add the theme toggle button in the `top-bar-right` div (around line 733), as the first child before the history button:

```jsx
        <div className="top-bar-right">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button
```

(The existing history button follows immediately after.)

- [ ] **Step 8: Add theme toggle button to SettingsView topbar**

Update the `SettingsView` function signature. Find the line (around 343):

```jsx
function SettingsView({
```

Add `theme, onToggleTheme,` to the destructured props.

In the settings topbar controls section (around line 458), add the theme toggle before `<WindowControls />`:

```jsx
        <div className="settings-topbar-controls">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ marginRight: 2 }}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <WindowControls />
        </div>
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx tests/App.test.jsx
git commit -m "feat: add theme toggle button with sun/moon icons in top bars"
```

---

### Task 7: React — Update TIER_COLORS for Orange Accent

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update the TIER_COLORS constant**

Replace the `TIER_COLORS` constant (around line 21–25):

```jsx
const TIER_COLORS = {
  simple:   { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' },
  standard: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  complex:  { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
};
```

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: update TIER_COLORS from purple to orange accent"
```

---

### Task 8: Final Cleanup — Clean test for theme on document element

**Files:**
- Modify: `tests/App.test.jsx`

- [ ] **Step 1: Add afterEach to reset document class**

In `tests/App.test.jsx`, add cleanup for the `light` class to the existing `beforeEach` block (around line 60):

```js
beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
  document.documentElement.classList.remove('light');
});
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/App.test.jsx
git commit -m "test: add document class cleanup between theme tests"
```

---

### Task 9: Manual Verification

No code changes — visual verification of the implementation.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify dark mode**

Check: app launches in dark mode. Background is `#141414`. Accent is orange. Generate button has an orange gradient. Glass surfaces are semi-transparent. Focus rings are orange.

- [ ] **Step 3: Verify light mode toggle**

Click the sun icon in the top bar. Check: background switches to `#f8f8f8`. Text goes dark. Accent stays orange. Surfaces are frosted-glass white. Toggle icon changes to moon.

- [ ] **Step 4: Verify settings view**

Open settings. Check: theme toggle is in the settings topbar. Clicking it toggles theme. All form elements readable in both themes.

- [ ] **Step 5: Verify persistence**

Set theme to light. Hide window to tray. Click tray icon to reopen. Check: still in light mode, no flash of dark on open.

- [ ] **Step 6: Verify tier badges**

Generate a prompt. Check: tier badges have correct contrast in both themes. Simple is green, standard is orange, complex is amber.
