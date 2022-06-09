#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[macro_use]
extern crate lazy_static;

mod helper;
mod google_translate;

use std::error::Error;
use std::io::BufReader;
use std::{collections::HashMap, fs::File};
use google_translate::Translator;

static JSON_DIR: &str = "json_dictionaries";
static RAW_DIR: &str = "raw_dictionaries";

lazy_static! {
    static ref SHEET_NAME: &'static str = "EnglishPersianWordDatabase";
    static ref EN_FA_RAW_PATH: String = format!("{}/dictionary.xlsx", RAW_DIR);     // "dictionary.xlsx";
    static ref EN_FA_JSON_PATH: String = format!("{}/en-fa.json", JSON_DIR);        // "en-fa.json";
    static ref EN_FA_DICT: HashMap<String, Vec<String>> = prepare_json_dict(&EN_FA_JSON_PATH).unwrap();
}

// static mut STD_ONCE_COUNTER: Option<Mutex<HashMap<String, Vec<String>>>> = None;
// static INIT: Once = Once::new();

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

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![find, google_translate])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn prepare_json_dict(dictionary_path: &str) -> Result<HashMap<String, Vec<String>>, Box<dyn Error>> {
    let env = tauri::Env::default();
    let context = tauri::generate_context!();
    let path_buf = tauri::api::path::resource_dir(context.package_info(), &env).unwrap();
    let absolute_path = format!("{}/{}", path_buf.to_str().unwrap(), dictionary_path);
    let file = File::open(absolute_path)?;
    let reader = BufReader::new(file);
    let dict: HashMap<String, Vec<String>> = serde_json::from_reader(reader)?;

    Ok(dict)
}

#[tauri::command]
fn find(word: &str) -> Result<Vec<String>, &str> {
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
    let translator_struct = Translator{
        from,
        to
    };
    translator_struct.translate(&word).await
}