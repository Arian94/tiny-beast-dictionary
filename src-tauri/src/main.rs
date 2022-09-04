#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[macro_use]
extern crate lazy_static;

mod google_translate;
mod helper;

use ahash::RandomState;
use google_translate::Translator;
use helper::*;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    CustomMenuItem, Manager, PhysicalPosition, PhysicalSize, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem,
};
use tts_rust::languages::Languages::*;
use tts_rust::GTTSClient;

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    let tray_menu = SystemTrayMenu::new()
        .add_item(quit)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide);
    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            offline_translate,
            online_translate,
            speak,
            download_dict,
            delete_dict,
        ])
        .system_tray(tray)
        .on_system_tray_event(move |app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => {
                    let window = app.get_window("main").unwrap();
                    window.once("new_config", |event| {
                        let payload = event.payload().unwrap();
                        open_write_json_payload(&find_absolute_resource_path(SETTINGS_FILENAME), payload)
                            .is_ok()
                            .then(|| std::process::exit(0));
                    });
                    window.emit("quit", "quit button clicked").unwrap();
                }
                "hide" => {
                    let item_handle = app.tray_handle().get_item(&id);
                    let window = app.get_window("main").unwrap();
                    eprintln!("{}", window.is_visible().unwrap_or(false));
                    if window.is_visible().unwrap_or(false) {
                        window.hide().unwrap();
                        item_handle.set_title("Show").unwrap();
                    } else {
                        let pos = window.outer_position().unwrap();
                        window.set_position(pos).unwrap();
                        window.show().unwrap();
                        item_handle.set_title("Hide").unwrap();
                    }
                }
                _ => {}
            },
            _ => {}
        })
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            let win_arc = Arc::new(Mutex::new(window.to_owned()));
            window.listen("new_config", move |event| {
                let payload = event.payload().unwrap();
                if let Err(e) =
                    open_write_json_payload(&find_absolute_resource_path(SETTINGS_FILENAME), payload)
                {
                    eprintln!("error in writing new config: {e}");
                } else {
                    win_arc.lock().unwrap().emit("config_saved", "").unwrap();
                }
            });

            match read_json_file::<HashMap<String, serde_json::Value, RandomState>>(
                &find_absolute_resource_path(SETTINGS_FILENAME),
            ) {
                Ok(config) => {
                    if config.get("x").is_some() {
                        window.set_position(PhysicalPosition {
                            x: config["x"].as_f64().unwrap(),
                            y: config["y"].as_f64().unwrap(),
                        })?;
                        window.set_size(PhysicalSize {
                            width: config["width"].as_f64().unwrap(),
                            height: config["height"].as_f64().unwrap(),
                        })?;
                    }
                    window.to_owned().listen("front_is_up", move |_| {
                        window.emit("get_saved_config", config.to_owned()).unwrap();
                    });
                }
                Err(err) => eprintln!("{err}"),
            };
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn offline_translate(word: &str, lang: &str) -> Result<Value, &'static str> {
    let selected_lang;

    match lang {
        "en" => selected_lang = EN_DICT.to_owned(),
        "fr" => selected_lang = FR_DICT.to_owned(),
        "de" => selected_lang = DE_DICT.to_owned(),
        "es" => selected_lang = ES_DICT.to_owned(),
        "it" => selected_lang = IT_DICT.to_owned(),
        "fa" => selected_lang = FA_DICT.to_owned(),
        "ar" => selected_lang = AR_DICT.to_owned(),
        _ => return Err("language not found"),
    }

    if let Some(found) = selected_lang.get(word) {
        let val = found.to_owned();
        Ok(val)
    } else {
        Err("not found")
    }
}

#[tauri::command]
async fn online_translate(from: &str, to: &str, word: &str) -> Result<String, String> {
    let translator_struct = Translator { from, to };
    translator_struct.translate(&word).await
}

#[tauri::command]
async fn speak<'a>(word: String, lang: String) {
    if word.is_empty() {
        return;
    }
    let narrator = GTTSClient {
        volume: 1.0,
        language: match lang.as_str() {
            "en" => English,
            "fr" => French,
            "af" => Afrikaans,
            "ar" => Arabic,
            "bg" => Bulgarian,
            "bn" => Bengali,
            "bs" => Bosnian,
            "ca" => Catalan,
            "cs" => Czech,
            "cy" => Welsh,
            "da" => Danish,
            "de" => German,
            "el" => Greek,
            "eo" => Esperanto,
            "es" => Spanish,
            "et" => Estonian,
            "fi" => Finnish,
            "gu" => Gujarati,
            "hi" => Hindi,
            "hr" => Croatian,
            "hu" => Hungarian,
            "hy" => Armenian,
            "id" => Indonesian,
            "is" => Icelandic,
            "it" => Italian,
            "ja" => Japanese,
            "jw" => Javanese,
            "km" => Khmer,
            "kn" => Kannada,
            "ko" => Korean,
            "la" => Latin,
            "lv" => Latvian,
            "mk" => Macedonian,
            "ml" => Malayalam,
            "mr" => Marathi,
            "my" => MyanmarAKABurmese,
            "ne" => Nepali,
            "nl" => Dutch,
            "no" => Norwegian,
            "pl" => Polish,
            "pt" => Portuguese,
            "ro" => Romanian,
            "ru" => Russian,
            "si" => Sinhala,
            "sk" => Slovak,
            "sq" => Albanian,
            "sr" => Serbian,
            "su" => Sundanese,
            "sv" => Swedish,
            "sw" => Swahili,
            "ta" => Tamil,
            "te" => Telugu,
            "th" => Thai,
            "tl" => Filipino,
            "tr" => Turkish,
            "uk" => Ukrainian,
            "ur" => Urdu,
            "vi" => Vietnamese,
            "zh-CN" => Chinese,
            _ => English,
        },
    };
    narrator.speak(&word);
}

#[tauri::command]
async fn download_dict(abbr: &str, app_window: tauri::Window) -> Result<(), String> {
    let window = app_window.get_window("main").unwrap();
    helper::download_dict(abbr, window).await?;
    Ok(())
}

#[tauri::command]
async fn delete_dict(abbr: &str) -> Result<(), String> {
    if let Err(e) = delete_json_file(&find_absolute_resource_path(&format!("{JSON_DIR}/{abbr}"))) {
        return Err(e.to_string());
    }
    Ok(())
}
