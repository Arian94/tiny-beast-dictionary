mod google_translate;
mod other_online_translate;

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
    other: String,
}

impl OnlineTranslator<'_> {
    pub async fn translate(&self, text: &str) -> Result<OnlineTranslation, String> {
        let google = google_translate::Translator {
            from: self.from,
            to: self.to,
        }
        .translate(text)
        .await;
        if let Err(ge) = google {
            return Err(ge);
        }

        let other = other_online_translate::OtherTranslator::translate(text).await;
        if let Err(oe) = other {
            return Err(oe);
        }

        Ok(OnlineTranslation {
            google: google.unwrap(),
            other: other.unwrap(),
        })
    }
}
