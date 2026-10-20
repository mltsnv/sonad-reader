import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  FileText,
  FolderUp,
  Loader2,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  db,
  type BookRecord,
  type ChapterRecord,
} from '../db';
import {
  parsePlainText,
  parseUploadedBookFile,
  pickCoverColor,
} from '../parsers/bookParser';

interface LibraryViewProps {
  books: BookRecord[];
  onOpenBook: (bookId: string) => void;
  onGoToGenerator: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  onOpenBook,
  onGoToGenerator,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<'all' | 'books' | 'ai' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadError(null);

    try {
      const parsed = await parseUploadedBookFile(file);
      const now = new Date().toISOString();
      const bookId = `book-${Date.now()}`;
      const totalParagraphs = parsed.chapters.reduce(
        (sum, ch) => sum + ch.paragraphs.length,
        0,
      );

      const bookRecord: BookRecord = {
        id: bookId,
        title: parsed.title,
        author: parsed.author,
        source: parsed.source,
        totalChapters: parsed.chapters.length,
        totalParagraphs,
        currentChapterIndex: 0,
        currentParagraphIndex: 0,
        progressPercent: 0,
        coverColor: pickCoverColor(parsed.title),
        createdAt: now,
        lastReadAt: now,
      };

      const chapterRecords: ChapterRecord[] = parsed.chapters.map((ch, idx) => ({
        id: `${bookId}-ch-${idx}`,
        bookId,
        index: idx,
        title: ch.title,
        paragraphs: ch.paragraphs,
      }));

      await db.transaction('rw', db.books, db.chapters, async () => {
        await db.books.put(bookRecord);
        await db.chapters.bulkPut(chapterRecords);
      });

      onOpenBook(bookId);
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Не удалось прочитать файл книги. Проверьте формат (.epub, .fb2, .txt).',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSavePastedText = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBody = pasteContent.trim();
    if (!cleanBody) return;

    const title =
      pasteTitle.trim() ||
      cleanBody.split('\n')[0].slice(0, 60).trim() ||
      'Свой текст на эстонском';

    const parsed = parsePlainText(cleanBody, title, 'paste');
    const now = new Date().toISOString();
    const bookId = `paste-${Date.now()}`;
    const totalParagraphs = parsed.chapters.reduce(
      (sum, ch) => sum + ch.paragraphs.length,
      0,
    );

    const bookRecord: BookRecord = {
      id: bookId,
      title: parsed.title,
      author: 'Вставленная статья / текст',
      source: 'paste',
      totalChapters: parsed.chapters.length,
      totalParagraphs,
      currentChapterIndex: 0,
      currentParagraphIndex: 0,
      progressPercent: 0,
      coverColor: pickCoverColor(parsed.title),
      createdAt: now,
      lastReadAt: now,
    };

    const chapterRecords: ChapterRecord[] = parsed.chapters.map((ch, idx) => ({
      id: `${bookId}-ch-${idx}`,
      bookId,
      index: idx,
      title: ch.title,
      paragraphs: ch.paragraphs,
    }));

    await db.transaction('rw', db.books, db.chapters, async () => {
      await db.books.put(bookRecord);
      await db.chapters.bulkPut(chapterRecords);
    });

    setShowPasteModal(false);
    setPasteTitle('');
    setPasteContent('');
    onOpenBook(bookId);
  };

  const handleToggleFavorite = async (
    e: React.MouseEvent,
    book: BookRecord,
  ) => {
    e.stopPropagation();
    await db.books.update(book.id, { favorite: !book.favorite });
  };

  const handleDeleteBook = async (
    e: React.MouseEvent,
    bookId: string,
    title: string,
  ) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить «${title}» из библиотеки?`)) return;
    await db.transaction('rw', db.books, db.chapters, async () => {
      await db.books.delete(bookId);
      await db.chapters.where('bookId').equals(bookId).delete();
    });
  };

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((b) => {
      if (filter === 'books') {
        if (
          b.source !== 'epub' &&
          b.source !== 'fb2' &&
          b.source !== 'txt' &&
          b.source !== 'paste'
        )
          return false;
      } else if (filter === 'ai') {
        if (b.source !== 'ai' && b.source !== 'starter') return false;
      } else if (filter === 'favorites') {
        if (!b.favorite) return false;
      }

      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.titleRu ?? '').toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q) ||
        (b.genre ?? '').toLowerCase().includes(q) ||
        (b.targetWords ?? []).some((tw) => tw.toLowerCase().includes(q))
      );
    });
  }, [books, filter, searchQuery]);

  const sourceBadgeLabel = (src: BookRecord['source']) => {
    switch (src) {
      case 'epub':
        return 'EPUB';
      case 'fb2':
        return 'FB2';
      case 'txt':
        return 'TXT';
      case 'paste':
        return 'Статья';
      case 'ai':
        return 'AI-рассказ';
      case 'starter':
        return 'Билингва';
    }
  };

  const recentBook = books[0];

  return (
    <div className="page-container">
      {/* Page Header & Actions */}
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">RAAMATUD · КНИЖНАЯ ПОЛКА И СТАТЬИ</span>
          <h1 className="page-title">Библиотека</h1>
          <p className="page-subtitle">
            Читайте книги в стиле «Билингва», переводите абзацы и сохраняйте новые слова в Sõnad в одно касание
          </p>
        </div>

        <div className="heading-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.fb2,.txt,.zip"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="btn-hero-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <FolderUp size={17} />
            )}
            <span>Загрузить книгу</span>
          </button>

          <button
            type="button"
            className="btn-hero-secondary"
            onClick={() => setShowPasteModal(true)}
          >
            <FileText size={17} />
            <span>Вставить текст</span>
          </button>

          <button
            type="button"
            className="btn-hero-accent"
            onClick={onGoToGenerator}
          >
            <Sparkles size={17} />
            <span>AI-рассказ</span>
          </button>
        </div>
      </div>

      {uploadError && <div className="generator-error-banner">{uploadError}</div>}

      {/* Continue Reading Spotlight */}
      {recentBook && (
        <section
          className="continue-reading-banner"
          onClick={() => onOpenBook(recentBook.id)}
        >
          <div className="continue-reading-info">
            <span className="continue-eyebrow">ПРОДОЛЖИТЬ ЧТЕНИЕ</span>
            <h2>{recentBook.title}</h2>
            {recentBook.titleRu && (
              <p className="continue-title-ru">{recentBook.titleRu}</p>
            )}
            <div className="continue-meta">
              {recentBook.level && (
                <span className={`cefr-badge cefr-${recentBook.level.toLowerCase()}`}>
                  {recentBook.level}
                </span>
              )}
              <span>
                {recentBook.totalChapters > 1
                  ? `Глава ${recentBook.currentChapterIndex + 1} из ${recentBook.totalChapters}`
                  : `${recentBook.totalParagraphs} абзацев`}
              </span>
              {recentBook.genre && <span>· {recentBook.genre}</span>}
            </div>
          </div>

          <button type="button" className="btn-continue-cta">
            <span>Читать дальше</span>
            <ArrowRight size={17} />
          </button>
        </section>
      )}

      {/* Search & Filter Toolbar */}
      <div className="vocab-toolbar">
        <div className="vocab-search-box">
          <Search size={17} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, автору, жанру или целевым словам..."
          />
        </div>

        <div className="segmented-group">
          <button
            type="button"
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            Все ({books.length})
          </button>
          <button
            type="button"
            className={filter === 'books' ? 'active' : ''}
            onClick={() => setFilter('books')}
          >
            Книги и статьи (
            {
              books.filter(
                (b) =>
                  b.source === 'epub' ||
                  b.source === 'fb2' ||
                  b.source === 'txt' ||
                  b.source === 'paste',
              ).length
            }
            )
          </button>
          <button
            type="button"
            className={filter === 'ai' ? 'active' : ''}
            onClick={() => setFilter('ai')}
          >
            AI-рассказы (
            {books.filter((b) => b.source === 'ai' || b.source === 'starter').length}
            )
          </button>
          <button
            type="button"
            className={filter === 'favorites' ? 'active' : ''}
            onClick={() => setFilter('favorites')}
          >
            ★ Избранное ({books.filter((b) => b.favorite).length})
          </button>
        </div>
      </div>

      {/* Bookshelf Grid */}
      {filteredBooks.length === 0 ? (
        <div className="empty-library-box">
          <BookOpen size={42} strokeWidth={1.5} />
          <h3>В этой категории пока нет книг</h3>
          <p>
            Загрузите книгу в формате <code>.epub</code>, <code>.fb2</code> или{' '}
            <code>.txt</code>, вставьте текст статьи с ERR.ee или сгенерируйте рассказ по вашим словам из Sõnad.
          </p>
        </div>
      ) : (
        <div className="books-grid">
          {filteredBooks.map((b) => (
            <div
              key={b.id}
              className="book-card"
              onClick={() => onOpenBook(b.id)}
            >
              <div
                className="book-spine-accent"
                style={{ backgroundColor: b.coverColor || '#1e293b' }}
              />
              <div className="book-card-body">
                <div className="book-card-top">
                  <div className="book-badges">
                    <span className={`source-badge source-${b.source}`}>
                      {sourceBadgeLabel(b.source)}
                    </span>
                    {b.level && (
                      <span className={`cefr-badge cefr-${b.level.toLowerCase()}`}>
                        {b.level}
                      </span>
                    )}
                  </div>

                  <div className="book-card-icon-actions">
                    <button
                      type="button"
                      className={`book-star-btn ${b.favorite ? 'active' : ''}`}
                      onClick={(e) => handleToggleFavorite(e, b)}
                      title={
                        b.favorite ? 'Убрать из избранного' : 'В избранное'
                      }
                    >
                      <Star
                        size={15}
                        fill={b.favorite ? 'currentColor' : 'none'}
                      />
                    </button>
                    <button
                      type="button"
                      className="book-delete-btn"
                      onClick={(e) => handleDeleteBook(e, b.id, b.title)}
                      title="Удалить книгу"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <h3 className="book-card-title">{b.title}</h3>
                {b.titleRu && <p className="book-card-title-ru">{b.titleRu}</p>}
                {b.author && <p className="book-card-author">{b.author}</p>}

                {b.targetWords && b.targetWords.length > 0 && (
                  <div className="book-card-words">
                    {b.targetWords.slice(0, 5).map((w) => (
                      <span key={w} className="mini-word-tag">
                        {w}
                      </span>
                    ))}
                    {b.targetWords.length > 5 && (
                      <span className="mini-word-tag">
                        +{b.targetWords.length - 5}
                      </span>
                    )}
                  </div>
                )}

                <div className="book-card-footer">
                  <div className="progress-bar-track">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.max(4, b.progressPercent || 0)}%`,
                        backgroundColor: b.coverColor || '#1e293b',
                      }}
                    />
                  </div>
                  <div className="progress-meta-row">
                    <span>
                      {b.totalChapters > 1
                        ? `Глава ${b.currentChapterIndex + 1}/${b.totalChapters}`
                        : `${b.totalParagraphs} абз.`}
                    </span>
                    <span>
                      {b.progressPercent > 0 ? `${b.progressPercent}%` : 'Читать →'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paste Custom Estonian Text Modal */}
      {showPasteModal && (
        <div
          className="popover-backdrop"
          onClick={() => setShowPasteModal(false)}
        >
          <div
            className="paste-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popover-header">
              <h2>Вставить свой текст или статью на эстонском</h2>
              <button
                type="button"
                className="icon-btn-close"
                onClick={() => setShowPasteModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePastedText} className="paste-modal-form">
              <div className="field-block">
                <label className="field-label">Заголовок (необязательно):</label>
                <input
                  type="text"
                  className="input-text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="Напр.: Статья из Postimees / ERR..."
                />
              </div>

              <div className="field-block">
                <label className="field-label">Текст на эстонском языке:</label>
                <textarea
                  className="input-textarea"
                  rows={9}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Вставьте сюда любой эстонский текст, новость, письмо или диалог..."
                  required
                />
              </div>

              <div className="paste-modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowPasteModal(false)}
                >
                  Отмена
                </button>
                <button type="submit" className="btn-hero-primary">
                  <BookOpen size={18} />
                  <span>Открыть в режиме «Билингва»</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
