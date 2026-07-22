use crate::config::{expand_path, ModelRoute};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

pub struct KeyWeightConfig {
    pub path: PathBuf,
    defaults: HashMap<String, i64>,
    memory: HashMap<String, i64>,
}

impl KeyWeightConfig {
    pub fn new(path: &str, defaults: HashMap<String, i64>) -> Self {
        Self {
            path: expand_path(path),
            memory: defaults.clone(),
            defaults,
        }
    }

    pub fn get(&mut self) -> HashMap<String, i64> {
        let mut weights = self.defaults.clone();
        if self.is_memory() {
            weights.extend(self.memory.clone());
            return weights;
        }
        if !self.path.exists() {
            let _ = self.write(&weights);
            return weights;
        }
        let Ok(raw) = fs::read_to_string(&self.path) else {
            return weights;
        };
        let Ok(data) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw) else {
            return weights;
        };
        for (name, value) in data {
            if !weights.contains_key(&name) {
                continue;
            }
            if let Some(weight) = value.as_i64() {
                weights.insert(name, weight);
            }
        }
        weights
    }

    pub fn set(&mut self, weights: HashMap<String, i64>) -> anyhow::Result<HashMap<String, i64>> {
        let mut next = self.defaults.clone();
        next.extend(weights);
        if self.is_memory() {
            self.memory = next.clone();
            return Ok(next);
        }
        self.write(&next)?;
        Ok(next)
    }

    pub fn add_defaults(&mut self, defaults: HashMap<String, i64>) {
        for (name, weight) in defaults {
            self.defaults.entry(name).or_insert(weight);
        }
    }

    fn write(&self, weights: &HashMap<String, i64>) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sorted: BTreeMap<_, _> = weights.iter().map(|(k, v)| (k, v)).collect();
        fs::write(
            &self.path,
            format!("{}\n", serde_json::to_string_pretty(&sorted)?),
        )?;
        Ok(())
    }

    fn is_memory(&self) -> bool {
        self.path.to_string_lossy() == ":memory:"
    }
}

pub struct ProviderConfig {
    pub path: PathBuf,
    defaults: HashMap<String, String>,
    memory: HashMap<String, String>,
}

impl ProviderConfig {
    pub fn new(path: &str, defaults: HashMap<String, String>) -> Self {
        Self {
            path: expand_path(path),
            memory: defaults.clone(),
            defaults,
        }
    }

    pub fn get(&mut self) -> HashMap<String, String> {
        let mut base_urls = self.defaults.clone();
        if self.is_memory() {
            base_urls.extend(self.memory.clone());
            return base_urls;
        }
        if !self.path.exists() {
            let _ = self.write(&base_urls);
            return base_urls;
        }
        let Ok(raw) = fs::read_to_string(&self.path) else {
            return base_urls;
        };
        let Ok(data) = serde_json::from_str::<HashMap<String, String>>(&raw) else {
            return base_urls;
        };
        for (name, base_url) in data {
            if base_urls.contains_key(&name) && !base_url.is_empty() {
                base_urls.insert(name, base_url);
            }
        }
        base_urls
    }

    pub fn set(
        &mut self,
        base_urls: HashMap<String, String>,
    ) -> anyhow::Result<HashMap<String, String>> {
        let mut next = self.defaults.clone();
        next.extend(base_urls);
        if self.is_memory() {
            self.memory = next.clone();
            return Ok(next);
        }
        self.write(&next)?;
        Ok(next)
    }

    fn write(&self, base_urls: &HashMap<String, String>) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sorted: BTreeMap<_, _> = base_urls.iter().map(|(k, v)| (k, v)).collect();
        fs::write(
            &self.path,
            format!("{}\n", serde_json::to_string_pretty(&sorted)?),
        )?;
        Ok(())
    }

    fn is_memory(&self) -> bool {
        self.path.to_string_lossy() == ":memory:"
    }
}

pub struct ModelRouteConfig {
    pub path: PathBuf,
    defaults: HashMap<String, ModelRoute>,
    memory: HashMap<String, ModelRoute>,
}

impl ModelRouteConfig {
    pub fn new(path: &str, defaults: HashMap<String, ModelRoute>) -> Self {
        Self {
            path: expand_path(path),
            memory: defaults.clone(),
            defaults,
        }
    }

    pub fn get(&mut self, known_aliases: &HashSet<String>) -> HashMap<String, ModelRoute> {
        let mut routes = normalize_model_routes(&self.defaults, known_aliases);
        if self.is_memory() {
            routes.extend(normalize_model_routes(&self.memory, known_aliases));
            return routes;
        }
        if !self.path.exists() {
            let _ = self.write(&routes);
            return routes;
        }
        let Ok(raw) = fs::read_to_string(&self.path) else {
            return routes;
        };
        let Ok(data) = serde_json::from_str::<HashMap<String, ModelRoute>>(&raw) else {
            return routes;
        };
        routes.extend(normalize_model_routes(&data, known_aliases));
        routes
    }

    pub fn set(
        &mut self,
        routes: HashMap<String, ModelRoute>,
        known_aliases: &HashSet<String>,
    ) -> anyhow::Result<HashMap<String, ModelRoute>> {
        let normalized = normalize_model_routes(&routes, known_aliases);
        if self.is_memory() {
            self.memory = normalized.clone();
            return Ok(normalized);
        }
        self.write(&normalized)?;
        Ok(normalized)
    }

    fn write(&self, routes: &HashMap<String, ModelRoute>) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sorted: BTreeMap<_, _> = routes.iter().map(|(k, v)| (k, v)).collect();
        fs::write(
            &self.path,
            format!("{}\n", serde_json::to_string_pretty(&sorted)?),
        )?;
        Ok(())
    }

    fn is_memory(&self) -> bool {
        self.path.to_string_lossy() == ":memory:"
    }
}

fn normalize_model_routes(
    routes: &HashMap<String, ModelRoute>,
    known_aliases: &HashSet<String>,
) -> HashMap<String, ModelRoute> {
    let mut normalized = HashMap::new();
    for (route_name, route) in routes {
        if !known_aliases.contains(&route.target) {
            continue;
        }
        let mut fallbacks = Vec::new();
        for fallback in &route.fallbacks {
            if known_aliases.contains(fallback)
                && fallback != &route.target
                && !fallbacks.contains(fallback)
            {
                fallbacks.push(fallback.clone());
            }
        }
        normalized.insert(
            route_name.clone(),
            ModelRoute {
                target: route.target.clone(),
                fallbacks,
            },
        );
    }
    normalized
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CustomKeyPools {
    #[serde(default)]
    pub keys: HashMap<String, CustomKeyEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CustomKeyEntry {
    pub env_var: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default = "default_billing_type")]
    pub billing_type: String,
    #[serde(default = "default_weight")]
    pub weight: i64,
    #[serde(default)]
    pub aliases: Vec<String>,
}

fn default_provider() -> String {
    "ark".to_string()
}
fn default_billing_type() -> String {
    "subscription".to_string()
}
fn default_weight() -> i64 {
    1
}

pub struct CustomKeyPoolConfig {
    pub path: PathBuf,
    memory: CustomKeyPools,
}

impl CustomKeyPoolConfig {
    pub fn new(path: &str) -> Self {
        Self {
            path: expand_path(path),
            memory: CustomKeyPools::default(),
        }
    }

    pub fn get(&mut self) -> CustomKeyPools {
        if self.is_memory() {
            return self.memory.clone();
        }
        if !self.path.exists() {
            let empty = CustomKeyPools::default();
            let _ = self.write(&empty);
            return empty;
        }
        let Ok(raw) = fs::read_to_string(&self.path) else {
            return CustomKeyPools::default();
        };
        serde_json::from_str::<CustomKeyPools>(&raw).unwrap_or_default()
    }

    pub fn add_key(
        &mut self,
        name: String,
        entry: CustomKeyEntry,
    ) -> anyhow::Result<CustomKeyPools> {
        let mut config = self.get();
        config.keys.insert(name, entry);
        self.write(&config)?;
        Ok(config)
    }

    fn write(&mut self, config: &CustomKeyPools) -> anyhow::Result<()> {
        if self.is_memory() {
            self.memory = config.clone();
            return Ok(());
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sorted: BTreeMap<_, _> = config.keys.iter().map(|(k, v)| (k, v)).collect();
        let payload = serde_json::json!({ "keys": sorted });
        fs::write(
            &self.path,
            format!("{}\n", serde_json::to_string_pretty(&payload)?),
        )?;
        Ok(())
    }

    fn is_memory(&self) -> bool {
        self.path.to_string_lossy() == ":memory:"
    }
}
