import {
  cleanWordToken,
  lookupSonapiDirect,
  normalize,
  type PartOfSpeech,
} from './dictionary/sonapi';
import { getEkiCefr, type CefrLevel } from './dictionary/ekiCefr';

export interface SonadCompanionWord {
  id: string;
  lemma: string;
  translation: string;
  partOfSpeech: string;
  forms: {
    primary: string[];
    paradigm: { code?: string; label: string; value: string }[];
  };
  formsNotApplicable: boolean;
  notes: string;
  folderId: string | null;
  level: CefrLevel | null;
  status: 'sonavara' | 'recalled' | 'new';
  firstReviewedAt: string | null;
  updatedAt: string;
}

export interface SonadFolder {
  id: string;
  name: string;
  createdAt: string;
  color?: string;
}

export interface SonadVocabularySummary {
  total: number;
  sonavara: number;
  recalled: number;
  new: number;
}

export interface SonadVocabularyResponse {
  userId: string;
  serverRevision: number;
  folders: SonadFolder[];
  summary: SonadVocabularySummary;
  words: SonadCompanionWord[];
}

export interface SonadLookupCandidate {
  lemma: string;
  forms: {
    primary: string[];
    paradigm: { code?: string; label: string; value: string }[];
  };
  level: string | null;
  alreadyInSonad: boolean;
  savedWordId: string | null;
  details: {
    query: string;
    meaningIndex: number;
    meanings: {
      id?: string;
      definition: string;
      partOfSpeech: PartOfSpeech | string;
      translations: Record<string, { words: string; weight?: number | null }[]>;
      examples: string[];
    }[];
  };
}

export interface SonadLookupResponse {
  query: string;
  existingWord: {
    id: string;
    lemma: string;
    translation: string;
    forms: { primary: string[] };
    status?: 'sonavara' | 'recalled' | 'new';
  } | null;
  candidates: SonadLookupCandidate[];
}

export class SonadClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://sonad.mkin-did-it.workers.dev',
  ) {}

  private get cleanBaseUrl(): string {
    return this.baseUrl.trim().replace(/\/+$/, '');
  }

  private headers(jsonBody = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.token.trim()}`,
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async fetchVocabulary(): Promise<SonadVocabularyResponse> {
    const res = await fetch(`${this.cleanBaseUrl}/api/companion/words`, {
      headers: this.headers(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ??
          `Ошибка загрузки словаря Sõnad (код ${res.status}). Проверьте API-ключ.`,
      );
    }
    return data as SonadVocabularyResponse;
  }

  async lookupWord(query: string, signal?: AbortSignal): Promise<SonadLookupResponse> {
    const url = new URL(`${this.cleanBaseUrl}/api/companion/lookup`);
    url.searchParams.set('q', query.trim());
    const res = await fetch(url.toString(), {
      headers: this.headers(),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? 'Ошибка поиска слова в Sõnad.',
      );
    }
    return data as SonadLookupResponse;
  }

  async addWordToSonad(input: {
    lemma: string;
    translation: string;
    partOfSpeech?: string;
    forms?: { primary: string[] };
    notes?: string;
    folderId?: string;
  }): Promise<{ status: 'created' | 'existing'; word: SonadCompanionWord }> {
    const res = await fetch(`${this.cleanBaseUrl}/api/companion/words`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ mode: 'word', ...input }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? 'Не удалось сохранить слово в Sõnad.',
      );
    }
    return data as { status: 'created' | 'existing'; word: SonadCompanionWord };
  }

  async addToInbox(text: string): Promise<{ status: string; mode: 'inbox' }> {
    const res = await fetch(`${this.cleanBaseUrl}/api/companion/words`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ mode: 'inbox', text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? 'Не удалось отправить в Inbox.',
      );
    }
    return data as { status: string; mode: 'inbox' };
  }
}

/**
 * Unified word lookup that combines:
 * 1) Local cached Sõnad vocabulary (`localWords`)
 * 2) Sõnad Companion API `/api/companion/lookup` (if `token` is configured)
 * 3) Direct SONAPI morphological dictionary lookup (`https://api.sonapi.ee/v2/`) as fallback or when no token is set
 */
export async function lookupEstonianWord(
  rawQuery: string,
  localWords: SonadCompanionWord[],
  options?: {
    sonadToken?: string;
    sonadBaseUrl?: string;
    signal?: AbortSignal;
  },
): Promise<SonadLookupResponse> {
  const clean = cleanWordToken(rawQuery);
  const byLemma = new Map<string, SonadCompanionWord>();
  for (const w of localWords) {
    byLemma.set(normalize(w.lemma), w);
    for (const f of w.forms?.primary ?? []) {
      const nf = normalize(f);
      if (nf && nf !== '—' && !byLemma.has(nf)) byLemma.set(nf, w);
    }
  }

  const directLocal = byLemma.get(clean) ?? null;

  // Try Sõnad Companion API lookup first if token is provided
  if (options?.sonadToken?.trim()) {
    try {
      const client = new SonadClient(
        options.sonadToken,
        options.sonadBaseUrl || 'https://sonad.mkin-did-it.workers.dev',
      );
      const remote = await client.lookupWord(clean, options.signal);
      if (remote.candidates.length > 0 || remote.existingWord) {
        // Enrich with local status if available
        const matchLocal =
          (remote.existingWord
            ? byLemma.get(normalize(remote.existingWord.lemma))
            : null) ?? directLocal;
        return {
          ...remote,
          existingWord: remote.existingWord
            ? {
                ...remote.existingWord,
                status: matchLocal?.status,
              }
            : matchLocal
              ? {
                  id: matchLocal.id,
                  lemma: matchLocal.lemma,
                  translation: matchLocal.translation,
                  forms: { primary: matchLocal.forms.primary },
                  status: matchLocal.status,
                }
              : null,
        };
      }
    } catch {
      // Fall through to direct SONAPI lookup
    }
  }

  // Direct SONAPI lookup (works without Sõnad token too!)
  const candidates = await lookupSonapiDirect(clean, options?.signal);
  const mappedCandidates: SonadLookupCandidate[] = candidates.map((c) => {
    const saved = byLemma.get(normalize(c.lemma));
    return {
      lemma: c.lemma,
      forms: c.forms,
      level: c.level ?? getEkiCefr(c.lemma) ?? null,
      alreadyInSonad: Boolean(saved),
      savedWordId: saved?.id ?? null,
      details: {
        query: c.details.query,
        meaningIndex: c.details.meaningIndex,
        meanings: c.details.meanings,
      },
    };
  });

  const resolvedLocal =
    directLocal ??
    (mappedCandidates[0]
      ? byLemma.get(normalize(mappedCandidates[0].lemma)) ?? null
      : null);

  return {
    query: clean,
    existingWord: resolvedLocal
      ? {
          id: resolvedLocal.id,
          lemma: resolvedLocal.lemma,
          translation: resolvedLocal.translation,
          forms: { primary: resolvedLocal.forms.primary },
          status: resolvedLocal.status,
        }
      : null,
    candidates: mappedCandidates,
  };
}
