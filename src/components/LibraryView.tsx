import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  FileText,
  FolderUp,
  Loader2,
  Plus,
  Search,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  db,
  type BookmarkRecord,
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
  bookmarks: BookmarkRecord[];
  onOpenBook: (bookId: string) => void;
  onOpenBookAtChapter: (bookId: string, chapterIndex: number) => void;
  onGoToGenerator: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  bookmarks,
  onOpenBook,
  onOpenBookAtChapter,
  onGoToGenerator,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<'all' | 'books' | 'ai' | 'bookmarks'>(
    'all',
  );
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
          : 'Не удалось прочитать файл (.epub, .fb2, .txt).',
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
      'Текст на эстонском';

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
      author: 'Статья / фрагмент',
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

  const handleDeleteBook = async (
    e: React.MouseEvent,
    bookId: string,
    title: string,
  ) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить «${title}»?`)) return;
    await db.transaction('rw', db.books, db.chapters, async () => {
      await db.books.delete(bookId);
      await db.chapters.where('bookId').equals(bookId).delete();
    });
  };

  const booksCount = books.filter(
    (b) =>
      b.source === 'epub' ||
      b.source === 'fb2' ||
      b.source === 'txt' ||
      b.source === 'paste',
  ).length;

  const aiCount = books.filter(
    (b) => b.source === 'ai' || b.source === 'starter',
  ).length;

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

  const sourceLabel = (src: BookRecord['source']) => {
    switch (src) {
      case 'epub':
        return 'EPUB';
      case 'fb2':
        return 'FB2';
      case 'txt':
        return 'TXT';
      case 'paste':
        return 'ТЕКСТ';
      case 'ai':
      case 'starter':
        return 'AI';
    }
  };

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>
            Raamatud<span className="heading-dot">.</span>
          </h1>
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
            className="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <FolderUp size={17} />
            )}
            <span>Файл</span>
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => setShowPasteModal(true)}
          >
            <FileText size={17} />
            <span>Текст</span>
          </button>

          <button
            type="button"
            className="primary"
            onClick={onGoToGenerator}
          >
            <Plus size={17} />
            <span>Рассказ</span>
          </button>
        </div>
      </div>

      {uploadError && <div className="error">{uploadError}</div>}

      <div className="dictionary-toolbar">
        <div className="tabs" role="tablist" aria-label="Фильтр библиотеки">
          <button
            type="button"
            className={filter === 'all' ? 'selected' : ''}
            onClick={() => setFilter('all')}
          >
            Все <span>{books.length}</span>
          </button>
          <button
            type="button"
            className={filter === 'books' ? 'selected' : ''}
            onClick={() => setFilter('books')}
          >
            Книги <span>{booksCount}</span>
          </button>
          <button
            type="button"
            className={filter === 'ai' ? 'selected' : ''}
            onClick={() => setFilter('ai')}
          >
            Рассказы <span>{aiCount}</span>
          </button>
          <button
            type="button"
            className={filter === 'bookmarks' ? 'selected' : ''}
            onClick={() => setFilter('bookmarks')}
          >
            Закладки <span>{bookmarks.length}</span>
          </button>
        </div>

        {filter !== 'bookmarks' && (
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Найти книгу или слово"
            />
            {searchQuery && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
              >
                <X size={15} />
              </button>
            )}
          </label>
        )}
      </div>

      {filter === 'bookmarks' ? (
        bookmarks.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Bookmark size={28} />
            </div>
            <h2>Закладок пока нет</h2>
            <p>Отмечайте абзацы во время чтения, чтобы сохранять цитаты.</p>
          </div>
        ) : (
          <div className="word-list">
            {bookmarks.map((bm) => (
              <article key={bm.id} className="book-row">
                <button
                  type="button"
                  className="book-row-open"
                  onClick={() =>
                    onOpenBookAtChapter(bm.bookId, bm.chapterIndex)
                  }
                >
                  <div className="book-row-main">
                    <div className="book-row-eyebrow">
                      <span>{bm.bookTitle}</span>
                      <span>·</span>
                      <span>Глава {bm.chapterIndex + 1}</span>
                    </div>
                    <strong lang="et">{bm.etText}</strong>
                    {bm.ruText && <span>{bm.ruText}</span>}
                  </div>
                </button>

                <div className="book-row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => {
                      if (!('speechSynthesis' in window)) return;
                      window.speechSynthesis.cancel();
                      const u = new SpeechSynthesisUtterance(bm.etText);
                      u.lang = 'et-EE';
                      u.rate = 0.92;
                      window.speechSynthesis.speak(u);
                    }}
                    title="Озвучить"
                  >
                    <Volume2 size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => db.bookmarks.delete(bm.id)}
                    title="Удалить"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : filteredBooks.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <BookOpen size={28} />
          </div>
          <h2>Список пуст</h2>
          <p>Загрузите файл (.epub, .fb2, .txt) или создайте рассказ.</p>
        </div>
      ) : (
        <div className="word-list">
          {filteredBooks.map((b) => (
            <article key={b.id} className="book-row">
              <button
                type="button"
                className="book-row-open"
                onClick={() => onOpenBook(b.id)}
              >
                <div className="book-row-main">
                  <div className="book-row-eyebrow">
                    <span>{sourceLabel(b.source)}</span>
                    {b.level && (
                      <>
                        <span>·</span>
                        <span>{b.level}</span>
                      </>
                    )}
                    {b.genre && (
                      <>
                        <span>·</span>
                        <span>{b.genre}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      {b.totalChapters > 1
                        ? `Гл. ${b.currentChapterIndex + 1}/${b.totalChapters}`
                        : `${b.totalParagraphs} абз.`}
                    </span>
                  </div>

                  <strong lang="et">{b.title}</strong>
                  {b.titleRu && <span>{b.titleRu}</span>}

                  {b.targetWords && b.targetWords.length > 0 && (
                    <div className="book-row-words" lang="et">
                      {b.targetWords.slice(0, 7).join(' · ')}
                    </div>
                  )}
                </div>

                <div className="book-row-side">
                  {b.progressPercent > 0 && (
                    <span className="book-row-progress">
                      {b.progressPercent}%
                    </span>
                  )}
                  <ArrowRight size={17} className="row-arrow" />
                </div>
              </button>

              <div className="book-row-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={(e) => handleDeleteBook(e, b.id, b.title)}
                  title="Удалить"
                  aria-label={`Удалить ${b.title}`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showPasteModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowPasteModal(false)}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Вставить текст</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPasteModal(false)}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSavePastedText} className="form-card clean-form">
              <label htmlFor="paste-title">Заголовок</label>
              <input
                id="paste-title"
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="Название статьи или заметки"
              />

              <label htmlFor="paste-body">Текст на эстонском</label>
              <textarea
                id="paste-body"
                rows={8}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Вставьте эстонский текст..."
                required
              />

              <div className="form-actions">
                <button type="submit" className="primary">
                  Открыть
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowPasteModal(false)}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
