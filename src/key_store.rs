use crate::config::expand_path;
use anyhow::Context;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};

pub struct EncryptedKeyConfig {
    pub path: PathBuf,
    recipient: String,
    age_key_file: String,
    known_names: HashSet<String>,
    memory: HashMap<String, String>,
}

impl EncryptedKeyConfig {
    pub fn new(
        path: &str,
        recipient: &str,
        age_key_file: &str,
        known_names: HashSet<String>,
    ) -> Self {
        Self {
            path: expand_path(path),
            recipient: recipient.to_string(),
            age_key_file: shellexpand_home(age_key_file),
            known_names,
            memory: HashMap::new(),
        }
    }

    pub fn set_known_names(&mut self, known_names: HashSet<String>) {
        self.known_names = known_names;
    }

    pub fn get_all(&mut self) -> anyhow::Result<HashMap<String, String>> {
        if self.is_memory() {
            return Ok(self.memory.clone());
        }
        if !self.path.exists() {
            return Ok(HashMap::new());
        }
        let stdout = run_sops(
            &[
                "decrypt",
                "--input-type",
                "json",
                "--output-type",
                "json",
                &self.path.to_string_lossy(),
            ],
            None,
            &self.age_key_file,
        )?;
        self.filtered_values(&stdout)
    }

    pub fn set_values(
        &mut self,
        values: HashMap<String, String>,
        delete_names: HashSet<String>,
    ) -> anyhow::Result<HashMap<String, serde_json::Value>> {
        let unknown: Vec<String> = values
            .keys()
            .chain(delete_names.iter())
            .filter(|name| !self.known_names.contains(*name))
            .cloned()
            .collect();
        if !unknown.is_empty() {
            anyhow::bail!("unknown key name(s): {}", sorted_join(unknown));
        }

        let mut current = self.get_all()?;
        for name in delete_names {
            current.remove(&name);
        }
        for (name, value) in values {
            if !value.is_empty() {
                current.insert(name, value);
            }
        }
        if self.is_memory() {
            self.memory = current.clone();
        } else {
            self.write_values(&current)?;
        }
        Ok(self.safe_snapshot_from_values(&current))
    }

    pub fn safe_snapshot(&mut self) -> anyhow::Result<HashMap<String, serde_json::Value>> {
        let values = self.get_all()?;
        Ok(self.safe_snapshot_from_values(&values))
    }

    fn safe_snapshot_from_values(
        &self,
        values: &HashMap<String, String>,
    ) -> HashMap<String, Value> {
        let mut snapshot = HashMap::new();
        for name in &self.known_names {
            let configured = values.contains_key(name);
            snapshot.insert(
                name.clone(),
                serde_json::json!({
                    "configured": configured,
                    "source": if configured { "encrypted_file" } else { "missing" },
                }),
            );
        }
        snapshot
    }

    fn filtered_values(&self, raw: &str) -> anyhow::Result<HashMap<String, String>> {
        let data: Value =
            serde_json::from_str(raw).context("encrypted key config must decrypt to JSON")?;
        let mut values = HashMap::new();
        if let Value::Object(map) = data {
            for (name, value) in map {
                if self.known_names.contains(&name) {
                    if let Some(value) = value.as_str().filter(|value| !value.is_empty()) {
                        values.insert(name, value.to_string());
                    }
                }
            }
        }
        Ok(values)
    }

    fn write_values(&self, values: &HashMap<String, String>) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sorted: BTreeMap<_, _> = values.iter().collect();
        let plaintext = format!("{}\n", serde_json::to_string_pretty(&sorted)?);
        let stdout = run_sops(
            &[
                "encrypt",
                "--age",
                &self.recipient,
                "--input-type",
                "json",
                "--output-type",
                "json",
                "/dev/stdin",
            ],
            Some(&plaintext),
            &self.age_key_file,
        )?;
        let tmp_path = self.path.with_file_name(format!(
            ".{}.tmp",
            self.path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("api-keys.sops.json")
        ));
        fs::write(&tmp_path, stdout)?;
        fs::rename(tmp_path, &self.path)?;
        Ok(())
    }

    fn is_memory(&self) -> bool {
        self.path.to_string_lossy() == ":memory:"
    }
}

fn run_sops(args: &[&str], input_text: Option<&str>, age_key_file: &str) -> anyhow::Result<String> {
    let mut command = Command::new("sops");
    command
        .args(args)
        .env("SOPS_AGE_KEY_FILE", age_key_file)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if input_text.is_some() {
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn().context("sops command is not installed")?;
    if let Some(input) = input_text {
        use std::io::Write;
        let mut stdin = child.stdin.take().context("failed to open sops stdin")?;
        stdin.write_all(input.as_bytes())?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.lines().next().unwrap_or("sops command failed");
        anyhow::bail!(message.to_string());
    }
    Ok(String::from_utf8(output.stdout).context("sops output was not valid UTF-8")?)
}

fn shellexpand_home(value: &str) -> String {
    if let Some(rest) = value.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    value.to_string()
}

fn sorted_join(mut values: Vec<String>) -> String {
    values.sort();
    values.dedup();
    values.join(", ")
}
