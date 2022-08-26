use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::error::Error;
use std::str::from_utf8;
use std::sync::{mpsc, Arc, Mutex};
use std::{collections::HashMap, fs::File, io::BufReader};
use tauri::async_runtime::block_on;

static JSON_DIR: &str = "json_dictionaries";
pub static SETTINGS_FILENAME: &str = "settings/settings.json";

struct OfflineDict<'a> {
    url: &'a str,
    length: u64,
}

#[derive(Serialize, Clone)]
struct DictDowlonadStatus<'a> {
    name: &'a str,
    percentage: u8,
}

lazy_static! {
    static ref EN_FA_JSON_PATH: String = format!("{}/en-fa.json", JSON_DIR);
    pub static ref EN_FA_DICT: HashMap<String, String> = read_json_file(&EN_FA_JSON_PATH).unwrap();
    static ref OFFLINE_DICTS: HashMap<&'static str, OfflineDict<'static>> = HashMap::from([
        (
            "english",
            OfflineDict {
                url: "https://kaikki.org/dictionary/French/by-pos/name/kaikki.org-dictionary-French-by-pos-name.json",
                length: 24
            }
        ),
        (
            "french",
            OfflineDict {
                url: "https://kaikki.org/dictionary/French/by-pos/pron/kaikki.org-dictionary-French-by-pos-pron.json",
                length: 7 * 1024 * 1024
            }
        ),
        (
            "german",
            OfflineDict {
                url: "dsa",
                length: 24
            }
        ),
        (
            "spanish",
            OfflineDict {
                url: "dsa",
                length: 24
            }
        ),
        (
            "italian",
            OfflineDict {
                url: "dsa",
                length: 24
            }
        ),
        (
            "persian",
            OfflineDict {
                url: "dsa",
                length: 24
            }
        ),
        (
            "arabic",
            OfflineDict {
                url: "dsa",
                length: 24
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

fn rectify_incorrect_string(mut file: String) -> Value {
    file.pop();
    file.insert(0, '[');
    file.push(']');
    let file = file.replace("}\n", "},");
    let file_value = serde_json::from_str::<Value>(&file).unwrap();
    file_value
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

pub async fn download_dict(name: &str, window: tauri::Window) -> Result<(), String> {
    let lower_name = name.to_lowercase();
    let lower_name_str = lower_name.as_str();
    let value = OFFLINE_DICTS.get(lower_name_str).unwrap();
    let res = reqwest::get(value.url)
        .await
        .or(Err("connection error".to_string()))?;
    let total_size = res.content_length().unwrap_or(value.length);
    let incorrect_vec_arc = Arc::new(Mutex::new(Vec::new()));
    let mut stream = res.bytes_stream();
    let (tx, rx) = mpsc::channel::<u8>();
    let arc_clone = Arc::clone(&incorrect_vec_arc);

    std::thread::spawn(move || -> Result<(), String> {
        let mut downloaded: u64 = 0;
        'blocking_while: while let Some(item) = block_on(stream.next()) {
            let chunk = item.or(Err(format!("error while downloading file")))?;
            let mut incorrect_vec = arc_clone.lock().unwrap();
            incorrect_vec.push(
                from_utf8(&chunk)
                    .or(Err(format!("invalid utf8 char")))?
                    .to_string(),
            );
            let len = chunk.len() as u64;
            let new_size = (downloaded + len) * 100 / total_size;
            downloaded += len;
            tx.send(new_size as u8)
                .or(Err(format!("error in sending message")))?;
            if new_size == 100 {
                break 'blocking_while;
            }
        }
        Ok(())
    });

    let now = std::time::Instant::now();
    let mut dur = std::time::Duration::new(2, 0);
    let emit_dl_status = |p: u8, event: &str, print_msg: &str| -> Result<(), String> {
        eprintln!("{print_msg} {p}%");
        window
            .emit(
                event,
                DictDowlonadStatus {
                    name,
                    percentage: p,
                },
            )
            .or(Err(format!("error in emitting payload")))?;
        Ok(())
    };

    'state_loop: loop {
        match rx.recv() {
            Ok(percentage) => {
                if dur > now.elapsed() {
                    continue;
                }
                emit_dl_status(percentage, "downloading", "downloading").unwrap();
                dur = std::time::Duration::new(dur.as_secs() + 2, 0);
            }
            Err(e) => {
                eprintln!("error: {e}");
                if !e.to_string().contains("closed channel") { return Err(format!("something went wrong")); }
                emit_dl_status(99, "downloading", "wait").unwrap();
                break 'state_loop;
            }
        }
    }

    let incorrect_vec = &*incorrect_vec_arc.lock().unwrap();
    let incorrect_string = incorrect_vec.join("");
    let correct_val = rectify_incorrect_string(incorrect_string);
    create_write_json_file(
        &find_absolute_path(&format!("{JSON_DIR}/{name}")),
        correct_val,
    )?;
    emit_dl_status(100, "download_finished", "download finished").unwrap();

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
        let d = block_on(download_dict("french", g)).unwrap();
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
