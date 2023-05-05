use std::collections::HashMap;

use scraper::Html;

use super::CLIENT;

lazy_static! {
  static ref SEMI_BIL_CAMBRIDGE_DICTS: HashMap<&'static str, &'static str> = HashMap::from([
    ("ar", "arabic"),
    ("ca", "catalan"),
    ("zh-CN", "chinese-simplified"),
    ("zh-TW", "chinese-traditional"),
    ("cs", "czech"),
    ("da", "danish"),
    ("hi", "hindi"),
    ("ko", "korean"),
    ("ms", "malay"),
    ("rs", "russian"),
    ("th", "thai"),
    ("tr", "turkish"),
    ("uk", "ukrainian"),
    ("vi", "vietnamese"),
  ]);

  static ref CAMBRIDGE_DICTS: HashMap<&'static str, &'static str> = HashMap::from([
    ("en", "english"),
    ("fr", "french"),
    ("de", "german"),
    ("es", "spanish"),
    ("pt", "portuguese"),
    ("it", "italian"),
    ("no", "norwegian"),
    ("pl", "polish"),
    ("id", "indonesian"),
    ("da", "dutch"),
    ("ja", "japanese"),
    // Semi-bilingual
    ("ar", "arabic"),
    ("ca", "catalan"),
    ("zh-CN", "chinese-simplified"),
    ("zh-TW", "chinese-traditional"),
    ("cs", "czech"),
    ("da", "danish"),
    ("hi", "hindi"),
    ("ko", "korean"),
    ("ms", "malay"),
    ("rs", "russian"),
    ("th", "thai"),
    ("tr", "turkish"),
    ("uk", "ukrainian"),
    ("vi", "vietnamese"),
  ]);
}

pub struct Translator<'a> {
    pub to: &'a str,
    pub from: &'a str,
}

impl Translator<'_> {
    pub async fn translate(&self, text: &str) -> Result<String, String> {
        if text.contains(" ") || (self.from != "en" && self.from == self.to) {
            return Ok("".to_string());
        }
        self.parse_result(fetch_page(text, self.from, self.to).await)
    }

    fn parse_result(&self, result: Result<String, reqwest::Error>) -> Result<String, String> {
        match result {
            Ok(body) => {
                let html = scraper::Html::parse_document(&body);
                let mut res = parse_entry_body_html(&html);
                if &res == "" {
                    res = parse_kdic_html(&html);
                }
                Ok(res)
            }
            Err(err) => return Err(err.to_string()),
        }
    }
}

async fn fetch_page(text: &str, from: &str, to: &str) -> Result<String, reqwest::Error> {
    let formatted_url: String;
    let from_eq = if from == "auto" {
        *CAMBRIDGE_DICTS.get("en").unwrap()
    } else {
        let fr = CAMBRIDGE_DICTS.get(from);
        if fr.is_none() {
            return Ok("".to_string());
        }

        *fr.unwrap()
    };

    let to_eq = CAMBRIDGE_DICTS
        .get(to)
        .unwrap_or(CAMBRIDGE_DICTS.get("en").unwrap());

    if from == "en" && from_eq == *to_eq {
        formatted_url = format!(
            "https://dictionary.cambridge.org/dictionary/english/{}",
            text
        );
    } else {
        if from_eq == *to_eq {
            return Ok("".to_string());
        }

        if from == "en" {
            formatted_url = format!(
                "https://dictionary.cambridge.org/dictionary/english-{}/{}",
                to_eq, text
            );
        } else {
            if SEMI_BIL_CAMBRIDGE_DICTS.get(from).is_some() {
                return Ok("".to_string());
            }
            formatted_url = format!(
                "https://dictionary.cambridge.org/dictionary/{}-english/{}",
                from_eq, text
            );
        }
    }

    let content = CLIENT.get(formatted_url).send().await?.text().await?;
    Ok(content)
}

fn parse_kdic_html(html: &Html) -> String {
    let selector = scraper::Selector::parse(".kdic").unwrap();
    let nodes = html.select(&selector);
    let mut nodes_str = nodes.into_iter().map(|n| n.html()).collect::<String>();
    nodes_str = nodes_str.replace("href=", "");
    nodes_str = nodes_str.replace("<h2 ", "<h2 style='display:none'");
    nodes_str = nodes_str.replace("<div class=\"dwl hax\"", "<div style='display:none'");
    nodes_str = nodes_str.replace(
        "<div class=\"def-body ddef_b ddef_b-t\">",
        "<div><strong style='display: block; margin-top: .5rem;'>Translation:</strong>",
    );
    nodes_str = nodes_str.replace(
      "<div class=\"pr phrase-block dphrase-block \">",
      "<div style='padding: .25rem; margin-block: .5rem; background-color: rgba(255, 50, 0, 0.363); border-radius: .25rem;'>",
    );
    nodes_str = nodes_str.replace(
        "<span class=\"pron-info dpron-info\">",
        "<span style='display: block'>",
    );
    nodes_str = nodes_str.replace(
        "<div class=\"dpos-g hdib\">",
        "<div style='display: inline'>",
    );
    nodes_str = nodes_str.replace(
  "<span class=\"usage dusage\">",
  "<span style='display: block; padding-inline: .25rem; margin-block: 1rem .5rem; background-color: rgba(255, 150, 0, 0.363);'>",
    );
    nodes_str = nodes_str.replace(
  "<span class=\"di-info\">",
  "<span style='display: block; padding: .25rem; margin-bottom: .5rem; background-color: rgba(255, 255, 0, 0.363); border-radius: .25rem;'>",
    );
    nodes_str = nodes_str.replace(
        "<div class=\"examp dexamp\">",
        "<h5>Example:</h5><div style='display: flex; flex-direction: column;'>",
    );
    nodes_str = nodes_str.replace("<span class=\"freq dfreq\">●</span>", "");
    nodes_str = nodes_str.replace("<span class=\"d_br\">&nbsp;</span>", "");

    nodes_str
}

fn parse_entry_body_html(html: &Html) -> String {
    let selector = scraper::Selector::parse(".entry-body__el").unwrap();
    let nodes = html.select(&selector);
    let mut nodes_str = nodes.into_iter().map(|n| n.html()).collect::<String>();
    nodes_str = nodes_str.replace("<h3", "<h4 style='margin-inline-start: unset'");
    nodes_str = nodes_str.replace("</h3>", "</h4>");
    nodes_str = nodes_str.replace("See more results »", "");
    nodes_str = nodes_str.replace("href=", "");
    nodes_str = nodes_str.replace(
        "<span class=\"pron-info dpron-info\">",
        "<span style='display: flex; gap: 1rem;'>",
    );
    nodes_str = nodes_str.replace("<div class=\"dwl hax\"", "<div style='display:none'");
    nodes_str = nodes_str.replace(
        "<div class=\"def ddef_d db\"",
        "<strong style='display: block; margin-top: .5rem;'>Translation:</strong><div style='margin-top: .5rem;'",
    );
    nodes_str = nodes_str.replace(
      "<div class=\"posgram dpos-g hdib lmr-5\">",
      "<div style='display: flex; gap: .25rem; padding-inline: .25rem; margin-bottom: .5rem; background-color: rgba(255, 255, 0, 0.363);'>",
    );
    nodes_str = nodes_str.replace("<span class=\"showmore\">More examples</span>", "");
    nodes_str = nodes_str.replace("<span class=\"showless\">Fewer examples</span>", "");
    nodes_str = nodes_str.replace("<div class=\"di-title\"", "<div style='display: none;'");
    nodes_str = nodes_str.replace(
        "<div class=\"smartt daccord\">",
        "<div style='padding: .5rem; margin-top: .5rem; border: 1px dashed gray; border-radius: .5rem;'>",
    );
    nodes_str = nodes_str.replace(
        "<span class=\"uk dpron-i",
        "<span style='display: flex; gap: 1rem;' class=\"",
    );
    nodes_str = nodes_str.replace(
        "<span class=\"us dpron-i",
        "<span style='display: flex; gap: 1rem;' class=\"",
    );
    nodes_str = nodes_str.replace(
        "class=\"def-block ddef_block \"",
        "style='padding-top: .25rem; margin-top: .25rem; border-top: 1px dashed gray'",
    );
    nodes_str = nodes_str.replace(
        "<div class=\"phrase-block pr dphrase-block \">",
        "<div style='padding: .25rem; margin-block: .5rem; background-color: rgba(255, 50, 0, 0.363); border-radius: .25rem;'>",
    );
    nodes_str = nodes_str.replace("<i ", "<i style='display: none' ");
    nodes_str = nodes_str.replace(
        "<div class=\"examp dexamp\">",
        "<h5>Example:</h5><div style='display: flex; flex-direction: column;'>",
    );
    nodes_str = nodes_str.replace("<audio", "<span style='display: none'");
    nodes_str = nodes_str.replace("</audio>", "</span>");
    nodes_str = nodes_str.replace("onclick=", "");
    nodes_str = nodes_str.replace("<span class=\"dbtn\"", "<span style='display: none'");
    nodes_str = nodes_str.replace("<div class=\"dimg\"", "<div style='display: none'");
    nodes_str = nodes_str.replace("<b", "<div style='display: block'");
    nodes_str = nodes_str.replace("</b>", "</div>");
    nodes_str = nodes_str.replace(
        "<div class=\"definition-src",
        "<div style='display: none' class=\"",
    );

    nodes_str
}
