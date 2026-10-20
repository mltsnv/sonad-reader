import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Languages,
  List,
  Loader2,
  Minus,
  Plus,
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
} from '../db';
import {
  explainParagraphGrammar,
  translateParagraphText,
} from '../aiClient';
import type { SonadCompanionWord } from '../sonadClient';
import { createVocabularyIndex, tokenizeParagraph } from '../tokenizer';
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

  const [bilingualMode, setBilingualMode] = useState<'parallel' | 'tap'>(
    'parallel',
  );
  const [revealedParagraphs, setRevealedParagraphs] = useState<
    Record<string, boolean>
  >({});
  const [openGrammarNotes, setOpenGrammarNotes] = useState<
    Record<string, boolean>
  >({});
  const [localTranslations, setLocalTranslations] = useState<
    Record<string, { ru?: string; grammar?: string }>
  >({});
  const [loadingParagraphId, setLoadingParagraphId] = useState<string | null>(
    null,
  );
  const [loadingGrammarId, setLoadingGrammarId] = useState<string | null>(null);

  const [selectedWord, setSelectedWord] = useState<{
    word: string;
    sentence: string;
  } | null>(null);

  useEffect(() => {
    setChapterIndex(
      Math.min(book.currentChapterIndex || 0, Math.max(0, chapters.length - 1)),
    );
  }, [book.id, book.currentChapterIndex, chapters.length]);

  const currentChapter: ChapterRecord | undefined =
    chapters[chapterIndex] ?? chapters[0];

  useEffect(() => {
    let active = true;
    async function loadCached() {
      if (!currentChapter) return;
      const hashes = currentChapter.paragraphs.map((p) =>
        makeParagraphHash(p.et),
      );
      const cached = await db.paragraphTranslations.bulkGet(hashes);
      if (!active) return;
      const map: Record<string, { ru?: string; grammar?: string }> = {};
      currentChapter.paragraphs.forEach((p, idx) => {
        const item = cached[idx];
        map[p.id] = {
          ru: p.ru || item?.ruTranslation,
          grammar: p.grammarNote || item?.grammarBreakdown,
        };
      });
      setLocalTranslations(map);
    }
    loadCached();
    return () => {
      active = false;
    };
  }, [currentChapter]);

  const vocabIndex = useMemo(
    () => createVocabularyIndex(sonadWords, book.targetWords ?? []),
    [sonadWords, book.targetWords],
  );

  const bookmarkedIds = useMemo(() => {
    const set = new Set<string>();
    for (const bm of bookmarks) {
      if (bm.bookId === book.id && bm.chapterIndex === chapterIndex) {
        set.add(bm.paragraphId);
      }
    }
    return set;
  }, [bookmarks, book.id, chapterIndex]);

  const handleSelectChapter = async (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(chapters.length - 1, nextIdx));
    setChapterIndex(clamped);
    setShowToc(false);
    const progressPercent = Math.round(
      ((clamped + 1) / Math.max(1, chapters.length)) * 100,
    );
    await db.books.update(book.id, {
      currentChapterIndex: clamped,
      progressPercent,
      lastReadAt: new Date().toISOString(),
    });
    const updatedSettings = recordParagraphsReadToday(2);
    onSettingsChange(updatedSettings);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const next = saveSettings({ [key]: value });
    onSettingsChange(next);
  };

  const speakEstonian = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'et-EE';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };

  const handleToggleTranslation = async (p: BookParagraph) => {
    const isCurrentlyOpen =
      bilingualMode === 'parallel'
        ? !(revealedParagraphs[p.id] === false)
        : Boolean(revealedParagraphs[p.id]);

    if (isCurrentlyOpen && bilingualMode === 'tap') {
      setRevealedParagraphs((prev) => ({ ...prev, [p.id]: false }));
      return;
    }

    setRevealedParagraphs((prev) => ({ ...prev, [p.id]: true }));
    const updatedSettings = recordParagraphsReadToday(1);
    onSettingsChange(updatedSettings);

    const existingRu = localTranslations[p.id]?.ru || p.ru;
    if (existingRu) return;

    setLoadingParagraphId(p.id);
    try {
      const translated = await translateParagraphText(p.et);
      setLocalTranslations((prev) => ({
        ...prev,
        [p.id]: { ...prev[p.id], ru: translated },
      }));
    } finally {
      setLoadingParagraphId(null);
    }
  };

  const handleGrammarExplain = async (p: BookParagraph) => {
    if (openGrammarNotes[p.id]) {
      setOpenGrammarNotes((prev) => ({ ...prev, [p.id]: false }));
      return;
    }

    setOpenGrammarNotes((prev) => ({ ...prev, [p.id]: true }));
    const existingGrammar = localTranslations[p.id]?.grammar || p.grammarNote;
    if (existingGrammar) return;

    setLoadingGrammarId(p.id);
    try {
      const grammarNote = await explainParagraphGrammar(p.et);
      setLocalTranslations((prev) => ({
        ...prev,
        [p.id]: {
          ...prev[p.id],
          grammar: grammarNote,
        },
      }));
    } catch (err: unknown) {
      setLocalTranslations((prev) => ({
        ...prev,
        [p.id]: {
          ...prev[p.id],
          grammar:
            err instanceof Error
              ? err.message
              : 'Не удалось получить разбор абзаца.',
        },
      }));
    } finally {
      setLoadingGrammarId(null);
    }
  };

  const handleToggleBookmark = async (p: BookParagraph) => {
    const id = `${book.id}:${chapterIndex}:${p.id}`;
    if (bookmarkedIds.has(p.id)) {
      await db.bookmarks.delete(id);
    } else {
      await db.bookmarks.put({
        id,
        bookId: book.id,
        bookTitle: book.title,
        chapterIndex,
        paragraphId: p.id,
        etText: p.et,
        ruText: localTranslations[p.id]?.ru || p.ru,
        createdAt: new Date().toISOString(),
      });
    }
  };

  if (!currentChapter) return null;

  return (
    <section className="reader-section">
      {/* Minimal Reader Header */}
      <div className="reader-bar">
        <button
          type="button"
          className="text-button"
          onClick={onBackToLibrary}
        >
          <ArrowLeft size={18} />
          <span>Raamatud</span>
        </button>

        <div className="reader-bar-controls">
          <div className="mini-segmented">
            <button
              type="button"
              className={bilingualMode === 'parallel' ? 'selected' : ''}
              onClick={() => setBilingualMode('parallel')}
            >
              Билингва
            </button>
            <button
              type="button"
              className={bilingualMode === 'tap' ? 'selected' : ''}
              onClick={() => setBilingualMode('tap')}
            >
              По нажатию
            </button>
          </div>

          {chapters.length > 1 && (
            <button
              type="button"
              className={`icon-button ${showToc ? 'active' : ''}`}
              onClick={() => {
                setShowToc((v) => !v);
                setShowTypography(false);
              }}
              title="Оглавление"
            >
              <List size={19} />
            </button>
          )}

          <button
            type="button"
            className={`icon-button ${showTypography ? 'active' : ''}`}
            onClick={() => {
              setShowTypography((v) => !v);
              setShowToc(false);
            }}
            title="Шрифт и подсветка"
          >
            <SlidersHorizontal size={19} />
          </button>
        </div>
      </div>

      {/* Typography Popover */}
      {showTypography && (
        <div className="form-card reader-drawer">
          <div className="drawer-row">
            <span>Шрифт</span>
            <div className="mini-segmented">
              {(
                [
                  { id: 'serif', label: 'Serif' },
                  { id: 'sans', label: 'Sans' },
                ] as { id: ReaderFontFamily; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={
                    settings.readerFontFamily === f.id ? 'selected' : ''
                  }
                  onClick={() => updateSetting('readerFontFamily', f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="drawer-row">
            <span>Размер ({settings.readerFontSize}px)</span>
            <div className="mini-segmented">
              <button
                type="button"
                onClick={() =>
                  updateSetting(
                    'readerFontSize',
                    Math.max(15, settings.readerFontSize - 1),
                  )
                }
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSetting(
                    'readerFontSize',
                    Math.min(28, settings.readerFontSize + 1),
                  )
                }
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="drawer-row">
            <span>Подчёркивать изучаемые слова (Õpin)</span>
            <button
              type="button"
              className={settings.highlightOpin ? 'selected' : ''}
              onClick={() =>
                updateSetting('highlightOpin', !settings.highlightOpin)
              }
            >
              <span className="switch" />
            </button>
          </div>
        </div>
      )}

      {/* Table of Contents */}
      {showToc && chapters.length > 1 && (
        <div className="form-card reader-drawer">
          <div className="toc-list">
            {chapters.map((ch, idx) => (
              <button
                key={ch.id}
                type="button"
                className={`toc-item ${idx === chapterIndex ? 'selected' : ''}`}
                onClick={() => handleSelectChapter(idx)}
              >
                <span>{idx + 1}. {ch.title}</span>
                <span>{ch.paragraphs.length} абз.</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Book Title */}
      <header className="reader-head">
        <span className="eyebrow">
          {[book.level, book.genre, book.author].filter(Boolean).join(' · ') ||
            'LUGEMINE'}
        </span>
        <h1 lang="et">{book.title}</h1>
        {book.titleRu && <p className="reader-subtitle">{book.titleRu}</p>}
      </header>

      {/* Paragraphs */}
      <div
        className={`reader-body font-${settings.readerFontFamily}`}
        style={
          {
            '--reader-size': `${settings.readerFontSize}px`,
          } as React.CSSProperties
        }
      >
        {currentChapter.paragraphs.map((p) => {
          const segments = tokenizeParagraph(p.et);
          const ruText = localTranslations[p.id]?.ru || p.ru;
          const grammarText = localTranslations[p.id]?.grammar || p.grammarNote;
          const showRu =
            bilingualMode === 'parallel'
              ? Boolean(ruText) || Boolean(revealedParagraphs[p.id])
              : Boolean(revealedParagraphs[p.id]);
          const showGrammar = Boolean(openGrammarNotes[p.id]);
          const isBookmarked = bookmarkedIds.has(p.id);

          return (
            <article key={p.id} className="paragraph-item">
              <p className="et-paragraph" lang="et">
                {segments.map((seg, i) => {
                  if (!seg.isWord) {
                    return <React.Fragment key={i}>{seg.text}</React.Fragment>;
                  }

                  const matched = vocabIndex.matchWord(seg.cleanWord);
                  const isTarget = vocabIndex.isTargetWord(seg.cleanWord);

                  let wordClass = 'et-word';
                  if (
                    settings.highlightOpin &&
                    (isTarget ||
                      (matched && matched.status !== 'sonavara'))
                  ) {
                    wordClass += ' is-marked';
                  }

                  return (
                    <span
                      key={i}
                      className={wordClass}
                      onClick={() =>
                        setSelectedWord({
                          word: seg.text,
                          sentence: p.et,
                        })
                      }
                    >
                      {seg.text}
                    </span>
                  );
                })}
              </p>

              {showRu && (
                <div className="ru-paragraph">
                  {loadingParagraphId === p.id ? (
                    <span className="inline-loading">
                      <Loader2 size={14} className="spin" /> Перевод…
                    </span>
                  ) : ruText ? (
                    <p>{ruText}</p>
                  ) : (
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => handleToggleTranslation(p)}
                    >
                      Показать русский перевод
                    </button>
                  )}
                </div>
              )}

              {showGrammar && (
                <div className="grammar-note">
                  {loadingGrammarId === p.id ? (
                    <span className="inline-loading">
                      <Loader2 size={14} className="spin" /> Разбор…
                    </span>
                  ) : (
                    <p>{grammarText}</p>
                  )}
                </div>
              )}

              <div className="paragraph-tools">
                <button
                  type="button"
                  className={`para-icon-btn ${showRu && ruText ? 'active' : ''}`}
                  onClick={() => handleToggleTranslation(p)}
                  title="Перевод абзаца"
                >
                  <Languages size={15} />
                </button>

                <button
                  type="button"
                  className={`para-icon-btn ${showGrammar ? 'active' : ''}`}
                  onClick={() => handleGrammarExplain(p)}
                  title="Грамматика"
                >
                  <Sparkles size={15} />
                </button>

                <button
                  type="button"
                  className="para-icon-btn"
                  onClick={() => speakEstonian(p.et)}
                  title="Озвучить"
                >
                  <Volume2 size={15} />
                </button>

                <button
                  type="button"
                  className={`para-icon-btn ${isBookmarked ? 'active' : ''}`}
                  onClick={() => handleToggleBookmark(p)}
                  title="В закладки"
                >
                  <Bookmark
                    size={15}
                    fill={isBookmarked ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Chapter Pager */}
      {chapters.length > 1 && (
        <div className="chapter-pager">
          <button
            type="button"
            className="secondary"
            disabled={chapterIndex <= 0}
            onClick={() => handleSelectChapter(chapterIndex - 1)}
          >
            <ChevronLeft size={17} />
            <span>Предыдущая</span>
          </button>

          <span className="pager-status">
            {chapterIndex + 1} / {chapters.length}
          </span>

          <button
            type="button"
            className="primary"
            disabled={chapterIndex >= chapters.length - 1}
            onClick={() => handleSelectChapter(chapterIndex + 1)}
          >
            <span>Следующая</span>
            <ChevronRight size={17} />
          </button>
        </div>
      )}

      {selectedWord && (
        <WordPopover
          clickedWord={selectedWord.word}
          sentenceContext={selectedWord.sentence}
          localWords={sonadWords}
          settings={settings}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </section>
  );
};
