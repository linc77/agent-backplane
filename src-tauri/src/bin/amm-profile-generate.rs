use std::{env, fs, path::Path, process};

use agent_memory_manager_lib::memory::{
    codex_audit::RealCodexExecRunner,
    parser::{parse_entries, MemoryEntry},
    paths::resolve_memory_root,
    profile::{
        generate_codex_memory_profile_for_root, generate_memory_profile_for_root,
        load_memory_profile_for_root,
    },
    risk::{detect_risks, RiskFlag},
    scanner::{scan_sources, MemorySource},
};

fn main() {
    if let Err(err) = run() {
        eprintln!("amm-profile-generate failed: {err}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let options = Options::parse(env::args().skip(1).collect())?;
    if options.help {
        print_help();
        return Ok(());
    }

    let root = resolve_memory_root(options.root_override);
    let (sources, entries, risks) = scan_memory_root(&root)?;
    let profile = if options.load_only {
        load_memory_profile_for_root(&root, &sources, &entries, &risks)?
    } else if options.require_codex {
        generate_codex_memory_profile_for_root(
            &root,
            &sources,
            &entries,
            &risks,
            &RealCodexExecRunner,
        )?
    } else {
        generate_memory_profile_for_root(&root, &sources, &entries, &risks, &RealCodexExecRunner)?
    };

    let json = serde_json::to_string_pretty(&profile)
        .map_err(|err| format!("failed to serialize profile JSON: {err}"))?;
    println!("{json}");
    Ok(())
}

fn scan_memory_root(
    root: &Path,
) -> Result<(Vec<MemorySource>, Vec<MemoryEntry>, Vec<RiskFlag>), String> {
    let sources = scan_sources(root).map_err(|err| err.to_string())?;
    let mut entries = Vec::new();

    for source in &sources {
        let text = fs::read_to_string(&source.path).map_err(|err| err.to_string())?;
        entries.extend(parse_entries(&source.relative_path, &text));
    }

    let risks = detect_risks(&entries);
    Ok((sources, entries, risks))
}

#[derive(Debug, Default)]
struct Options {
    root_override: Option<String>,
    load_only: bool,
    require_codex: bool,
    help: bool,
}

impl Options {
    fn parse(args: Vec<String>) -> Result<Self, String> {
        let mut options = Options::default();
        let mut index = 0;

        while index < args.len() {
            match args[index].as_str() {
                "--root" => {
                    index += 1;
                    let Some(root) = args.get(index) else {
                        return Err("--root requires a path".to_string());
                    };
                    options.root_override = Some(root.clone());
                }
                "--load-only" => {
                    options.load_only = true;
                }
                "--require-codex" => {
                    options.require_codex = true;
                }
                "-h" | "--help" => {
                    options.help = true;
                }
                arg => {
                    return Err(format!("unknown argument: {arg}"));
                }
            }
            index += 1;
        }

        Ok(options)
    }
}

fn print_help() {
    println!(
        "Usage: cargo run --manifest-path src-tauri/Cargo.toml --bin amm-profile-generate -- [--root PATH] [--load-only] [--require-codex]\n\n\
         Options:\n\
           --root PATH       Use a memory root instead of the default ~/.codex/memories.\n\
           --load-only       Load or rebuild the deterministic cache without invoking Codex.\n\
           --require-codex   Fail if generation falls back instead of producing codex-profile-v1.\n"
    );
}
