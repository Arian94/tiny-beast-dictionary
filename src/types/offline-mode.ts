import { offlineDictionaries } from "./countries";

export type OfflineDictNames = keyof typeof offlineDictionaries;
export type OfflineDictAbbrs = typeof offlineDictionaries[OfflineDictNames];
export type OfflineDictsList = { [key in OfflineDictAbbrs]: { percentage: number; zipped: string; extracted: string; name: OfflineDictNames, isBootUp: boolean } };
export type OfflineTranslation = {
    etymology_text?: string;
    etymology_templates?: { expansion: string; }[];
    senses: {
        categories: { name?: string; }[];
        glosses: string[];
        tags?: string[];
        form_of?: { word: string; }[];
        examples?: {
            text: string;
            ref: string;
            english?: string;
            type: string;
        }[];
        alt_of?: { word: string; }[];
    }[];
    pos: string;
    related: { word: string; }[];
    forms?: { form: string; tags: string[]; };
    sounds?: ({ ipa: string; tags?: string[]; } | { homophone: string; })[];
}
export const INIT_DICT = "initializing, wait for a moment...";