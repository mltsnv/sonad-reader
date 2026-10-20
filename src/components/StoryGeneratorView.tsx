import React, { useEffect, useMemo, useState } from 'react';
import {
  BookCheck,
  Check,
  Feather,
  FolderOpen,
  GraduationCap,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  UserCheck,
  Wand2,
} from 'lucide-react';
import {
  db,
  makeParagraphHash,
  saveSettings,
  type AppSettings,
  type BookRecord,
  type ChapterRecord,
} from '../db';
import {
  generateEstonianStory,
  type StoryWordPromptItem,
} from '../aiClient';
import { pickCoverColor } from '../parsers/bookParser';
import type { SonadCompanionWord } from '../sonadClient';
import type { CefrLevel } from '../dictionary/ekiCefr';

interface StoryGeneratorViewProps {
  sonadWords: SonadCompanionWord[];
  settings: AppSettings;
  onSettingsChange: (next: AppSettings) => void;
  onStoryCreated: (bookId: string) => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
}

type WordSourceMode = 'opin' | 'sonavara' | 'folder' | 'manual';

const BASE_GENRES = [
  { id: 'Уютная повседневность', icon: '☕', label: 'Уютная повседневность' },
  { id: 'Детектив и тайны', icon: '🕵️', label: 'Детектив и тайны' },
  { id: 'Юмор и ирония', icon: '😄', label: 'Юмор и ирония' },
  { id: 'Путешествия по Эстонии', icon: '🚆', label: 'Путешествия по Эстонии' },
  { id: 'Рабочая ситуация', icon: '💼', label: 'Рабочая ситуация' },
  { id: 'Магический реализм', icon: '✨', label: 'Магический реализм' },
  { id: 'Исторические зарисовки', icon: '🏰', label: 'Исторические зарисовки' },
  { id: 'Своя тема', icon: '✍️', label: 'Своя тема' },
];

const DEFAULT_FALLBACK_WORDS: StoryWordPromptItem[] = [
  { lemma: 'otsus', translation: 'решение' },
  { lemma: 'kohvik', translation: 'кафе' },
  { lemma: 'raamat', translation: 'книга' },
  { lemma: 'kogemus', translation: 'опыт' },
  { lemma: 'sõber', translation: 'друг' },
  { lemma: 'hommik', translation: 'утро' },
  { lemma: 'vestlus', translation: 'разговор' },
  { lemma: 'ootama', translation: 'ждать' },
  { lemma: 'leidma', translation: 'находить' },
  { lemma: 'rahulik', translation: 'спокойный' },
];

export const StoryGeneratorView: React.FC<StoryGeneratorViewProps> = ({
  sonadWords,
  settings,
  onSettingsChange,
  onStoryCreated,
  onOpenSettings,
  onOpenProfile,
}) => {
  const profile = settings.profile;

  const [sourceMode, setSourceMode] = useState<WordSourceMode>('opin');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    settings.sonadFolders[0]?.id ?? '',
  );
  const [wordCountTarget, setWordCountTarget] = useState<number>(10);
  const [useKnownSonavara, setUseKnownSonavara] = useState<boolean>(true);
  const [level, setLevel] = useState<CefrLevel>(
    profile.cefrLevel === 'C1' || profile.cefrLevel === 'C2'
      ? 'B2'
      : profile.cefrLevel || 'A2',
  );
  const [genre, setGenre] = useState<string>(
    profile.favoriteGenres[0] || 'Уютная повседневность',
  );
  const [customTopic, setCustomTopic] = useState<string>('');
  const [manualWordsInput, setManualWordsInput] = useState<string>(
    'otsus (решение), kohvik (кафе), raamat (книга), sõber (друг), kogemus (опыт), ootama (ждать)',
  );

  const [pickedWords, setPickedWords] = useState<StoryWordPromptItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opinWords = useMemo(
    () =>
      sonadWords.filter((w) => w.status === 'recalled' || w.status === 'new'),
    [sonadWords],
  );
  const sonavaraWords = useMemo(
    () => sonadWords.filter((w) => w.status === 'sonavara'),
    [sonadWords],
  );
  const folderWords = useMemo(
    () =>
      selectedFolderId
        ? sonadWords.filter((w) => w.folderId === selectedFolderId)
        : [],
    [sonadWords, selectedFolderId],
  );

  const poolForCurrentMode = useMemo(() => {
    if (sourceMode === 'opin') {
      return opinWords.length > 0 ? opinWords : sonadWords;
    }
    if (sourceMode === 'sonavara') {
      return sonavaraWords.length > 0 ? sonavaraWords : sonadWords;
    }
    if (sourceMode === 'folder') {
      return folderWords;
    }
    return [];
  }, [sourceMode, opinWords, sonavaraWords, folderWords, sonadWords]);

  const sampleWordsFromPool = (pool: SonadCompanionWord[], count: number) => {
    if (pool.length === 0) {
      setPickedWords(DEFAULT_FALLBACK_WORDS.slice(0, count));
      return;
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setPickedWords(
      shuffled.slice(0, count).map((w) => ({
        lemma: w.lemma,
        translation: w.translation,
      })),
    );
  };

  useEffect(() => {
    if (sourceMode !== 'manual') {
      sampleWordsFromPool(poolForCurrentMode, wordCountTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, selectedFolderId, wordCountTarget, sonadWords.length]);

  const availableGenres = useMemo(() => {
    const map = new Map<
      string,
      { id: string; icon: string; label: string; isFav?: boolean }
    >();
    for (const fg of profile.favoriteGenres) {
      const base = BASE_GENRES.find((b) => b.id === fg);
      map.set(fg, {
        id: fg,
        icon: base?.icon ?? '❤️',
        label: fg,
        isFav: true,
      });
    }
    for (const b of BASE_GENRES) {
      if (!map.has(b.id)) {
        map.set(b.id, b);
      }
    }
    return Array.from(map.values());
  }, [profile.favoriteGenres]);

  const parseManualWords = (): StoryWordPromptItem[] => {
    return manualWordsInput
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((raw) => {
        const match = raw.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          return { lemma: match[1].trim(), translation: match[2].trim() };
        }
        const dash = raw.split(/\s*[-—]\s*/);
        if (dash.length >= 2) {
          return {
            lemma: dash[0].trim(),
            translation: dash.slice(1).join(' - ').trim(),
          };
        }
        return { lemma: raw, translation: '' };
      });
  };

  const handleGenerate = async () => {
    setError(null);
    const activeTargetWords =
      sourceMode === 'manual' ? parseManualWords() : pickedWords;

    if (activeTargetWords.length === 0) {
      setError(
        'Выберите или введите хотя бы 3 эстонских слова для генерации рассказа.',
      );
      return;
    }

    if (settings.aiProvider !== 'cloudflare' && !settings.aiApiKey.trim()) {
      setError(
        'Укажите ваш API-ключ нейросети (Gemini, OpenAI, Claude, OpenRouter или Groq) в разделе «Настройки» (Seaded) или переключитесь на встроенный Cloudflare AI.',
      );
      return;
    }

    setGenerating(true);
    try {
      const knownSample = useKnownSonavara
        ? sonavaraWords
            .sort(() => Math.random() - 0.5)
            .slice(0, 30)
            .map((w) => w.lemma)
        : [];

      const result = await generateEstonianStory({
        targetWords: activeTargetWords,
        knownWordsSample: knownSample,
        level,
        genre,
        customTopic:
          genre === 'Своя тема' ? customTopic : customTopic || undefined,
        paragraphCount: level === 'A1' ? 5 : 6,
        profile,
      });

      const now = new Date().toISOString();
      const bookId = `ai-story-${Date.now()}`;
      const chapterId = `${bookId}-ch-0`;

      const bookRecord: BookRecord = {
        id: bookId,
        title: result.title,
        titleRu: result.titleRu,
        author: `AI · Уровень ${level} · ${genre}`,
        source: 'ai',
        level,
        genre,
        targetWords:
          result.usedWords.length > 0
            ? result.usedWords
            : activeTargetWords.map((w) => w.lemma),
        totalChapters: 1,
        totalParagraphs: result.paragraphs.length,
        currentChapterIndex: 0,
        currentParagraphIndex: 0,
        progressPercent: 0,
        coverColor: pickCoverColor(result.title),
        createdAt: now,
        lastReadAt: now,
      };

      const chapterRecord: ChapterRecord = {
        id: chapterId,
        bookId,
        index: 0,
        title: result.title,
        paragraphs: result.paragraphs.map((p, idx) => ({
          id: `p-${idx + 1}`,
          et: p.et,
          ru: p.ru,
          grammarNote: p.grammarNote,
        })),
      };

      await db.transaction(
        'rw',
        db.books,
        db.chapters,
        db.paragraphTranslations,
        async () => {
          await db.books.put(bookRecord);
          await db.chapters.put(chapterRecord);
          for (const p of result.paragraphs) {
            if (p.ru) {
              await db.paragraphTranslations.put({
                id: makeParagraphHash(p.et),
                etText: p.et,
                ruTranslation: p.ru,
                grammarBreakdown: p.grammarNote,
                updatedAt: now,
              });
            }
          }
        },
      );

      onStoryCreated(bookId);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Ошибка при генерации рассказа. Проверьте API-ключ в настройках.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">LOO LUGU · ПЕРСОНАЛЬНЫЙ AI-ГЕНЕРАТОР</span>
          <h1 className="page-title">Создать рассказ со словами Sõnad</h1>
          <p className="page-subtitle">
            Генерация рассказа напрямую через API в 1 клик с учётом ваших изучаемых слов и литературных вкусов из профиля
          </p>
        </div>

        <button
          type="button"
          className="btn-hero-secondary"
          onClick={onOpenProfile}
        >
          <Feather size={16} />
          <span>Мои литературные вкусы ({profile.avatar})</span>
        </button>
      </div>

      {(!settings.sonadToken.trim() ||
        (settings.aiProvider !== 'cloudflare' && !settings.aiApiKey.trim())) && (
        <div className="setup-callout-card">
          <div className="setup-callout-text">
            <strong>Подключите API-ключи в настройках (один раз):</strong>
            <ul>
              {!settings.sonadToken.trim() && (
                <li>
                  Токен <code>Sõnad</code> (<code>sonad_pat_...</code>) для загрузки ваших реальных слов (сейчас используются стартовые слова).
                </li>
              )}
              {settings.aiProvider !== 'cloudflare' && !settings.aiApiKey.trim() && (
                <li>
                  API-ключ вашей нейросети (Gemini, OpenAI, Claude, OpenRouter или Groq) для мгновенной генерации рассказов в 1 клик.
                </li>
              )}
            </ul>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={onOpenSettings}
          >
            <Settings size={16} />
            <span>Открыть настройки</span>
          </button>
        </div>
      )}

      <div className="generator-grid">
        {/* Step 1: Word Source */}
        <section className="generator-card">
          <h2 className="card-step-title">
            <span className="step-num">1</span>
            Источник слов из словаря Sõnad
          </h2>

          <div className="source-options-grid">
            <button
              type="button"
              className={`source-option-btn ${sourceMode === 'opin' ? 'active' : ''}`}
              onClick={() => setSourceMode('opin')}
            >
              <GraduationCap size={20} />
              <div className="source-option-info">
                <strong>Слова, которые учу (Õpin)</strong>
                <span>
                  {opinWords.length > 0
                    ? `Доступно ${opinWords.length} слов`
                    : '8–15 актуальных слов для закрепления'}
                </span>
              </div>
            </button>

            <button
              type="button"
              className={`source-option-btn ${sourceMode === 'sonavara' ? 'active' : ''}`}
              onClick={() => setSourceMode('sonavara')}
            >
              <BookCheck size={20} />
              <div className="source-option-info">
                <strong>Выученные слова (Sõnavara)</strong>
                <span>
                  {sonavaraWords.length > 0
                    ? `В запасе ${sonavaraWords.length} слов`
                    : 'Повторение выученных слов в контексте'}
                </span>
              </div>
            </button>

            <button
              type="button"
              className={`source-option-btn ${sourceMode === 'folder' ? 'active' : ''}`}
              onClick={() => setSourceMode('folder')}
            >
              <FolderOpen size={20} />
              <div className="source-option-info">
                <strong>Папка / Список из Sõnad</strong>
                <span>
                  {settings.sonadFolders.length > 0
                    ? `Папок: ${settings.sonadFolders.length}`
                    : 'Выберите тематическую папку'}
                </span>
              </div>
            </button>

            <button
              type="button"
              className={`source-option-btn ${sourceMode === 'manual' ? 'active' : ''}`}
              onClick={() => setSourceMode('manual')}
            >
              <Wand2 size={20} />
              <div className="source-option-info">
                <strong>Ввести свои слова</strong>
                <span>Любой список слов через запятую</span>
              </div>
            </button>
          </div>

          {sourceMode === 'folder' && (
            <div className="folder-picker-box">
              {settings.sonadFolders.length > 0 ? (
                <select
                  className="input-select"
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                >
                  {settings.sonadFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="muted-hint">
                  Папки появятся после синхронизации со словарём Sõnad в настройках.
                </p>
              )}
            </div>
          )}

          {sourceMode === 'manual' ? (
            <div className="manual-words-box">
              <label className="field-label">
                Введите эстонские слова (можно с переводом в скобках):
              </label>
              <textarea
                className="input-textarea"
                rows={3}
                value={manualWordsInput}
                onChange={(e) => setManualWordsInput(e.target.value)}
                placeholder="otsus (решение), kohvik (кафе), raamat (книга)..."
              />
            </div>
          ) : (
            <div className="picked-words-preview">
              <div className="picked-words-header">
                <span>
                  Выбрано слов для рассказа: <strong>{pickedWords.length}</strong>
                </span>
                <div className="picked-words-controls">
                  <select
                    className="count-select"
                    value={wordCountTarget}
                    onChange={(e) => setWordCountTarget(Number(e.target.value))}
                  >
                    <option value={8}>8 слов</option>
                    <option value={10}>10 слов</option>
                    <option value={12}>12 слов</option>
                    <option value={15}>15 слов</option>
                  </select>
                  <button
                    type="button"
                    className="btn-small-ghost"
                    onClick={() =>
                      sampleWordsFromPool(poolForCurrentMode, wordCountTarget)
                    }
                  >
                    <RefreshCw size={14} />
                    <span>Перемешать</span>
                  </button>
                </div>
              </div>

              <div className="picked-words-chips">
                {pickedWords.map((w, idx) => (
                  <span key={`${w.lemma}-${idx}`} className="picked-word-chip">
                    <strong>{w.lemma}</strong>
                    {w.translation && <em> — {w.translation}</em>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={useKnownSonavara}
              onChange={(e) => setUseKnownSonavara(e.target.checked)}
            />
            <span>
              Учитывать уже выученные слова из <strong>Sõnavara</strong> (
              {sonavaraWords.length}) при построении текста
            </span>
          </label>
        </section>

        {/* Step 2: Profile Taste Summary + CEFR Level & Genre */}
        <section className="generator-card">
          <h2 className="card-step-title">
            <span className="step-num">2</span>
            Уровень, жанр и ваши литературные предпочтения
          </h2>

          <div className="profile-context-banner">
            <div className="profile-context-top">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={profile.useProfileInAi}
                  onChange={(e) => {
                    const next = saveSettings({
                      profile: {
                        ...profile,
                        useProfileInAi: e.target.checked,
                      },
                    });
                    onSettingsChange(next);
                  }}
                />
                <span>
                  <UserCheck
                    size={15}
                    style={{ verticalAlign: 'middle', marginRight: 5 }}
                  />
                  <strong>Применять вкусы из моего профиля ({profile.name})</strong>
                </span>
              </label>

              <button
                type="button"
                className="btn-small-ghost"
                onClick={onOpenProfile}
              >
                Настроить профиль →
              </button>
            </div>

            {profile.useProfileInAi && (
              <div className="profile-context-details">
                {profile.favoriteAuthors.length > 0 && (
                  <span>
                    <strong>Ориентиры стиля:</strong>{' '}
                    {profile.favoriteAuthors.slice(0, 3).join(', ')}
                  </span>
                )}
                {profile.favoriteTopics.length > 0 && (
                  <span>
                    <strong>Любимые темы:</strong>{' '}
                    {profile.favoriteTopics.slice(0, 4).join(', ')}
                  </span>
                )}
                {profile.recurringCharacters && (
                  <span>
                    <strong>Постоянные герои:</strong>{' '}
                    {profile.recurringCharacters}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="field-block">
            <label className="field-label">Уровень эстонского языка (CEFR):</label>
            <div className="cefr-selector-grid">
              {(
                [
                  { id: 'A1', desc: 'Простые фразы и настоящее время' },
                  { id: 'A2', desc: 'Повседневная лексика и базовые падежи' },
                  { id: 'B1', desc: 'Связный сюжет и живые диалоги' },
                  { id: 'B2', desc: 'Богатый язык и сложные конструкции' },
                ] as { id: CefrLevel; desc: string }[]
              ).map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  className={`cefr-option-card ${level === lvl.id ? 'active' : ''}`}
                  onClick={() => setLevel(lvl.id)}
                >
                  <div className="cefr-option-top">
                    <span className={`cefr-badge cefr-${lvl.id.toLowerCase()}`}>
                      {lvl.id}
                    </span>
                    {level === lvl.id && <Check size={16} />}
                  </div>
                  <span className="cefr-option-desc">{lvl.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-block">
            <label className="field-label">
              Жанр или ситуация (избранные жанры из профиля идут первыми):
            </label>
            <div className="genre-pills-grid">
              {availableGenres.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`genre-pill-btn ${genre === g.id ? 'active' : ''}`}
                  onClick={() => setGenre(g.id)}
                >
                  <span>{g.icon}</span>
                  <span>{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-block">
            <label className="field-label">
              Дополнительное пожелание к сюжету этого рассказа (необязательно):
            </label>
            <input
              type="text"
              className="input-text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Напр.: действие происходит в Тарту зимой, герои обсуждают поездку на Сааремаа..."
            />
          </div>

          {error && <div className="generator-error-banner">{error}</div>}

          <button
            type="button"
            className="btn-generate-story"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={20} className="spin" />
                <span>Пишем рассказ на эстонском и переводим по абзацам...</span>
              </>
            ) : (
              <>
                <Sparkles size={20} />
                <span>Сгенерировать рассказ ({level}) и открыть в «Билингва»</span>
              </>
            )}
          </button>
        </section>
      </div>
    </div>
  );
};
