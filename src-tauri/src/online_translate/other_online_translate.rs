use super::CLIENT;
use serde::Serialize;

pub struct OtherTranslator {}

#[derive(Serialize)]
pub struct OtherTranslation {
    word_type: String,
    definitions: Vec<String>,
}

impl OtherTranslator {
    pub async fn translate(text: &str) -> Result<String, String> {
        parse_result(fetch_page(text).await)
    }
}

async fn fetch_page(text: &str) -> Result<String, reqwest::Error> {
    let formatted_url = format!("https://sentencedict.com/{}.html", text.trim());
    let content = CLIENT.get(formatted_url).send().await?.text().await?;
    Ok(content)
}

#[derive(Serialize)]
struct Alaki<'a> {
    event_name: &'a str,
    text: &'a str,
    dir_code: &'a str,
}

fn parse_result(result: Result<String, reqwest::Error>) -> Result<String, String> {
    match result {
        Ok(body) => {
            let all = body
                .split("<!--最大高度为105px,能显示5行多的样子-->")
                .nth(1);
            if let None = all {
                return Ok("not found".to_string());
            }

            let res = all
                .unwrap()
                .split("<!--all结束-->")
                .nth(0)
                .unwrap_or("not found");
            Ok(res.trim().to_string())
        }
        Err(err) => return Err(err.to_string()),
    }
}
