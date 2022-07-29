#[cfg(test)]
pub mod tests {
    use crate::{EN_FA_JSON_PATH, EN_FA_RAW_PATH, SHEET_NAME};
    use calamine::{open_workbook, Reader, Xlsx};
    use fast_image_resize as fr;
    use icns::{IconFamily, Image};
    use image::codecs::png::PngEncoder;
    use image::io::Reader as ImageReader;
    use image::{ColorType, ImageEncoder};
    use std::{
        collections::HashMap,
        fs::File,
        io::{BufReader, BufWriter},
        num::NonZeroU32,
    };

    fn read_en_fa_excel_dictionary_file(path: &str, sheet_name: &str) -> Result<(), String> {
        let mut excel: Xlsx<_> = open_workbook(path).unwrap();

        if let Some(Err(error)) = excel.worksheet_range(sheet_name) {
            return Err(error.to_string());
        }

        if excel.worksheet_range(sheet_name).is_none() {
            return Err(String::from("something wrong about the file."));
        }

        let range = excel.worksheet_range(sheet_name).unwrap().unwrap();
        let mut dict = HashMap::new();
        let mut value_buffer = String::new();
        let mut previous_key = range.get((0,0)).unwrap().get_string().unwrap();
        let mut current_key = "";

        range.rows().for_each(|row| {
            current_key = row[0].get_string().unwrap();
            let current_value = row[1].get_string().unwrap().to_string();

            if previous_key == current_key {
                let val = format!("، {current_value}");
                value_buffer.push_str(&val);
            } else {
                dict.insert(previous_key.to_string(), value_buffer.clone());
                value_buffer = current_value;
                previous_key = current_key;
            }
        });

        dict.insert(current_key.to_string(), value_buffer);

        let path: Box<&str> = Box::new(&EN_FA_JSON_PATH);
        let mut _file = match File::create(path.as_ref()) {
            Ok(it) => {
                match serde_json::to_writer(it, &dict) {
                    Ok(it) => return Ok(it),
                    Err(err) => return Err(err.to_string()),
                };
            }
            Err(err) => return Err(err.to_string()),
        };
    }

    #[test]
    fn read_raw_excel_write_to_json() {
        assert_eq!(
            read_en_fa_excel_dictionary_file(&EN_FA_RAW_PATH, &SHEET_NAME),
            Ok(())
        );
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
        let img = ImageReader::open(icon_png_path)
            .unwrap()
            .decode()
            .unwrap();
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
