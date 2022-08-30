use ahash::RandomState;
use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::error::Error;
use std::str::from_utf8;
use std::sync::{mpsc, Arc, Mutex};
use std::{collections::HashMap, fs::File, io::BufReader};
use tauri::async_runtime::block_on;
use tauri::regex::Regex;

static JSON_DIR: &str = "json_dictionaries";
pub static SETTINGS_FILENAME: &str = "settings/settings.json";

pub struct OfflineDict<'a> {
    url: &'a str,
    length: u64,
    name: &'a str,
}

#[derive(Serialize, Clone)]
struct DictDowlonadStatus<'a> {
    name: &'a str,
    percentage: i8,
}

lazy_static! {
    static ref JSON_REGEX: Regex = Regex::new(r#"(?m).*"word": "([^"]+)", "lang".*"#).unwrap();
    pub static ref EN_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/en.json")).unwrap();
    pub static ref FR_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/fr.json")).unwrap();
    pub static ref DE_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/de.json")).unwrap();
    pub static ref ES_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/es.json")).unwrap();
    pub static ref IT_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/it.json")).unwrap();
    pub static ref FA_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/fa.json")).unwrap();
    pub static ref AR_DICT: HashMap<String, Value, RandomState> = read_json_file(&format!("{JSON_DIR}/ar.json")).unwrap();
    pub static ref OFFLINE_DICTS: HashMap<&'static str, OfflineDict<'static>> = HashMap::from([
        (
            "en",
            OfflineDict {
                url: "https://kaikki.org/dictionary/French/by-pos/name/kaikki.org-dictionary-French-by-pos-name.json", // 7.3mb
                // url: "https://kaikki.org/dictionary/French/by-pos/pron/kaikki.org-dictionary-French-by-pos-pron.json", // 300kb
                length: 24,
                name: "English"
            }
        ),
        (
            "fr",
            OfflineDict {
                // url: "https://kaikki.org/dictionary/French/by-pos/pron/kaikki.org-dictionary-French-by-pos-pron.json", // 300kb
                url: "https://kaikki.org/dictionary/French/by-pos/adv/kaikki.org-dictionary-French-by-pos-adv.json", //4mb
                length: 7 * 1024 * 1024,
                name: "French"
            }
        ),
        (
            "de",
            OfflineDict {
                url: "dsa",
                length: 24,
                name: "German"
            }
        ),
        (
            "es",
            OfflineDict {
                url: "dsa",
                length: 24,
                name: "Spanish"
            }
        ),
        (
            "it",
            OfflineDict {
                url: "dsa",
                length: 24,
                name: "Italian"
            }
        ),
        (
            "fa",
            OfflineDict {
                url: "https://kaikki.org/dictionary/Persian/by-pos/particle/kaikki.org-dictionary-Persian-by-pos-particl-ZyLl7P",
                length: 24,
                name: "Persian"
            }
        ),
        (
            "ar",
            OfflineDict {
                url: "dsa",
                length: 24,
                name: "Arabic"
            }
        )
    ]);
}

pub fn find_absolute_path(path: &str) -> String {
    let env = tauri::Env::default();
    let context = tauri::generate_context!();
    let path_buf = tauri::api::path::resource_dir(context.package_info(), &env).unwrap();
    let absolute_path = format!("{}/{}", path_buf.to_str().unwrap(), path);
    absolute_path
}

pub fn read_json_file<T>(json_path: &str) -> Result<T, Box<dyn Error>>
where
    T: DeserializeOwned + std::fmt::Debug,
{
    let absolute_path = find_absolute_path(json_path);
    let file = File::open(absolute_path)?;
    let reader = BufReader::new(file);
    let json_file = serde_json::from_reader(reader)?;
    Ok(json_file)
}

pub fn write_payload(filename: &str, payload: &str) -> Result<(), String> {
    let absolute_path = find_absolute_path(filename);
    let config_value = serde_json::from_str::<Value>(payload).unwrap();

    match File::options()
        .write(true)
        .truncate(true)
        .open(absolute_path)
    {
        Ok(file) => {
            match serde_json::to_writer(file, &config_value) {
                Ok(it) => return Ok(it),
                Err(err) => return Err(err.to_string()),
            };
        }
        Err(err) => Err(err.to_string()),
    }
}

fn rectify_incorrect_string(incorrect_string: String, abbr: &str) -> Value {
    let mut correct_val = String::new();
    let name = OFFLINE_DICTS.get(&abbr).unwrap().name;

    JSON_REGEX.captures_iter(&incorrect_string).for_each(|c| {
        let val = &c[0];
        let k = &c[1];
        let to_be_removed =
            format!("\"word\": \"{k}\", \"lang\": \"{name}\", \"lang_code\": \"{abbr}\",");
        let mut removed_val = val.replace(&to_be_removed, "");
        removed_val.push(',');
        let res = format!("\"{k}\":{removed_val}");
        correct_val.push_str(&res);
    });

    correct_val.pop(); // in the loop, an additional ',' will be pushed which must be removed to make it a valid json.
    correct_val.insert(0, '{');
    correct_val.push('}');
    let correct_val = serde_json::from_str::<Value>(&correct_val).unwrap();
    correct_val
}

fn create_write_json_file(filename: &str, file_value: Value) -> Result<(), String> {
    let name = format!("{filename}.json");
    match File::create(name) {
        Ok(file) => {
            match serde_json::to_writer(file, &file_value) {
                Ok(it) => return Ok(it),
                Err(err) => return Err(err.to_string()),
            };
        }
        Err(err) => return Err(err.to_string()),
    };
}

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
    let total_size = res.content_length().unwrap_or(value.length);
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
    let emit_dl_status = |p: i8, print_msg: &str| -> Result<(), String> {
        eprintln!("{print_msg} {p}%");
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

    create_write_json_file(
        &find_absolute_path(&format!("{JSON_DIR}/{abbr}")),
        correct_val,
    )?;
    eprintln!("downloaded: {abbr}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::download_dict;
    use fast_image_resize as fr;
    use icns::{IconFamily, Image};
    use image::codecs::png::PngEncoder;
    use image::io::Reader as ImageReader;
    use image::{ColorType, ImageEncoder};
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
        let file = std::fs::File::open("icons/128x128.png").unwrap();
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
}
