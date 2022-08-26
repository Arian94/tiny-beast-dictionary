#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[macro_use]
extern crate lazy_static;

mod google_translate;
mod helper;

use std::borrow::BorrowMut;
use std::collections::HashMap;
use std::sync::{Mutex, Once};

use google_translate::Translator;
use helper::{read_json_file, write_payload, EN_FA_DICT, SETTINGS_FILENAME};
use tauri::{
    CustomMenuItem, Manager, PhysicalPosition, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem,
};
use tts_rust::languages::Languages::*;
use tts_rust::GTTSClient;

// #[derive(Serialize, Deserialize, Debug)]
// struct SavedConfig {
//     active_tab: String,
//     from: String,
//     to: String,
//     x: u16,
//     y: u16,
// }

static mut STD_ONCE_COUNTER: Option<Mutex<&mut tauri::App>> = None;
static INIT: Once = Once::new();

// fn global_dict<'a>() -> &'a Mutex<HashMap<String, Vec<String>>> {
//     INIT.call_once(|| {
//         // Since this access is inside a call_once, before any other accesses, it is safe
//         unsafe {
//             let dict = prepare_json_dict(&EN_FA_JSON_PATH).unwrap();
//             /*STD_ONCE_COUNTER.borrow_mut() = Some(Mutex::new(dict));
//         }
//     });
//     // As long as this function is the only place with access to the static variable,
//     // giving out a read-only borrow here is safe because it is guaranteed no more mutable
//     // references will exist at this point or in the future.
//     unsafe { STD_ONCE_COUNTER.as_ref().unwrap() }
// }

fn main() {
    // println!("{:?}", *global_dict().lock().unwrap());
    // println!("{:?}", EN_FA_DICT.get("abandon"));
    // here `"quit".to_string()` defines the menu item id, and the second parameter is the menu item label.
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    let tray_menu = SystemTrayMenu::new()
        .add_item(quit)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide);
    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![find, google_translate, speak, download_dict])
        .system_tray(tray)
        .on_system_tray_event(move |app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => {
                    let window = app.get_window("main").unwrap();
                    window.once("new_config", |event| {
                        let payload = event.payload().unwrap();
                        write_payload(SETTINGS_FILENAME, payload)
                            .is_ok()
                            .then(|| std::process::exit(0));
                    });
                    window.emit("quit", "quit button clicked").unwrap();
                }
                "hide" => {
                    let item_handle = app.tray_handle().get_item(&id);
                    let window = app.get_window("main").unwrap();
                    println!("it is: {}", window.is_visible().unwrap_or(false));
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
            // INIT.call_once(|| {
            //     // Since this access is inside a call_once, before any other accesses, it is safe
            //     unsafe {
            //         // let dict = prepare_json_dict(&EN_FA_JSON_PATH).unwrap();
            //         *STD_ONCE_COUNTER.borrow_mut() = Some(Mutex::new(app));
            //     }
            // });

            let window = app.get_window("main").unwrap();

            match read_json_file::<HashMap<String, serde_json::Value>>(SETTINGS_FILENAME) {
                Ok(config) => {
                    window.set_position(PhysicalPosition {
                        x: config["x"].as_f64().unwrap(),
                        y: config["y"].as_f64().unwrap(),
                    })?;
                    window.to_owned().listen("front_is_up", move |_| {
                        window.emit("saved_config", config.to_owned()).unwrap();
                    });
                }
                Err(err) => println!("{err}"),
            };
            Ok(())
        })
        .on_window_event(|e| match e.event() {
            tauri::WindowEvent::CloseRequested { .. } => {
                let window = e.window().get_window("main").unwrap();
                window.to_owned().once("new_config", move |event| {
                    let payload = event.payload().unwrap();
                    write_payload(SETTINGS_FILENAME, payload)
                        .is_ok()
                        .then(|| window.close().unwrap());
                });
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn find(word: &str) -> Result<String, &str> {
    // let dict = &*global_dict().lock().unwrap();
    if let Some(found) = EN_FA_DICT.get(word) {
        let owned_word = found.to_owned();
        Ok(owned_word)
    } else {
        Err("not found")
    }
}

#[tauri::command]
async fn google_translate(from: &str, to: &str, word: &str) -> Result<String, String> {
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
async fn download_dict(name: &str, app_window: tauri::Window) -> Result<(), String> {
    let window = app_window.get_window("main").unwrap();
    helper::download_dict(name, window).await?;
    Ok(())
}