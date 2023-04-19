export type OnlineTranslation = {
  google: string;
  cambridge: string;
  sentencedict: string;
  mymemory: MyMemoryTranslation
}

type MyMemoryTranslation = {
  segment: string;
  translation: string;
  accuracy: number;
}[]