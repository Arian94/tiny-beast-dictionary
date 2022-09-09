use ahash::RandomState;
use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::error::Error;
use std::io::Read;
use std::path::PathBuf;
use std::str::from_utf8;
use std::sync::{mpsc, Arc, Mutex};
use std::{collections::HashMap, fs::File};
use std::{fs, io, thread};
use tauri::{async_runtime::block_on, regex::Regex};

pub static JSON_DIR: &str = "json_dictionaries";
pub static SETTINGS_FILENAME: &str = "settings";

pub struct OfflineDict<'a> {
    url: &'a str,
    length_mb: u64,
    name: &'a str,
}

#[derive(Serialize, Clone)]
struct DictDowlonadStatus<'a> {
    name: &'a str,
    percentage: i8,
}

lazy_static! {
    static ref JSON_REGEX: Regex = Regex::new(r#"(?m).*"word": "([^"]+)", "lang".*"#).unwrap();
    static ref RESOURCE_PATH_BUF: PathBuf = tauri::api::path::resource_dir(tauri::generate_context!().package_info(), &tauri::Env::default()).unwrap();
    static ref IDENTIFIER: String = format!("{}", tauri::generate_context!().config().tauri.bundle.identifier);
    static ref CACHE_PATH_BUF: PathBuf = tauri::api::path::cache_dir().unwrap();
    pub static ref CACHE_PATH_WITH_IDENTIFIER: String = format!("{}/{}", CACHE_PATH_BUF.to_str().unwrap(), IDENTIFIER.to_string());
    pub static ref EN_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/en"))).or(Err(format!("en dict not found")));
    pub static ref FR_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/fr"))).or(Err(format!("fr dict not found")));
    pub static ref DE_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/de"))).or(Err(format!("de dict not found")));
    pub static ref ES_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/es"))).or(Err(format!("es dict not found")));
    pub static ref IT_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/it"))).or(Err(format!("it dict not found")));
    pub static ref FA_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/fa"))).or(Err(format!("fa dict not found")));
    pub static ref AR_DICT: Result<HashMap<String, Value, RandomState>, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/ar"))).or(Err(format!("ar dict not found")));
    pub static ref OFFLINE_DICTS: HashMap<&'static str, OfflineDict<'static>> = HashMap::from([
        (
            "en",
            OfflineDict {
                url: "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.json",
                length_mb: 1536,
                name: "English"
            }
        ),
        (
            "fr",
            OfflineDict {
                url: "https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.json",
                // url: "https://kaikki.org/dictionary/French/by-pos/pron/kaikki.org-dictionary-French-by-pos-pron.json", // 300kb
                // url: "https://kaikki.org/dictionary/French/by-pos/adv/kaikki.org-dictionary-French-by-pos-adv.json", //4mb
                length_mb: 324,
                name: "French"
            }
        ),
        (
            "de",
            OfflineDict {
                url: "https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.json",
                length_mb: 686,
                name: "German"
            }
        ),
        (
            "es",
            OfflineDict {
                url: "https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.json",
                length_mb: 617,
                name: "Spanish"
            }
        ),
        (
            "it",
            OfflineDict {
                url: "https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.json",
                length_mb: 424,
                name: "Italian"
            }
        ),
        (
            "fa",
            OfflineDict {
                url: "https://kaikki.org/dictionary/Persian/kaikki.org-dictionary-Persian.json",
                length_mb: 54,
                name: "Persian"
            }
        ),
        (
            "ar",
            OfflineDict {
                url: "https://kaikki.org/dictionary/Arabic/kaikki.org-dictionary-Arabic.json",
                length_mb: 429,
                name: "Arabic"
            }
        )
    ]);
}

pub fn find_absolute_path(base_path: String, path: &str) -> String {
    let absolute_path = format!("{}/{}", base_path, path);
    absolute_path
}

pub fn read_json_file<T>(path: &str) -> Result<T, Box<dyn Error>>
where
    T: DeserializeOwned + std::fmt::Debug,
{
    let name = format!("{path}.json");
    let mut file = File::open(name)?;
    let mut s = String::new();
    file.read_to_string(&mut s).unwrap();
    let json_file = serde_json::from_str(&s)?;
    Ok(json_file)
}

pub fn delete_json_file(path: &str) -> io::Result<()> {
    let name = format!("{path}.json");
    fs::remove_file(name)?;
    Ok(())
}

pub fn open_write_json_payload(filename: &str, payload: &str) -> Result<(), String> {
    let name = format!("{filename}.json");
    let config_value = serde_json::from_str::<Value>(payload).unwrap();

    match File::options().write(true).truncate(true).open(&name) {
        Ok(file) => {
            match serde_json::to_writer(file, &config_value) {
                Ok(it) => return Ok(it),
                Err(err) => return Err(err.to_string()),
            };
        }
        Err(err) => {
            eprintln!("open_write_json_payload: {err}");
            create_write_json_file(&filename, config_value)
        }
    }
}

fn rectify_incorrect_string(incorrect_string: String, abbr: &str) -> Value {
    let correct_string_arc = Arc::new(Mutex::new(String::new()));
    let name = OFFLINE_DICTS
        .get(&abbr)
        .unwrap_or(&OfflineDict {
            url: "",
            length_mb: 0,
            name: "unknown",
        })
        .name;

    let mut vector_of_lines = incorrect_string
        .split("\n")
        .map(|s| s.to_string())
        .collect::<Vec<String>>();
    vector_of_lines.pop();

    let l = vector_of_lines.len();
    let slot = l / 4;

    let lines_1 = vector_of_lines.get(0..slot).unwrap().join("\n"); //* join by \n so that the regex will work correclty. */
    let lines_2 = vector_of_lines.get(slot..2 * slot).unwrap().join("\n");
    let lines_3 = vector_of_lines.get(2 * slot..3 * slot).unwrap().join("\n");
    let lines_4 = vector_of_lines.get(3 * slot..l).unwrap().join("\n");

    let all_four = vec![lines_1, lines_2, lines_3, lines_4];

    let mut threads = Vec::new();
    for lines in all_four {
        let owned_abbr = abbr.to_owned();
        let cln = correct_string_arc.clone();

        let thread = thread::spawn(move || {
            let mut correct_seg_string = String::new();
            let mut matches = JSON_REGEX.captures_iter(&lines);
            while let Some(c) = matches.next() {
                let removed_val = &c[0];
                let word = &c[1];
                let to_be_removed = format!(
                    "\"word\": \"{word}\", \"lang\": \"{name}\", \"lang_code\": \"{owned_abbr}\","
                );
                let removed_val = removed_val.replace(&to_be_removed, "");
                let res = format!("\"{word}\":{removed_val},");
                correct_seg_string.push_str(&res);
            }
            let mut correct_string = cln.lock().unwrap();
            correct_string.push_str(&correct_seg_string);
        });

        threads.push(thread);
    }

    for thread in threads {
        thread.join().unwrap();
    }

    let mut correct_string = correct_string_arc.lock().unwrap();
    correct_string.pop(); // in the loop, an additional ',' will be pushed which must be removed to make it a valid json.
    correct_string.insert(0, '{');
    correct_string.push('}');
    let correct_val = serde_json::from_str::<Value>(&correct_string).unwrap();
    correct_val
}

fn create_write_json_file(filename: &str, file_value: Value) -> Result<(), String> {
    let name = format!("{filename}.json");
    match File::create(name) {
        Ok(file) => {
            if let Err(err) = serde_json::to_writer(file, &file_value) {
                Err(err.to_string())
            } else {
                Ok(())
            }
        }
        Err(err) => return Err(err.to_string()),
    }
}

/// Neglecting the time it takes to download a dictionary, it would take 558 seconds (9 min) to rectify a 320 MB file
/// and write it to the storage (6 min for rectifying, 3 min for writing).
pub async fn download_dict(abbr: &str, window: tauri::Window) -> Result<(), String> {
    let once_abbr = abbr.to_owned();
    let (t_once_x, r_once_x) = mpsc::channel::<bool>();
    let win_arc = Arc::new(Mutex::new(window.to_owned()));
    let ev_han = window.listen("cancel_download", move |event| {
        if event.payload().unwrap() == once_abbr {
            if let Err(e) = t_once_x.send(true) {
                eprintln!("{}", e.to_string());
            }
        }
    });
    let value = OFFLINE_DICTS.get(&abbr).unwrap();
    let res = reqwest::get(value.url)
        .await
        .or(Err("connection error".to_string()))?;
    let total_size = res
        .content_length()
        .unwrap_or(value.length_mb * 1024 * 1024);
    let mut stream = res.bytes_stream();
    let (tx, rx) = mpsc::channel::<i8>();
    let incorrect_string_arc = Arc::new(Mutex::new(String::new()));
    let incorrect_str_arc_clone = Arc::clone(&incorrect_string_arc);
    std::thread::spawn::<_, Result<(), String>>(move || {
        let mut downloaded: u64 = 0;
        'blocking_while: while let Some(item) = block_on(stream.next()) {
            match r_once_x.try_recv() {
                Ok(cancel_dl) => {
                    if cancel_dl {
                        win_arc.lock().unwrap().unlisten(ev_han);
                        tx.send(-1)
                            .or(Err("error in sending cancel message".to_string()))?;
                        break 'blocking_while;
                    }
                }
                _ => {}
            }

            let chunk = item.or(Err(format!("error while downloading file")))?;
            let mut incorrect_string = incorrect_str_arc_clone.lock().unwrap();
            incorrect_string.push_str(from_utf8(&chunk).or(Err(format!("invalid utf8 char")))?);
            let len = chunk.len() as u64;
            let new_percentage = (downloaded + len) * 100 / total_size;
            downloaded += len;
            tx.send(new_percentage as i8)
                .or(Err(format!("error in sending message")))?;
            if new_percentage == 100 {
                break 'blocking_while;
            }
        }
        Ok(())
    });
    let now = std::time::Instant::now();
    let mut dur = std::time::Duration::new(2, 0);
    let emit_dl_status = |p: i8, _print_msg: &str| -> Result<(), String> {
        // eprintln!("{print_msg} {p}%");
        window
            .emit(
                "downloading",
                DictDowlonadStatus {
                    name: abbr,
                    percentage: p,
                },
            )
            .or(Err(format!("error in emitting payload")))?;
        Ok(())
    };

    'state_loop: loop {
        match rx.recv() {
            Ok(percentage) => {
                if percentage == -1 {
                    return Err("download canceled".to_string());
                }
                if dur > now.elapsed() {
                    continue;
                }
                emit_dl_status(percentage, &format!("downloading {abbr}")).unwrap();
                dur = std::time::Duration::new(dur.as_secs() + 2, 0);
            }
            Err(e) => {
                eprintln!("error: {e}");
                if !e.to_string().contains("closed channel") {
                    return Err(format!("something went wrong"));
                }
                emit_dl_status(99, &format!("wait {abbr}")).unwrap();
                break 'state_loop;
            }
        }
    }

    let incorrect_string = &*incorrect_string_arc.lock().unwrap();
    let correct_val = rectify_incorrect_string(incorrect_string.to_string(), abbr);

    if fs::metadata(find_absolute_path(
        CACHE_PATH_WITH_IDENTIFIER.to_string(),
        &format!("{JSON_DIR}"),
    ))
    .is_err()
    {
        fs::create_dir_all(find_absolute_path(
            CACHE_PATH_WITH_IDENTIFIER.to_string(),
            &format!("{JSON_DIR}"),
        ))
        .or(Err("error while creating nested directory.".to_string()))?;
    }

    create_write_json_file(
        &find_absolute_path(
            CACHE_PATH_WITH_IDENTIFIER.to_string(),
            &format!("{JSON_DIR}/{abbr}"),
        ),
        correct_val,
    )?;
    eprintln!("downloaded: {abbr}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_write_json_file, download_dict, rectify_incorrect_string};
    use fast_image_resize as fr;
    use icns::{IconFamily, Image};
    use image::codecs::png::PngEncoder;
    use image::io::Reader as ImageReader;
    use image::{ColorType, ImageEncoder};
    use license::{Gfdl1_3OrLater, License};
    use std::io::{Read, Write};
    use std::{
        fs::File,
        io::{BufReader, BufWriter},
        num::NonZeroU32,
    };
    use tauri::async_runtime::block_on;
    use tauri::Manager;

    #[test]
    fn download_dict_works() {
        let g = tauri::Builder::default()
            .any_thread()
            .build(tauri::generate_context!())
            .unwrap()
            .get_window("main")
            .unwrap();
        let d = block_on(download_dict("fr", g)).unwrap();
        assert_eq!((), d);
    }

    #[test]
    fn benchmark_rectification_writing_dict() {
        println!("starting");
        let name = format!(
            "{}/incorrect_fr.json",
            tauri::api::path::download_dir().unwrap().to_str().unwrap()
        );
        let mut file = File::open(name).unwrap();
        let mut incorrect_string = String::new();
        file.read_to_string(&mut incorrect_string).unwrap();
        println!("file is stringified");

        let now = std::time::Instant::now();
        let corr = rectify_incorrect_string(incorrect_string, "fr");
        println!("file is rectified after {} seconds", now.elapsed().as_secs());
        create_write_json_file("rectified_test_fr", corr).unwrap();
        println!("all done after {} seconds", now.elapsed().as_secs());
    }

    #[test]
    fn make_icons() {
        let mut icon_family = IconFamily::new();
        let icon_png_path = "icons/icon.png";
        // Read in another icon from a PNG file, and add it to the icon family.
        let file = BufReader::new(File::open(icon_png_path).unwrap());
        let image = Image::read_png(file).unwrap();
        icon_family.add_icon(&image).unwrap();

        // Save the updated icon family to a new ICNS file.
        let file = BufWriter::new(File::create("icons/icon.icns").unwrap());
        icon_family.write(file).unwrap();

        // Create a new, empty icon collection:
        let mut icon_dir = ico::IconDir::new(ico::ResourceType::Icon);
        let file = std::fs::File::open("icons/icon.png").unwrap();
        let image = ico::IconImage::read_png(file).unwrap();
        icon_dir.add_entry(ico::IconDirEntry::encode(&image).unwrap());
        let rgba = vec![std::u8::MAX; 4 * 16 * 16];
        let image = ico::IconImage::from_rgba_data(16, 16, rgba);
        icon_dir.add_entry(ico::IconDirEntry::encode(&image).unwrap());
        // Finally, write the ICO file to disk:
        let file = std::fs::File::create("icons/icon.ico").unwrap();
        icon_dir.write(file).unwrap();

        // Read source image from file
        let img = ImageReader::open(icon_png_path).unwrap().decode().unwrap();
        let width = NonZeroU32::new(img.width()).unwrap();
        let height = NonZeroU32::new(img.height()).unwrap();
        let mut src_image = fr::Image::from_vec_u8(
            width,
            height,
            img.to_rgba8().into_raw(),
            fr::PixelType::U8x4,
        )
        .unwrap();

        // Create MulDiv instance
        let alpha_mul_div = fr::MulDiv::default();
        // Multiple RGB channels of source image by alpha channel
        // (not required for the Nearest algorithm)
        alpha_mul_div
            .multiply_alpha_inplace(&mut src_image.view_mut())
            .unwrap();

        let sizes = [30, 32, 44, 71, 89, 107, 128, 142, 150, 284, 310];

        sizes.into_iter().for_each(|size| {
            // Create container for data of destination image
            let dst_size = NonZeroU32::new(size).unwrap();
            let mut dst_image = fr::Image::new(dst_size, dst_size, src_image.pixel_type());

            // Get mutable view of destination image data
            let mut dst_view = dst_image.view_mut();

            // Create Resizer instance and resize source image
            // into buffer of destination image
            let mut resizer =
                fr::Resizer::new(fr::ResizeAlg::Convolution(fr::FilterType::Lanczos3));
            resizer.resize(&src_image.view(), &mut dst_view).unwrap();

            // Divide RGB channels of destination image by alpha
            alpha_mul_div.divide_alpha_inplace(&mut dst_view).unwrap();

            let mut path = String::new();

            if size == 32 || size == 128 {
                path.push_str(&format!("icons/{size}x{size}.png"));
            } else {
                path.push_str(&format!("icons/Square{size}x{size}Logo.png"));
            }
            // Write destination image as PNG-file
            let mut result_buf = BufWriter::new(File::create(path).unwrap());
            PngEncoder::new(&mut result_buf)
                .write_image(
                    dst_image.buffer(),
                    dst_size.get(),
                    dst_size.get(),
                    ColorType::Rgba8,
                )
                .unwrap();
        });
    }

    #[test]
    fn add_license_works() {
        let gfdl = Gfdl1_3OrLater.text().as_bytes();
        let c = File::create("../LICENSE-GFDL").unwrap().write_all(gfdl);
        assert_eq!(c.unwrap(), ());
    }
}
