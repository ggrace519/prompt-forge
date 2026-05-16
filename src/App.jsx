import { useState, useEffect, useCallback, useRef } from 'react';
import * as promptService from './lib/promptService';
import logoUrl from './assets/logo.png';
import { IMAGE_SECTIONS, VIDEO_SECTIONS, appendAspectRatio } from './lib/utils.js';

const SECTIONS = [
  { key: 'role',          label: 'Role & Objective'  },
  { key: 'instructions',  label: 'Instructions'      },
  { key: 'context',       label: 'Context'           },
  { key: 'outputFormat',  label: 'Output Format'     },
  { key: 'reasoning',     label: 'Reasoning Chain'   },
  { key: 'examples',      label: 'Examples'          },
  { key: 'reinforcement', label: 'Reinforcement'     },
];

// Fallback Anthropic models if API fetch fails
const FALLBACK_ANTHROPIC_MODELS = [
  'claude-sonnet-4-5-20250514',
  'claude-haiku-4-5-20251001',
];

const FALLBACK_OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
];

// ── Slot encoding helpers ─────────────────────────────────────────────────────
// A slot is `{ provider, authMethod, model }` where authMethod distinguishes
// `anthropic` API-key from Claude Code subscription. Encoded form is used as
// the <select> option value: "<provider>:<authMethod>:<model>". Splitting on
// the first two `:` only — model names may legitimately contain `:` (e.g.
// `llama3:8b` from Ollama).
function encodeSlot(config) {
  if (!config) return '';
  const auth = config.authMethod || 'apiKey';
  return `${config.provider}:${auth}:${config.model || ''}`;
}

function decodeSlot(encoded) {
  const first = encoded.indexOf(':');
  const second = encoded.indexOf(':', first + 1);
  return {
    provider:   encoded.slice(0, first),
    authMethod: encoded.slice(first + 1, second),
    model:      encoded.slice(second + 1),
  };
}

function defaultSlot(provider = 'anthropic', model = 'claude-haiku-4-5-20251001') {
  return { provider, authMethod: 'apiKey', model };
}

const TIER_COLORS = {
  simple:   { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' },
  standard: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  complex:  { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
  image:    { bg: 'rgba(34, 211, 238, 0.12)', border: 'rgba(34, 211, 238, 0.3)', text: '#22d3ee' },
  video:    { bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)', text: '#a78bfa' },
};

// ── Icon components ───────────────────────────────────────────────────────────

function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IconChevron({ up }) {
  return (
    <svg
      className={`chevron-icon${up ? ' up' : ''}`}
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function IconX() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconMinus() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function IconSliders() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  );
}

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

// ── ModeToggle ────────────────────────────────────────────────────────────────

const MODES = [
  { key: 'text',  label: 'Text'  },
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
];

export function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-toggle" role="group" aria-label="Output mode">
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`mode-toggle-btn${mode === m.key ? ' active' : ''}`}
          aria-pressed={mode === m.key}
          onClick={() => onChange(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── AspectRatioSelect ─────────────────────────────────────────────────────────

const ASPECT_RATIOS = ['16:9', '1:1', '9:16', '4:3', '21:9'];

function AspectRatioSelect({ value, onChange }) {
  return (
    <div className="aspect-ratio-select">
      <label className="aspect-ratio-label" htmlFor="aspect-ratio">
        Aspect ratio
      </label>
      <select
        id="aspect-ratio"
        className="text-input select-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {ASPECT_RATIOS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function WindowControls() {
  return (
    <div className="window-controls">
      <button
        className="win-btn win-btn-minimize"
        onClick={() => promptService.minimizeWindow()}
        title="Minimize"
        aria-label="Minimize"
      >
        <IconMinus />
      </button>
      <button
        className="win-btn win-btn-close"
        onClick={() => promptService.closeWindow()}
        title="Close"
        aria-label="Close"
      >
        <IconX />
      </button>
    </div>
  );
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast" role="status">{message}</div>;
}

// ── App ───────────────────────────────────────────────────────────────────────

/** Does the current config let us call generate-prompt without further setup? */
function hasUsableConfig({ apiKey, openaiApiKey, slotConfig }) {
  if (!slotConfig) return false;
  const slots = ['classify', 'generateSimple', 'generateComplex']
    .map((k) => slotConfig[k])
    .filter(Boolean);
  return slots.some((s) => {
    if (s.provider === 'ollama') return !!s.model;
    if (s.provider === 'openai') return !!openaiApiKey;
    if (s.provider === 'anthropic') {
      return s.authMethod === 'subscription' || !!apiKey;
    }
    return false;
  });
}

export default function App() {
  const [view,          setView]          = useState('loading');
  const [apiKey,        setApiKey]        = useState('');
  const [openaiApiKey,  setOpenaiApiKey]  = useState('');
  const [slotConfig,    setSlotConfig]    = useState(null);
  const [ollamaUrl,     setOllamaUrl]     = useState('http://localhost:11434');
  const [ollamaApiKey,  setOllamaApiKey]  = useState('');
  const [sendTargets,   setSendTargets]   = useState([]);
  const [history,       setHistory]       = useState([]);
  const [theme,         setTheme]         = useState('dark');

  useEffect(() => {
    Promise.all([
      promptService.getApiKey(),
      promptService.getOpenaiApiKey(),
      promptService.getSlotConfig(),
      promptService.getOllamaUrl(),
      promptService.getOllamaApiKey(),
      promptService.getSendTargets(),
      promptService.getHistory(),
      promptService.getTheme(),
    ]).then(([key, openaiKey, slots, oUrl, oKey, targets, hist, savedTheme]) => {
      setApiKey(key || '');
      setOpenaiApiKey(openaiKey || '');
      setSlotConfig(slots || {
        classify:        defaultSlot(),
        generateSimple:  defaultSlot(),
        generateComplex: defaultSlot('anthropic', 'claude-sonnet-4-5'),
      });
      setOllamaUrl(oUrl || 'http://localhost:11434');
      setOllamaApiKey(oKey || '');
      setSendTargets(targets || []);
      setHistory(hist || []);
      setTheme(savedTheme || 'dark');

      const usable = hasUsableConfig({ apiKey: key, openaiApiKey: openaiKey, slotConfig: slots });
      setView(usable ? 'main' : 'settings');
    }).catch(() => setView('settings'));
  }, []);

  const handleSettingsSaved = useCallback((config) => {
    setApiKey(config.apiKey);
    setOpenaiApiKey(config.openaiApiKey);
    setSlotConfig(config.slotConfig);
    setOllamaUrl(config.ollamaUrl);
    setOllamaApiKey(config.ollamaApiKey);
    setSendTargets(config.sendTargets);
    setView('main');
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    promptService.saveTheme(next);
  }, [theme]);

  const canGoBack = hasUsableConfig({ apiKey, openaiApiKey, slotConfig });

  if (view === 'loading') {
    return (
      <div className="init-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <SettingsView
        apiKey={apiKey}
        openaiApiKey={openaiApiKey}
        slotConfig={slotConfig}
        ollamaUrl={ollamaUrl}
        ollamaApiKey={ollamaApiKey}
        sendTargets={sendTargets}
        onSave={handleSettingsSaved}
        onBack={canGoBack ? () => setView('main') : null}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <MainView
      slotConfig={slotConfig}
      setSlotConfig={setSlotConfig}
      ollamaUrl={ollamaUrl}
      ollamaApiKey={ollamaApiKey}
      openaiApiKey={openaiApiKey}
      sendTargets={sendTargets}
      history={history}
      setHistory={setHistory}
      onOpenSettings={() => setView('settings')}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}

// ── SettingsView ──────────────────────────────────────────────────────────────

/** Unified model dropdown — Anthropic (API/subscription) + OpenAI + Ollama. */
function SlotModelSelect({
  label, slotKey, config, onChange,
  anthropicModels, openaiModels, ollamaModels,
}) {
  const currentValue = encodeSlot(config);

  // Ensure the currently-selected model is present in its optgroup so the
  // <select> doesn't silently flip to the first option when the model is
  // missing from the fetched list.
  const includeCurrent = (provider, authMethod, list) => {
    const isHere =
      config?.provider === provider &&
      (config.authMethod || 'apiKey') === authMethod &&
      config.model && !list.includes(config.model);
    return isHere ? [config.model, ...list] : list;
  };

  const anthApiList = includeCurrent('anthropic', 'apiKey',       anthropicModels);
  const anthSubList = includeCurrent('anthropic', 'subscription', anthropicModels);
  const openaiList  = includeCurrent('openai',    'apiKey',       openaiModels);
  const ollamaList  = includeCurrent('ollama',    'apiKey',       ollamaModels);

  return (
    <div className="field-group">
      <label className="field-label" htmlFor={`${slotKey}-model`}>{label}</label>
      <select
        id={`${slotKey}-model`}
        className="text-input select-input"
        value={currentValue}
        onChange={(e) => onChange(decodeSlot(e.target.value))}
      >
        <optgroup label="Anthropic (API key)">
          {anthApiList.map((m) => (
            <option key={`a-api-${m}`} value={`anthropic:apiKey:${m}`}>{m}</option>
          ))}
        </optgroup>
        <optgroup label="Anthropic (Claude Code subscription)">
          {anthSubList.map((m) => (
            <option key={`a-sub-${m}`} value={`anthropic:subscription:${m}`}>{m}</option>
          ))}
        </optgroup>
        <optgroup label="OpenAI (API key)">
          {openaiList.length > 0
            ? openaiList.map((m) => (
                <option key={`o-${m}`} value={`openai:apiKey:${m}`}>{m}</option>
              ))
            : <option disabled value="">Add OpenAI key to enable</option>
          }
        </optgroup>
        <optgroup label="Ollama">
          {ollamaList.length > 0
            ? ollamaList.map((m) => (
                <option key={`l-${m}`} value={`ollama:apiKey:${m}`}>{m}</option>
              ))
            : <option disabled value="">Fetch models first</option>
          }
        </optgroup>
      </select>
    </div>
  );
}

function SettingsView({
  apiKey: currentApiKey, openaiApiKey: currentOpenaiApiKey,
  slotConfig: currentSlotConfig,
  ollamaUrl: currentOllamaUrl, ollamaApiKey: currentOllamaApiKey,
  sendTargets: currentSendTargets,
  onSave, onBack,
  theme, onToggleTheme,
}) {
  const [key,             setKey]             = useState('');
  const [openaiKey,       setOpenaiKey]       = useState('');
  const [serverUrl,       setServerUrl]       = useState(currentOllamaUrl || 'http://localhost:11434');
  const [ollamaKey,       setOllamaKey]       = useState('');
  const [anthropicModels, setAnthropicModels] = useState(FALLBACK_ANTHROPIC_MODELS);
  const [openaiModels,    setOpenaiModels]    = useState(FALLBACK_OPENAI_MODELS);
  const [ollamaModels,    setOllamaModels]    = useState([]);
  const [fetchingModels,  setFetchingModels]  = useState(false);
  const [fetchError,      setFetchError]      = useState('');
  const [cliStatus,       setCliStatus]       = useState(null); // null=loading, {installed, version?}

  const [slots, setSlots] = useState(currentSlotConfig || {
    classify:        defaultSlot('anthropic', FALLBACK_ANTHROPIC_MODELS[1]),
    generateSimple:  defaultSlot('anthropic', FALLBACK_ANTHROPIC_MODELS[1]),
    generateComplex: defaultSlot('anthropic', FALLBACK_ANTHROPIC_MODELS[0]),
  });

  const [targets, setTargets] = useState(currentSendTargets || []);
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetUrl,  setNewTargetUrl]  = useState('');

  const [saving, setSaving] = useState(false);

  // Auto-fetch model lists + Claude CLI status on mount
  useEffect(() => {
    promptService.fetchAnthropicModels().then((result) => {
      if (result.success && result.models.length > 0) {
        setAnthropicModels(result.models);
      }
    }).catch(() => {});

    promptService.fetchOpenaiModels().then((result) => {
      if (result.success && result.models.length > 0) {
        setOpenaiModels(result.models);
      }
    }).catch(() => {});

    promptService.checkClaudeCliStatus()
      .then(setCliStatus)
      .catch(() => setCliStatus({ installed: false }));

    if (serverUrl) {
      handleFetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFetchModels() {
    setFetchingModels(true);
    setFetchError('');
    try {
      const result = await promptService.fetchOllamaModels(serverUrl, ollamaKey);
      if (result.success) {
        setOllamaModels(result.models);
        if (result.models.length === 0) {
          setFetchError('Server responded but returned 0 models');
        }
      } else {
        setFetchError(result.error || 'Could not connect to Ollama server');
      }
    } catch (err) {
      setFetchError('IPC error: ' + (err.message || String(err)));
    } finally {
      setFetchingModels(false);
    }
  }

  function updateSlot(slotKey, value) {
    setSlots((prev) => ({ ...prev, [slotKey]: value }));
  }

  function addTarget() {
    const name = newTargetName.trim();
    const url = newTargetUrl.trim();
    if (!name || !url) return;
    setTargets((prev) => [...prev, { name, url }]);
    setNewTargetName('');
    setNewTargetUrl('');
  }

  function removeTarget(index) {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const trimmedKey = key.trim();
      const trimmedOpenaiKey = openaiKey.trim();
      if (trimmedKey)       await promptService.saveApiKey(trimmedKey);
      if (trimmedOpenaiKey) await promptService.saveOpenaiApiKey(trimmedOpenaiKey);
      await promptService.saveOllamaUrl(serverUrl);
      await promptService.saveOllamaApiKey(ollamaKey);
      await promptService.saveSlotConfig(slots);
      await promptService.saveSendTargets(targets);
      onSave({
        apiKey:       trimmedKey       || currentApiKey,
        openaiApiKey: trimmedOpenaiKey || currentOpenaiApiKey,
        slotConfig:   slots,
        ollamaUrl:    serverUrl,
        ollamaApiKey: ollamaKey,
        sendTargets:  targets,
      });
    } finally {
      setSaving(false);
    }
  }

  // Can save iff every slot has the credentials it needs.
  const hasAnthropicKey = !!(key.trim() || currentApiKey);
  const hasOpenaiKey    = !!(openaiKey.trim() || currentOpenaiApiKey);
  const SLOT_KEYS = ['classify', 'generateSimple', 'generateComplex'];
  const slotList = SLOT_KEYS.map((k) => slots[k]).filter(Boolean);
  const slotIsSatisfied = (s) => {
    if (s.provider === 'ollama')    return !!serverUrl;
    if (s.provider === 'openai')    return hasOpenaiKey;
    if (s.provider === 'anthropic') return s.authMethod === 'subscription' || hasAnthropicKey;
    return false;
  };
  const canSave = slotList.every(slotIsSatisfied) && !saving;
  const usesSubscription = slotList.some(
    (s) => s.provider === 'anthropic' && s.authMethod === 'subscription',
  );

  return (
    <div className="settings-view">
      <div className="settings-topbar">
        <div className="settings-topbar-left">
          {onBack && (
            <button className="settings-back-btn" onClick={onBack} aria-label="Back">
              <IconArrowLeft />
              Back
            </button>
          )}
        </div>
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
      </div>

      <div className="settings-inner">
        <div className="settings-header">
          <img src={logoUrl} alt="PromptForge" className="app-logo" />
        </div>

        {/* Shared Anthropic API Key */}
        <div className="field-group">
          <label className="field-label" htmlFor="api-key-input">
            Anthropic API Key
          </label>
          <input
            id="api-key-input"
            type="password"
            className="text-input"
            placeholder={currentApiKey ? '••••••••  (saved)' : 'sk-ant-api03-...'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="settings-desc" style={{ textAlign: 'left', padding: 0, marginTop: 2 }}>
            Encrypted with Windows DPAPI. <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Get a key</a>
          </p>
        </div>

        {/* Shared OpenAI API Key */}
        <div className="field-group">
          <label className="field-label" htmlFor="openai-key-input">
            OpenAI API Key
          </label>
          <input
            id="openai-key-input"
            type="password"
            className="text-input"
            placeholder={currentOpenaiApiKey ? '••••••••  (saved)' : 'sk-...'}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="settings-desc" style={{ textAlign: 'left', padding: 0, marginTop: 2 }}>
            Encrypted with Windows DPAPI. <a className="link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get a key</a>
          </p>
        </div>

        {/* Claude Code subscription status — only relevant when a slot uses it */}
        {usesSubscription && (
          <div className="field-group" style={{ marginTop: -4 }}>
            {cliStatus === null && (
              <p className="settings-desc" style={{ textAlign: 'left', padding: 0 }}>
                Checking Claude Code CLI…
              </p>
            )}
            {cliStatus && cliStatus.installed && (
              <p className="settings-desc" style={{ textAlign: 'left', padding: 0, color: '#4ade80' }}>
                ✓ Claude Code detected{cliStatus.version ? ` (${cliStatus.version})` : ''} — subscription auth enabled.
              </p>
            )}
            {cliStatus && !cliStatus.installed && (
              <p className="settings-desc" style={{ textAlign: 'left', padding: 0, color: '#f59e0b' }}>
                ⚠ Claude Code CLI not detected. <a
                  className="link"
                  href="https://docs.claude.com/en/docs/claude-code/setup"
                  target="_blank" rel="noreferrer"
                >Install &amp; sign in</a> to use the subscription auth path.
              </p>
            )}
          </div>
        )}

        {/* Shared Ollama Config */}
        <div className="field-group">
          <label className="field-label" htmlFor="ollama-url-input">
            Ollama Server URL
          </label>
          <input
            id="ollama-url-input"
            type="url"
            className="text-input"
            placeholder="http://localhost:11434"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="ollama-key-input">
            Ollama API Key <span className="field-label-optional">(optional)</span>
          </label>
          <input
            id="ollama-key-input"
            type="password"
            className="text-input"
            placeholder="Leave empty if not required"
            value={ollamaKey}
            onChange={(e) => setOllamaKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="ollama-fetch-row">
          <button
            className="btn btn-secondary"
            onClick={handleFetchModels}
            disabled={!serverUrl || fetchingModels}
          >
            {fetchingModels
              ? <><span className="btn-spinner" /> Connecting...</>
              : 'Fetch Models'}
          </button>
          {fetchError && (
            <span className="ollama-fetch-error" role="alert">{fetchError}</span>
          )}
        </div>

        {/* Slot model selectors */}
        <SlotModelSelect
          label="Classification Model"
          slotKey="classify"
          config={slots.classify}
          onChange={(v) => updateSlot('classify', v)}
          anthropicModels={anthropicModels}
          openaiModels={openaiModels}
          ollamaModels={ollamaModels}
        />
        <SlotModelSelect
          label="Simple & Standard Generation"
          slotKey="generateSimple"
          config={slots.generateSimple}
          onChange={(v) => updateSlot('generateSimple', v)}
          anthropicModels={anthropicModels}
          openaiModels={openaiModels}
          ollamaModels={ollamaModels}
        />
        <SlotModelSelect
          label="Complex Generation"
          slotKey="generateComplex"
          config={slots.generateComplex}
          onChange={(v) => updateSlot('generateComplex', v)}
          anthropicModels={anthropicModels}
          openaiModels={openaiModels}
          ollamaModels={ollamaModels}
        />

        {/* Send targets */}
        <div className="field-group">
          <label className="field-label">Send-to Targets</label>
          {targets.map((t, i) => (
            <div key={i} className="send-target-row">
              <span className="send-target-name">{t.name}</span>
              <span className="send-target-url">{t.url}</span>
              <button
                className="send-target-remove"
                onClick={() => removeTarget(i)}
                aria-label={`Remove ${t.name}`}
              >
                <IconX />
              </button>
            </div>
          ))}
          <div className="send-target-add">
            <input
              className="text-input"
              placeholder="Name"
              value={newTargetName}
              onChange={(e) => setNewTargetName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              className="text-input"
              placeholder="https://..."
              value={newTargetUrl}
              onChange={(e) => setNewTargetUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTarget()}
              style={{ flex: 2 }}
            />
            <button
              className="btn btn-secondary"
              onClick={addTarget}
              disabled={!newTargetName.trim() || !newTargetUrl.trim()}
              style={{ padding: '6px 8px' }}
            >
              <IconPlus />
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}

// ── MainView ──────────────────────────────────────────────────────────────────

function MainView({ slotConfig, setSlotConfig, ollamaUrl, ollamaApiKey, openaiApiKey, sendTargets, history, setHistory, onOpenSettings, theme, onToggleTheme }) {
  const [task,         setTask]         = useState('');
  const [mode,         setMode]         = useState('text');
  const [aspectRatio,  setAspectRatio]  = useState('1:1');
  const [loading,      setLoading]      = useState(false);
  const [loadingStep,  setLoadingStep]  = useState('');
  const [result,       setResult]       = useState(null);
  const [tier,         setTier]         = useState(null);
  const [error,        setError]        = useState('');
  const [errorKey,     setErrorKey]     = useState(0);
  const [activeTab,    setActiveTab]    = useState('assembled');
  const [showOverride, setShowOverride] = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);
  const [toast,        setToast]        = useState('');
  const [anthropicModels, setAnthropicModels] = useState(FALLBACK_ANTHROPIC_MODELS);
  const [openaiModels, setOpenaiModels] = useState(FALLBACK_OPENAI_MODELS);
  const [ollamaModels, setOllamaModels] = useState([]);

  // Load persisted mode + aspect ratio on mount
  useEffect(() => {
    promptService.getLastMode().then((m) => {
      if (['text', 'image', 'video'].includes(m)) setMode(m);
    }).catch(() => {});
  }, []);

  // When mode changes, load the saved aspect ratio for that mode
  useEffect(() => {
    if (mode === 'text') return;
    promptService.getLastAspectRatio(mode).then((r) => {
      if (r) setAspectRatio(r);
    }).catch(() => {});
  }, [mode]);

  // Fetch all three model lists for the override row
  useEffect(() => {
    promptService.fetchAnthropicModels().then((result) => {
      if (result.success && result.models.length > 0) setAnthropicModels(result.models);
    }).catch(() => {});

    promptService.fetchOpenaiModels().then((result) => {
      if (result.success && result.models.length > 0) setOpenaiModels(result.models);
    }).catch(() => {});

    if (ollamaUrl) {
      promptService.fetchOllamaModels(ollamaUrl, ollamaApiKey || '').then((result) => {
        if (result.success) setOllamaModels(result.models);
      });
    }
  }, [ollamaUrl, ollamaApiKey, openaiApiKey]);

  const modelLabel = (() => {
    const slot = slotConfig?.generateSimple;
    if (!slot) return '';
    return slot.model || '';
  })();

  // Window dimensions per mode + state
  useEffect(() => {
    if (mode === 'image' || mode === 'video') {
      promptService.resizeWindow({ width: 640, height: 720 });
    } else {
      promptService.resizeWindow({ width: 480, height: result ? 640 : 320 });
    }
  }, [mode, result]);

  function handleModeChange(next) {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setTier(null);
    setError('');
    promptService.saveLastMode(next).catch(() => {});
  }

  function handleAspectRatioChange(next) {
    setAspectRatio(next);
    if (mode === 'image' || mode === 'video') {
      promptService.saveLastAspectRatio(mode, next).catch(() => {});
    }
  }

  async function handleGenerate(overrideTier) {
    const trimmed = task.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    setTier(null);

    try {
      setLoadingStep(overrideTier ? 'generating' : 'classifying');
      const isMedia = mode === 'image' || mode === 'video';
      const response = await promptService.generatePrompt(
        trimmed,
        isMedia ? undefined : (overrideTier || undefined),
        isMedia ? mode : undefined,
      );
      setResult(response.data);
      setTier(response.tier);
      setActiveTab('assembled');

      // Save to history
      const entry = {
        task: trimmed,
        tier: response.tier,
        result: response.data,
        classifyProvider: response.classifyProvider,
        classifyModel: response.classifyModel,
        generateProvider: response.generateProvider,
        generateModel: response.generateModel,
        timestamp: new Date().toISOString(),
      };
      promptService.saveHistoryEntry(entry);
      setHistory((prev) => [entry, ...prev]);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setErrorKey((k) => k + 1);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  function restoreFromHistory(entry) {
    setTask(entry.task);
    setResult(entry.result);
    setTier(entry.tier);
    setActiveTab('assembled');
    setShowHistory(false);
  }

  async function handleClearHistory() {
    await promptService.clearHistory();
    setHistory([]);
  }

  async function handleSlotChange(slotKey, decoded) {
    const updated = {
      ...slotConfig,
      [slotKey]: decoded,
    };
    setSlotConfig(updated);
    await promptService.saveSlotConfig(updated);
  }

  const buttonText = loading
    ? (loadingStep === 'classifying' ? <><span className="btn-spinner" /> Classifying...</> : <><span className="btn-spinner" /> Generating...</>)
    : 'Generate Prompt';

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <img src={logoUrl} alt="PromptForge" className="app-logo-sm" />
          <span
            className="model-badge"
            title={modelLabel}
            aria-label={`Active model: ${modelLabel}`}
          >
            {modelLabel}
          </span>
        </div>
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
            className="icon-btn"
            onClick={() => setShowHistory(!showHistory)}
            title="Prompt History"
            aria-label="Prompt History"
          >
            <IconClock />
          </button>
          <button
            className="icon-btn"
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
          >
            <IconGear />
          </button>
          <div className="top-bar-divider" aria-hidden="true" />
          <button
            className="win-btn win-btn-minimize"
            onClick={() => promptService.minimizeWindow()}
            title="Minimize"
            aria-label="Minimize"
          >
            <IconMinus />
          </button>
          <button
            className="win-btn win-btn-close"
            onClick={() => promptService.closeWindow()}
            title="Close"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>
      </header>

      {showHistory ? (
        <HistoryPanel
          history={history}
          onRestore={restoreFromHistory}
          onClear={handleClearHistory}
          onClose={() => setShowHistory(false)}
        />
      ) : (
        <div className="main-body">
          <ModeToggle mode={mode} onChange={handleModeChange} />
          <div className="input-group">
            <textarea
              className="task-textarea"
              rows={5}
              placeholder="Describe your task... (Ctrl+Enter to generate)"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
              spellCheck={false}
            />

            {/* Override row toggle */}
            <div className="input-actions-row">
              <button
                className={`override-toggle${showOverride ? ' active' : ''}`}
                onClick={() => setShowOverride(!showOverride)}
                title="Model overrides"
                aria-label="Toggle model overrides"
                aria-expanded={showOverride}
              >
                <IconSliders />
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => handleGenerate()}
                disabled={loading || !task.trim()}
              >
                {buttonText}
              </button>
            </div>

            {showOverride && (
              <div className="override-row">
                <OverrideSlot
                  label="Classify"
                  slotKey="classify"
                  config={slotConfig?.classify}
                  anthropicModels={anthropicModels}
                  openaiModels={openaiModels}
                  ollamaModels={ollamaModels}
                  onChange={handleSlotChange}
                />
                <OverrideSlot
                  label="Simple"
                  slotKey="generateSimple"
                  config={slotConfig?.generateSimple}
                  anthropicModels={anthropicModels}
                  openaiModels={openaiModels}
                  ollamaModels={ollamaModels}
                  onChange={handleSlotChange}
                />
                <OverrideSlot
                  label="Complex"
                  slotKey="generateComplex"
                  config={slotConfig?.generateComplex}
                  anthropicModels={anthropicModels}
                  openaiModels={openaiModels}
                  ollamaModels={ollamaModels}
                  onChange={handleSlotChange}
                />
              </div>
            )}
          </div>

          {error && (
            <div key={errorKey} className="error-banner" role="alert">
              <span className="error-icon"><IconWarning /></span>
              <span>{error}</span>
            </div>
          )}

          {result && (
            <ResultsPanel
              result={result}
              tier={tier}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onTierChange={(t) => handleGenerate(t)}
              sendTargets={sendTargets}
              toast={toast}
              setToast={setToast}
              mode={mode}
              aspectRatio={aspectRatio}
              onAspectRatioChange={handleAspectRatioChange}
            />
          )}
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  );
}

// ── OverrideSlot ──────────────────────────────────────────────────────────────

function OverrideSlot({
  label, slotKey, config,
  anthropicModels = [], openaiModels = [], ollamaModels = [],
  onChange,
}) {
  const currentValue = encodeSlot(config);

  const includeCurrent = (provider, authMethod, list) => {
    const isHere =
      config?.provider === provider &&
      (config.authMethod || 'apiKey') === authMethod &&
      config.model && !list.includes(config.model);
    return isHere ? [config.model, ...list] : list;
  };

  const anthApiList = includeCurrent('anthropic', 'apiKey',       anthropicModels);
  const anthSubList = includeCurrent('anthropic', 'subscription', anthropicModels);
  const openaiList  = includeCurrent('openai',    'apiKey',       openaiModels);
  const ollamaList  = includeCurrent('ollama',    'apiKey',       ollamaModels);

  return (
    <div className="override-slot">
      <span className="override-label">{label}</span>
      <select
        className="override-select"
        value={currentValue}
        onChange={(e) => onChange(slotKey, decodeSlot(e.target.value))}
      >
        <optgroup label="Anthropic (API)">
          {anthApiList.map((m) => (
            <option key={`a-api-${m}`} value={`anthropic:apiKey:${m}`}>{m}</option>
          ))}
        </optgroup>
        <optgroup label="Anthropic (Claude Code)">
          {anthSubList.map((m) => (
            <option key={`a-sub-${m}`} value={`anthropic:subscription:${m}`}>{m}</option>
          ))}
        </optgroup>
        {openaiList.length > 0 && (
          <optgroup label="OpenAI">
            {openaiList.map((m) => (
              <option key={`o-${m}`} value={`openai:apiKey:${m}`}>{m}</option>
            ))}
          </optgroup>
        )}
        {ollamaList.length > 0 && (
          <optgroup label="Ollama">
            {ollamaList.map((m) => (
              <option key={`l-${m}`} value={`ollama:apiKey:${m}`}>{m}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

// ── HistoryPanel ──────────────────────────────────────────────────────────────

function HistoryPanel({ history, onRestore, onClear, onClose }) {
  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">History</span>
        <div className="history-actions">
          {history.length > 0 && (
            <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={onClear}>
              <IconTrash /> Clear
            </button>
          )}
          <button className="icon-btn small" onClick={onClose} aria-label="Close history">
            <IconX />
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="history-empty">No prompts generated yet.</div>
      ) : (
        <div className="history-list">
          {history.map((entry, i) => (
            <button key={i} className="history-entry" onClick={() => onRestore(entry)}>
              <span className="history-task">{entry.task}</span>
              <div className="history-meta">
                {entry.tier && (
                  <span className={`tier-badge tier-${entry.tier}`}>
                    {entry.tier.charAt(0).toUpperCase() + entry.tier.slice(1)}
                  </span>
                )}
                <span className="history-time">{formatTime(entry.timestamp)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ResultsPanel ──────────────────────────────────────────────────────────────

export function ResultsPanel({
  result, tier, activeTab, onTabChange, onTierChange,
  sendTargets, toast, setToast,
  mode, aspectRatio, onAspectRatioChange,
}) {
  const isMedia = mode === 'image' || mode === 'video';
  const sections = mode === 'image' ? IMAGE_SECTIONS
                : mode === 'video' ? VIDEO_SECTIONS
                : SECTIONS;

  const displayedAssembled = isMedia
    ? appendAspectRatio(result.assembled, aspectRatio)
    : result.assembled;

  return (
    <div className="results-panel">
      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'assembled'}
          className={`tab-btn${activeTab === 'assembled' ? ' active' : ''}`}
          onClick={() => onTabChange('assembled')}
        >
          Assembled
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'breakdown'}
          className={`tab-btn${activeTab === 'breakdown' ? ' active' : ''}`}
          onClick={() => onTabChange('breakdown')}
        >
          Breakdown
        </button>
        {tier && !isMedia && (
          <TierBadgeDropdown tier={tier} onTierChange={onTierChange} />
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'assembled' && (
          <>
            {isMedia && (
              <AspectRatioSelect value={aspectRatio} onChange={onAspectRatioChange} />
            )}
            <AssembledTab
              assembled={displayedAssembled}
              sendTargets={sendTargets}
              setToast={setToast}
            />
          </>
        )}
        {activeTab === 'breakdown' && <BreakdownTab result={result} sections={sections} />}
      </div>
    </div>
  );
}

// ── TierBadgeDropdown ─────────────────────────────────────────────────────────

function TierBadgeDropdown({ tier, onTierChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const tiers = ['simple', 'standard', 'complex'];
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="tier-badge-wrapper" ref={ref}>
      <button
        className={`tier-badge tier-${tier}`}
        onClick={() => setOpen(!open)}
        aria-label={`Tier: ${label}. Click to change.`}
      >
        {label}
        <IconChevron up={open} />
      </button>
      {open && (
        <div className="tier-dropdown">
          {tiers.map((t) => (
            <button
              key={t}
              className={`tier-option${t === tier ? ' active' : ''}`}
              onClick={() => {
                setOpen(false);
                if (t !== tier) onTierChange(t);
              }}
            >
              <span className={`tier-dot tier-${t}`} />
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AssembledTab ──────────────────────────────────────────────────────────────

function AssembledTab({ assembled, sendTargets, setToast }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await promptService.copyToClipboard(assembled);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendTo(target) {
    await promptService.copyToClipboard(assembled);
    await promptService.openExternalUrl(target.url);
    setToast('Prompt copied — paste into chat');
  }

  return (
    <div className="assembled-tab">
      <div className="assembled-actions">
        <button
          className={`btn btn-copy${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy prompt to clipboard'}
        >
          {copied ? <><IconCheck /> Copied</> : <><IconCopy /> Copy All</>}
        </button>
        {sendTargets && sendTargets.length > 0 && (
          <div className="send-row">
            {sendTargets.map((t, i) => (
              <button key={i} className="btn-send" onClick={() => handleSendTo(t)} title={`Copy & open ${t.name}`}>
                <IconSend /> {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <pre className="assembled-text">{assembled}</pre>
    </div>
  );
}

// ── BreakdownTab ──────────────────────────────────────────────────────────────

function BreakdownTab({ result, sections = SECTIONS }) {
  const [expanded, setExpanded] = useState({});

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const populatedSections = sections.filter(({ key }) => result[key]?.trim());

  return (
    <div className="breakdown-tab">
      {populatedSections.map(({ key, label }) => (
        <SectionCard
          key={key}
          sectionKey={key}
          label={label}
          content={result[key]}
          isExpanded={!!expanded[key]}
          onToggle={() => toggle(key)}
        />
      ))}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────

function SectionCard({ sectionKey, label, content, isExpanded, onToggle }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await promptService.copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`section-card${isExpanded ? ' expanded' : ''}`}>
      <div className="card-header">
        <button
          className="card-toggle"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`section-body-${sectionKey}`}
        >
          <span className="card-label">{label}</span>
          <IconChevron up={isExpanded} />
        </button>
        <button
          className={`icon-btn small card-copy-btn${copied ? ' success' : ''}`}
          onClick={handleCopy}
          title={`Copy ${label}`}
          aria-label={`Copy ${label}`}
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </button>
      </div>

      {isExpanded && (
        <div
          id={`section-body-${sectionKey}`}
          className="card-body"
        >
          <pre className="card-content">{content}</pre>
        </div>
      )}
    </div>
  );
}
