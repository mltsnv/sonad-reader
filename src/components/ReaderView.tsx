import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Languages,
  List,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  db,
  makeParagraphHash,
  recordParagraphsReadToday,
  saveSettings,
  type AppSettings,
  type BookmarkRecord,
  type BookParagraph,
  type BookRecord,
  type ChapterRecord,
  type ReaderFontFamily,
  type ReaderTheme,
} from '../db';
import {
  explainParagraphGrammar,
  translateParagraphText,
} from '../aiClient';
import { createVocabularyIndex, tokenizeParagraph } from '../tokenizer';
import type { SonadCompanionWord } from '../sonadClient';
import { WordPopover } from './WordPopover';

interface ReaderViewProps {
  book: BookRecord;
  chapters: ChapterRecord[];
  sonadWords: SonadCompanionWord[];
  bookmarks: BookmarkRecord[];
  settings: AppSettings;
  onSettingsChange: (next: AppSettings) => void;
  onBackToLibrary: () => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  chapters,
  sonadWords,
  bookmarks,
  settings,
  onSettingsChange,
  onBackToLibrary,
}) => {
  const [chapterIndex, setChapterIndex] = useState<number>(
    Math.min(book.currentChapterIndex || 0, Math.max(0, chapters.length - 1)),
  );
  const [showToc, setShowToc] = useState(false);
  const [showTypography, setShowTypography] = useState(false);
  const [showAllTranslations, setShowAllTranslations] = useState(false);

  const [openTranslations, setOpenTranslations] = useState<Record<string, boolean>>({});
  const [translationsMap, setTranslationsMap] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});

  const [openGrammar, setOpenGrammar] = useState<Record<string, boolean>>({});
  const [grammarMap, setGrammarMap] = useState<Record<string, string>>({});
  const [grammarLoadingIds, setGrammarLoadingIds] = useState<Record<string, boolean>>({});
  const [paragraphError, setParagraphError] = useState<Record<string, string>>({});

  const [activeWord, setActiveWord] = useState<{
    word: string;
    context: string;
  } | null>(null);

  const currentChapter: ChapterRecord | undefined =
    chapters[chapterIndex] ?? chapters[0];

  useEffect(() => {
    setChapterIndex(
      Math.min(book.currentChapterIndex || 0, Math.max(0, chapters.length - 1)),
    );
  }, [book.id, book.currentChapterIndex, chapters.length]);

  const vocabIndex = useMemo(
    () => createVocabularyIndex(sonadWords, book.targetWords ?? []),
    [sonadWords, book.targetWords],
  );

  const bookmarkedIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookmarks) {
      if (b.bookId === book.id && b.chapterIndex === chapterIndex) {
        set.add(b.paragraphId);
      }
    }
    return set;
  }, [bookmarks, book.id, chapterIndex]);

  // Load cached translations & grammar notes for current chapter from Dexie
  useEffect(() => {
    const ch = currentChapter;
    if (!ch) return;
    let cancelled = false;

    async function loadChapterCache() {
      const nextTrans: Record<string, string> = {};
      const nextGrammar: Record<string, string> = {};

      for (const p of ch.paragraphs) {
        if (p.ru) nextTrans[p.id] = p.ru;
        if (p.grammarNote) nextGrammar[p.id] = p.grammarNote;

        const hash = makeParagraphHash(p.et);
        const cached = await db.paragraphTranslations.get(hash);
        if (cached) {
          if (cached.ruTranslation && !nextTrans[p.id]) {
            nextTrans[p.id] = cached.ruTranslation;
          }
          if (cached.grammarBreakdown && !nextGrammar[p.id]) {
            nextGrammar[p.id] = cached.grammarBreakdown;
          }
        }
      }

      if (!cancelled) {
        setTranslationsMap(nextTrans);
        setGrammarMap(nextGrammar);
      }
    }

    loadChapterCache();
    return () => {
      cancelled = true;
    };
  }, [currentChapter]);

  // Save reading progress when chapter changes
  useEffect(() => {
    if (!currentChapter || chapters.length === 0) return;
    const progressPercent = Math.round(((chapterIndex + 1) / chapters.length) * 100);
    db.books
      .update(book.id, {
        currentChapterIndex: chapterIndex,
        progressPercent,
        lastReadAt: new Date().toISOString(),
      })
      .catch(() => {});
  }, [book.id, chapterIndex, chapters.length, currentChapter]);

  const handleToggleTranslation = async (p: BookParagraph) => {
    const isCurrentlyOpen = Boolean(openTranslations[p.id]);
    if (isCurrentlyOpen) {
      setOpenTranslations((prev) => ({ ...prev, [p.id]: false }));
      return;
    }

    setOpenTranslations((prev) => ({ ...prev, [p.id]: true }));
    setParagraphError((prev) => ({ ...prev, [p.id]: '' }));
    onSettingsChange(recordParagraphsReadToday(1));

    if (translationsMap[p.id]) return;

    setTranslatingIds((prev) => ({ ...prev, [p.id]: true }));
    try {
      const ru = await translateParagraphText(p.et);
      setTranslationsMap((prev) => ({ ...prev, [p.id]: ru }));
    } catch (err: unknown) {
      setParagraphError((prev) => ({
        ...prev,
        [p.id]: err instanceof Error ? err.message : 'Не удалось перевести абзац.',
      }));
    } finally {
      setTranslatingIds((prev) => ({ ...prev, [p.id]: false }));
    }
  };

  const handleToggleGrammar = async (p: BookParagraph) => {
    const isCurrentlyOpen = Boolean(openGrammar[p.id]);
    if (isCurrentlyOpen) {
      setOpenGrammar((prev) => ({ ...prev, [p.id]: false }));
      return;
    }

    setOpenGrammar((prev) => ({ ...prev, [p.id]: true }));
    setParagraphError((prev) => ({ ...prev, [p.id]: '' }));

    if (grammarMap[p.id]) return;

    setGrammarLoadingIds((prev) => ({ ...prev, [p.id]: true }));
    try {
      const explanation = await explainParagraphGrammar(p.et);
      setGrammarMap((prev) => ({ ...prev, [p.id]: explanation }));
    } catch (err: unknown) {
      setParagraphError((prev) => ({
        ...prev,
        [p.id]:
          err instanceof Error
            ? err.message
            : 'Не удалось получить разбор грамматики.',
      }));
    } finally {
      setGrammarLoadingIds((prev) => ({ ...prev, [p.id]: false }));
    }
  };

  const handleToggleBookmark = async (p: BookParagraph) => {
    const bmId = `${book.id}:${chapterIndex}:${p.id}`;
    if (bookmarkedIds.has(p.id)) {
      await db.bookmarks.delete(bmId);
    } else {
      await db.bookmarks.put({
        id: bmId,
        bookId: book.id,
        bookTitle: book.title,
        chapterIndex,
        paragraphId: p.id,
        etText: p.et,
        ruText: translationsMap[p.id] ?? p.ru,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const speakParagraph = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'et-EE';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const next = saveSettings({ [key]: value });
    onSettingsChange(next);
  };

  const goToChapter = (idx: number) => {
    const clamped = Math.max(0, Math.min(chapters.length - 1, idx));
    setChapterIndex(clamped);
    setShowToc(false);
    onSettingsChange(recordParagraphsReadToday(3));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`reader-screen theme-${settings.readerTheme}`}>
      {/* Reader Sticky Sub-Toolbar */}
      <header className="reader-topbar">
        <div className="reader-topbar-left">
          <button
            type="button"
            className="reader-nav-btn"
            onClick={onBackToLibrary}
            title="Назад в библиотеку"
          >
            <ArrowLeft size={18} />
            <span className="hide-mobile">К полке</span>
          </button>

          <div className="reader-book-meta">
            <h1 className="reader-book-title">{book.title}</h1>
            <span className="reader-chapter-subtitle">
              {chapters.length > 1
                ? `Глава ${chapterIndex + 1} из ${chapters.length} · ${currentChapter?.title}`
                : book.author || 'Режим двуязычного чтения «Билингва»'}
            </span>
          </div>
        </div>

        <div className="reader-topbar-actions">
          <button
            type="button"
            className={`reader-tool-btn ${showAllTranslations ? 'active' : ''}`}
            onClick={() => setShowAllTranslations((v) => !v)}
            title="Показать / скрыть параллельный перевод всех абзацев"
          >
            <Languages size={17} />
            <span>Билингва</span>
          </button>

          {chapters.length > 1 && (
            <button
              type="button"
              className={`reader-tool-btn ${showToc ? 'active' : ''}`}
              onClick={() => {
                setShowToc((v) => !v);
                setShowTypography(false);
              }}
              title="Оглавление книги"
            >
              <List size={17} />
              <span className="hide-mobile">Главы ({chapters.length})</span>
            </button>
          )}

          <button
            type="button"
            className={`reader-tool-btn ${showTypography ? 'active' : ''}`}
            onClick={() => {
              setShowTypography((v) => !v);
              setShowToc(false);
            }}
            title="Настройки шрифта, темы и подсветки слов"
          >
            <SlidersHorizontal size={17} />
            <span className="hide-mobile">Шрифт и тема</span>
          </button>
        </div>
      </header>

      {/* Typography & Highlight Settings Drawer */}
      {showTypography && (
        <div className="reader-settings-panel">
          <div className="reader-settings-row">
            <span className="settings-label">Тема чтения</span>
            <div className="segmented-group">
              {(
                [
                  { id: 'light', label: 'Светлая' },
                  { id: 'sepia', label: 'Сепия' },
                  { id: 'dark', label: 'Тёмная' },
                ] as { id: ReaderTheme; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={settings.readerTheme === t.id ? 'active' : ''}
                  onClick={() => updateSetting('readerTheme', t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-settings-row">
            <span className="settings-label">Шрифт</span>
            <div className="segmented-group">
              {(
                [
                  { id: 'serif', label: 'Книжный (Serif)' },
                  { id: 'sans', label: 'Гротеск (Sans)' },
                ] as { id: ReaderFontFamily; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={settings.readerFontFamily === f.id ? 'active' : ''}
                  onClick={() => updateSetting('readerFontFamily', f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-settings-row">
            <span className="settings-label">
              Размер текста: <strong>{settings.readerFontSize}px</strong>
            </span>
            <div className="stepper-controls">
              <button
                type="button"
                onClick={() =>
                  updateSetting(
                    'readerFontSize',
                    Math.max(15, settings.readerFontSize - 1),
                  )
                }
              >
                A−
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSetting(
                    'readerFontSize',
                    Math.min(26, settings.readerFontSize + 1),
                  )
                }
              >
                A+
              </button>
            </div>
          </div>

          <div className="reader-settings-row">
            <span className="settings-label">Подсветка слов из Sõnad в тексте</span>
            <div className="highlight-toggles">
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={settings.highlightOpin}
                  onChange={(e) => updateSetting('highlightOpin', e.target.checked)}
                />
                <span className="legend-opin">Учу сейчас (Õpin)</span>
              </label>
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={settings.highlightSonavara}
                  onChange={(e) =>
                    updateSetting('highlightSonavara', e.target.checked)
                  }
                />
                <span className="legend-sonavara">Выученные (Sõnavara)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Table of Contents Drawer */}
      {showToc && chapters.length > 1 && (
        <div className="reader-toc-panel">
          <h3>Оглавление книги</h3>
          <div className="toc-list">
            {chapters.map((ch, idx) => (
              <button
                key={ch.id}
                type="button"
                className={`toc-item ${idx === chapterIndex ? 'active' : ''}`}
                onClick={() => goToChapter(idx)}
              >
                <span className="toc-num">{idx + 1}.</span>
                <span className="toc-title">{ch.title}</span>
                <span className="toc-count">{ch.paragraphs.length} абз.</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Reading Content */}
      <main
        className={`reader-content font-${settings.readerFontFamily}`}
        style={{
          fontSize: `${settings.readerFontSize}px`,
          lineHeight: settings.readerLineHeight,
        }}
      >
        <div className="reader-chapter-header">
          <div className="reader-badges-row">
            {book.level && (
              <span className={`cefr-badge cefr-${book.level.toLowerCase()}`}>
                Уровень {book.level}
              </span>
            )}
            {book.genre && <span className="reader-genre-pill">{book.genre}</span>}
            <span className="reader-hint-pill">
              Нажмите на любое слово для разбора · Двойной клик по абзацу открывает перевод
            </span>
          </div>

          <h2 className="chapter-heading">
            {currentChapter?.title || book.title}
          </h2>
          {book.titleRu && chapterIndex === 0 && (
            <p className="chapter-heading-ru">{book.titleRu}</p>
          )}

          {book.targetWords && book.targetWords.length > 0 && chapterIndex === 0 && (
            <div className="story-target-words-box">
              <span className="target-words-label">Целевые слова рассказа:</span>
              <div className="target-words-chips">
                {book.targetWords.map((tw) => (
                  <button
                    key={tw}
                    type="button"
                    className="target-word-chip"
                    onClick={() =>
                      setActiveWord({
                        word: tw,
                        context: book.title,
                      })
                    }
                  >
                    {tw}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Paragraphs List */}
        <div className="paragraphs-container">
          {currentChapter?.paragraphs.map((p) => {
            const segments = tokenizeParagraph(p.et);
            const isTranslationVisible =
              showAllTranslations || Boolean(openTranslations[p.id]);
            const isGrammarVisible = Boolean(openGrammar[p.id]);
            const isBookmarked = bookmarkedIds.has(p.id);
            const ruText = translationsMap[p.id];
            const grammarText = grammarMap[p.id];
            const isTranslating = Boolean(translatingIds[p.id]);
            const isGrammarLoading = Boolean(grammarLoadingIds[p.id]);
            const errText = paragraphError[p.id];

            return (
              <article
                key={p.id}
                className={`bilingual-paragraph-block ${
                  p.isHeading ? 'is-subheading' : ''
                }`}
                onDoubleClick={() => handleToggleTranslation(p)}
              >
                <div className="estonian-paragraph-row">
                  <p className="estonian-paragraph-text">
                    {segments.map((seg, i) => {
                      if (!seg.isWord) {
                        return <React.Fragment key={i}>{seg.text}</React.Fragment>;
                      }

                      const matchedSonad = vocabIndex.matchWord(seg.cleanWord);
                      const isTarget = vocabIndex.isTargetWord(seg.cleanWord);

                      let highlightClass = '';
                      if (matchedSonad) {
                        if (
                          (matchedSonad.status === 'new' ||
                            matchedSonad.status === 'recalled') &&
                          settings.highlightOpin
                        ) {
                          highlightClass = 'word-opin';
                        } else if (
                          matchedSonad.status === 'sonavara' &&
                          settings.highlightSonavara
                        ) {
                          highlightClass = 'word-sonavara';
                        }
                      } else if (isTarget) {
                        highlightClass = 'word-target';
                      }

                      return (
                        <span
                          key={i}
                          className={`interactive-word ${highlightClass}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveWord({
                              word: seg.text,
                              context: p.et,
                            });
                          }}
                          title={
                            matchedSonad
                              ? `${matchedSonad.lemma} — ${matchedSonad.translation}`
                              : undefined
                          }
                        >
                          {seg.text}
                        </span>
                      );
                    })}
                  </p>

                  {/* Paragraph quick actions (Bilingual translation, grammar, audio, bookmark) */}
                  <div className="paragraph-side-actions">
                    <button
                      type="button"
                      className={`para-action-btn ${
                        isTranslationVisible ? 'active' : ''
                      }`}
                      onClick={() => handleToggleTranslation(p)}
                      title="Параллельный перевод абзаца на русский"
                    >
                      <Languages size={14} />
                      <span>RU</span>
                    </button>

                    <button
                      type="button"
                      className={`para-action-btn ${isGrammarVisible ? 'active' : ''}`}
                      onClick={() => handleToggleGrammar(p)}
                      title="Разобрать грамматику и падежи в этом абзаце"
                    >
                      <Sparkles size={14} />
                    </button>

                    <button
                      type="button"
                      className={`para-action-btn ${isBookmarked ? 'active' : ''}`}
                      onClick={() => handleToggleBookmark(p)}
                      title={
                        isBookmarked
                          ? 'Удалить из закладок'
                          : 'Сохранить цитату / закладку'
                      }
                    >
                      <Bookmark size={14} />
                    </button>

                    <button
                      type="button"
                      className="para-action-btn"
                      onClick={() => speakParagraph(p.et)}
                      title="Озвучить абзац по-эстонски"
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Parallel Russian Translation Block */}
                {isTranslationVisible && (
                  <div className="russian-translation-box">
                    {isTranslating ? (
                      <div className="para-inline-loading">
                        <Loader2 size={16} className="spin" />
                        <span>Переводим абзац на русский...</span>
                      </div>
                    ) : ruText ? (
                      <p className="russian-translation-text">{ruText}</p>
                    ) : (
                      <button
                        type="button"
                        className="request-translation-btn"
                        onClick={() => handleToggleTranslation(p)}
                      >
                        <Languages size={15} />
                        <span>Загрузить русский перевод этого абзаца</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Grammar Breakdown Block */}
                {isGrammarVisible && (
                  <div className="grammar-breakdown-box">
                    <div className="grammar-box-header">
                      <Sparkles size={15} />
                      <span>Грамматический разбор абзаца</span>
                    </div>
                    {isGrammarLoading ? (
                      <div className="para-inline-loading">
                        <Loader2 size={16} className="spin" />
                        <span>Анализируем падежи и конструкции...</span>
                      </div>
                    ) : (
                      <pre className="grammar-breakdown-text">{grammarText}</pre>
                    )}
                  </div>
                )}

                {errText && <div className="para-error-msg">{errText}</div>}
              </article>
            );
          })}
        </div>

        {/* Footer Chapter Navigation */}
        <footer className="reader-chapter-footer">
          <button
            type="button"
            className="btn-chapter-nav"
            disabled={chapterIndex <= 0}
            onClick={() => goToChapter(chapterIndex - 1)}
          >
            <ChevronLeft size={18} />
            <span>Предыдущая глава</span>
          </button>

          <div className="reader-progress-indicator">
            <BookOpen size={16} />
            <span>
              Глава {chapterIndex + 1} из {chapters.length} (
              {Math.round(((chapterIndex + 1) / Math.max(1, chapters.length)) * 100)}
              %)
            </span>
          </div>

          <button
            type="button"
            className="btn-chapter-nav"
            disabled={chapterIndex >= chapters.length - 1}
            onClick={() => goToChapter(chapterIndex + 1)}
          >
            <span>Следующая глава</span>
            <ChevronRight size={18} />
          </button>
        </footer>
      </main>

      {/* Bottom Sheet Word Popover */}
      {activeWord && (
        <WordPopover
          clickedWord={activeWord.word}
          sentenceContext={activeWord.context}
          localWords={sonadWords}
          settings={settings}
          onClose={() => setActiveWord(null)}
        />
      )}
    </div>
  );
};
