import type { FilterState, KeyConfig, ModelRoutesConfig, ProviderConfig, StateResponse, UsageSnapshot, WeightConfig } from './types';

function queryFromFilters(filters: FilterState): string {
  const params = new URLSearchParams();
  if (filters.period) params.set('period', filters.period);
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  state(filters: FilterState) {
    return request<StateResponse>(`/api/state${queryFromFilters(filters)}`);
  },
  usage(filters: Partial<FilterState> = {}) {
    return request<UsageSnapshot>(`/api/usage${queryFromFilters({ period: filters.period ?? 'all', start: filters.start ?? '', end: filters.end ?? '' })}`);
  },
  resetUsage() {
    return request<{ ok: boolean; usage: UsageSnapshot }>('/api/usage/reset', { method: 'POST' });
  },
  clearFrozen() {
    return request<StateResponse>('/api/frozen/clear', { method: 'POST' });
  },
  weights() {
    return request<WeightConfig>('/api/config/weights');
  },
  saveWeights(weights: Record<string, number>) {
    return request<WeightConfig>('/api/config/weights', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights }),
    });
  },
  providers() {
    return request<ProviderConfig>('/api/config/providers');
  },
  saveProviders(providers: Record<string, string>) {
    return request<ProviderConfig>('/api/config/providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers }),
    });
  },
  modelRoutes() {
    return request<ModelRoutesConfig>('/api/config/model-routes');
  },
  saveModelRoutes(routes: ModelRoutesConfig['routes']) {
    return request<ModelRoutesConfig>('/api/config/model-routes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes }),
    });
  },
  keys() {
    return request<KeyConfig>('/api/config/keys');
  },
  saveKeys(keys: Record<string, string>, deleteNames: string[]) {
    return request<KeyConfig>('/api/config/keys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys, delete: deleteNames }),
    });
  },
  addKey(payload: { name: string; value: string; weight: number; aliases: string[] }) {
    return request<KeyConfig>('/api/config/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};
