pub mod agent_config;
pub mod memory;
pub mod skill_manager;

use tauri::{LogicalSize, Manager, WebviewWindow};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(memory::commands::MemoryProfileGenerationState::default())
        .manage(memory::commands::CodexAuditState::default())
        .setup(|app| {
            let window =
                match app.get_webview_window("main") {
                    Some(window) => window,
                    None => {
                        let window_config =
                            app.config().app.windows.first().ok_or_else(|| {
                                std::io::Error::other("missing main window config")
                            })?;
                        tauri::WebviewWindowBuilder::from_config(app.handle(), window_config)?
                            .build()?
                    }
                };
            normalize_main_window(&window)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_config::load_agent_config_inventory,
            agent_config::save_agent_provider_profile,
            agent_config::delete_agent_provider_profile,
            agent_config::activate_agent_provider_profile,
            memory::commands::scan_memories,
            memory::commands::get_source_excerpt,
            memory::commands::draft_correction,
            memory::commands::draft_correction_from_content,
            memory::commands::load_memory_profile,
            memory::commands::start_memory_profile_generation,
            memory::commands::get_memory_profile_generation,
            memory::commands::cancel_memory_profile_generation,
            memory::commands::start_codex_audit,
            memory::commands::get_codex_audit,
            memory::commands::cancel_codex_audit,
            memory::commands::generate_memory_profile,
            memory::commands::write_correction,
            memory::commands::run_codex_audit,
            skill_manager::load_skill_inventory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn normalize_main_window(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_min_size(Some(LogicalSize::new(980.0, 640.0)))?;
    window.set_size(LogicalSize::new(1180.0, 760.0))?;
    window.center()?;
    window.show()?;
    window.set_focus()?;
    #[cfg(debug_assertions)]
    {
        eprintln!(
            "[amm-window] label={} inner={:?} outer={:?} visible={:?}",
            window.label(),
            window.inner_size(),
            window.outer_size(),
            window.is_visible()
        );
    }
    Ok(())
}
