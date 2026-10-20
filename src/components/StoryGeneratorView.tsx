import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
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
  'Повседневность',
  'Детектив',
  'Ирония',
  'Путешествия',
  'Диалог',
  'История',
  'Фантастика',
  'Своя тема',
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
  const [level, setLevel] = useState<CefrLevel>(
    profile.cefrLevel === 'C1' || profile.cefrLevel === 'C2'
      ? 'B2'
      : profile.cefrLevel || 'A2',
  );
  const [genre, setGenre] = useState<string>(
    profile.favoriteGenres[0] || 'Повседневность',
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
    return Array.from(new Set([...profile.favoriteGenres, ...BASE_GENRES]));
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
      setError('Укажите хотя бы 3 слова.');
      return;
    }

    if (settings.aiProvider !== 'cloudflare' && !settings.aiApiKey.trim()) {
      setError('Вставьте API-ключ в настройках или выберите Cloudflare AI.');
      return;
    }

    setGenerating(true);
    try {
      const knownSample = sonavaraWords
        .sort(() => Math.random() - 0.5)
        .slice(0, 30)
        .map((w) => w.lemma);

      const result = await generateEstonianStory({
        targetWords: activeTargetWords,
        knownWordsSample: knownSample,
        level,
        genre,
        customTopic: customTopic.trim() || undefined,
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
        author: `${level} · ${genre}`,
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
          : 'Не удалось сгенерировать рассказ.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="narrow">
      <div className="page-heading">
        <div>
          <h1>
            Loo lugu<span className="heading-dot">.</span>
          </h1>
        </div>
      </div>

      <div className="tabs lisa-tabs" role="tablist" aria-label="Источник слов">
        <button
          type="button"
          className={sourceMode === 'opin' ? 'selected' : ''}
          onClick={() => setSourceMode('opin')}
        >
          Õpin <span>{opinWords.length || 10}</span>
        </button>
        <button
          type="button"
          className={sourceMode === 'sonavara' ? 'selected' : ''}
          onClick={() => setSourceMode('sonavara')}
        >
          Sõnavara <span>{sonavaraWords.length}</span>
        </button>
        {settings.sonadFolders.length > 0 && (
          <button
            type="button"
            className={sourceMode === 'folder' ? 'selected' : ''}
            onClick={() => setSourceMode('folder')}
          >
            Список
          </button>
        )}
        <button
          type="button"
          className={sourceMode === 'manual' ? 'selected' : ''}
          onClick={() => setSourceMode('manual')}
        >
          Вручную
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="form-card">
        {sourceMode === 'folder' && settings.sonadFolders.length > 0 && (
          <div className="field-group">
            <label htmlFor="folder-select">Список из Sõnad</label>
            <select
              id="folder-select"
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
            >
              {settings.sonadFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {sourceMode === 'manual' ? (
          <div className="field-group">
            <label htmlFor="manual-words">Слова через запятую</label>
            <textarea
              id="manual-words"
              rows={3}
              value={manualWordsInput}
              onChange={(e) => setManualWordsInput(e.target.value)}
              placeholder="otsus (решение), kohvik (кафе), raamat (книга)"
            />
          </div>
        ) : (
          <div className="field-group">
            <div className="label-row">
              <label>Слова для текста ({pickedWords.length})</label>
              <div className="inline-controls">
                <div className="mini-segmented">
                  {[8, 10, 12, 15].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={wordCountTarget === n ? 'selected' : ''}
                      onClick={() => setWordCountTarget(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    sampleWordsFromPool(poolForCurrentMode, wordCountTarget)
                  }
                >
                  <RefreshCw size={14} />
                  <span>Обновить</span>
                </button>
              </div>
            </div>

            <div className="chip-cloud">
              {pickedWords.map((w, idx) => (
                <span key={`${w.lemma}-${idx}`} className="word-chip" lang="et">
                  <strong>{w.lemma}</strong>
                  {w.translation && <span>{w.translation}</span>}
                </span>
              ))}
            </div>

            {!settings.sonadToken.trim() && (
              <div className="quiet-note">
                Используется стартовый набор.{' '}
                <button
                  type="button"
                  className="inline-link"
                  onClick={onOpenSettings}
                >
                  Подключить Sõnad →
                </button>
              </div>
            )}
          </div>
        )}

        <div className="field-group">
          <label>Уровень языка</label>
          <div className="segmented-bar">
            {(['A1', 'A2', 'B1', 'B2'] as CefrLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={level === lvl ? 'selected' : ''}
                onClick={() => setLevel(lvl)}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label>Жанр</label>
          <div className="chip-cloud">
            {availableGenres.map((g) => (
              <button
                key={g}
                type="button"
                className={`choice-chip ${genre === g ? 'selected' : ''}`}
                onClick={() => setGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="custom-topic">Детали сюжета (необязательно)</label>
          <input
            id="custom-topic"
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="Например: действие в Тарту зимой, разговор в кафе"
          />
        </div>

        <div className="switch-row">
          <button
            type="button"
            className={`raske-control ${profile.useProfileInAi ? 'selected' : ''}`}
            onClick={() => {
              const next = saveSettings({
                profile: {
                  ...profile,
                  useProfileInAi: !profile.useProfileInAi,
                },
              });
              onSettingsChange(next);
            }}
          >
            <div>
              <strong>Учитывать предпочтения из профиля</strong>
              <small>
                {[
                  ...profile.favoriteAuthors.slice(0, 2),
                  ...profile.favoriteTopics.slice(0, 2),
                ].join(' · ') || 'Жанры, авторы и сквозные персонажи'}
              </small>
            </div>
            <span className="switch" />
          </button>

          <button
            type="button"
            className="text-button"
            onClick={onOpenProfile}
          >
            Изменить профиль →
          </button>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="primary full-width"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={18} className="spin" />
                <span>Генерация текста…</span>
              </>
            ) : (
              <span>Создать рассказ ({level})</span>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
