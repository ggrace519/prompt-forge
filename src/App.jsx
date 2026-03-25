import { useState, useEffect, useCallback, useRef } from 'react';
import * as promptService from './lib/promptService';
import logoUrl from './assets/logo.png';

const SECTIONS = [
  { key: 'role',          label: 'Role & Objective'  },
  { key: 'instructions',  label: 'Instructions'      },
  { key: 'context',       label: 'Context'           },
  { key: 'outputFormat',  label: 'Output Format'     },
  { key: 'reasoning',     label: 'Reasoning Chain'   },
  { key: 'examples',      label: 'Examples'          },
  { key: 'reinforcement', label: 'Reinforcement'     },
];

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

export default function App() {
  const [view,         setView]         = useState('loading');
  const [provider,     setProvider]     = useState('anthropic');
  const [apiKey,       setApiKey]       = useState('');
  const [model,        setModel]        = useState('claude-haiku-4-5-20251001');
  const [ollamaUrl,    setOllamaUrl]    = useState('http://localhost:11434');
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [ollamaModel,  setOllamaModel]  = useState('');

  useEffect(() => {
    Promise.all([
      promptService.getProvider(),
      promptService.getApiKey(),
      promptService.getModel(),
      promptService.getOllamaUrl(),
      promptService.getOllamaApiKey(),
      promptService.getOllamaModel(),
    ]).then(([prov, key, savedModel, oUrl, oKey, oModel]) => {
      const p = prov || 'anthropic';
      setProvider(p);
      setApiKey(key || '');
      if (savedModel) setModel(savedModel);
      setOllamaUrl(oUrl || 'http://localhost:11434');
      setOllamaApiKey(oKey || '');
      setOllamaModel(oModel || '');
      const ready = p === 'anthropic' ? !!key : !!(oUrl && oModel);
      setView(ready ? 'main' : 'settings');
    }).catch(() => setView('settings'));
  }, []);

  const handleSettingsSaved = useCallback((config) => {
    setProvider(config.provider);
    if (config.provider === 'anthropic') {
      setApiKey(config.apiKey);
      setModel(config.model);
    } else {
      setOllamaUrl(config.ollamaUrl);
      setOllamaApiKey(config.ollamaApiKey || '');
      setOllamaModel(config.ollamaModel);
    }
    setView('main');
  }, []);

  const canGoBack = provider === 'anthropic' ? !!apiKey : !!(ollamaUrl && ollamaModel);

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
        currentProvider={provider}
        currentApiKey={apiKey}
        currentModel={model}
        currentOllamaUrl={ollamaUrl}
        currentOllamaApiKey={ollamaApiKey}
        currentOllamaModel={ollamaModel}
        onSave={handleSettingsSaved}
        onBack={canGoBack ? () => setView('main') : null}
      />
    );
  }

  return (
    <MainView
      provider={provider}
      apiKey={apiKey}
      model={provider === 'anthropic' ? model : ollamaModel}
      ollamaUrl={ollamaUrl}
      ollamaApiKey={ollamaApiKey}
      onOpenSettings={() => setView('settings')}
    />
  );
}

const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5  — fastest, cheapest'   },
  { value: 'claude-sonnet-4-5',         label: 'Sonnet 4.5 — balanced'             },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 — latest'               },
  { value: 'claude-opus-4-5',           label: 'Opus 4.5   — most capable'         },
];

function SettingsView({
  currentProvider, currentApiKey, currentModel,
  currentOllamaUrl, currentOllamaApiKey, currentOllamaModel,
  onSave, onBack,
}) {
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || 'anthropic');

  const [key,           setKey]           = useState('');
  const [selectedModel, setSelectedModel] = useState(currentModel);

  const [serverUrl,           setServerUrl]           = useState(currentOllamaUrl || 'http://localhost:11434');
  const [ollamaKey,           setOllamaKey]           = useState('');
  const [availableModels,     setAvailableModels]     = useState([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState(currentOllamaModel || '');
  const [fetchingModels,      setFetchingModels]      = useState(false);
  const [fetchError,          setFetchError]          = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedProvider === 'ollama' && serverUrl && availableModels.length === 0) {
      handleFetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  async function handleFetchModels() {
    setFetchingModels(true);
    setFetchError('');
    try {
      const result = await promptService.fetchOllamaModels(serverUrl, ollamaKey);
      if (result.success) {
        setAvailableModels(result.models);
        if (result.models.length > 0 && !selectedOllamaModel) {
          setSelectedOllamaModel(result.models[0]);
        }
      } else {
        setFetchError(result.error || 'Could not connect to Ollama server');
      }
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await promptService.saveProvider(selectedProvider);
      if (selectedProvider === 'anthropic') {
        const trimmed = key.trim();
        if (trimmed) await promptService.saveApiKey(trimmed);
        await promptService.saveModel(selectedModel);
        onSave({ provider: 'anthropic', apiKey: trimmed || currentApiKey, model: selectedModel });
      } else {
        await Promise.all([
          promptService.saveOllamaUrl(serverUrl),
          promptService.saveOllamaApiKey(ollamaKey),
          promptService.saveOllamaModel(selectedOllamaModel),
        ]);
        onSave({ provider: 'ollama', ollamaUrl: serverUrl, ollamaApiKey: ollamaKey, ollamaModel: selectedOllamaModel });
      }
    } finally {
      setSaving(false);
    }
  }

  const canSave = selectedProvider === 'anthropic'
    ? (key.trim() || currentApiKey) && !saving
    : serverUrl && selectedOllamaModel && !saving;

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
          <WindowControls />
        </div>
      </div>

      <div className="settings-inner">
        <div className="settings-header">
          <img src={logoUrl} alt="PromptForge" className="app-logo" />
        </div>

        <div className="provider-tabs" role="tablist" aria-label="Provider">
          <button
            role="tab"
            aria-selected={selectedProvider === 'anthropic'}
            className={`provider-tab${selectedProvider === 'anthropic' ? ' active' : ''}`}
            onClick={() => setSelectedProvider('anthropic')}
          >
            Anthropic
          </button>
          <button
            role="tab"
            aria-selected={selectedProvider === 'ollama'}
            className={`provider-tab${selectedProvider === 'ollama' ? ' active' : ''}`}
            onClick={() => setSelectedProvider('ollama')}
          >
            Ollama
          </button>
        </div>

        {selectedProvider === 'anthropic' && (
          <>
            <p className="settings-desc">
              API key is encrypted with Windows DPAPI and never stored in plain text.
            </p>

            <div className="field-group">
              <label className="field-label" htmlFor="api-key-input">
                Anthropic API Key
              </label>
              <input
                id="api-key-input"
                type="password"
                className="text-input"
                placeholder="sk-ant-api03-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSave && handleSave()}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="model-select">Model</label>
              <select
                id="model-select"
                className="text-input select-input"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <p className="settings-link-row">
              <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                Get your API key →
              </a>
            </p>
          </>
        )}

        {selectedProvider === 'ollama' && (
          <>
            <p className="settings-desc">
              Connect to a local or remote Ollama server. API key is optional.
            </p>

            <div className="field-group">
              <label className="field-label" htmlFor="ollama-url-input">Server URL</label>
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
                API Key <span className="field-label-optional">(optional)</span>
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
                  ? <><span className="btn-spinner" /> Connecting…</>
                  : 'Fetch Models'}
              </button>
              {fetchError && (
                <span className="ollama-fetch-error" role="alert">{fetchError}</span>
              )}
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="ollama-model-select">Model</label>
              <select
                id="ollama-model-select"
                className="text-input select-input"
                value={selectedOllamaModel}
                onChange={(e) => setSelectedOllamaModel(e.target.value)}
                disabled={availableModels.length === 0}
              >
                {availableModels.length === 0
                  ? <option value="">— fetch models first —</option>
                  : availableModels.map((m) => <option key={m} value={m}>{m}</option>)
                }
              </select>
            </div>
          </>
        )}

        <button
          className="btn btn-primary btn-full"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}

function MainView({ provider, apiKey, model, ollamaUrl, ollamaApiKey, onOpenSettings }) {
  const [task,      setTask]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState('');
  const [errorKey,  setErrorKey]  = useState(0);
  const [activeTab, setActiveTab] = useState('assembled');

  const modelLabel = provider === 'anthropic'
    ? (MODELS.find((m) => m.value === model)?.label.split('—')[0].trim() ?? model)
    : model;

  useEffect(() => {
    promptService.resizeWindow(result ? 640 : 320);
  }, [result]);

  async function handleGenerate() {
    const trimmed = task.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await promptService.generatePrompt(trimmed, apiKey, model, provider, ollamaUrl, ollamaApiKey);
      setResult(data);
      setActiveTab('assembled');
    } catch (err) {
      setError(err.message || 'Something went wrong. Check your API key and try again.');
      // Increment key so the alert node remounts and screen readers re-announce
      setErrorKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

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
            onClick={onOpenSettings}
            title="API Key Settings"
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

      <div className="main-body">
        <div className="input-group">
          <textarea
            className="task-textarea"
            rows={5}
            placeholder="Describe your task… (Ctrl+Enter to generate)"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
            spellCheck={false}
          />
          <button
            className="btn btn-primary btn-full"
            onClick={handleGenerate}
            disabled={loading || !task.trim()}
          >
            {loading
              ? <><span className="btn-spinner" /> Generating…</>
              : 'Generate Prompt'
            }
          </button>
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
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
      </div>
    </div>
  );
}

function ResultsPanel({ result, activeTab, onTabChange }) {
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
      </div>

      <div className="tab-content">
        {activeTab === 'assembled' && <AssembledTab assembled={result.assembled} />}
        {activeTab === 'breakdown' && <BreakdownTab result={result} />}
      </div>
    </div>
  );
}

function AssembledTab({ assembled }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await promptService.copyToClipboard(assembled);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="assembled-tab">
      {/* Single action row — no redundant "Complete Prompt" label, recovers ~28px */}
      <div className="assembled-actions">
        <button
          className={`btn btn-copy${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy prompt to clipboard'}
        >
          {copied ? <><IconCheck /> Copied</> : <><IconCopy /> Copy All</>}
        </button>
      </div>
      <pre className="assembled-text">{assembled}</pre>
    </div>
  );
}

function BreakdownTab({ result }) {
  // All sections start collapsed — no arbitrary two-open default that implies false hierarchy
  const [expanded, setExpanded] = useState({});

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Hide sections with no generated content rather than showing empty cards
  const populatedSections = SECTIONS.filter(({ key }) => result[key]?.trim());

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

function SectionCard({ sectionKey, label, content, isExpanded, onToggle }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await promptService.copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`section-card${isExpanded ? ' expanded' : ''}`}>
      {/*
        Fix: previously a div[role=button] contained a <button> (copy), which is
        a button-inside-interactive-element violation. Now the toggle is a real
        <button> and the copy action sits outside it at the same DOM level.
      */}
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
