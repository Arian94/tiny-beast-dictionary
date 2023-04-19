mod cambridge_translate;
mod google_translate;
mod other_online_translate;

use self::other_online_translate::{MyMemoryTranslation, OtherTranslator};
use serde::Serialize;

lazy_static! {
    pub static ref CLIENT: reqwest::Client =
        reqwest::Client::builder().use_rustls_tls().build().unwrap();
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

        let google = google_translate::Translator {
            from: self.from,
            to: self.to,
        }
        .translate(&text)
        .await;
        if let Err(ge) = google {
            return Err(ge);
        }

        let sentencedict = if self.from == "auto" || self.from == "en" {
            OtherTranslator::sentencedict_translate(&text).await
        } else {
            Ok("".to_string())
        };
        if let Err(se) = sentencedict {
            return Err(se);
        }

        let cambridge = cambridge_translate::Translator {
            from: self.from,
            to: self.to,
        }
        .translate(&text)
        .await;
        if let Err(ca) = cambridge {
            return Err(ca);
        }

        let mymemory = OtherTranslator::mymemory_translate(&text, self.from, self.to).await;
        if let Err(me) = mymemory {
            return Err(me);
        }

        Ok(OnlineTranslation {
            google: google.unwrap(),
            cambridge: cambridge.unwrap(),
            sentencedict: sentencedict.unwrap(),
            mymemory: mymemory.unwrap(),
        })
    }
}
