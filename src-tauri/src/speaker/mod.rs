pub mod languages;

use self::languages::Languages;
use std::{io::Cursor, time::Duration};

lazy_static! {
    static ref CLIENT: reqwest::Client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .use_rustls_tls()
        .build()
        .unwrap();
}

#[derive(Debug)]
pub struct GTTSClient {
    /// The volume of the audio. Must be between 0.0 and 1.0. Default is 1.0.
    ///
    /// recommended value is 1.0
    pub volume: f32,
    /// The language of the gTTS client (ISO code)
    ///
    /// example: Languages::English, Languages::Japanese
    pub language: Languages,
    /// top-level domain of the gTTS client
    ///
    /// example: "com"
    pub tld: &'static str,
}

impl GTTSClient {
    pub async fn get_sound(&self, text: &str) -> Result<Vec<u8>, String> {
        let len = text.len();
        let language = Languages::as_code(&self.language);
        let url = format!("https://translate.google.{}/translate_tts?ie=UTF-8&q={}&tl={}&total=1&idx=0&textlen={}&tl={}&client=tw-ob", self.tld, text, language, len, language);
        let rep = CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("{}", e))?;
        let bytes = rep.bytes().await.unwrap();

        if bytes.is_empty() || bytes.starts_with("<html".as_bytes()) {
            return Err("something went wrong".to_string());
        }

        Ok(bytes.to_vec())
    }
    fn play_mp3(&self, vec: Vec<u8>) {
        let (_s, handle) = rodio::OutputStream::try_default().unwrap();
        let file = Cursor::new(vec);
        let s = handle.play_once(file).unwrap();
        s.set_volume(self.volume);
        s.sleep_until_end();
    }

    /// Speak the input according to the volume and language
    pub async fn speak(&self, input: &str) -> Result<(), String> {
        let sound = self.get_sound(input).await?;
        self.play_mp3(sound);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::async_runtime::block_on;

    #[test]
    fn test() {
        let narrator = GTTSClient {
            language: Languages::English,
            tld: "com",
            volume: 1.0,
        };
        block_on(narrator.speak("Hello")).unwrap();
    }
}
