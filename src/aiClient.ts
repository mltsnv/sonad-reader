import {
  db,
  loadSettings,
  makeParagraphHash,
  type AiProviderId,
  type AppSettings,
  type UserProfile,
} from './db';
import type { CefrLevel } from './dictionary/ekiCefr';
import {
  analyzeEstonianGrammarOffline,
  translateWithTartuNlp,
} from './dictionary/tartunlp';

export const CLOUDFLARE_READER_ORIGIN =
  'https://sonad-reader.mkin-did-it.workers.dev';

export interface GeneratedStoryResult {
  title: string;
  titleRu: string;
  paragraphs: {
    et: string;
    ru: string;
    grammarNote?: string;
  }[];
  usedWords: string[];
}

export interface StoryWordPromptItem {
  lemma: string;
  translation: string;
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const slice =
    firstBrace >= 0 && lastBrace > firstBrace
      ? candidate.slice(firstBrace, lastBrace + 1)
      : candidate;
  return JSON.parse(slice);
}

async function callAiJson(
  systemPrompt: string,
  userPrompt: string,
  overrideSettings?: Partial<AppSettings>,
): Promise<unknown> {
  const settings = { ...loadSettings(), ...overrideSettings };
  const provider: AiProviderId = settings.aiProvider;
  const apiKey = settings.aiApiKey.trim();
  const model = settings.aiModel.trim();

  // 1. Built-in Cloudflare Workers AI (@cf/google/gemma-4-26b-a4b-it — 0 € no key required!)
  if (provider === 'cloudflare') {
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === '127.0.0.1' ||
        window.location.hostname === 'localhost');
    const endpoint = isLocalhost
      ? `${CLOUDFLARE_READER_ORIGIN}/api/ai`
      : '/api/ai';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        userPrompt,
        model: model.startsWith('@cf/') ? model : '@cf/google/gemma-4-26b-a4b-it',
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      text?: string;
    };

    if (!res.ok) {
      throw new Error(
        data.error ?? `Ошибка встроенного облачного AI (код ${res.status}).`,
      );
    }

    if (!data.text) {
      throw new Error('Пустой ответ от встроенного облачного AI.');
    }

    return extractJsonObject(data.text);
  }

  if (!apiKey) {
    throw new Error(
      'API-ключ не указан. Выберите «Встроенный Облачный AI (Cloudflare — без ключей)» в Настройках или вставьте ваш API-ключ.',
    );
  }

  if (provider === 'gemini') {
    const modelName = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.72,
        },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    if (!res.ok) {
      throw new Error(
        data.error?.message ?? `Ошибка Gemini API (код ${res.status}).`,
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('Пустой ответ от Gemini API.');
    return extractJsonObject(text);
  }

  if (provider === 'anthropic') {
    const modelName = model || 'claude-3-5-haiku-latest';
    const baseUrl =
      settings.customBaseUrl.trim() || 'https://api.anthropic.com/v1/messages';
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4096,
        system: `${systemPrompt}\nОтвечай СТРОГО валидным JSON-объектом без лишнего текста.`,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      content?: { text?: string }[];
    };

    if (!res.ok) {
      throw new Error(
        data.error?.message ?? `Ошибка Anthropic API (код ${res.status}).`,
      );
    }

    const text = data.content?.[0]?.text ?? '';
    if (!text) throw new Error('Пустой ответ от Anthropic Claude.');
    return extractJsonObject(text);
  }

  const endpoint =
    settings.customBaseUrl.trim() ||
    (provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions');

  const modelName =
    model ||
    (provider === 'groq'
      ? 'llama-3.3-70b-versatile'
      : provider === 'openrouter'
        ? 'deepseek/deepseek-chat:free'
        : 'gpt-4o-mini');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] =
      window.location.origin || CLOUDFLARE_READER_ORIGIN;
    headers['X-Title'] = 'Sonad Reader (Lugemik)';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      ...(provider !== 'openrouter'
        ? { response_format: { type: 'json_object' } }
        : {}),
      temperature: 0.72,
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\nВсегда возвращай ответ СТРОГО в формате JSON без пояснений до или после JSON.`,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };

  if (!res.ok) {
    throw new Error(
      data.error?.message ?? `Ошибка AI API (код ${res.status}).`,
    );
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Пустой ответ от нейросети.');
  return extractJsonObject(text);
}

export async function verifyAiKey(
  overrideSettings?: Partial<AppSettings>,
): Promise<{ ok: boolean; modelReply: string }> {
  const raw = (await callAiJson(
    'Ты помощник приложения Sõnad Reader. Ответь коротким JSON: {"status":"ok","greeting":"Tere!"}',
    'Проверь соединение и верни JSON {"status":"ok","greeting":"Tere! Соединение с AI успешно работает."}',
    overrideSettings,
  )) as { status?: string; greeting?: string };

  return {
    ok: true,
    modelReply: raw.greeting || 'Tere! Соединение успешно проверено.',
  };
}

function buildProfileStyleInstructions(profile?: UserProfile): string {
  if (!profile || !profile.useProfileInAi) return '';
  const lines: string[] = [];
  if (profile.favoriteAuthors.length > 0) {
    lines.push(
      `• Вдохновляйся атмосферой и авторской манерой любимых писателей читателя: ${profile.favoriteAuthors.join(', ')}.`,
    );
  }
  if (profile.favoriteTopics.length > 0) {
    lines.push(
      `• Любимые темы, детали и локации читателя (по возможности вплетай их в фон истории): ${profile.favoriteTopics.join(', ')}.`,
    );
  }
  if (profile.preferredTone.trim()) {
    lines.push(
      `• Желаемый тон и настроение рассказа: ${profile.preferredTone.trim()}.`,
    );
  }
  if (profile.recurringCharacters.trim()) {
    lines.push(
      `• Постоянные герои читателя (используй их как главных или второстепенных персонажей): ${profile.recurringCharacters.trim()}.`,
    );
  }
  if (profile.avoidTopics.trim()) {
    lines.push(`• Чего следует избегать: ${profile.avoidTopics.trim()}.`);
  }
  if (lines.length === 0) return '';
  return `\nЛИЧНЫЙ ПРОФИЛЬ И ВКУСЫ ЧИТАТЕЛЯ:\n${lines.join('\n')}`;
}

export async function generateEstonianStory(params: {
  targetWords: StoryWordPromptItem[];
  knownWordsSample?: string[];
  level: CefrLevel;
  genre: string;
  customTopic?: string;
  paragraphCount?: number;
  profile?: UserProfile;
}): Promise<GeneratedStoryResult> {
  const count = params.paragraphCount ?? 6;
  const targetList = params.targetWords
    .map((w) => (w.translation ? `${w.lemma} (${w.translation})` : w.lemma))
    .join(', ');
  const knownHint =
    params.knownWordsSample && params.knownWordsSample.length > 0
      ? `\nТакже пользователь уже знает эти слова (можно свободно использовать их в тексте): ${params.knownWordsSample
          .slice(0, 35)
          .join(', ')}.`
      : '';

  const profileBlock = buildProfileStyleInstructions(params.profile);

  const systemPrompt = `Ты — опытный преподаватель эстонского языка и талантливый эстонский писатель.
Твоя задача — написать увлекательный, естественный и грамотный рассказ на эстонском языке уровня ${params.level} для русскоязычного читателя.
Обязательно используй целевые слова из списка пользователя (в подходящих по смыслу падежах или формах глагола).
Соблюдай точный баланс длины: ${count} осмысленных абзацев (по 2–4 предложения в каждом).
Для каждого абзаца дай точный, литературный и понятный перевод на русский язык, а также краткую подсказку по грамматике (1–3 ключевые словоформы или падежа из этого абзаца с объяснением).`;

  const userPrompt = `Напиши рассказ на эстонском языке.
Уровень сложности: ${params.level}
Жанр / ситуация: ${params.genre}${params.customTopic ? ` (${params.customTopic})` : ''}
Целевые слова из словаря Sõnad, которые нужно органично вплести в рассказ:
${targetList}${knownHint}${profileBlock}

Верни СТРОГО JSON следующей структуры:
{
  "title": "Заголовок на эстонском",
  "titleRu": "Заголовок на русском",
  "paragraphs": [
    {
      "et": "Текст абзаца на эстонском языке...",
      "ru": "Точный перевод этого абзаца на русский язык...",
      "grammarNote": "• словоформа (лемма) — объяснение падежа/конструкции на русском"
    }
  ],
  "usedWords": ["список", "использованных", "начальных", "форм", "целевых", "слов"]
}`;

  const raw = (await callAiJson(
    systemPrompt,
    userPrompt,
  )) as Partial<GeneratedStoryResult>;
  if (!raw || !Array.isArray(raw.paragraphs) || raw.paragraphs.length === 0) {
    throw new Error(
      'Нейросеть вернула некорректный формат рассказа. Попробуйте ещё раз.',
    );
  }

  return {
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : 'Uus lugu',
    titleRu:
      typeof raw.titleRu === 'string' && raw.titleRu.trim()
        ? raw.titleRu.trim()
        : 'Новый рассказ',
    paragraphs: raw.paragraphs
      .filter((p) => p && typeof p.et === 'string' && p.et.trim())
      .map((p) => ({
        et: p.et.trim(),
        ru: typeof p.ru === 'string' ? p.ru.trim() : '',
        grammarNote:
          typeof p.grammarNote === 'string' ? p.grammarNote.trim() : undefined,
      })),
    usedWords: Array.isArray(raw.usedWords)
      ? raw.usedWords.filter((w): w is string => typeof w === 'string')
      : params.targetWords.map((w) => w.lemma),
  };
}

async function translateGoogleFreeFallback(etText: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=et&tl=ru&dt=t&q=${encodeURIComponent(
    etText,
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Сервис бесплатного перевода временно недоступен.');
  }
  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Неожиданный ответ сервиса перевода.');
  }
  const parts = (data[0] as unknown[])
    .map((segment) =>
      Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '',
    )
    .join('');
  return parts.trim();
}

export async function translateParagraphText(etText: string): Promise<string> {
  const hash = makeParagraphHash(etText);
  const cached = await db.paragraphTranslations.get(hash);
  if (cached?.ruTranslation) {
    return cached.ruTranslation;
  }

  let ruTranslation = (await translateWithTartuNlp(etText)) ?? '';

  if (!ruTranslation) {
    try {
      ruTranslation = await translateGoogleFreeFallback(etText);
    } catch {
      const raw = (await callAiJson(
        'Ты профессиональный переводчик с эстонского языка на русский.',
        `Переведи следующий абзац с эстонского на русский язык точно и естественно. Верни JSON: {"ru": "перевод"}\n\nАбзац:\n${etText}`,
      )) as { ru?: string; translation?: string };
      ruTranslation = (raw.ru || raw.translation || '').trim();
    }
  }

  if (ruTranslation) {
    await db.paragraphTranslations.put({
      id: hash,
      etText,
      ruTranslation,
      grammarBreakdown: cached?.grammarBreakdown,
      updatedAt: new Date().toISOString(),
    });
  }

  return ruTranslation;
}

export async function explainParagraphGrammar(etText: string): Promise<string> {
  const hash = makeParagraphHash(etText);
  const cached = await db.paragraphTranslations.get(hash);
  if (cached?.grammarBreakdown) {
    return cached.grammarBreakdown;
  }

  let grammarBreakdown = '';
  try {
    const raw = (await callAiJson(
      'Ты преподаватель эстонского языка для русскоязычных студентов. Объясняй грамматику компактно, понятно и доброжелательно.',
      `Разбери грамматику этого эстонского абзаца (падежи существительных, формы глаголов, управление, послелоги).
Верни JSON:
{
  "grammar": "• словоформа (начальная форма) — падеж/форма и почему она здесь используется\\n• ..."
}

Текст:
${etText}`,
    )) as { grammar?: string | string[] };

    grammarBreakdown = Array.isArray(raw.grammar)
      ? raw.grammar.join('\n')
      : typeof raw.grammar === 'string'
        ? raw.grammar.trim()
        : '';
  } catch {
    grammarBreakdown = analyzeEstonianGrammarOffline(etText);
  }

  if (!grammarBreakdown) {
    grammarBreakdown = analyzeEstonianGrammarOffline(etText);
  }

  await db.paragraphTranslations.put({
    id: hash,
    etText,
    ruTranslation: cached?.ruTranslation ?? '',
    grammarBreakdown,
    updatedAt: new Date().toISOString(),
  });

  return grammarBreakdown;
}
