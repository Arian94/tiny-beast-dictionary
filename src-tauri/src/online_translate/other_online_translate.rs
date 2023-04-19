use super::CLIENT;
use serde::{Deserialize, Serialize};

pub struct OtherTranslator {}

#[derive(Serialize, Deserialize)]
struct MyMemoryModel {
    matches: Vec<MyMemoryTranslation>,
}

#[derive(Serialize, Deserialize)]
pub struct MyMemoryTranslation {
    segment: String,
    translation: String,
    #[serde(rename(deserialize = "match"))]
    accuracy: f32,
}

impl OtherTranslator {
    pub async fn sentencedict_translate(text: &str) -> Result<String, String> {
        if text.contains(" ") {
            return Ok("".to_string());
        }    
        parse_sentencedict_resp(fetch_sentencedict_page(text).await)
    }

    pub async fn mymemory_translate(
        text: &str,
        from: &str,
        to: &str,
    ) -> Result<Vec<MyMemoryTranslation>, String> {
        parse_mymemory_resp(fetch_mymemory(text, from, to).await)
    }
}

async fn fetch_sentencedict_page(text: &str) -> Result<String, reqwest::Error> {
    let formatted_url = format!("https://sentencedict.com/{}.html", text.trim());
    let content = CLIENT.get(formatted_url).send().await?.text().await?;
    Ok(content)
}

async fn fetch_mymemory(text: &str, from: &str, to: &str) -> Result<String, reqwest::Error> {
    let fr = if from == "auto" { "en" } else { from };

    if fr == to {
        return Ok("".to_string());
    }

    let formatted_url = format!(
        "https://api.mymemory.translated.net/get?q={}&langpair={}|{}",
        text, fr, to
    );
    let content = CLIENT.get(formatted_url).send().await?.text().await?;
    Ok(content)
}

fn parse_mymemory_resp(
    result: Result<String, reqwest::Error>,
) -> Result<Vec<MyMemoryTranslation>, String> {
    match result {
        Ok(body) => {
            if &body == "" {
                return Ok(vec![]);
            }

            let json_body = serde_json::from_str::<MyMemoryModel>(&body);
            if let Err(json_err) = json_body {
                Err(json_err.to_string())
            } else {
                Ok(json_body.unwrap().matches)
            }
        }
        Err(err) => return Err(err.to_string()),
    }
}

fn parse_sentencedict_resp(result: Result<String, reqwest::Error>) -> Result<String, String> {
    match result {
        Ok(body) => {
            let all = body
                .split("<!--最大高度为105px,能显示5行多的样子-->")
                .nth(1);
            if let None = all {
                return Ok("".to_string());
            }

            let res = all
                .unwrap()
                .split("<!--all结束-->")
                .nth(0)
                .unwrap_or("");
            Ok(res.trim().to_string())
        }
        Err(err) => return Err(err.to_string()),
    }
}
