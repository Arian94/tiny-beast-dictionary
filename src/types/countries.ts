import { OfflineDictAbbrs } from "./offline-mode";

export const offlineDictionaries = {
    English: "en",
    French: "fr",
    German: "de",
    Spanish: "es",
    Portuguese: "pt",
    Italian: "it",
    Persian: "fa",
    Chinese: "zh-CN",
    Arabic: "ar",
} as const;

export const onlineDictionaries = {
    Afrikaans: "af",
    Albanian: "sq",
    Arabic: offlineDictionaries.Arabic,
    Armenian: "hy",
    Bengali: "bn",
    Bosnian: "bs",
    Bulgarian: "bg",
    Catalan: "ca",
    Chinese: offlineDictionaries.Chinese,
    Croatian: "hr",
    Czech: "cs",
    Danish: "da",
    Dutch: "nl",
    English: offlineDictionaries.English,
    Esperanto: "eo",
    Estonian: "et",
    Filipino: "tl",
    Finnish: "fi",
    French: offlineDictionaries.French,
    German: offlineDictionaries.German,
    Greek: "el",
    Gujarati: "gu",
    Hindi: "hi",
    Hungarian: "hu",
    Icelandic: "is",
    Indonesian: "id",
    Italian: offlineDictionaries.Italian,
    Japanese: "ja",
    Javanese: "jw",
    Kannada: "kn",
    Khmer: "km",
    Korean: "ko",
    Latin: "la",
    Latvian: "lv",
    Macedonian: "mk",
    Malayalam: "ml",
    Marathi: "mr",
    "Myanmar (Burmese)": "my",
    Nepali: "ne",
    Norwegian: "no",
    Persian: offlineDictionaries.Persian,
    Polish: "pl",
    Portuguese: offlineDictionaries.Portuguese,
    Romanian: "ro",
    Russian: "ru",
    Serbian: "sr",
    Sinhala: "si",
    Slovak: "sk",
    Spanish: offlineDictionaries.Spanish,
    Sundanese: "su",
    Swahili: "sw",
    Swedish: "sv",
    Tamil: "ta",
    Telugu: "te",
    Thai: "th",
    Turkish: "tr",
    Ukrainian: "uk",
    Urdu: "ur",
    Vietnamese: "vi",
    Welsh: "cy",
} as const;

export type CountriesNames = keyof typeof onlineDictionaries;
export type CountriesAbbrs = typeof onlineDictionaries[CountriesNames];
export type SavedConfig = {
    activeTab: 'online' | 'offline';
    from: CountriesAbbrs | 'auto';
    to: CountriesAbbrs;
    selectedOfflineDict?: OfflineDictAbbrs;
    downloadedDicts?: OfflineDictAbbrs[];
    x: number;
    y: number;
    width: number;
    height: number;
    translateClipboard: boolean;
    translateSelectedText: boolean;
}
