#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[macro_use]
extern crate lazy_static;

mod google_translate;
mod helper;
use google_translate::Translator;
use helper::*;
use ijson::IValue;
use std::{
    fs,
    sync::{Arc, Mutex},
    thread,
};
use tauri::{
    CustomMenuItem, Manager, PhysicalPosition, PhysicalSize, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem, SystemTraySubmenu, WindowEvent,
};
use tts_rust::languages::Languages::*;
use tts_rust::GTTSClient;

fn main() {
    let quit = CustomMenuItem::new("quit", "Quit");
    let show_hide = CustomMenuItem::new("show_hide", "Hide");
    let mut clipboard = CustomMenuItem::new("clipboard".to_string(), "Translate Clipboard (On)");
    let mut selected_text_setting =
        CustomMenuItem::new("selected_text".to_string(), "Translate Selected Text (On)");
    let config_result = read_json_file::<IValue>(&find_absolute_path(
        CACHE_PATH_WITH_IDENTIFIER.to_string(),
        SETTINGS_FILENAME,
    ));
    let arc_translate_clip = Arc::new(Mutex::new(true));
    let arc_translate_selected_text = Arc::new(Mutex::new(true));
    let listener_clone_translate_selected_text = Arc::clone(&arc_translate_selected_text);
    if let Ok(conf) = config_result.as_ref() {
        *arc_translate_clip.lock().unwrap() = conf
            .get("translateClipboard")
            .unwrap_or(&IValue::TRUE)
            .to_bool()
            .unwrap();
        *arc_translate_selected_text.lock().unwrap() = conf
            .get("translateSelectedText")
            .unwrap_or(&IValue::TRUE)
            .to_bool()
            .unwrap();
        clipboard.title = if *arc_translate_clip.lock().unwrap() {
            "Translate Clipboard (On)".to_string()
        } else {
            "Translate Clipboard (Off)".to_string()
        };
        selected_text_setting.title = if *arc_translate_selected_text.lock().unwrap() {
            "Translate Selected Text (On)".to_string()
        } else {
            "Translate Selected Text (Off)".to_string()
        };
    }
    let setting_items = SystemTrayMenu::new()
        .add_item(clipboard)
        .add_item(selected_text_setting);
    let setting_menu = SystemTraySubmenu::new("Settings", setting_items);
    let tray_menu = SystemTrayMenu::new()
        .add_item(quit)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(show_hide)
        .add_submenu(setting_menu);
    let tray = SystemTray::new().with_menu(tray_menu);
    fn xsel_command() -> std::process::Output {
        std::process::Command::new("xsel")
            .output()
            .expect("failed to get shell output")
    }

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
            SystemTrayEvent::MenuItemClick { id, .. } => {
                let item_handle = app.tray_handle().get_item(&id);
                let window = app.get_window("main").unwrap();

                match id.as_str() {
                    "quit" => {
                        window.once("new_config", |event| {
                            let payload = event.payload().unwrap();
                            open_write_json_payload::<IValue>(
                                &find_absolute_path(
                                    CACHE_PATH_WITH_IDENTIFIER.to_string(),
                                    SETTINGS_FILENAME,
                                ),
                                payload,
                            )
                            .is_ok()
                            .then(|| std::process::exit(0));
                        });
                        window.emit("quit", "quit button in tray clicked").unwrap();
                    }
                    "show_hide" => {
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
                    "clipboard" => {
                        let tc = !*arc_translate_clip.lock().unwrap();
                        *arc_translate_clip.lock().unwrap() = tc;
                        let title = if tc { "On" } else { "Off" };
                        if let Err(err) = item_handle
                            .set_title(format!("Translate Clipboard ({title})"))
                            .and(window.emit(
                                "tray_settings",
                                (tc, *arc_translate_selected_text.lock().unwrap()),
                            ))
                        {
                            eprintln!("tray_settings clipboard error: {err}");
                        }
                    }
                    "selected_text" => {
                        let ts = !*arc_translate_selected_text.lock().unwrap();
                        *arc_translate_selected_text.lock().unwrap() = ts;
                        let title = if ts { "On" } else { "Off" };
                        xsel_command();
                        if let Err(err) =
                            item_handle
                                .set_title(format!("Translate Selected Text ({title})"))
                                .and(window.emit(
                                    "tray_settings",
                                    (*arc_translate_clip.lock().unwrap(), ts),
                                ))
                        {
                            eprintln!("tray_settings selected_text error: {err}");
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .setup(move |app| {
            let window = app.get_window("main").unwrap();

            if fs::metadata(CACHE_PATH_WITH_IDENTIFIER.to_string()).is_err() {
                fs::create_dir_all(CACHE_PATH_WITH_IDENTIFIER.to_string())
                    .or(Err("error while creating base app directory.".to_string()))?;
                println!(
                    "base dir created: {}",
                    CACHE_PATH_WITH_IDENTIFIER.to_string()
                );
            }

            let config_win = window.clone();
            window.listen("new_config", move |event| {
                let payload = event.payload().unwrap();
                if let Err(e) = open_write_json_payload::<IValue>(
                    &find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), SETTINGS_FILENAME),
                    payload,
                ) {
                    eprintln!(
                        "error in writing new config at {} : {e}",
                        CACHE_PATH_WITH_IDENTIFIER.to_string()
                    );
                } else {
                    config_win.emit("config_saved", "").unwrap();
                }
            });

            let set_win = window.clone();
            match config_result {
                Ok(config) => {
                    window.set_position(PhysicalPosition {
                        x: config["x"].to_f32().unwrap(),
                        y: config["y"].to_f32().unwrap(),
                    })?;
                    window.set_size(PhysicalSize {
                        width: config["width"].to_f32().unwrap(),
                        height: config["height"].to_f32().unwrap(),
                    })?;
                    window.listen("front_is_up", move |_| {
                        set_win.emit("get_saved_config", config.to_owned()).unwrap();
                    });
                }
                Err(err) => eprintln!("config result error: {err}"),
            };

            let thread_win = window.clone();
            let app_handle = app.handle();
            thread::spawn(move || {
                xsel_command(); // consume first xsel before startup
                let script = "window.addEventListener('click', () => window.close());";
                if let Ok(builder) = tauri::WindowBuilder::new(
                    &app_handle,
                    "translate_label",
                    tauri::WindowUrl::App("preview.html".into()),
                )
                .decorations(false)
                .transparent(true)
                .visible(false)
                .initialization_script(script)
                .position(0.0, 0.0)
                .inner_size(35.0, 35.0)
                .build()
                {
                    let arc_op = Arc::new(Mutex::new("".to_string()));
                    let clone_arc = Arc::clone(&arc_op);
                    let b = builder.to_owned();
                    builder.on_window_event(move |e| match e {
                        WindowEvent::Focused(is_focused) => {
                            if !*is_focused {
                                b.hide().unwrap();
                            }
                        }
                        WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            let output = &*arc_op.lock().unwrap();
                            let item_handle =
                                thread_win.app_handle().tray_handle().get_item("show_hide");
                            item_handle.set_title("Hide").unwrap(); // in front-end window.show() is called.
                            if let Err(err) = thread_win.emit("text_selected", output) {
                                eprintln!("{}", err.to_string());
                            }
                            b.hide().unwrap();
                        }
                        _ => {}
                    });

                    let mut mouse_position = PhysicalPosition { x: 0.0, y: 0.0 };
                    if let Err(err) = rdev::listen(move |ev| {
                        if !*listener_clone_translate_selected_text.lock().unwrap() {
                            return;
                        }
                        match ev.event_type {
                            rdev::EventType::MouseMove { x, y } => {
                                mouse_position = PhysicalPosition { x, y };
                            }
                            rdev::EventType::ButtonRelease(rdev::Button::Left) => {
                                let xsel = xsel_command();
                                let xsel = String::from_utf8(xsel.stdout)
                                    .or(Err("something went wrong in xsel"));
                                if let Ok(output) = xsel {
                                    let clip = tauri::ClipboardManager::read_text(
                                        &app_handle.clipboard_manager(),
                                    )
                                    .unwrap_or(Some(String::new()))
                                    .unwrap_or("".to_string());
                                    if output.trim() == "" || output == clip {
                                        return;
                                    }
                                    let output = output.trim().to_owned();
                                    *clone_arc.lock().unwrap() = output;
                                    builder
                                        .set_position(PhysicalPosition {
                                            x: mouse_position.x - 30.0,
                                            y: mouse_position.y - 40.0,
                                        })
                                        .and(builder.show())
                                        .unwrap();
                                }
                            }
                            rdev::EventType::KeyRelease(rdev::Key::Escape) => {
                                builder.hide().unwrap();
                            }
                            rdev::EventType::KeyRelease(rdev::Key::ShiftLeft)
                            | rdev::EventType::KeyRelease(rdev::Key::ShiftRight) => {
                                xsel_command(); // consume text selected using shift keys as it's better to ignore such selections.
                                ()
                            }
                            _ => {}
                        }
                    }) {
                        eprintln!("global listener err: {err:?}");
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn offline_translate(word: &str, lang: &str) -> Result<IValue, String> {
    let selected_lang;
    let word = word.to_lowercase();

    match lang {
        "en" => selected_lang = EN_DICT.as_ref(),
        "fr" => selected_lang = FR_DICT.as_ref(),
        "de" => selected_lang = DE_DICT.as_ref(),
        "es" => selected_lang = ES_DICT.as_ref(),
        "it" => selected_lang = IT_DICT.as_ref(),
        "fa" => selected_lang = FA_DICT.as_ref(),
        "pt" => selected_lang = PT_DICT.as_ref(),
        "zh-CN" => selected_lang = ZH_CN_DICT.as_ref(),
        "ar" => selected_lang = AR_DICT.as_ref(),
        _ => return Err("language not found".to_string()),
    }

    if let Some(found) = selected_lang?.get(&*word) {
        let val = found.to_owned();
        Ok(val)
    } else {
        Err("not found".to_string())
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
    if let Err(e) = delete_json_file(&find_absolute_path(
        CACHE_PATH_WITH_IDENTIFIER.to_string(),
        &format!("{JSON_DIR}/{abbr}"),
    )) {
        return Err(e.to_string());
    }
    Ok(())
}
