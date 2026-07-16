use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use serde_yaml::{Mapping as YamlMapping, Value as YamlValue};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{Mutex, OnceLock};
use toml_edit::{value, DocumentMut, Item, Table};

const CATALOG_SCHEMA_VERSION: u32 = 1;
const KEYCHAIN_SERVICE: &str = "com.linc.agent-memory-manager.agent-provider";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum AgentKind {
    Codex,
    ClaudeCode,
    Hermes,
}

impl AgentKind {
    fn key(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claudeCode",
            Self::Hermes => "hermes",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::ClaudeCode => "Claude Code",
            Self::Hermes => "Hermes",
        }
    }

    fn executable(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude",
            Self::Hermes => "hermes",
        }
    }

    fn reload_hint(self) -> &'static str {
        match self {
            Self::Codex => "Restart Codex or open a new terminal session.",
            Self::ClaudeCode => "Claude Code reloads settings automatically.",
            Self::Hermes => "Start a new Hermes session to use the profile.",
        }
    }

    #[cfg(test)]
    fn default_protocol(self) -> AgentProtocol {
        match self {
            Self::Codex => AgentProtocol::Responses,
            Self::ClaudeCode => AgentProtocol::AnthropicMessages,
            Self::Hermes => AgentProtocol::ChatCompletions,
        }
    }
}

const AGENT_KINDS: [AgentKind; 3] = [AgentKind::Codex, AgentKind::ClaudeCode, AgentKind::Hermes];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentProtocol {
    Responses,
    AnthropicMessages,
    ChatCompletions,
}

impl AgentProtocol {
    fn hermes_value(self) -> &'static str {
        match self {
            Self::Responses => "codex_responses",
            Self::AnthropicMessages => "anthropic_messages",
            Self::ChatCompletions => "chat_completions",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentProfileSource {
    Imported,
    Managed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderProfile {
    pub id: String,
    pub agent: AgentKind,
    pub name: String,
    pub provider_key: String,
    pub base_url: String,
    pub model: String,
    pub protocol: AgentProtocol,
    pub official: bool,
    pub source: AgentProfileSource,
    pub has_secret: bool,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentTarget {
    pub agent: AgentKind,
    pub label: String,
    pub installed: bool,
    pub executable_path: Option<String>,
    pub config_path: String,
    pub config_exists: bool,
    pub active_profile_id: Option<String>,
    pub active_provider_key: String,
    pub active_model: String,
    pub active_base_url: String,
    pub reload_hint: String,
    pub profiles: Vec<AgentProviderProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigInventory {
    pub generated_at: String,
    pub catalog_path: String,
    pub targets: Vec<AgentTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAgentProfileInput {
    pub id: Option<String>,
    pub agent: AgentKind,
    pub name: String,
    pub provider_key: String,
    pub base_url: String,
    pub model: String,
    pub protocol: AgentProtocol,
    #[serde(default)]
    pub official: bool,
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivationResult {
    pub inventory: AgentConfigInventory,
    pub backup_path: Option<String>,
    pub reload_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProfile {
    id: String,
    agent: AgentKind,
    name: String,
    provider_key: String,
    base_url: String,
    model: String,
    protocol: AgentProtocol,
    official: bool,
    source: AgentProfileSource,
    credential_env: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentCatalog {
    schema_version: u32,
    profiles: Vec<StoredProfile>,
    active: BTreeMap<String, String>,
}

impl Default for AgentCatalog {
    fn default() -> Self {
        Self {
            schema_version: CATALOG_SCHEMA_VERSION,
            profiles: Vec::new(),
            active: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
struct LiveConfig {
    provider_key: String,
    base_url: String,
    model: String,
    protocol: AgentProtocol,
    official: bool,
    api_key: Option<String>,
    credential_env: Option<String>,
}

#[derive(Debug, Clone)]
struct AgentConfigPaths {
    home: PathBuf,
    catalog: PathBuf,
    backup_root: PathBuf,
    codex: PathBuf,
    claude: PathBuf,
    hermes: PathBuf,
}

impl AgentConfigPaths {
    fn for_home(home: PathBuf) -> Self {
        let codex_home = env_path("CODEX_HOME").unwrap_or_else(|| home.join(".codex"));
        let claude_home = env_path("CLAUDE_CONFIG_DIR").unwrap_or_else(|| home.join(".claude"));
        let hermes_home = env_path("HERMES_HOME").unwrap_or_else(|| home.join(".hermes"));
        let app_home = home.join(".agent-memory-manager");
        Self {
            home,
            catalog: app_home.join("agent-config-profiles.json"),
            backup_root: app_home.join("backups/agent-config"),
            codex: codex_home.join("config.toml"),
            claude: claude_home.join("settings.json"),
            hermes: hermes_home.join("config.yaml"),
        }
    }

    fn native_config(&self, agent: AgentKind) -> &Path {
        match agent {
            AgentKind::Codex => &self.codex,
            AgentKind::ClaudeCode => &self.claude,
            AgentKind::Hermes => &self.hermes,
        }
    }
}

trait SecretStore {
    fn get(&self, profile_id: &str) -> Result<Option<String>, String>;
    fn set(&self, profile_id: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, profile_id: &str) -> Result<(), String>;
}

struct PlatformSecretStore;

impl SecretStore for PlatformSecretStore {
    fn get(&self, profile_id: &str) -> Result<Option<String>, String> {
        let entry = keyring::v1::Entry::new(KEYCHAIN_SERVICE, profile_id)
            .map_err(|error| format!("failed to access system credential store: {error}"))?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::v1::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("failed to read system credential: {error}")),
        }
    }

    fn set(&self, profile_id: &str, secret: &str) -> Result<(), String> {
        keyring::v1::Entry::new(KEYCHAIN_SERVICE, profile_id)
            .map_err(|error| format!("failed to access system credential store: {error}"))?
            .set_password(secret)
            .map_err(|error| format!("failed to save system credential: {error}"))
    }

    fn delete(&self, profile_id: &str) -> Result<(), String> {
        let entry = keyring::v1::Entry::new(KEYCHAIN_SERVICE, profile_id)
            .map_err(|error| format!("failed to access system credential store: {error}"))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::v1::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("failed to delete system credential: {error}")),
        }
    }
}

fn config_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[tauri::command]
pub fn load_agent_config_inventory() -> Result<AgentConfigInventory, String> {
    let _guard = config_lock()
        .lock()
        .map_err(|_| "Agent configuration lock is poisoned".to_string())?;
    let paths = default_paths()?;
    load_inventory_with(&paths, &PlatformSecretStore)
}

#[tauri::command]
pub fn save_agent_provider_profile(
    input: SaveAgentProfileInput,
) -> Result<AgentConfigInventory, String> {
    let _guard = config_lock()
        .lock()
        .map_err(|_| "Agent configuration lock is poisoned".to_string())?;
    let paths = default_paths()?;
    save_profile_with(&paths, &PlatformSecretStore, input)
}

#[tauri::command]
pub fn delete_agent_provider_profile(
    agent: AgentKind,
    profile_id: String,
) -> Result<AgentConfigInventory, String> {
    let _guard = config_lock()
        .lock()
        .map_err(|_| "Agent configuration lock is poisoned".to_string())?;
    let paths = default_paths()?;
    delete_profile_with(&paths, &PlatformSecretStore, agent, &profile_id)
}

#[tauri::command]
pub fn activate_agent_provider_profile(
    agent: AgentKind,
    profile_id: String,
) -> Result<AgentActivationResult, String> {
    let _guard = config_lock()
        .lock()
        .map_err(|_| "Agent configuration lock is poisoned".to_string())?;
    let paths = default_paths()?;
    activate_profile_with(&paths, &PlatformSecretStore, agent, &profile_id)
}

fn default_paths() -> Result<AgentConfigPaths, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    Ok(AgentConfigPaths::for_home(home))
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
}

fn load_inventory_with(
    paths: &AgentConfigPaths,
    secrets: &dyn SecretStore,
) -> Result<AgentConfigInventory, String> {
    let mut catalog = load_catalog(&paths.catalog)?;
    let mut changed = false;
    for agent in AGENT_KINDS {
        if catalog
            .profiles
            .iter()
            .all(|profile| profile.agent != agent)
        {
            let live = inspect_agent(agent, paths.native_config(agent))?;
            let id = new_profile_id(agent, "current-local-config");
            if let Some(secret) = live.api_key.as_deref().filter(|value| !value.is_empty()) {
                secrets.set(&id, secret)?;
            }
            catalog.profiles.push(StoredProfile {
                id: id.clone(),
                agent,
                name: "Current local config".to_string(),
                provider_key: live.provider_key,
                base_url: live.base_url,
                model: live.model,
                protocol: live.protocol,
                official: live.official,
                source: AgentProfileSource::Imported,
                credential_env: live.credential_env,
            });
            catalog.active.insert(agent.key().to_string(), id);
            changed = true;
        }
    }
    if changed {
        save_catalog(&paths.catalog, &catalog)?;
    }
    build_inventory(paths, &catalog, secrets)
}

fn save_profile_with(
    paths: &AgentConfigPaths,
    secrets: &dyn SecretStore,
    input: SaveAgentProfileInput,
) -> Result<AgentConfigInventory, String> {
    validate_profile_input(&input)?;
    let mut catalog = load_catalog(&paths.catalog)?;
    let id = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| new_profile_id(input.agent, &input.provider_key));
    if let Some(existing) = catalog.profiles.iter().find(|profile| profile.id == id) {
        if existing.agent != input.agent {
            return Err("profile Agent cannot be changed".to_string());
        }
    }
    let stored = StoredProfile {
        id: id.clone(),
        agent: input.agent,
        name: input.name.trim().to_string(),
        provider_key: normalize_provider_key(&input.provider_key),
        base_url: normalize_base_url(&input.base_url),
        model: input.model.trim().to_string(),
        protocol: input.protocol,
        official: input.official,
        source: AgentProfileSource::Managed,
        credential_env: None,
    };
    if let Some(index) = catalog.profiles.iter().position(|profile| profile.id == id) {
        catalog.profiles[index] = stored;
    } else {
        catalog.profiles.push(stored);
    }
    if input.clear_secret {
        secrets.delete(&id)?;
    } else if let Some(api_key) = input.api_key.as_deref().map(str::trim) {
        if !api_key.is_empty() {
            secrets.set(&id, api_key)?;
        }
    }
    save_catalog(&paths.catalog, &catalog)?;
    build_inventory(paths, &catalog, secrets)
}

fn delete_profile_with(
    paths: &AgentConfigPaths,
    secrets: &dyn SecretStore,
    agent: AgentKind,
    profile_id: &str,
) -> Result<AgentConfigInventory, String> {
    let mut catalog = load_catalog(&paths.catalog)?;
    let live = inspect_agent(agent, paths.native_config(agent))?;
    let Some(profile) = catalog
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id && profile.agent == agent)
        .cloned()
    else {
        return Err("Agent provider profile was not found".to_string());
    };
    if profile_matches_live(&profile, &live) {
        return Err("activate another profile before deleting the current profile".to_string());
    }
    catalog.profiles.retain(|item| item.id != profile_id);
    if catalog.active.get(agent.key()).map(String::as_str) == Some(profile_id) {
        catalog.active.remove(agent.key());
    }
    save_catalog(&paths.catalog, &catalog)?;
    secrets.delete(profile_id)?;
    build_inventory(paths, &catalog, secrets)
}

fn activate_profile_with(
    paths: &AgentConfigPaths,
    secrets: &dyn SecretStore,
    agent: AgentKind,
    profile_id: &str,
) -> Result<AgentActivationResult, String> {
    let mut catalog = load_catalog(&paths.catalog)?;
    let profile = catalog
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id && profile.agent == agent)
        .cloned()
        .ok_or_else(|| "Agent provider profile was not found".to_string())?;
    let secret = secrets.get(profile_id)?.or_else(|| {
        profile
            .credential_env
            .as_deref()
            .and_then(|name| env::var(name).ok())
            .filter(|value| !value.is_empty())
    });
    let config_path = paths.native_config(agent);
    let next = build_native_config(agent, config_path, &profile, secret.as_deref())?;
    let backup_path = create_backup(paths, agent, config_path)?;
    atomic_write(config_path, next.as_bytes(), 0o600)?;
    catalog
        .active
        .insert(agent.key().to_string(), profile_id.to_string());
    save_catalog(&paths.catalog, &catalog)?;
    let inventory = build_inventory(paths, &catalog, secrets)?;
    Ok(AgentActivationResult {
        inventory,
        backup_path: backup_path.map(|path| path_string(&path)),
        reload_hint: agent.reload_hint().to_string(),
    })
}

fn build_inventory(
    paths: &AgentConfigPaths,
    catalog: &AgentCatalog,
    secrets: &dyn SecretStore,
) -> Result<AgentConfigInventory, String> {
    let mut targets = Vec::new();
    for agent in AGENT_KINDS {
        let config_path = paths.native_config(agent);
        let live = inspect_agent(agent, config_path)?;
        let active_profile_id = catalog
            .profiles
            .iter()
            .find(|profile| profile.agent == agent && profile_matches_live(profile, &live))
            .map(|profile| profile.id.clone());
        let mut profiles = Vec::new();
        for profile in catalog
            .profiles
            .iter()
            .filter(|profile| profile.agent == agent)
        {
            let keychain_secret = secrets.get(&profile.id)?.is_some();
            let environment_secret = profile
                .credential_env
                .as_deref()
                .and_then(|name| env::var(name).ok())
                .is_some_and(|value| !value.is_empty());
            profiles.push(AgentProviderProfile {
                id: profile.id.clone(),
                agent,
                name: profile.name.clone(),
                provider_key: profile.provider_key.clone(),
                base_url: profile.base_url.clone(),
                model: profile.model.clone(),
                protocol: profile.protocol,
                official: profile.official,
                source: profile.source,
                has_secret: keychain_secret || environment_secret,
                active: active_profile_id.as_deref() == Some(profile.id.as_str()),
            });
        }
        profiles.sort_by(|left, right| {
            right
                .active
                .cmp(&left.active)
                .then(left.name.cmp(&right.name))
        });
        let executable_path = find_executable(agent.executable(), &paths.home);
        targets.push(AgentTarget {
            agent,
            label: agent.label().to_string(),
            installed: executable_path.is_some() || config_path.exists(),
            executable_path: executable_path.map(|path| path_string(&path)),
            config_path: path_string(config_path),
            config_exists: config_path.is_file(),
            active_profile_id,
            active_provider_key: live.provider_key,
            active_model: live.model,
            active_base_url: live.base_url,
            reload_hint: agent.reload_hint().to_string(),
            profiles,
        });
    }
    Ok(AgentConfigInventory {
        generated_at: Utc::now().to_rfc3339(),
        catalog_path: path_string(&paths.catalog),
        targets,
    })
}

fn validate_profile_input(input: &SaveAgentProfileInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("profile name is required".to_string());
    }
    if input.model.trim().is_empty() {
        return Err("model is required".to_string());
    }
    let provider_key = normalize_provider_key(&input.provider_key);
    if provider_key.is_empty() {
        return Err("provider key must contain letters, digits, or hyphens".to_string());
    }
    if !input.official {
        let base_url = input.base_url.trim();
        if !(base_url.starts_with("https://") || base_url.starts_with("http://")) {
            return Err("base URL must start with http:// or https://".to_string());
        }
        if input.agent == AgentKind::Codex
            && matches!(provider_key.as_str(), "openai" | "ollama" | "lmstudio")
        {
            return Err(
                "Codex reserves the openai, ollama, and lmstudio provider keys".to_string(),
            );
        }
    }
    match input.agent {
        AgentKind::Codex if input.protocol != AgentProtocol::Responses => {
            Err("Codex profiles must use the Responses protocol".to_string())
        }
        AgentKind::ClaudeCode if input.protocol != AgentProtocol::AnthropicMessages => {
            Err("Claude Code profiles must use the Anthropic Messages protocol".to_string())
        }
        _ => Ok(()),
    }
}

fn normalize_provider_key(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_hyphen = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            normalized.push(character);
            last_hyphen = false;
        } else if !last_hyphen && !normalized.is_empty() {
            normalized.push('-');
            last_hyphen = true;
        }
    }
    normalized.trim_matches('-').to_string()
}

fn normalize_base_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn new_profile_id(agent: AgentKind, seed: &str) -> String {
    let raw = format!(
        "{}:{}:{}",
        agent.key(),
        seed,
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let digest = format!("{:x}", Sha256::digest(raw.as_bytes()));
    format!("{}-{}", agent.key(), &digest[..12])
}

fn profile_matches_live(profile: &StoredProfile, live: &LiveConfig) -> bool {
    profile.provider_key == live.provider_key
        && normalize_base_url(&profile.base_url) == normalize_base_url(&live.base_url)
        && profile.model == live.model
}

fn inspect_agent(agent: AgentKind, path: &Path) -> Result<LiveConfig, String> {
    match agent {
        AgentKind::Codex => inspect_codex(path),
        AgentKind::ClaudeCode => inspect_claude(path),
        AgentKind::Hermes => inspect_hermes(path),
    }
}

fn inspect_claude(path: &Path) -> Result<LiveConfig, String> {
    let document = read_json_object(path)?;
    let env = document
        .get("env")
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    let base_url = json_string(&env, "ANTHROPIC_BASE_URL");
    let model = [
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
    ]
    .iter()
    .find_map(|key| env.get(*key).and_then(JsonValue::as_str))
    .filter(|value| !value.is_empty())
    .unwrap_or("default")
    .to_string();
    let credential = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]
        .iter()
        .find_map(|key| {
            env.get(*key)
                .and_then(JsonValue::as_str)
                .filter(|value| !value.is_empty())
                .map(|value| ((*key).to_string(), value.to_string()))
        });
    let official = base_url.is_empty();
    Ok(LiveConfig {
        provider_key: if official {
            "anthropic".to_string()
        } else {
            provider_key_from_base_url(&base_url)
        },
        base_url: if official {
            "https://api.anthropic.com".to_string()
        } else {
            normalize_base_url(&base_url)
        },
        model,
        protocol: AgentProtocol::AnthropicMessages,
        official,
        api_key: credential.as_ref().map(|(_, value)| value.clone()),
        credential_env: credential.map(|(key, _)| key),
    })
}

fn inspect_codex(path: &Path) -> Result<LiveConfig, String> {
    let text = read_text(path)?;
    let document = if text.trim().is_empty() {
        DocumentMut::new()
    } else {
        DocumentMut::from_str(&text).map_err(|error| format!("invalid Codex TOML: {error}"))?
    };
    let provider_key = document
        .get("model_provider")
        .and_then(Item::as_str)
        .unwrap_or("openai")
        .to_string();
    let model = document
        .get("model")
        .and_then(Item::as_str)
        .unwrap_or("default")
        .to_string();
    let provider = document
        .get("model_providers")
        .and_then(Item::as_table)
        .and_then(|providers| providers.get(&provider_key))
        .and_then(Item::as_table);
    let base_url = provider
        .and_then(|table| table.get("base_url"))
        .and_then(Item::as_str)
        .map(normalize_base_url)
        .unwrap_or_else(|| "https://chatgpt.com/codex".to_string());
    let api_key = provider
        .and_then(|table| table.get("experimental_bearer_token"))
        .and_then(Item::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let credential_env = provider
        .and_then(|table| table.get("env_key"))
        .and_then(Item::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Ok(LiveConfig {
        official: provider_key == "openai",
        provider_key,
        base_url,
        model,
        protocol: AgentProtocol::Responses,
        api_key,
        credential_env,
    })
}

fn inspect_hermes(path: &Path) -> Result<LiveConfig, String> {
    let text = read_text(path)?;
    let root = parse_yaml_root(&text)?;
    let model_section = yaml_mapping_value(&root, "model");
    let provider_key = model_section
        .and_then(|mapping| yaml_string(mapping, "provider"))
        .unwrap_or_else(|| "auto".to_string());
    let model = model_section
        .and_then(|mapping| yaml_string(mapping, "default"))
        .unwrap_or_else(|| "default".to_string());
    let model_base_url = model_section.and_then(|mapping| yaml_string(mapping, "base_url"));
    let custom = find_hermes_custom_provider(&root, &provider_key);
    let base_url = model_base_url
        .or_else(|| custom.and_then(|mapping| yaml_string(mapping, "base_url")))
        .unwrap_or_default();
    let api_key = custom.and_then(|mapping| yaml_string(mapping, "api_key"));
    let protocol = custom
        .and_then(|mapping| yaml_string(mapping, "api_mode"))
        .as_deref()
        .map(protocol_from_hermes)
        .unwrap_or(AgentProtocol::ChatCompletions);
    Ok(LiveConfig {
        provider_key,
        base_url: normalize_base_url(&base_url),
        model,
        protocol,
        official: custom.is_none(),
        api_key,
        credential_env: None,
    })
}

fn build_native_config(
    agent: AgentKind,
    path: &Path,
    profile: &StoredProfile,
    secret: Option<&str>,
) -> Result<String, String> {
    match agent {
        AgentKind::Codex => build_codex_config(path, profile, secret),
        AgentKind::ClaudeCode => build_claude_config(path, profile, secret),
        AgentKind::Hermes => build_hermes_config(path, profile, secret),
    }
}

fn build_claude_config(
    path: &Path,
    profile: &StoredProfile,
    secret: Option<&str>,
) -> Result<String, String> {
    let mut document = read_json_object(path)?;
    let env = document
        .entry("env".to_string())
        .or_insert_with(|| JsonValue::Object(JsonMap::new()))
        .as_object_mut()
        .ok_or_else(|| "Claude settings env must be a JSON object".to_string())?;
    for key in [
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
    ] {
        env.remove(key);
    }
    if let Some(secret) = secret.filter(|value| !value.is_empty()) {
        let key = profile
            .credential_env
            .as_deref()
            .unwrap_or(if profile.official {
                "ANTHROPIC_API_KEY"
            } else {
                "ANTHROPIC_AUTH_TOKEN"
            });
        env.insert(key.to_string(), JsonValue::String(secret.to_string()));
    }
    if !profile.official {
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            JsonValue::String(profile.base_url.clone()),
        );
    }
    if profile.model != "default" {
        for key in [
            "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
        ] {
            env.insert(key.to_string(), JsonValue::String(profile.model.clone()));
        }
    }
    let mut output = serde_json::to_string_pretty(&JsonValue::Object(document))
        .map_err(|error| error.to_string())?;
    output.push('\n');
    Ok(output)
}

fn build_codex_config(
    path: &Path,
    profile: &StoredProfile,
    secret: Option<&str>,
) -> Result<String, String> {
    let text = read_text(path)?;
    let mut document = if text.trim().is_empty() {
        DocumentMut::new()
    } else {
        DocumentMut::from_str(&text).map_err(|error| format!("invalid Codex TOML: {error}"))?
    };
    document["model"] = value(profile.model.clone());
    if profile.official {
        document["model_provider"] = value("openai");
    } else {
        document["model_provider"] = value(profile.provider_key.clone());
        if !document.contains_key("model_providers") {
            document["model_providers"] = Item::Table(Table::new());
        }
        let providers = document["model_providers"]
            .as_table_mut()
            .ok_or_else(|| "Codex model_providers must be a TOML table".to_string())?;
        if !providers.contains_key(&profile.provider_key) {
            providers.insert(&profile.provider_key, Item::Table(Table::new()));
        }
        let provider = providers
            .get_mut(&profile.provider_key)
            .and_then(Item::as_table_mut)
            .ok_or_else(|| "Codex provider entry must be a TOML table".to_string())?;
        provider.insert("name", value(profile.name.clone()));
        provider.insert("base_url", value(profile.base_url.clone()));
        provider.insert("wire_api", value("responses"));
        provider.remove("experimental_bearer_token");
        provider.remove("env_key");
        if let Some(secret) = secret.filter(|value| !value.is_empty()) {
            provider.insert("experimental_bearer_token", value(secret));
        } else if let Some(env_key) = profile.credential_env.as_deref() {
            provider.insert("env_key", value(env_key));
        }
    }
    let output = document.to_string();
    DocumentMut::from_str(&output)
        .map_err(|error| format!("invalid generated Codex TOML: {error}"))?;
    Ok(output)
}

fn build_hermes_config(
    path: &Path,
    profile: &StoredProfile,
    secret: Option<&str>,
) -> Result<String, String> {
    let original = read_text(path)?;
    let root = parse_yaml_root(&original)?;
    let mut model = yaml_mapping_value(&root, "model")
        .cloned()
        .unwrap_or_default();
    yaml_insert_string(&mut model, "provider", &profile.provider_key);
    yaml_insert_string(&mut model, "default", &profile.model);
    if profile.base_url.is_empty() {
        model.remove(YamlValue::String("base_url".to_string()));
    } else {
        yaml_insert_string(&mut model, "base_url", &profile.base_url);
    }
    let mut output = replace_yaml_section(&original, "model", &YamlValue::Mapping(model))?;
    if !profile.official {
        let mut providers = yaml_sequence_value(&root, "custom_providers")
            .cloned()
            .unwrap_or_default();
        let mut replacement = None;
        for (index, item) in providers.iter_mut().enumerate() {
            let Some(mapping) = item.as_mapping_mut() else {
                continue;
            };
            if yaml_string(mapping, "name").as_deref() == Some(profile.provider_key.as_str()) {
                replacement = Some(index);
                break;
            }
        }
        let index = replacement.unwrap_or_else(|| {
            providers.push(YamlValue::Mapping(YamlMapping::new()));
            providers.len() - 1
        });
        let provider = providers[index]
            .as_mapping_mut()
            .ok_or_else(|| "Hermes custom provider entry must be a mapping".to_string())?;
        yaml_insert_string(provider, "name", &profile.provider_key);
        yaml_insert_string(provider, "base_url", &profile.base_url);
        yaml_insert_string(provider, "model", &profile.model);
        yaml_insert_string(provider, "api_mode", profile.protocol.hermes_value());
        if let Some(secret) = secret.filter(|value| !value.is_empty()) {
            yaml_insert_string(provider, "api_key", secret);
        } else {
            provider.remove(YamlValue::String("api_key".to_string()));
        }
        output =
            replace_yaml_section(&output, "custom_providers", &YamlValue::Sequence(providers))?;
    }
    parse_yaml_root(&output)?;
    Ok(output)
}

fn load_catalog(path: &Path) -> Result<AgentCatalog, String> {
    if !path.exists() {
        return Ok(AgentCatalog::default());
    }
    let text = fs::read_to_string(path)
        .map_err(|error| format!("failed to read Agent profile catalog: {error}"))?;
    let catalog: AgentCatalog = serde_json::from_str(&text)
        .map_err(|error| format!("invalid Agent profile catalog: {error}"))?;
    if catalog.schema_version != CATALOG_SCHEMA_VERSION {
        return Err(format!(
            "unsupported Agent profile catalog schema {}",
            catalog.schema_version
        ));
    }
    Ok(catalog)
}

fn save_catalog(path: &Path, catalog: &AgentCatalog) -> Result<(), String> {
    let mut bytes = serde_json::to_vec_pretty(catalog).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    atomic_write(path, &bytes, 0o600)
}

fn create_backup(
    paths: &AgentConfigPaths,
    agent: AgentKind,
    config_path: &Path,
) -> Result<Option<PathBuf>, String> {
    if !config_path.is_file() {
        return Ok(None);
    }
    let stamp = Utc::now().format("%Y%m%d-%H%M%S%.3f").to_string();
    let directory = paths.backup_root.join(agent.key()).join(stamp);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let filename = config_path
        .file_name()
        .ok_or_else(|| "native Agent config has no filename".to_string())?;
    let backup = directory.join(filename);
    fs::copy(config_path, &backup).map_err(|error| error.to_string())?;
    Ok(Some(backup))
}

fn atomic_write(path: &Path, bytes: &[u8], default_mode: u32) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "configuration path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary
        .as_file_mut()
        .write_all(bytes)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let mode = fs::metadata(path)
            .map(|metadata| metadata.mode() & 0o777)
            .unwrap_or(default_mode);
        temporary
            .as_file()
            .set_permissions(fs::Permissions::from_mode(mode))
            .map_err(|error| error.to_string())?;
    }
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

fn read_text(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|error| format!("failed to read {}: {error}", path.display()))
}

fn read_json_object(path: &Path) -> Result<JsonMap<String, JsonValue>, String> {
    let text = read_text(path)?;
    if text.trim().is_empty() {
        return Ok(JsonMap::new());
    }
    serde_json::from_str::<JsonValue>(&text)
        .map_err(|error| format!("invalid JSON in {}: {error}", path.display()))?
        .as_object()
        .cloned()
        .ok_or_else(|| format!("{} must contain a JSON object", path.display()))
}

fn json_string(mapping: &JsonMap<String, JsonValue>, key: &str) -> String {
    mapping
        .get(key)
        .and_then(JsonValue::as_str)
        .unwrap_or_default()
        .to_string()
}

fn parse_yaml_root(text: &str) -> Result<YamlMapping, String> {
    if text.trim().is_empty() {
        return Ok(YamlMapping::new());
    }
    serde_yaml::from_str::<YamlValue>(text)
        .map_err(|error| format!("invalid Hermes YAML: {error}"))?
        .as_mapping()
        .cloned()
        .ok_or_else(|| "Hermes config must contain a YAML mapping".to_string())
}

fn yaml_mapping_value<'a>(root: &'a YamlMapping, key: &str) -> Option<&'a YamlMapping> {
    root.get(YamlValue::String(key.to_string()))?.as_mapping()
}

fn yaml_sequence_value<'a>(root: &'a YamlMapping, key: &str) -> Option<&'a Vec<YamlValue>> {
    root.get(YamlValue::String(key.to_string()))?.as_sequence()
}

fn yaml_string(mapping: &YamlMapping, key: &str) -> Option<String> {
    mapping
        .get(YamlValue::String(key.to_string()))?
        .as_str()
        .map(str::to_string)
}

fn yaml_insert_string(mapping: &mut YamlMapping, key: &str, value: &str) {
    mapping.insert(
        YamlValue::String(key.to_string()),
        YamlValue::String(value.to_string()),
    );
}

fn find_hermes_custom_provider<'a>(
    root: &'a YamlMapping,
    provider_key: &str,
) -> Option<&'a YamlMapping> {
    yaml_sequence_value(root, "custom_providers")?
        .iter()
        .filter_map(YamlValue::as_mapping)
        .find(|mapping| yaml_string(mapping, "name").as_deref() == Some(provider_key))
}

fn protocol_from_hermes(value: &str) -> AgentProtocol {
    match value {
        "codex_responses" => AgentProtocol::Responses,
        "anthropic_messages" => AgentProtocol::AnthropicMessages,
        _ => AgentProtocol::ChatCompletions,
    }
}

fn replace_yaml_section(raw: &str, key: &str, value: &YamlValue) -> Result<String, String> {
    let mut section = YamlMapping::new();
    section.insert(YamlValue::String(key.to_string()), value.clone());
    let serialized =
        serde_yaml::to_string(&YamlValue::Mapping(section)).map_err(|error| error.to_string())?;
    if let Some((start, end)) = yaml_section_range(raw, key) {
        let mut output = String::with_capacity(raw.len() + serialized.len());
        output.push_str(&raw[..start]);
        output.push_str(&serialized);
        if !serialized.ends_with('\n') && !raw[end..].starts_with('\n') {
            output.push('\n');
        }
        output.push_str(&raw[end..]);
        Ok(output)
    } else {
        let mut output = raw.to_string();
        if !output.is_empty() && !output.ends_with('\n') {
            output.push('\n');
        }
        output.push_str(&serialized);
        Ok(output)
    }
}

fn yaml_section_range(raw: &str, key: &str) -> Option<(usize, usize)> {
    let target = format!("{key}:");
    let mut start = None;
    let mut offset = 0;
    for line in raw.split_inclusive('\n') {
        let body = line.trim_end_matches(['\r', '\n']);
        let top_level =
            !body.is_empty() && !body.starts_with([' ', '\t', '#', '-']) && body.contains(':');
        if start.is_none() && top_level && body.starts_with(&target) {
            let suffix = &body[target.len()..];
            if suffix.is_empty() || suffix.starts_with([' ', '\t']) {
                start = Some(offset);
            }
        } else if start.is_some() && top_level {
            return Some((start.unwrap(), offset));
        }
        offset += line.len();
    }
    start.map(|start| (start, raw.len()))
}

fn provider_key_from_base_url(base_url: &str) -> String {
    let without_scheme = base_url
        .trim()
        .strip_prefix("https://")
        .or_else(|| base_url.trim().strip_prefix("http://"))
        .unwrap_or(base_url.trim());
    let host = without_scheme.split('/').next().unwrap_or(without_scheme);
    normalize_provider_key(host.split('.').next().unwrap_or(host))
}

fn find_executable(name: &str, home: &Path) -> Option<PathBuf> {
    let mut candidates = env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect::<Vec<_>>())
        .unwrap_or_default();
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        home.join(".local/bin"),
        home.join(".cargo/bin"),
    ]);
    candidates
        .into_iter()
        .map(|directory| directory.join(name))
        .find(|path| path.is_file())
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[derive(Default)]
    struct MemorySecretStore {
        values: Mutex<HashMap<String, String>>,
    }

    impl SecretStore for MemorySecretStore {
        fn get(&self, profile_id: &str) -> Result<Option<String>, String> {
            Ok(self.values.lock().unwrap().get(profile_id).cloned())
        }

        fn set(&self, profile_id: &str, secret: &str) -> Result<(), String> {
            self.values
                .lock()
                .unwrap()
                .insert(profile_id.to_string(), secret.to_string());
            Ok(())
        }

        fn delete(&self, profile_id: &str) -> Result<(), String> {
            self.values.lock().unwrap().remove(profile_id);
            Ok(())
        }
    }

    fn fixture_paths(root: &Path) -> AgentConfigPaths {
        let home = root.join("home");
        AgentConfigPaths {
            catalog: home.join(".agent-memory-manager/agent-config-profiles.json"),
            backup_root: home.join(".agent-memory-manager/backups/agent-config"),
            codex: home.join(".codex/config.toml"),
            claude: home.join(".claude/settings.json"),
            hermes: home.join(".hermes/config.yaml"),
            home,
        }
    }

    fn seed_native_configs(paths: &AgentConfigPaths) {
        fs::create_dir_all(paths.codex.parent().unwrap()).unwrap();
        fs::create_dir_all(paths.claude.parent().unwrap()).unwrap();
        fs::create_dir_all(paths.hermes.parent().unwrap()).unwrap();
        fs::write(
            &paths.codex,
            "model = \"gpt-test\"\nmodel_provider = \"openai\"\n[features]\nmemories = true\n[model_providers.gateway]\nhttp_headers = { X-Team = \"memory\" }\n",
        )
        .unwrap();
        fs::write(
            &paths.claude,
            r#"{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "claude-secret",
    "ANTHROPIC_BASE_URL": "https://claude.example",
    "ANTHROPIC_MODEL": "claude-test"
  },
  "includeCoAuthoredBy": false
}
"#,
        )
        .unwrap();
        fs::write(
            &paths.hermes,
            "# user comment\nmodel:\n  provider: codex\n  default: gpt-test\nagent:\n  max_turns: 42\n",
        )
        .unwrap();
    }

    fn input(agent: AgentKind, name: &str, provider: &str) -> SaveAgentProfileInput {
        SaveAgentProfileInput {
            id: None,
            agent,
            name: name.to_string(),
            provider_key: provider.to_string(),
            base_url: "https://gateway.example/v1".to_string(),
            model: "test-model".to_string(),
            protocol: agent.default_protocol(),
            official: false,
            api_key: Some("managed-secret".to_string()),
            clear_secret: false,
        }
    }

    #[test]
    fn imports_current_profiles_without_persisting_secrets() {
        let temp = tempdir().unwrap();
        let paths = fixture_paths(temp.path());
        let secrets = MemorySecretStore::default();
        seed_native_configs(&paths);

        let inventory = load_inventory_with(&paths, &secrets).unwrap();
        let catalog_text = fs::read_to_string(&paths.catalog).unwrap();

        assert_eq!(inventory.targets.len(), 3);
        assert!(inventory
            .targets
            .iter()
            .all(|target| target.profiles.len() == 1));
        assert!(
            inventory
                .targets
                .iter()
                .find(|target| target.agent == AgentKind::ClaudeCode)
                .unwrap()
                .profiles[0]
                .has_secret
        );
        assert!(!catalog_text.contains("claude-secret"));
    }

    #[test]
    fn activates_claude_profile_and_preserves_unrelated_settings() {
        let temp = tempdir().unwrap();
        let paths = fixture_paths(temp.path());
        let secrets = MemorySecretStore::default();
        seed_native_configs(&paths);
        load_inventory_with(&paths, &secrets).unwrap();
        let inventory = save_profile_with(
            &paths,
            &secrets,
            input(AgentKind::ClaudeCode, "Gateway", "gateway"),
        )
        .unwrap();
        let profile = inventory
            .targets
            .iter()
            .find(|target| target.agent == AgentKind::ClaudeCode)
            .unwrap()
            .profiles
            .iter()
            .find(|profile| profile.name == "Gateway")
            .unwrap();

        let result =
            activate_profile_with(&paths, &secrets, AgentKind::ClaudeCode, &profile.id).unwrap();
        let settings: JsonValue =
            serde_json::from_str(&fs::read_to_string(&paths.claude).unwrap()).unwrap();

        assert_eq!(settings["includeCoAuthoredBy"], false);
        assert_eq!(settings["env"]["ANTHROPIC_AUTH_TOKEN"], "managed-secret");
        assert_eq!(settings["env"]["ANTHROPIC_MODEL"], "test-model");
        assert!(result.backup_path.is_some());
    }

    #[test]
    fn activates_official_claude_profile_with_api_key() {
        let temp = tempdir().unwrap();
        let paths = fixture_paths(temp.path());
        let secrets = MemorySecretStore::default();
        seed_native_configs(&paths);
        load_inventory_with(&paths, &secrets).unwrap();
        let mut official = input(AgentKind::ClaudeCode, "Anthropic", "anthropic");
        official.official = true;
        official.base_url.clear();
        let inventory = save_profile_with(&paths, &secrets, official).unwrap();
        let profile = inventory
            .targets
            .iter()
            .find(|target| target.agent == AgentKind::ClaudeCode)
            .unwrap()
            .profiles
            .iter()
            .find(|profile| profile.name == "Anthropic")
            .unwrap();

        activate_profile_with(&paths, &secrets, AgentKind::ClaudeCode, &profile.id).unwrap();
        let settings: JsonValue =
            serde_json::from_str(&fs::read_to_string(&paths.claude).unwrap()).unwrap();

        assert_eq!(settings["env"]["ANTHROPIC_API_KEY"], "managed-secret");
        assert_eq!(settings["env"]["ANTHROPIC_MODEL"], "test-model");
        assert!(settings["env"].get("ANTHROPIC_BASE_URL").is_none());
    }

    #[test]
    fn activates_codex_profile_without_touching_unrelated_tables() {
        let temp = tempdir().unwrap();
        let paths = fixture_paths(temp.path());
        let secrets = MemorySecretStore::default();
        seed_native_configs(&paths);
        load_inventory_with(&paths, &secrets).unwrap();
        let inventory = save_profile_with(
            &paths,
            &secrets,
            input(AgentKind::Codex, "Gateway", "gateway"),
        )
        .unwrap();
        let profile = inventory
            .targets
            .iter()
            .find(|target| target.agent == AgentKind::Codex)
            .unwrap()
            .profiles
            .iter()
            .find(|profile| profile.name == "Gateway")
            .unwrap();

        activate_profile_with(&paths, &secrets, AgentKind::Codex, &profile.id).unwrap();
        let document = DocumentMut::from_str(&fs::read_to_string(&paths.codex).unwrap()).unwrap();

        assert_eq!(document["model_provider"].as_str(), Some("gateway"));
        assert_eq!(document["model"].as_str(), Some("test-model"));
        assert_eq!(document["features"]["memories"].as_bool(), Some(true));
        assert_eq!(
            document["model_providers"]["gateway"]["http_headers"]["X-Team"].as_str(),
            Some("memory")
        );
        assert_eq!(
            document["model_providers"]["gateway"]["experimental_bearer_token"].as_str(),
            Some("managed-secret")
        );
    }

    #[test]
    fn activates_hermes_profile_and_preserves_unrelated_yaml() {
        let temp = tempdir().unwrap();
        let paths = fixture_paths(temp.path());
        let secrets = MemorySecretStore::default();
        seed_native_configs(&paths);
        load_inventory_with(&paths, &secrets).unwrap();
        let inventory = save_profile_with(
            &paths,
            &secrets,
            input(AgentKind::Hermes, "Gateway", "gateway"),
        )
        .unwrap();
        let profile = inventory
            .targets
            .iter()
            .find(|target| target.agent == AgentKind::Hermes)
            .unwrap()
            .profiles
            .iter()
            .find(|profile| profile.name == "Gateway")
            .unwrap();

        let profile_id = profile.id.clone();
        activate_profile_with(&paths, &secrets, AgentKind::Hermes, &profile_id).unwrap();
        let text = fs::read_to_string(&paths.hermes).unwrap();
        let root = parse_yaml_root(&text).unwrap();

        assert!(text.contains("# user comment"));
        assert_eq!(
            yaml_mapping_value(&root, "agent")
                .and_then(|mapping| mapping.get(YamlValue::String("max_turns".to_string())))
                .and_then(YamlValue::as_i64),
            Some(42)
        );
        assert_eq!(
            yaml_mapping_value(&root, "model")
                .and_then(|mapping| yaml_string(mapping, "provider"))
                .as_deref(),
            Some("gateway")
        );
        assert_eq!(
            find_hermes_custom_provider(&root, "gateway")
                .and_then(|mapping| yaml_string(mapping, "api_key"))
                .as_deref(),
            Some("managed-secret")
        );

        let mut cleared = input(AgentKind::Hermes, "Gateway", "gateway");
        cleared.id = Some(profile_id.clone());
        cleared.api_key = None;
        cleared.clear_secret = true;
        save_profile_with(&paths, &secrets, cleared).unwrap();
        activate_profile_with(&paths, &secrets, AgentKind::Hermes, &profile_id).unwrap();
        let cleared_root = parse_yaml_root(&fs::read_to_string(&paths.hermes).unwrap()).unwrap();
        assert!(find_hermes_custom_provider(&cleared_root, "gateway")
            .and_then(|mapping| yaml_string(mapping, "api_key"))
            .is_none());
    }

    #[test]
    fn rejects_invalid_provider_inputs() {
        let mut invalid = input(AgentKind::Codex, "Bad", "openai");
        invalid.base_url = "not-a-url".to_string();
        assert!(validate_profile_input(&invalid).is_err());

        invalid.base_url = "https://example.com".to_string();
        assert!(validate_profile_input(&invalid).is_err());
    }
}
