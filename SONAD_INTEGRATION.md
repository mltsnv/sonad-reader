# Интеграция Sõnad Reader с приложением Sõnad (Технический справочник)

Этот документ описывает, как `Sõnad Reader` взаимодействует с основным приложением `Sõnad`.

---

## 1. Где находится основной проект Sõnad

- **Папка на диске**: `c:\Users\mrmol\Desktop\Sonad`
- **Production URL**: `https://sonad.mkin-did-it.workers.dev`
- **Серверный модуль Companion API**: `c:\Users\mrmol\Desktop\Sonad\server\companion.ts`
- **Морфологический парсер словаря SONAPI**: `c:\Users\mrmol\Desktop\Sonad\src\dictionary\sonapi.ts` (и `c:\Users\mrmol\Desktop\Sonad\src\dictionary\inflections.ts`)

> Вы можете либо вызывать готовый серверный эндпоинт `GET https://sonad.mkin-did-it.workers.dev/api/companion/lookup?q=...`, либо скопировать файлы `sonapi.ts` и `inflections.ts` из `c:\Users\mrmol\Desktop\Sonad\src\dictionary\` прямо в `src/dictionary/` нового проекта.

---

## 2. Авторизация через Sõnad API-ключ

Пользователь в приложении `Sõnad` открывает **Настройки → Интеграция (Sõnad Reader API)** и нажимает **«Создать API-ключ»**.
Токен имеет формат:
```text
sonad_pat_<userB64>.<secret>
```
Все запросы из `Sõnad Reader` к `https://sonad.mkin-did-it.workers.dev/api/companion/*` поддерживают CORS (`Access-Control-Allow-Origin: *`) и передают заголовок:
```http
Authorization: Bearer sonad_pat_...
```

---

## 3. Готовый TypeScript-клиент для Sõnad Companion API

Ниже приведён готовый модуль `src/sonadClient.ts`, который можно сразу использовать в `Sõnad Reader`:

```ts
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
  raske: boolean;
  folderId: string | null;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  status: 'sonavara' | 'recalled' | 'new';
  firstReviewedAt: string | null;
  updatedAt: string;
}

export interface SonadVocabularyResponse {
  userId: string;
  serverRevision: number;
  folders: { id: string; name: string; createdAt: string; color?: string }[];
  summary: {
    total: number;
    sonavara: number;
    recalled: number;
    new: number;
    raske: number;
  };
  words: SonadCompanionWord[];
}

export interface SonadLookupResponse {
  query: string;
  existingWord: {
    id: string;
    lemma: string;
    translation: string;
    forms: { primary: string[] };
    raske: boolean;
  } | null;
  candidates: {
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
        id: string;
        definition: string;
        partOfSpeech: string;
        translations: Record<string, { words: string; weight?: number }[]>;
        examples: string[];
      }[];
    };
  }[];
}

export class SonadClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://sonad.mkin-did-it.workers.dev',
  ) {}

  private headers(jsonBody = false): HeadersInit {
    return {
      Authorization: `Bearer ${this.token.trim()}`,
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  async fetchVocabulary(): Promise<SonadVocabularyResponse> {
    const res = await fetch(`${this.baseUrl}/api/companion/words`, {
      headers: this.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Ошибка загрузки словаря Sõnad.');
    return data as SonadVocabularyResponse;
  }

  async lookupWord(query: string): Promise<SonadLookupResponse> {
    const url = new URL(`${this.baseUrl}/api/companion/lookup`);
    url.searchParams.set('q', query.trim());
    const res = await fetch(url.toString(), {
      headers: this.headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Ошибка поиска слова.');
    return data as SonadLookupResponse;
  }

  async addWordToSonad(input: {
    lemma: string;
    translation: string;
    partOfSpeech?: string;
    forms?: { primary: string[] };
    notes?: string;
    raske?: boolean;
    folderId?: string;
  }) {
    const res = await fetch(`${this.baseUrl}/api/companion/words`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ mode: 'word', ...input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Не удалось сохранить слово в Sõnad.');
    return data as { status: 'created' | 'existing'; word: SonadCompanionWord };
  }

  async addToInbox(text: string) {
    const res = await fetch(`${this.baseUrl}/api/companion/words`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ mode: 'inbox', text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Не удалось отправить в Inbox.');
    return data;
  }
}
```

---

## 4. Универсальный BYOK AI-клиент (Gemini / OpenAI / OpenRouter)

Чтобы пользователь мог вставить API-ключ любой своей нейросети:

1. **Google Gemini (`gemini-2.5-flash`)**:
   - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
   - Body:
     ```json
     {
       "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
       "generationConfig": { "responseMimeType": "application/json" }
     }
     ```
2. **OpenAI (`gpt-4o-mini`) / OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)**:
   - Header: `Authorization: Bearer ${apiKey}`
   - Body:
     ```json
     {
       "model": "gpt-4o-mini",
       "response_format": { "type": "json_object" },
       "messages": [
         { "role": "system", "content": "..." },
         { "role": "user", "content": "..." }
       ]
     }
     ```
