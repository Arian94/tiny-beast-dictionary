use reqwest;

pub struct Translator<'a> {
    pub to: &'a str,
    pub from: &'a str,
}

impl Translator<'_> {
    pub async fn translate(&self, text: &str) -> Result<String,String> {
        parse_result(fetch_page(text, self.from, self.to).await)
    }
}

async fn fetch_page(text: &str, from: &str, to: &str) -> Result<String, reqwest::Error> {
    let formatted_url = format!(
        "https://translate.google.com/m?tl={}&sl={}&q={}",
        to, from, text
    );

    let content = reqwest::get(formatted_url).await?.text().await?;
    Ok(content)
}

fn parse_result(result: Result<String, reqwest::Error>) -> Result<String, String> {
    match result {
        Ok(body) => {
            let html = scraper::Html::parse_document(&body);
            let selector = scraper::Selector::parse(".result-container").unwrap();
            let mut nodes = html.select(&selector);

            Ok(nodes.nth(0).unwrap().text().collect::<Vec<&str>>().concat())
        }
        Err(err) => return Err(err.to_string()),
    }
}