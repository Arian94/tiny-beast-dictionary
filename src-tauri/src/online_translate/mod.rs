mod cambridge_translate;
mod google_translate;
mod other_online_translate;

use self::other_online_translate::{MyMemoryTranslation, OtherTranslator};
use serde::Serialize;
use std::{thread, time::Duration};
use tauri::async_runtime::block_on;

lazy_static! {
    pub static ref CLIENT: reqwest::Client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .use_rustls_tls()
        .build()
        .unwrap();
}

pub struct OnlineTranslator<'a> {
    pub to: &'a str,
    pub from: &'a str,
}

#[derive(Serialize)]
pub struct OnlineTranslation {
    google: String,
    cambridge: String,
    sentencedict: String,
    mymemory: Vec<MyMemoryTranslation>,
}

impl OnlineTranslator<'_> {
    pub async fn translate(&self, text: &str) -> Result<OnlineTranslation, String> {
        let text = text.trim().to_lowercase();
        thread::scope(|s| {
            let google_s = s.spawn(|| {
                block_on(async {
                    google_translate::Translator {
                        from: self.from,
                        to: self.to,
                    }
                    .translate(&text)
                    .await
                })
            });

            let sentencedict_s = s.spawn(|| {
                block_on(async {
                    if self.from == "auto" || self.from == "en" {
                        OtherTranslator::sentencedict_translate(&text).await
                    } else {
                        Ok("".to_string())
                    }
                })
            });

            let cambridge_s = s.spawn(|| {
                block_on(async {
                    cambridge_translate::Translator {
                        from: self.from,
                        to: self.to,
                    }
                    .translate(&text)
                    .await
                })
            });

            let mymemory_s = s.spawn(|| {
                block_on(async {
                    OtherTranslator::mymemory_translate(&text, self.from, self.to).await
                })
            });

            let google = google_s.join().unwrap();
            let cambridge = cambridge_s.join().unwrap();
            let sentencedict = sentencedict_s.join().unwrap();
            let mymemory = mymemory_s.join().unwrap();

            if let Err(e) = google {
                return Err(e);
            }
            if let Err(e) = cambridge {
                return Err(e);
            }
            if let Err(e) = mymemory {
                return Err(e);
            }
            if let Err(e) = sentencedict {
                return Err(e);
            }

            Ok(OnlineTranslation {
                google: google.unwrap(),
                cambridge: cambridge.unwrap(),
                mymemory: mymemory.unwrap(),
                sentencedict: sentencedict.unwrap(),
            })
        })
    }
}
