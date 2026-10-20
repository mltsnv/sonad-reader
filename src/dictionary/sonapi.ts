import { inflectionQueries } from './inflections';
import { getEkiCefr, type CefrLevel } from './ekiCefr';

export const SONAPI_BASE = 'https://api.sonapi.ee/v2/';

export const partsOfSpeech = {
  unknown: 'Не указана',
  noun: 'Существительное',
  adjective: 'Прилагательное',
  pronoun: 'Местоимение',
  numeral: 'Числительное',
  verb: 'Глагол',
  adverb: 'Наречие',
  other: 'Другая',
} as const;

export type PartOfSpeech = keyof typeof partsOfSpeech;

export interface WordForms {
  primary: string[];
  paradigm: {
    label: string;
    value: string;
    code?: string;
    inflectionType?: string;
  }[];
}

export interface DictionaryMeaning {
  definition: string;
  partOfSpeech: PartOfSpeech;
  rection: string;
  examples: string[];
  synonyms: string[];
  translations: Record<string, { words: string; weight: number | null }[]>;
}

export interface DictionaryDetails {
  provider: 'sonapi';
  apiVersion: number;
  adapterVersion: number;
  fetchedAt: string;
  query: string;
  lemma: string;
  entryIndex: number;
  meaningIndex: number;
  wordClasses: string[];
  meanings: DictionaryMeaning[];
  similarWords: string[];
}

export interface DictionaryCandidate {
  lemma: string;
  forms: WordForms;
  level: CefrLevel | null;
  details: DictionaryDetails;
}

export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const schemaError = () =>
  new Error('SONAPI вернул неожиданный формат данных.');

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw schemaError();
  return value as Record<string, unknown>;
}

function array(value: unknown, max = 1000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw schemaError();
  return value;
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

const strings = (value: unknown) =>
  array(value ?? [])
    .map(safeText)
    .filter(Boolean);

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const posCodes: Record<string, PartOfSpeech> = {
  s: 'noun',
  a: 'adjective',
  adj: 'adjective',
  p: 'pronoun',
  num: 'numeral',
  n: 'numeral',
  v: 'verb',
  d: 'adverb',
  adv: 'adverb',
};

function parseMeaning(
  value: unknown,
  wordClasses: string[],
): DictionaryMeaning {
  const meaning = object(value);
  const tags = array(meaning.partOfSpeech ?? []).map((tag) =>
    safeText(object(tag).code),
  );
  const pos = unique(tags.map((code) => posCodes[code] ?? 'other'));
  const partOfSpeech: PartOfSpeech =
    pos.length === 1
      ? (pos[0] as PartOfSpeech)
      : wordClasses.includes('verb')
        ? 'verb'
        : 'unknown';
  const translations: DictionaryMeaning['translations'] = {};
  for (const [lang, list] of Object.entries(
    object(meaning.translations ?? {}),
  )) {
    if (!/^[a-z]{2,3}$/.test(lang)) continue;
    translations[lang] = array(list).map((item) => {
      const entry = object(item);
      return {
        words: safeText(entry.words),
        weight:
          typeof entry.weight === 'number' && Number.isFinite(entry.weight)
            ? entry.weight
            : null,
      };
    });
  }
  return {
    definition: safeText(meaning.definition),
    partOfSpeech,
    rection: safeText(meaning.rection),
    examples: strings(meaning.examples),
    synonyms: strings(meaning.synonyms),
    translations,
  };
}

export function directRussian(meaning: {
  translations: Record<string, { words: string; weight?: number | null }[]>;
}): string[] {
  const rusList = meaning.translations.rus ?? meaning.translations.ru ?? [];
  const weighted = rusList
    .filter((entry) => entry.weight === 1 || entry.weight === undefined || entry.weight === null)
    .flatMap((entry) => entry.words.split(',').map((word) => word.trim()));
  if (weighted.length > 0) return unique(weighted);
  return unique(
    rusList.flatMap((entry) => entry.words.split(',').map((word) => word.trim())),
  );
}

export function parseSonapi(
  raw: unknown,
  query: string,
  fetchedAt = new Date().toISOString(),
): DictionaryCandidate[] {
  const response = object(raw);
  safeText(response.estonianWord);
  return array(response.searchResult, 100).map((value, entryIndex) => {
    const entry = object(value);
    const wordClasses = strings(entry.wordClasses);
    const meanings = array(entry.meanings, 300).map((meaning) =>
      parseMeaning(meaning, wordClasses),
    );
    const paradigm = array(entry.wordForms ?? []).map((item) => {
      const form = object(item);
      return {
        code: safeText(form.code),
        label: safeText(form.morphValue),
        value: safeText(form.value),
        inflectionType: safeText(form.inflectionType),
      };
    });
    const get = (code: string) =>
      unique(
        paradigm
          .filter((form) => form.code === code)
          .flatMap((form) => form.value.split(',').map((v) => v.trim()))
          .filter((v) => v !== '-' && v !== '—'),
      ).join(' / ');
    const verb =
      wordClasses.includes('verb') ||
      meanings.some((meaning) => meaning.partOfSpeech === 'verb');
    const codes = verb
      ? ['Sup', 'Inf', 'IndPrSg3', 'PtsPtIps']
      : ['SgN', 'SgG', 'SgP'];
    const hasPrimary = codes.some((code) => get(code));
    const lemma =
      get(verb ? 'Sup' : 'SgN').split(' / ')[0] ||
      safeText(response.estonianWord) ||
      query;
    return {
      lemma,
      level: getEkiCefr(lemma),
      forms: {
        primary: hasPrimary ? codes.map((code) => get(code) || '—') : [],
        paradigm,
      },
      details: {
        provider: 'sonapi',
        apiVersion: 2,
        adapterVersion: 1,
        fetchedAt,
        query,
        lemma,
        entryIndex,
        meaningIndex: 0,
        wordClasses,
        meanings,
        similarWords: strings(entry.similarWords),
      },
    };
  });
}

export function cleanWordToken(rawWord: string): string {
  return normalize(
    rawWord.replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, ''),
  );
}

export async function lookupSonapiDirect(
  query: string,
  signal?: AbortSignal,
): Promise<DictionaryCandidate[]> {
  const clean = cleanWordToken(query);
  if (!clean || clean.length > 120) return [];
  const timeout = AbortSignal.timeout(12000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  async function request(term: string): Promise<DictionaryCandidate[]> {
    requestSignal.throwIfAborted();
    const response = await fetch(`${SONAPI_BASE}${encodeURIComponent(term)}`, {
      signal: requestSignal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return [];
    if (!response.ok) return [];
    const body = await response.text();
    if (body.length > 2_000_000) return [];
    try {
      return parseSonapi(JSON.parse(body), term);
    } catch {
      return [];
    }
  }

  const direct = await request(clean);
  if (direct.length > 0) return direct;

  for (const hint of inflectionQueries(clean)) {
    const matches = (await request(hint)).filter(
      (candidate) =>
        candidate.forms.paradigm.some(
          (form) =>
            ['SgN', 'Sup'].includes(form.code ?? '') &&
            form.value
              .split(',')
              .some((value) => normalize(value) === normalize(candidate.lemma)),
        ) &&
        candidate.forms.paradigm.some((form) =>
          form.value.split(',').some((value) => normalize(value) === clean),
        ),
    );
    if (matches.length > 0) {
      return matches.map((c) => ({
        ...c,
        details: { ...c.details, query: clean },
      }));
    }
  }

  // Fallback: if strict paradigm match wasn't found, return first non-empty stem result
  for (const hint of inflectionQueries(clean).slice(0, 3)) {
    const fallbackMatches = await request(hint);
    if (fallbackMatches.length > 0) {
      return fallbackMatches.map((c) => ({
        ...c,
        details: { ...c.details, query: clean },
      }));
    }
  }

  return [];
}
