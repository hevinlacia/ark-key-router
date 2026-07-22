export type Bucket = {
  requests: number;
  errors: number;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_hit_rate: number;
};

export type UsageSnapshot = {
  started_at: number;
  uptime_seconds: number;
  range: { period: string; start: number | null; end: number | null };
  total: Bucket;
  by_model: Record<string, Bucket>;
  by_key: Record<string, Bucket>;
  by_status: Record<string, Bucket>;
  by_day: Record<string, Bucket>;
  by_month: Record<string, Bucket>;
  db_path: string;
};

export type StateResponse = {
  ok: boolean;
  frozen: Record<string, { seconds_remaining: number; reason: string }>;
  bindings: number;
  usage: UsageSnapshot;
};

export type WeightConfig = {
  ok: boolean;
  weights: Record<string, number>;
  aliases: Record<string, unknown>;
  model_routes: Record<string, ModelRoute>;
  config_path: string;
};

export type ProviderConfig = {
  ok: boolean;
  providers: Array<{ name: string; base_url: string; default_base_url: string }>;
  config_path: string;
};

export type ModelRoute = {
  target: string;
  fallbacks: string[];
};

export type ModelRoutesConfig = {
  ok: boolean;
  routes: Record<string, ModelRoute>;
  base_aliases: Array<{ name: string; upstream_model: string; provider: string; base_url: string }>;
  config_path: string;
};

export type KeyConfig = {
  ok: boolean;
  keys: Array<{
    name: string;
    provider: string;
    billing_type: string;
    env_var: string;
    configured: boolean;
    encrypted_configured: boolean;
    env_configured: boolean;
    source: string;
  }>;
  auto_aliases: string[];
  config_path: string;
  custom_key_config_path: string;
};

export type FilterState = {
  period: string;
  start: string;
  end: string;
};
