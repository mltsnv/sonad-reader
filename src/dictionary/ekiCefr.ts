import ekiData from '../data/ekiCefr.json';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

const map = new Map<string, CefrLevel>();
for (const [level, words] of Object.entries(ekiData)) {
  for (const w of words as string[]) {
    map.set(w.toLowerCase().trim(), level as CefrLevel);
  }
}

export function getEkiCefr(lemma: string): CefrLevel | null {
  return map.get(lemma.toLowerCase().trim()) ?? null;
}
