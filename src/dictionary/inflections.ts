// Bounded Estonian morphological search hints for resolving oblique cases and verb conjugations
// (e.g., otsuseid -> otsus, emale -> ema, läksime -> minema/lähtuma).
export function inflectionQueries(word: string): string[] {
  if (!/^[a-zõäöüšž-]+$/u.test(word)) return [];
  const hints = new Set<string>();
  const add = (value: string) => {
    if (value.length >= 2 && value !== word) hints.add(value);
  };
  const nominalStem = (stem: string) => {
    add(stem);
    if (/[aeiu]$/.test(stem)) add(stem.slice(0, -1));
    if (stem.endsWith('se')) add(stem.slice(0, -2) + 'ne');
    if (stem.endsWith('ik')) add(stem);
  };
  if (/[aeiu]$/.test(word)) add(word + 'ma');
  const caseEnding = word.match(/(?:sse|ga|le|lt|st|ks|ni|na|ta|s|l)$/)?.[0];
  if (caseEnding) {
    const stem = word.slice(0, -caseEnding.length);
    nominalStem(stem);
    if (/(?:de|te)$/.test(stem)) nominalStem(stem.slice(0, -2));
  }
  const pluralPartitive = word.match(/(?:id|sid)$/)?.[0];
  if (pluralPartitive) {
    const stem = word.slice(0, -pluralPartitive.length);
    nominalStem(stem);
    if (stem.endsWith('se')) add(stem.slice(0, -1)); // otsuseid -> otsus
  }
  const verbEnding = word.match(
    /(?:sime|site|vad|nud|tud|dud|sin|sid|mas|mast|mata|des|me|te|da|ta|n|b|d)$/,
  )?.[0];
  if (verbEnding) add(word.slice(0, -verbEnding.length) + 'ma');
  if (/[aeiu]s$/.test(word)) add(word.slice(0, -1) + 'ma'); // ootas -> ootama, astus -> astuma
  if (word.endsWith('d')) nominalStem(word.slice(0, -1));
  if (/[aeiu]$/.test(word)) nominalStem(word);
  return [...hints].slice(0, 8);
}
