use futures_util::StreamExt;
use ijson::IObject;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::error::Error;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, Read, Write},
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    thread,
};
use tauri::{async_runtime::block_on, regex::Regex};
use xz::read::XzDecoder;

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
    pub static ref EN_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/en"))).or(Err(format!("error occurred for en dict")));
    pub static ref FR_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/fr"))).or(Err(format!("error occurred for fr dict")));
    pub static ref DE_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/de"))).or(Err(format!("error occurred for de dict")));
    pub static ref ES_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/es"))).or(Err(format!("error occurred for es dict")));
    pub static ref IT_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/it"))).or(Err(format!("error occurred for it dict")));
    pub static ref FA_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/fa"))).or(Err(format!("error occurred for fa dict")));
    pub static ref PT_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/pt"))).or(Err(format!("error occurred for pt dict")));
    pub static ref ZH_CN_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/zh-CN"))).or(Err(format!("error occurred for zh-CN dict")));
    pub static ref AR_DICT: Result<IObject, String> = read_json_file(&find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), &format!("{JSON_DIR}/ar"))).or(Err(format!("error occurred for ar dict")));
    pub static ref OFFLINE_DICTS: HashMap<&'static str, OfflineDict<'static>> = HashMap::from([
        (
            "en",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=1ZxMDBL-cAxIGVQ4KJR9iEVm_bXOJWnog",
                length_mb: 94,
                name: "English"
            }
        ),
        (
            "fr",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=11lUFTvd7fCKlHhxU3buxgAXslab-fiDC",
                length_mb: 25,
                name: "French"
            }
        ),
        (
            "de",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=1bf6JlXWCBkq1ieTAivPmtj2aicyCrxHc",
                length_mb: 41,
                name: "German"
            }
        ),
        (
            "es",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=1wHNS7BmbygZfitql5cYmBffweB9X0Iz9",
                length_mb: 39,
                name: "Spanish"
            }
        ),
        (
            "it",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=14urD7NVf-3CjKUsjwoaBFoRHOheohC4A",
                length_mb: 32,
                name: "Italian"
            }
        ),
        (
            "fa",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=1YWVECa-0YyMkk8LwlLuBr5aoQu_WzqnX",
                length_mb: 3,
                name: "Persian"
            }
        ),
        (
            "pt",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=1I9eKFLCKupfjioTkbL83yKyyNNttazLS",
                length_mb: 20,
                name: "Portuguese"
            }
        ),
        (
            "zh-CN",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=174MR_R1Kfcm-F9KoO5xmUBpHwZ2fmE4O",
                length_mb: 47,
                name: "Chinese"
            }
        ),
        (
            "ar",
            OfflineDict {
                url: "https://drive.google.com/uc?export=download&id=1H6cGUgs2mOLIcO1RSowVDDeFAju1KuFn",
                length_mb: 20,
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

pub fn open_write_json_payload<T>(filename: &str, payload: &str) -> Result<(), String>
where
    T: Serialize + DeserializeOwned + std::fmt::Debug,
{
    let name = format!("{filename}.json");
    let config_value = serde_json::from_str::<T>(payload).unwrap();

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

fn rectify_incorrect_string(
    incorrect_string: &String,
    abbr: &str,
    file_path: &str,
) -> Result<(), Box<dyn Error>> {
    let file_path = format!("{file_path}.json");
    let name = OFFLINE_DICTS
        .get(&abbr)
        .unwrap_or(&OfflineDict {
            url: "",
            length_mb: 0,
            name: "unknown",
        })
        .name;

    let dict_file = File::options()
        .create(true)
        .append(true)
        .open(&file_path)
        .unwrap();
    let dict_file_arc = Arc::new(Mutex::new(dict_file));
    let counter_arc = Arc::new(Mutex::new(0));

    let mut vector_of_lines = incorrect_string.split("\n").collect::<Vec<&str>>();
    vector_of_lines.pop();

    let l = vector_of_lines.len();
    let number_of_threads = 4;
    let slot = l / number_of_threads;

    let lines_1 = vector_of_lines.get(0..slot).unwrap().join("\n"); //* join by \n so that the regex will work correclty. */
    let lines_2 = vector_of_lines.get(slot..2 * slot).unwrap().join("\n");
    let lines_3 = vector_of_lines.get(2 * slot..3 * slot).unwrap().join("\n");
    let lines_4 = vector_of_lines.get(3 * slot..l).unwrap().join("\n");

    let all_four = vec![lines_1, lines_2, lines_3, lines_4];

    let mut threads = Vec::new();
    for lines in all_four {
        let abbr = abbr.to_owned();
        let dict_arc_clone = dict_file_arc.clone();
        let counter_arc_clone = counter_arc.clone();

        let thread = thread::spawn(move || -> Result<(), &str> {
            let mut correct_seg_string = String::new();
            let mut matches = JSON_REGEX.captures_iter(&lines);
            while let Some(c) = matches.next() {
                let removed_val = &c[0];
                let word = &c[1];
                let to_be_removed = format!(
                    "\"word\": \"{word}\", \"lang\": \"{name}\", \"lang_code\": \"{abbr}\","
                );
                let removed_val = removed_val.replace(&to_be_removed, "");
                let res = format!("\"{word}\":{removed_val},");
                correct_seg_string.push_str(&res);
            }

            if let Ok(file) = dict_arc_clone.lock().as_mut() {
                if let Ok(mut counter) = counter_arc_clone.lock() {
                    *counter += 1;
                    if *counter == 1 {
                        correct_seg_string.insert(0, '{');
                    }
                    if *counter == number_of_threads {
                        correct_seg_string.pop(); // pop last comma which is extra.
                        correct_seg_string.push('}');
                    }
                } else {
                    return Err("error in locking counter");
                }
                file.write_all(correct_seg_string.as_bytes())
                    .or(Err("error in writing chunk"))?;
                Ok(())
            } else {
                Err("error in locking file")
            }
        });
        threads.push(thread);
    }

    for thread in threads {
        thread.join().unwrap().unwrap();
    }

    Ok(())
}

fn create_write_json_file<T>(filename: &str, file_value: T) -> Result<(), String>
where
    T: Serialize + DeserializeOwned + std::fmt::Debug,
{
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

/// Neglecting the time it takes to download a dictionary, in devmode it would take 340 seconds (< 6 min) to rectify a 320 MB file
/// and write it to the storage.
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
    let tarxz_path = format!("{}/{}.tar.xz", CACHE_PATH_WITH_IDENTIFIER.to_string(), abbr);
    let tarxz_path_th = tarxz_path.clone();
    if fs::metadata(&tarxz_path).is_ok() {
        fs::remove_file(&tarxz_path).or(Err("error in deleting corrupted zip file".to_string()))?;
    }
    let tarxz_dict_file = File::options()
        .create(true)
        .append(true)
        .open(&tarxz_path)
        .unwrap();
    let tarxz_arc = Arc::new(Mutex::new(tarxz_dict_file));
    let tarxz_arc_clone = Arc::clone(&tarxz_arc);
    std::thread::spawn::<_, Result<(), &str>>(move || {
        let mut downloaded: u64 = 0;
        'blocking_while: while let Some(item) = block_on(stream.next()) {
            if let Ok(cancel_dl) = r_once_x.try_recv() {
                if cancel_dl {
                    win_arc.lock().unwrap().unlisten(ev_han);
                    fs::remove_file(tarxz_path_th).or(Err("error in deleting zip file"))?;
                    tx.send(-1).or(Err("error in sending cancel message"))?;
                    break 'blocking_while;
                }
            }
            let chunk = item.or(Err("error while downloading file"))?;
            if let Ok(file) = tarxz_arc_clone.lock().as_mut() {
                file.write_all(&chunk).or(Err("error in writing chunk"))?
            } else {
                return Err("error in locking zip file");
            }
            let len = chunk.len() as u64;
            let new_percentage = (downloaded + len) * 100 / total_size;
            downloaded += len;
            tx.send(new_percentage as i8)
                .or(Err("error in sending message"))?;
            if new_percentage == 100 {
                break 'blocking_while;
            }
        }
        Ok(())
    });
    let now = std::time::Instant::now();
    let mut dur = std::time::Duration::new(2, 0);
    let emit_dl_status = |p: i8, _print_msg: &str| -> Result<(), String> {
        // eprintln!("{_print_msg} {p}%");
        window
            .emit(
                "downloading",
                DictDowlonadStatus {
                    name: abbr,
                    percentage: p,
                },
            )
            .or(Err("error in emitting payload"))?;
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
                    return Err("something went wrong".to_string());
                }
                emit_dl_status(99, &format!("wait {abbr}")).unwrap();
                break 'state_loop;
            }
        }
    }

    let mut abs_json_dir = find_absolute_path(CACHE_PATH_WITH_IDENTIFIER.to_string(), JSON_DIR);
    if fs::metadata(&abs_json_dir).is_err() {
        fs::create_dir_all(&abs_json_dir)
            .or(Err("error while creating nested directory.".to_string()))?;
    }
    let file = File::open(&tarxz_path).unwrap();
    let decompressor = XzDecoder::new(file);
    tar::Archive::new(decompressor)
        .unpack(&abs_json_dir)
        .or(Err("error in unpacking".to_string()))?;
    let incorrect_file_path = format!("{abs_json_dir}/incorrect_{abbr}.json");
    let mut unpacked_file = File::open(&incorrect_file_path).or(Err("error in reading unpacked file"))?;
    let mut contents = String::new();
    unpacked_file.read_to_string(&mut contents).unwrap();
    abs_json_dir.push_str(&format!("/{abbr}"));
    if let Err(e) = rectify_incorrect_string(&contents, abbr, &abs_json_dir) {
        return Err(e.to_string());
    }
    fs::remove_file(tarxz_path).or(Err("error in deleting zip file".to_string()))?;
    fs::remove_file(incorrect_file_path).or(Err("error in deleting incorrect file".to_string()))?;
    eprintln!("downloaded: {abbr}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{download_dict, rectify_incorrect_string};
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
    use xz::read::XzDecoder;

    #[test]
    fn extract_zip_works() {
        let name = format!(
            "{}/incorrect_fa.tar.xz",
            tauri::api::path::download_dir().unwrap().to_str().unwrap()
        );
        let tarxz = File::open(name).unwrap();
        let decompressor = XzDecoder::new(tarxz);
        tar::Archive::new(decompressor).unpack(".").unwrap();
    }

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

        let corr =
            rectify_incorrect_string(&mut incorrect_string, "fr", "rectified_test_fr").unwrap();
        assert_eq!((), corr);
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

// #[derive(Debug, Clone)]
// struct EtymologyTemplate {
//     name: String,
//     expansion: String,
// }

// #[derive(Debug, Clone)]
// struct Category {
//     name: Option<String>,
// }

// #[derive(Debug, Clone)]
// struct FormOf {
//     word: String,
// }

// #[derive(Debug, Clone)]
// struct Example {
//     text: String,
//     r#ref: String,
//     english: Option<String>,
//     r#type: String,
// }

// #[derive(Debug, Clone)]
// struct Sense {
//     categories: Vec<Category>,
//     glosses: Vec<String>,
//     tags: Option<Vec<String>>,
//     form_of: Option<FormOf>,
//     examples: Option<Vec<Example>>,
// }

// #[derive(Debug, Clone)]
// struct Forms {
//     form: String,
//     tags: Vec<String>,
// }

// #[derive(Debug, Clone)]
// struct Sound {
//     ipa: String,
//     tags: Option<Vec<String>>,
//     homophone: Option<String>,
// }

// #[derive(Debug, Clone)]
// pub struct OfflineTranslation {
//     etymology_text: Option<String>,
//     etymology_templates: Option<Vec<EtymologyTemplate>>,
//     senses: Vec<Sense>,
//     pos: String,
//     related: Vec<FormOf>,
//     forms: Option<Forms>,
//     sounds: Vec<Sound>,
//     lang: String,
//     lang_code: String,
//     wikipedia: Option<Vec<String>>,
// }
