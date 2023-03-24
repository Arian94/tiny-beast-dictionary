export type OnlineTranslation = {
  google: string;
  sentencedict: string;
  mymemory: MyMemoryTranslation
}

type MyMemoryTranslation = {
  segment: string;
  translation: string;
  accuracy: number;
}[]