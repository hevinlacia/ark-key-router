import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Bucket, FilterState, KeyConfig, ModelRoute, ModelRoutesConfig, ProviderConfig, StateResponse, UsageSnapshot, WeightConfig } from './types';
import './styles.css';

const number = new Intl.NumberFormat();

function formatPercent(value: number | undefined): string {
  return `${(((value ?? 0) || 0) * 100).toFixed(1)}%`;
}

function card(label: string, value: string | number) {
  const display = typeof value === 'number' ? number.format(value) : value;
  return <div className="card"><div className="label">{label}</div><div className="value">{display}</div></div>;
}

function UsageTable({ data, tokenFirst = false }: { data?: Record<string, Bucket>; tokenFirst?: boolean }) {
  const rows = Object.entries(data ?? {}).sort((left, right) => tokenFirst ? (right[1].total_tokens ?? 0) - (left[1].total_tokens ?? 0) : left[0].localeCompare(right[0]));
  if (!rows.length) return <p className="muted">No data yet.</p>;
  return <div className="table-wrap"><table><thead><tr><th>Name</th><th>Requests</th><th>Errors</th><th>Prompt</th><th>Cached</th><th>Cache Hit</th><th>Completion</th><th>Total</th></tr></thead><tbody>{rows.map(([name, item]) => <tr key={name}><td>{name}</td><td>{number.format(item.requests)}</td><td>{number.format(item.errors)}</td><td>{number.format(item.prompt_tokens)}</td><td>{number.format(item.cached_tokens)}</td><td>{formatPercent(item.cache_hit_rate)}</td><td>{number.format(item.completion_tokens)}</td><td>{number.format(item.total_tokens)}</td></tr>)}</tbody></table></div>;
}

function TokenTable({ data }: { data?: Record<string, Bucket> }) {
  const rows = Object.entries(data ?? {}).sort((left, right) => (right[1].total_tokens ?? 0) - (left[1].total_tokens ?? 0));
  if (!rows.length) return <p className="muted">No token usage today.</p>;
  return <div className="table-wrap"><table><thead><tr><th>Key</th><th>Prompt</th><th>Cached</th><th>Cache Hit</th><th>Completion</th><th>Total Tokens</th><th>Requests</th></tr></thead><tbody>{rows.map(([name, item]) => <tr key={name}><td>{name}</td><td>{number.format(item.prompt_tokens)}</td><td>{number.format(item.cached_tokens)}</td><td>{formatPercent(item.cache_hit_rate)}</td><td>{number.format(item.completion_tokens)}</td><td>{number.format(item.total_tokens)}</td><td>{number.format(item.requests)}</td></tr>)}</tbody></table></div>;
}

function HomePage() {
  const [filters, setFilters] = useState<FilterState>({ period: 'all', start: '', end: '' });
  const [state, setState] = useState<StateResponse | null>(null);
  const [today, setToday] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [stateData, todayData] = await Promise.all([api.state(filters), api.usage({ period: 'today' })]);
      setState(stateData);
      setToday(todayData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 5000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const usage = state?.usage;
  const total = usage?.total;

  async function resetUsage() {
    if (!confirm('Reset all recorded usage metrics?')) return;
    await api.resetUsage();
    await loadData();
  }

  async function clearFrozen() {
    await api.clearFrozen();
    await loadData();
  }

  const frozenRows = Object.entries(state?.frozen ?? {});

  return <section className="page active"><header><div><h1>Dashboard</h1><div className="muted">{usage ? `Uptime ${number.format(usage.uptime_seconds)}s · ${state?.bindings ?? 0} active bindings · period ${usage.range.period}` : 'Loading usage metrics...'}</div>{error && <div className="error">{error}</div>}</div><div className="header-actions"><button className="secondary" onClick={() => void loadData()}>Refresh</button><button onClick={() => void resetUsage()}>Reset Usage</button></div></header>
    <section className="toolbar"><div className="field"><label>Range</label><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value })}><option value="all">All</option><option value="today">Today</option><option value="day">Last 24h</option><option value="month">This Month</option></select></div><div className="field"><label>Start</label><input type="date" value={filters.start} onChange={(event) => setFilters({ ...filters, start: event.target.value })} /></div><div className="field"><label>End</label><input type="date" value={filters.end} onChange={(event) => setFilters({ ...filters, end: event.target.value })} /></div><button className="secondary" onClick={() => setFilters({ period: 'all', start: '', end: '' })}>Clear Range</button></section>
    <section className="grid">{card('Requests', total?.requests ?? 0)}{card('Errors', total?.errors ?? 0)}{card('Prompt Tokens', total?.prompt_tokens ?? 0)}{card('Cached Tokens', total?.cached_tokens ?? 0)}{card('Cache Hit', formatPercent(total?.cache_hit_rate))}{card('Completion Tokens', total?.completion_tokens ?? 0)}{card('Total Tokens', total?.total_tokens ?? 0)}</section>
    <section className="card"><div className="section-title"><h2>Today by Key</h2><span className="muted">{today ? `${number.format(today.total.total_tokens)} total tokens today` : ''}</span></div><TokenTable data={today?.by_key} /></section>
    <section className="card"><h2>Daily Requests</h2><UsageTable data={usage?.by_day} /></section>
    <section className="card"><h2>Monthly Requests</h2><UsageTable data={usage?.by_month} /></section>
    <section className="card"><h2>Usage by Model</h2><UsageTable data={usage?.by_model} /></section>
    <section className="card"><h2>Usage by Key</h2><UsageTable data={usage?.by_key} tokenFirst /></section>
    <section className="card"><h2>Usage by Status</h2><UsageTable data={usage?.by_status} /></section>
    <section className="card"><div className="section-title"><h2>Frozen Keys</h2><button className="secondary" onClick={() => void clearFrozen()}>Clear Frozen Keys</button></div>{frozenRows.length ? <table><thead><tr><th>Key</th><th>Remaining</th><th>Reason</th></tr></thead><tbody>{frozenRows.map(([name, item]) => <tr key={name}><td>{name}</td><td>{number.format(item.seconds_remaining)}s</td><td>{item.reason}</td></tr>)}</tbody></table> : <p className="muted">No frozen keys.</p>}</section>
  </section>;
}

function SettingsPage() {
  const [weights, setWeights] = useState<WeightConfig | null>(null);
  const [providers, setProviders] = useState<ProviderConfig | null>(null);
  const [routes, setRoutes] = useState<ModelRoutesConfig | null>(null);
  const [keys, setKeys] = useState<KeyConfig | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const [weightData, providerData, routeData, keyData] = await Promise.all([api.weights(), api.providers(), api.modelRoutes(), api.keys()]);
      setWeights(weightData);
      setProviders(providerData);
      setRoutes(routeData);
      setKeys(keyData);
      setStatus('Settings loaded.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  return <section className="page active"><header><div><h1>Settings</h1><div className="muted">Change provider URLs, routing weights, encrypted keys, and virtual model routes without restarting.</div>{status && <div className="ok">{status}</div>}{error && <div className="error">{error}</div>}</div><button className="secondary" onClick={() => void loadSettings()}>Refresh</button></header>
    <ModelRoutesPanel config={routes} onChange={setRoutes} onSaved={(next) => { setRoutes(next); setStatus('Model routes saved.'); }} onError={setError} />
    <ProvidersPanel config={providers} onChange={setProviders} onSaved={(next) => { setProviders(next); setStatus('Providers saved.'); }} onError={setError} />
    <WeightsPanel config={weights} onChange={setWeights} onSaved={(next) => { setWeights(next); setStatus('Weights saved.'); }} onError={setError} />
    <KeysPanel config={keys} onSaved={(next) => { setKeys(next); setStatus('Key config saved.'); }} onError={setError} />
  </section>;
}

function ModelRoutesPanel({ config, onChange, onSaved, onError }: { config: ModelRoutesConfig | null; onChange: (value: ModelRoutesConfig) => void; onSaved: (value: ModelRoutesConfig) => void; onError: (value: string) => void }) {
  const baseAliases = config?.base_aliases ?? [];
  const routeEntries = Object.entries(config?.routes ?? {});

  function updateRouteName(oldName: string, newName: string) {
    if (!config) return;
    const next = { ...config.routes };
    const route = next[oldName];
    delete next[oldName];
    next[newName] = route;
    onChange({ ...config, routes: next });
  }

  function updateRoute(name: string, route: ModelRoute) {
    if (!config) return;
    onChange({ ...config, routes: { ...config.routes, [name]: route } });
  }

  async function save() {
    if (!config) return;
    try { onSaved(await api.saveModelRoutes(config.routes)); } catch (err) { onError(err instanceof Error ? err.message : String(err)); }
  }

  function addRoute() {
    if (!config || !baseAliases[0]) return;
    const name = `custom-model-auto-${Object.keys(config.routes).length + 1}`;
    onChange({ ...config, routes: { ...config.routes, [name]: { target: baseAliases[0].name, fallbacks: [] } } });
  }

  if (!config) return <section className="card"><h2>Model Routes</h2><p className="muted">Loading model routes...</p></section>;
  return <section className="card"><div className="section-title"><h2>Model Routes</h2><span className="muted">{config.config_path}</span></div><p className="muted">Configure virtual auto model names and ordered fallbacks.</p><div className="route-list">{routeEntries.map(([name, route]) => <div className="route-row" key={name}><div className="route-row-header"><div className="field"><label>Virtual Model</label><input value={name} onChange={(event) => updateRouteName(name, event.target.value)} /></div><div className="field"><label>Primary Target</label><select value={route.target} onChange={(event) => updateRoute(name, { ...route, target: event.target.value })}>{baseAliases.map((alias) => <option key={alias.name} value={alias.name}>{alias.name} → {alias.upstream_model}</option>)}</select></div><div className="route-row-actions"><button className="secondary" onClick={() => { const next = { ...config.routes }; delete next[name]; onChange({ ...config, routes: next }); }}>Remove Route</button></div></div><div className="route-fallbacks"><div className="route-fallbacks-title">Fallbacks</div>{[...route.fallbacks, ''].map((fallback, index) => <div className="route-fallback-line" key={`${name}-${index}`}><select value={fallback} onChange={(event) => { const nextFallbacks = [...route.fallbacks]; if (event.target.value) nextFallbacks[index] = event.target.value; else nextFallbacks.splice(index, 1); updateRoute(name, { ...route, fallbacks: nextFallbacks.filter(Boolean) }); }}><option value="">No fallback</option>{baseAliases.map((alias) => <option key={alias.name} value={alias.name}>{alias.name} → {alias.upstream_model}</option>)}</select>{fallback && <button className="secondary" onClick={() => updateRoute(name, { ...route, fallbacks: route.fallbacks.filter((_, i) => i !== index) })}>Remove</button>}</div>)}</div></div>)}</div><div className="toolbar"><button className="secondary" onClick={addRoute}>Add Route</button><button onClick={() => void save()}>Save Routes</button></div></section>;
}

function ProvidersPanel({ config, onChange, onSaved, onError }: { config: ProviderConfig | null; onChange: (value: ProviderConfig) => void; onSaved: (value: ProviderConfig) => void; onError: (value: string) => void }) {
  if (!config) return <section className="card"><h2>Provider URLs</h2><p className="muted">Loading providers...</p></section>;
  const current = config;
  async function save() {
    try { onSaved(await api.saveProviders(Object.fromEntries(current.providers.map((item) => [item.name, item.base_url])))); } catch (err) { onError(err instanceof Error ? err.message : String(err)); }
  }
  return <section className="card"><div className="section-title"><h2>Provider URLs</h2><span className="muted">{current.config_path}</span></div><table><thead><tr><th>Provider</th><th>Base URL</th><th>Default</th></tr></thead><tbody>{current.providers.map((item, index) => <tr key={item.name}><td>{item.name}</td><td><input value={item.base_url} onChange={(event) => { const providers = [...current.providers]; providers[index] = { ...item, base_url: event.target.value }; onChange({ ...current, providers }); }} /></td><td>{item.default_base_url}</td></tr>)}</tbody></table><div className="toolbar"><button onClick={() => void save()}>Save Providers</button></div></section>;
}

function WeightsPanel({ config, onChange, onSaved, onError }: { config: WeightConfig | null; onChange: (value: WeightConfig) => void; onSaved: (value: WeightConfig) => void; onError: (value: string) => void }) {
  const total = useMemo(() => Object.values(config?.weights ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0), [config]);
  if (!config) return <section className="card"><h2>Key Weights</h2><p className="muted">Loading weights...</p></section>;
  const current = config;
  async function save() {
    try { onSaved(await api.saveWeights(current.weights)); } catch (err) { onError(err instanceof Error ? err.message : String(err)); }
  }
  return <section className="card"><div className="section-title"><h2>Key Weights</h2><span className="muted">{current.config_path}</span></div><table><thead><tr><th>Key</th><th>Weight</th><th>Probability</th></tr></thead><tbody>{Object.entries(current.weights).sort(([a], [b]) => a.localeCompare(b)).map(([name, weight]) => <tr key={name}><td>{name}</td><td><input className="weight-input" type="number" min="0" step="1" value={weight} onChange={(event) => onChange({ ...current, weights: { ...current.weights, [name]: Number(event.target.value) || 0 } })} /></td><td>{total > 0 ? `${((Math.max(0, weight) / total) * 100).toFixed(1)}%` : '0.0%'}</td></tr>)}</tbody></table><div className="toolbar"><button onClick={() => void save()}>Save Weights</button></div></section>;
}

function KeysPanel({ config, onSaved, onError }: { config: KeyConfig | null; onSaved: (value: KeyConfig) => void; onError: (value: string) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [deleteNames, setDeleteNames] = useState<string[]>([]);
  const [add, setAdd] = useState({ name: '', value: '', weight: 1, aliases: [] as string[] });

  useEffect(() => {
    if (config && add.aliases.length === 0) setAdd((current) => ({ ...current, aliases: config.auto_aliases }));
  }, [config]);

  if (!config) return <section className="card"><h2>API Keys</h2><p className="muted">Loading keys...</p></section>;
  const current = config;

  async function save() {
    try { onSaved(await api.saveKeys(values, deleteNames)); setValues({}); setDeleteNames([]); } catch (err) { onError(err instanceof Error ? err.message : String(err)); }
  }
  async function addKey() {
    try { onSaved(await api.addKey(add)); setAdd({ name: '', value: '', weight: 1, aliases: current.auto_aliases }); } catch (err) { onError(err instanceof Error ? err.message : String(err)); }
  }

  const grouped = current.keys.reduce<Record<string, KeyConfig['keys']>>((groups, item) => { (groups[item.provider] ??= []).push(item); return groups; }, {});
  return <section className="card"><div className="section-title"><h2>API Keys</h2><span className="muted">{current.config_path}</span></div><p className="muted">Values are saved encrypted. Existing key values are never displayed.</p><div className="add-key-panel"><h3>Add Ark Key</h3><div className="add-key-grid"><div className="field"><label>Key Name</label><input value={add.name} onChange={(event) => setAdd({ ...add, name: event.target.value })} placeholder="shell" /></div><div className="field"><label>API Key</label><input type="password" value={add.value} onChange={(event) => setAdd({ ...add, value: event.target.value })} placeholder="Stored encrypted; never displayed" /></div><div className="field"><label>Weight</label><input type="number" min="0" step="1" value={add.weight} onChange={(event) => setAdd({ ...add, weight: Number(event.target.value) || 0 })} /></div></div><div className="pool-list">{current.auto_aliases.map((alias) => <label key={alias}><input type="checkbox" checked={add.aliases.includes(alias)} onChange={(event) => setAdd({ ...add, aliases: event.target.checked ? [...add.aliases, alias] : add.aliases.filter((item) => item !== alias) })} />{alias}</label>)}</div><div className="toolbar"><button onClick={() => void addKey()}>Add Key</button></div></div>{Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([provider, items]) => <div className="provider-group" key={provider}><h3>{provider}</h3><div className="table-wrap"><table className="api-key-table"><thead><tr><th>Key</th><th>Billing</th><th>Env Var</th><th>Status</th><th>New Value</th><th>Delete Encrypted</th></tr></thead><tbody>{items.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.billing_type === 'payg' ? 'Pay-as-you-go' : 'Subscription'}</td><td>{item.env_var}</td><td><span className={`status ${item.configured ? 'ok' : 'warn'}`}>{item.configured ? item.source : 'missing'}</span></td><td><input className="key-input" type="password" value={values[item.name] ?? ''} onChange={(event) => setValues({ ...values, [item.name]: event.target.value })} placeholder="Leave blank to keep current value" /></td><td><input type="checkbox" checked={deleteNames.includes(item.name)} onChange={(event) => setDeleteNames(event.target.checked ? [...deleteNames, item.name] : deleteNames.filter((name) => name !== item.name))} /></td></tr>)}</tbody></table></div></div>)}<div className="toolbar"><button onClick={() => void save()}>Save API Keys</button></div></section>;
}

export default function App() {
  const [page, setPage] = useState<'home' | 'settings'>('home');
  return <div className="shell"><aside><div className="brand">LLM Provider Router</div><nav><button className={`nav-button ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>Home</button><button className={`nav-button ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>Settings</button></nav></aside><main>{page === 'home' ? <HomePage /> : <SettingsPage />}</main></div>;
}
