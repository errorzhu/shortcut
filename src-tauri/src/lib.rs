use std::sync::{Arc, Mutex};
use std::thread;
use std::process::Command as SysCommand;
use std::fs;
use std::path::PathBuf;

use arboard::Clipboard;
use chrono::Local;
use enigo::{Enigo, Key, Keyboard, Settings};
use once_cell::sync::Lazy;
use rdev::{listen, Event, EventType, Key as RdevKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

// ─── Types ───────────────────────────────────────────────────────────────────

/// Helper function to provide default group_id
fn default_group_id() -> String {
    "default".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDef {
    pub id: String,
    pub trigger: String,
    #[serde(rename = "type")]
    pub cmd_type: String,
    pub label: String,
    pub value: String,
    pub enabled: bool,
    #[serde(default = "default_group_id")]
    pub group_id: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandGroup {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub order: i32,
    #[serde(default)]
    pub created_at: i64,
}

/// Unified app data structure for cmd.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    #[serde(default)]
    pub commands: Vec<CommandDef>,
    #[serde(default)]
    pub groups: Vec<CommandGroup>,
}

// ─── Unified Global State ────────────────────────────────────────────────────

struct GlobalState {
    commands: Vec<CommandDef>,
    groups: Vec<CommandGroup>,
    buffer: String,
    active: bool,
    app_handle: Option<AppHandle>,
    shift_pressed: bool,
    listener_started: bool,
    allow_close: bool,
}

impl GlobalState {
    fn new() -> Self {
        Self {
            commands: Vec::new(),
            groups: Vec::new(),
            buffer: String::new(),
            active: false,
            app_handle: None,
            shift_pressed: false,
            listener_started: false,
            allow_close: false,
        }
    }
}

/// Single unified global state, replacing the previous 7 separate statics.
static GLOBAL: Lazy<Arc<Mutex<GlobalState>>> =
    Lazy::new(|| Arc::new(Mutex::new(GlobalState::new())));

// ─── Keyboard listener ───────────────────────────────────────────────────────

/// Called on every key event from rdev (runs in its own thread)
fn on_key_event(event: Event) {
    // Track Shift key state
    match event.event_type {
        EventType::KeyPress(RdevKey::ShiftLeft | RdevKey::ShiftRight) => {
            GLOBAL.lock().unwrap().shift_pressed = true;
            return;
        }
        EventType::KeyRelease(RdevKey::ShiftLeft | RdevKey::ShiftRight) => {
            GLOBAL.lock().unwrap().shift_pressed = false;
            return;
        }
        _ => {}
    }

    let active = GLOBAL.lock().unwrap().active;
    if !active {
        return;
    }

    if let EventType::KeyPress(key) = event.event_type {
        // Use a scope to limit the lock duration for buffer mutation
        let captured: Option<String> = {
            let mut state = GLOBAL.lock().unwrap();
            match key {
                RdevKey::Escape => {
                    state.buffer.clear();
                    eprintln!("[rdev] Escape -> buffer cleared");
                    None
                }
                RdevKey::Return | RdevKey::Space | RdevKey::Tab => {
                    let buf = state.buffer.clone();
                    eprintln!("[rdev] Terminator key, buffer='{}'", buf);
                    state.buffer.clear();
                    // Drop lock before firing (state is released at end of scope)
                    Some(buf)
                }
                RdevKey::Backspace => {
                    let len = state.buffer.len();
                    if len > 0 {
                        state.buffer.truncate(len - 1);
                    }
                    eprintln!("[rdev] Backspace -> buffer='{}'", state.buffer);
                    // Also check for trigger after backspace
                    let buf = state.buffer.clone();
                    Some(buf)
                }
                _ => {
                    let shift = state.shift_pressed;
                    if let Some(ch) = key_to_char(&key, shift) {
                        state.buffer.push(ch);
                        if state.buffer.len() > 64 {
                            let excess = state.buffer.len() - 64;
                            state.buffer.drain(..excess);
                        }
                        let buf = state.buffer.clone();
                        eprintln!(
                            "[rdev] Key={:?} shift={} char='{}' -> buffer='{}'",
                            key, shift, ch, buf
                        );
                        Some(buf)
                    } else {
                        eprintln!(
                            "[rdev] Key={:?} shift={} -> no char mapping",
                            key, shift
                        );
                        None
                    }
                }
            }
        };

        // Now check triggers outside the lock
        if let Some(buf) = captured {
            check_and_fire(&buf);
        }
    }
}

fn check_and_fire(buffer: &str) {
    let (matched_cmd, app_handle) = {
        let state = GLOBAL.lock().unwrap();
        let mut found: Option<CommandDef> = None;
        for cmd in &state.commands {
            if cmd.enabled && buffer.ends_with(&cmd.trigger) {
                found = Some(cmd.clone());
                break;
            }
        }
        (found, state.app_handle.clone())
    };

    if let Some(cmd) = matched_cmd {
        // Clear the buffer
        GLOBAL.lock().unwrap().buffer.clear();

        let trigger = cmd.trigger.clone();
        let trigger_len = trigger.len();
        let cmd_type = cmd.cmd_type.clone();
        let value = cmd.value.clone();

        // Emit event to frontend
        if let Some(app) = app_handle {
            let _ = app.emit("command-triggered", &trigger);
            eprintln!(
                "[rdev] Emitted 'command-triggered' event with trigger='{}'",
                trigger
            );
        }

        // Execute the command in a new thread
        thread::spawn(move || {
            eprintln!(
                "[rdev] Executing action: type='{}' value='{}' trigger_len={}",
                cmd_type, value, trigger_len
            );
            execute_action(&cmd_type, &value, trigger_len);
        });
    }
}

fn execute_action(cmd_type: &str, value: &str, trigger_len: usize) {
    match cmd_type {
        "date" => {
            let date_str = if value == "datetime" {
                Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
            } else {
                Local::now().format("%Y-%m-%d").to_string()
            };

            // Delay to let the trigger key events finish processing
            thread::sleep(std::time::Duration::from_millis(100));

            // Delete the trigger text and type the replacement
            delete_trigger_and_type(trigger_len, &date_str);
        }

        "url" => {
            // Open URL in default browser
            #[cfg(target_os = "windows")]
            let _ = SysCommand::new("cmd")
                .args(["/C", "start", "", value])
                .spawn();

            #[cfg(target_os = "macos")]
            let _ = SysCommand::new("open").arg(value).spawn();

            #[cfg(target_os = "linux")]
            let _ = SysCommand::new("xdg-open").arg(value).spawn();
        }

        "app" => {
            // Launch application
            #[cfg(target_os = "windows")]
            {
                // Use cmd /C start to handle paths with spaces correctly
                let _ = SysCommand::new("cmd")
                    .args(["/C", "start", "", value])
                    .spawn();
            }

            #[cfg(not(target_os = "windows"))]
            let _ = SysCommand::new("open").arg(value).spawn();
        }

        "text" => {
            let expanded = expand_text_variables(value);
            thread::sleep(std::time::Duration::from_millis(100));
            delete_trigger_and_type(trigger_len, &expanded);
        }

        _ => {}
    }
}

/// Simulate pressing Backspace `count` times to delete the trigger,
/// then type the replacement text using enigo or clipboard paste.
fn delete_trigger_and_type(trigger_len: usize, replacement: &str) {
    // Check if replacement contains non-ASCII characters
    let has_non_ascii = replacement.chars().any(|c| !c.is_ascii());
    
    match Enigo::new(&Settings::default()) {
        Ok(mut enigo) => {
            // Delete the trigger characters using Click mode (atomic press+release)
            for _ in 0..trigger_len {
                let _ = enigo.key(Key::Backspace, enigo::Direction::Click);
                thread::sleep(std::time::Duration::from_millis(10));
            }

            // Small pause before typing replacement
            thread::sleep(std::time::Duration::from_millis(50));

            if has_non_ascii {
                // Use clipboard paste method for non-ASCII text (e.g., Chinese)
                match Clipboard::new() {
                    Ok(mut clipboard) => {
                        if clipboard.set_text(replacement).is_ok() {
                            // Small pause after setting clipboard
                            thread::sleep(std::time::Duration::from_millis(50));
                            
                            // Simulate Ctrl+V to paste using Click mode
                            let _ = enigo.key(Key::Control, enigo::Direction::Press);
                            thread::sleep(std::time::Duration::from_millis(20));
                            let _ = enigo.key(Key::Unicode('v'), enigo::Direction::Click);
                            thread::sleep(std::time::Duration::from_millis(20));
                            let _ = enigo.key(Key::Control, enigo::Direction::Release);
                        }
                    }
                    Err(_) => {
                        // Fallback to enigo.text()
                        let _ = enigo.text(replacement);
                    }
                }
            } else {
                // Pure ASCII, use enigo.text() directly
                let _ = enigo.text(replacement);
            }
        }
        Err(_) => {}
    }
}

/// Expand variable placeholders in text, replacing {{variable}} with actual values.
/// Supported variables:
/// - {{date}}: Current date (YYYY-MM-DD)
/// - {{datetime}}: Current date time (YYYY-MM-DD HH:MM:SS)
/// - {{time}}: Current time (HH:MM)
/// - {{timestamp}}: Current timestamp (milliseconds)
fn expand_text_variables(text: &str) -> String {
    let now = Local::now();
    
    let date_str = now.format("%Y-%m-%d").to_string();
    let datetime_str = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let time_str = now.format("%H:%M").to_string();
    let timestamp_str = now.timestamp_millis().to_string();
    
    let mut result = text.to_string();
    result = result.replace("{{date}}", &date_str);
    result = result.replace("{{datetime}}", &datetime_str);
    result = result.replace("{{time}}", &time_str);
    result = result.replace("{{timestamp}}", &timestamp_str);
    
    result
}

/// Convert rdev Key to char, respecting Shift state
fn key_to_char(key: &RdevKey, shift: bool) -> Option<char> {
    match key {
        RdevKey::Minus => if shift { Some('_') } else { Some('-') },
        RdevKey::Equal => if shift { Some('+') } else { Some('=') },
        RdevKey::LeftBracket => if shift { Some('{') } else { Some('[') },
        RdevKey::RightBracket => if shift { Some('}') } else { Some(']') },
        RdevKey::SemiColon => if shift { Some(':') } else { Some(';') },
        RdevKey::Quote => if shift { Some('"') } else { Some('\'') },
        RdevKey::Comma => if shift { Some('<') } else { Some(',') },
        RdevKey::Dot => if shift { Some('>') } else { Some('.') },
        RdevKey::Slash => if shift { Some('?') } else { Some('/') },
        RdevKey::BackSlash => if shift { Some('|') } else { Some('\\') },
        RdevKey::BackQuote => if shift { Some('~') } else { Some('`') },
        RdevKey::KeyA => if shift { Some('A') } else { Some('a') },
        RdevKey::KeyB => if shift { Some('B') } else { Some('b') },
        RdevKey::KeyC => if shift { Some('C') } else { Some('c') },
        RdevKey::KeyD => if shift { Some('D') } else { Some('d') },
        RdevKey::KeyE => if shift { Some('E') } else { Some('e') },
        RdevKey::KeyF => if shift { Some('F') } else { Some('f') },
        RdevKey::KeyG => if shift { Some('G') } else { Some('g') },
        RdevKey::KeyH => if shift { Some('H') } else { Some('h') },
        RdevKey::KeyI => if shift { Some('I') } else { Some('i') },
        RdevKey::KeyJ => if shift { Some('J') } else { Some('j') },
        RdevKey::KeyK => if shift { Some('K') } else { Some('k') },
        RdevKey::KeyL => if shift { Some('L') } else { Some('l') },
        RdevKey::KeyM => if shift { Some('M') } else { Some('m') },
        RdevKey::KeyN => if shift { Some('N') } else { Some('n') },
        RdevKey::KeyO => if shift { Some('O') } else { Some('o') },
        RdevKey::KeyP => if shift { Some('P') } else { Some('p') },
        RdevKey::KeyQ => if shift { Some('Q') } else { Some('q') },
        RdevKey::KeyR => if shift { Some('R') } else { Some('r') },
        RdevKey::KeyS => if shift { Some('S') } else { Some('s') },
        RdevKey::KeyT => if shift { Some('T') } else { Some('t') },
        RdevKey::KeyU => if shift { Some('U') } else { Some('u') },
        RdevKey::KeyV => if shift { Some('V') } else { Some('v') },
        RdevKey::KeyW => if shift { Some('W') } else { Some('w') },
        RdevKey::KeyX => if shift { Some('X') } else { Some('x') },
        RdevKey::KeyY => if shift { Some('Y') } else { Some('y') },
        RdevKey::KeyZ => if shift { Some('Z') } else { Some('z') },
        RdevKey::Num0 => if shift { Some(')') } else { Some('0') },
        RdevKey::Num1 => if shift { Some('!') } else { Some('1') },
        RdevKey::Num2 => if shift { Some('@') } else { Some('2') },
        RdevKey::Num3 => if shift { Some('#') } else { Some('3') },
        RdevKey::Num4 => if shift { Some('$') } else { Some('4') },
        RdevKey::Num5 => if shift { Some('%') } else { Some('5') },
        RdevKey::Num6 => if shift { Some('^') } else { Some('6') },
        RdevKey::Num7 => if shift { Some('&') } else { Some('7') },
        RdevKey::Num8 => if shift { Some('*') } else { Some('8') },
        RdevKey::Num9 => if shift { Some('(') } else { Some('9') },
        _ => None,
    }
}

// ─── File persistence ────────────────────────────────────────────────────────

/// Get the path to cmd.json in the same directory as the executable
fn get_commands_file_path() -> PathBuf {
    // Get the directory where the executable is located
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();
    exe_dir.join("cmd.json")
}

/// Default commands to use when cmd.json doesn't exist or is invalid
fn default_commands() -> Vec<CommandDef> {
    vec![
        CommandDef {
            id: "builtin-date".into(),
            trigger: "-date".into(),
            cmd_type: "date".into(),
            label: "打印当前日期".into(),
            value: "date".into(),
            enabled: true,
            group_id: "default".into(),
            tags: vec!["日期".into()],
        },
        CommandDef {
            id: "builtin-bd".into(),
            trigger: "-bd".into(),
            cmd_type: "url".into(),
            label: "打开百度".into(),
            value: "https://www.baidu.com".into(),
            enabled: true,
            group_id: "default".into(),
            tags: vec!["搜索".into()],
        },
        CommandDef {
            id: "builtin-wx".into(),
            trigger: "-wx".into(),
            cmd_type: "app".into(),
            label: "打开微信".into(),
            value: "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe".into(),
            enabled: true,
            group_id: "default".into(),
            tags: vec!["社交".into()],
        },
    ]
}

/// Default groups to use when cmd.json doesn't exist or is invalid
fn default_groups() -> Vec<CommandGroup> {
    vec![
        CommandGroup {
            id: "default".into(),
            name: "默认分组".into(),
            color: "#60c8ff".into(),
            icon: None,
            order: 0,
            created_at: Local::now().timestamp_millis(),
        },
    ]
}

/// Default app data structure
fn default_app_data() -> AppData {
    AppData {
        commands: default_commands(),
        groups: default_groups(),
    }
}

/// Load app data from cmd.json file, creating file with defaults if it doesn't exist
fn load_app_data() -> AppData {
    let file_path = get_commands_file_path();
    eprintln!("[file] Loading app data from: {:?}", file_path);
    
    match fs::read_to_string(&file_path) {
        Ok(content) => {
            eprintln!("[file] Successfully read file, parsing JSON...");
            // Try to parse as AppData (new format) first
            match serde_json::from_str::<AppData>(&content) {
                Ok(data) => {
                    eprintln!("[file] Parsed AppData: {} commands, {} groups", data.commands.len(), data.groups.len());
                    data
                }
                Err(_) => {
                    // Try to parse as old format (Vec<CommandDef>) for backward compatibility
                    match serde_json::from_str::<Vec<CommandDef>>(&content) {
                        Ok(cmds) => {
                            eprintln!("[file] Parsed old format commands, converting to AppData");
                            AppData {
                                commands: cmds,
                                groups: default_groups(),
                            }
                        }
                        Err(e) => {
                            eprintln!("[file] JSON parse error: {:?}", e);
                            eprintln!("[file] Using default app data");
                            default_app_data()
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[file] Could not read file: {:?}", e);
            eprintln!("[file] Creating default app data file");
            let data = default_app_data();
            if let Err(write_err) = save_app_data(&data) {
                eprintln!("[file] Failed to create default file: {:?}", write_err);
            }
            data
        }
    }
}

/// Save app data to cmd.json file
fn save_app_data(data: &AppData) -> Result<(), std::io::Error> {
    let file_path = get_commands_file_path();
    eprintln!("[file] Saving app data: {} commands, {} groups to: {:?}", 
              data.commands.len(), data.groups.len(), file_path);
    
    let json = serde_json::to_string_pretty(data)?;
    fs::write(&file_path, json)?;
    eprintln!("[file] App data saved successfully");
    Ok(())
}

/// Legacy function for backward compatibility - loads commands from app data
fn load_commands_from_file() -> Vec<CommandDef> {
    let data = load_app_data();
    data.commands
}

/// Legacy function for backward compatibility - saves commands to app data
fn save_commands_to_file(commands: &Vec<CommandDef>) -> Result<(), std::io::Error> {
    let data = load_app_data();
    let new_data = AppData {
        commands: commands.clone(),
        groups: data.groups,
    };
    save_app_data(&new_data)
}

/// Load groups from app data
fn load_groups_from_file() -> Vec<CommandGroup> {
    let data = load_app_data();
    data.groups
}

/// Save groups to app data
fn save_groups_to_file(groups: &Vec<CommandGroup>) -> Result<(), std::io::Error> {
    let data = load_app_data();
    let new_data = AppData {
        commands: data.commands,
        groups: groups.clone(),
    };
    save_app_data(&new_data)
}

/// Merge built-in commands with existing commands, ensuring built-in commands are always present.
/// Returns (merged_commands, had_new_builtin) where had_new_builtin indicates if new commands were added.
fn merge_builtin_commands(existing: Vec<CommandDef>) -> (Vec<CommandDef>, bool) {
    let builtins = default_commands();
    // Collect IDs as owned Strings to avoid borrow issues
    let existing_ids: std::collections::HashSet<String> = existing.iter().map(|c| c.id.clone()).collect();
    
    let mut merged = existing;
    let mut added_count = 0;
    
    for builtin in builtins {
        if !existing_ids.contains(&builtin.id) {
            eprintln!("[merge] Adding missing built-in command: id='{}' trigger='{}'", builtin.id, builtin.trigger);
            merged.push(builtin);
            added_count += 1;
        }
    }
    
    if added_count > 0 {
        eprintln!("[merge] Added {} new built-in commands, total: {}", added_count, merged.len());
    } else {
        eprintln!("[merge] All built-in commands already present");
    }
    
    (merged, added_count > 0)
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn update_commands(commands: Vec<CommandDef>) {
    eprintln!("[cmd] [DEBUG] update_commands called with {} commands", commands.len());
    for (i, cmd) in commands.iter().enumerate() {
        eprintln!("[cmd] [DEBUG]   Command {}: id='{}' trigger='{}' type='{}' enabled={} group_id='{}' value='{}'", 
                 i, cmd.id, cmd.trigger, cmd.cmd_type, cmd.enabled, cmd.group_id, cmd.value);
    }
    
    // Merge built-in commands to ensure they are always present
    let (merged, _) = merge_builtin_commands(commands);
    eprintln!("[cmd] update_commands: after merge, {} commands", merged.len());
    
    let mut state = GLOBAL.lock().unwrap();
    state.commands = merged.clone();
    eprintln!("[cmd] update_commands: {} commands synced", state.commands.len());
    
    // Also persist to file
    if let Err(e) = save_commands_to_file(&merged) {
        eprintln!("[cmd] Failed to persist commands: {:?}", e);
    }
}

#[tauri::command]
fn load_commands() -> Vec<CommandDef> {
    eprintln!("[cmd] load_commands called");
    let commands = load_commands_from_file();
    // Update global state
    let mut state = GLOBAL.lock().unwrap();
    state.commands = commands.clone();
    eprintln!("[cmd] Loaded {} commands from file", commands.len());
    commands
}

#[tauri::command]
fn persist_commands(commands: Vec<CommandDef>) -> serde_json::Value {
    eprintln!("[cmd] persist_commands called with {} commands", commands.len());
    match save_commands_to_file(&commands) {
        Ok(_) => {
            // Also update global state
            let mut state = GLOBAL.lock().unwrap();
            state.commands = commands;
            serde_json::json!({ "success": true })
        }
        Err(e) => {
            eprintln!("[cmd] Failed to persist commands: {:?}", e);
            serde_json::json!({ "success": false, "error": e.to_string() })
        }
    }
}

// 监听器在应用启动时自动开始，无需启动/停止命令

#[tauri::command]
fn get_debug_info() -> serde_json::Value {
    let state = GLOBAL.lock().unwrap();
    let cmd_summaries: Vec<serde_json::Value> = state
        .commands
        .iter()
        .map(|c| {
            serde_json::json!({
                "id": c.id,
                "trigger": c.trigger,
                "type": c.cmd_type,
                "enabled": c.enabled,
            })
        })
        .collect();

    serde_json::json!({
        "active": state.active,
        "listener_started": state.listener_started,
        "shift_pressed": state.shift_pressed,
        "buffer": state.buffer,
        "buffer_len": state.buffer.len(),
        "commands": cmd_summaries,
    })
}

#[tauri::command]
fn execute_command(cmd_type: String, value: String) -> serde_json::Value {
    thread::spawn(move || execute_action(&cmd_type, &value, 0));
    serde_json::json!({ "success": true, "message": "executing" })
}

#[tauri::command]
fn get_current_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

// ─── Group Tauri commands ────────────────────────────────────────────────────

#[tauri::command]
fn load_groups() -> Vec<CommandGroup> {
    eprintln!("[cmd] load_groups called");
    let groups = load_groups_from_file();
    // Update global state
    let mut state = GLOBAL.lock().unwrap();
    state.groups = groups.clone();
    eprintln!("[cmd] Loaded {} groups from file", groups.len());
    groups
}

#[tauri::command]
fn update_groups(groups: Vec<CommandGroup>) {
    eprintln!("[cmd] update_groups called with {} groups", groups.len());
    
    let mut state = GLOBAL.lock().unwrap();
    state.groups = groups.clone();
    eprintln!("[cmd] update_groups: {} groups synced", groups.len());
    
    // Also persist to file
    if let Err(e) = save_groups_to_file(&groups) {
        eprintln!("[cmd] Failed to persist groups: {:?}", e);
    }
}

// ─── App setup ───────────────────────────────────────────────────────────────

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Store app handle in unified global state
            {
                let mut state = GLOBAL.lock().unwrap();
                state.app_handle = Some(app.handle().clone());

                // Load app data from cmd.json file (creates with defaults if not exists)
                let app_data = load_app_data();
                eprintln!("[setup] Loaded {} commands, {} groups from file", 
                          app_data.commands.len(), app_data.groups.len());

                // Merge built-in commands to ensure they are always present
                let (merged, had_new) = merge_builtin_commands(app_data.commands);
                state.commands = merged;
                state.groups = app_data.groups;

                // If new built-in commands were added, persist them to cmd.json
                if had_new {
                    eprintln!("[setup] Persisting merged commands to cmd.json");
                    if let Err(e) = save_commands_to_file(&state.commands) {
                        eprintln!("[setup] Failed to persist merged commands: {:?}", e);
                    }
                }

                eprintln!("[setup] Total commands in global state: {}", state.commands.len());
                eprintln!("[setup] Total groups in global state: {}", state.groups.len());

                // Start active immediately
                state.active = true;
                state.listener_started = true;
            }

            // ── Start rdev global keyboard listener IMMEDIATELY in setup ──
            // This ensures the listener is active regardless of frontend state
            thread::spawn(|| {
                eprintln!("[setup] Spawning rdev global keyboard listener thread...");
                if let Err(e) = listen(on_key_event) {
                    eprintln!("[setup] rdev listen ERROR: {:?}", e);
                    GLOBAL.lock().unwrap().active = false;
                }
            });

            // ── Setup tray icon with menu ──
            setup_tray(app)?;

            eprintln!("[setup] App setup complete - rdev global listener started and ACTIVE");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_commands,
            load_commands,
            persist_commands,
            get_debug_info,
            execute_command,
            get_current_date,
            load_groups,
            update_groups,
        ])
        .on_window_event(|window, event| {
            // Intercept close event and minimize to tray instead
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = GLOBAL.lock().unwrap();
                if !state.allow_close {
                    eprintln!("[tray] Window close intercepted, minimizing to tray");
                    drop(state);
                    api.prevent_close();
                    let _ = window.hide();
                }
                // If allow_close is true, let the window close normally
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Setup system tray icon with menu
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    eprintln!("[tray] Setting up system tray icon...");

    // Create menu items
    let show_item = MenuItem::with_id(handle, "show", "显示窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&show_item, &quit_item])?;

    // Create tray icon using TrayIconBuilder
    // Use show_menu_on_left_click=true so menu appears on left click instead of right click.
    // This prevents Windows from automatically showing the window on right-click.
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Shortcut - 快捷命令工具")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|tray, event| {
            let app = tray.app_handle();
            match event.id.as_ref() {
                "show" => {
                    eprintln!("[tray] Show window requested");
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    eprintln!("[tray] Quit requested");
                    // Set allow_close to true so the app can exit
                    GLOBAL.lock().unwrap().allow_close = true;
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(handle)?;

    eprintln!("[tray] Tray icon setup complete");
    Ok(())
}
