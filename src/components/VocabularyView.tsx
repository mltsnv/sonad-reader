import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  GraduationCap,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  db,
  type AppSettings,
  type BookmarkRecord,
} from '../db';
import type { SonadCompanionWord } from '../sonadClient';
import { WordPopover } from './WordPopover';

interface VocabularyViewProps {
  sonadWords: SonadCompanionWord[];
  bookmarks: BookmarkRecord[];
  settings: AppSettings;
  onOpenBookAtChapter: (bookId: string, chapterIndex: number) => void;
  onGoToGenerator: () => void;
  onGoToSettings: () => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  sonadWords,
  bookmarks,
  settings,
  onOpenBookAtChapter,
  onGoToGenerator,
  onGoToSettings,
}) => {
  const [subTab, setSubTab] = useState<'words' | 'bookmarks'>('words');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'opin' | 'sonavara'
  >('all');
  const [folderFilter, setFolderFilter] = useState<string>('');
  const [inspectWord, setInspectWord] = useState<string | null>(null);

  const speakEstonian = (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'et-EE';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sonadWords.filter((w) => {
      if (statusFilter === 'opin' && w.status === 'sonavara') return false;
      if (statusFilter === 'sonavara' && w.status !== 'sonavara') return false;
      if (folderFilter && w.folderId !== folderFilter) return false;
      if (!q) return true;
      return (
        w.lemma.toLowerCase().includes(q) ||
        w.translation.toLowerCase().includes(q) ||
        (w.forms?.primary ?? []).some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [sonadWords, searchQuery, statusFilter, folderFilter]);

  const handleDeleteBookmark = async (id: string) => {
    await db.bookmarks.delete(id);
  };

  const opinCount = sonadWords.filter(
    (w) => w.status === 'new' || w.status === 'recalled',
  ).length;
  const sonavaraCount = sonadWords.filter((w) => w.status === 'sonavara').length;

  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">SÕNAVARA & JÄRJEHOIDJAD · СЛОВАРЬ И ЦИТАТЫ</span>
          <h1 className="page-title">Слова из Sõnad и закладки</h1>
          <p className="page-subtitle">
            Все синхронизированные слова, которые подсвечиваются в ваших книгах, и сохранённые цитаты из прочитанного
          </p>
        </div>

        <div className="heading-actions">
          <button
            type="button"
            className="btn-hero-secondary"
            onClick={onGoToSettings}
          >
            <RefreshCw size={16} />
            <span>Синхронизация с Sõnad</span>
          </button>
          <button
            type="button"
            className="btn-hero-accent"
            onClick={onGoToGenerator}
          >
            <Sparkles size={16} />
            <span>Рассказ по словам</span>
          </button>
        </div>
      </div>

      {/* Main Sub-Tabs */}
      <div className="library-filter-bar">
        <div className="segmented-group">
          <button
            type="button"
            className={subTab === 'words' ? 'active' : ''}
            onClick={() => setSubTab('words')}
          >
            Словарь Sõnad ({sonadWords.length})
          </button>
          <button
            type="button"
            className={subTab === 'bookmarks' ? 'active' : ''}
            onClick={() => setSubTab('bookmarks')}
          >
            Закладки и цитаты ({bookmarks.length})
          </button>
        </div>
      </div>

      {subTab === 'words' ? (
        <>
          {/* Filter & Search Toolbar */}
          <div className="vocab-toolbar">
            <div className="vocab-search-box">
              <Search size={17} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по эстонскому слову, формам или переводу..."
              />
            </div>

            <div className="vocab-filters-row">
              <div className="segmented-group">
                <button
                  type="button"
                  className={statusFilter === 'all' ? 'active' : ''}
                  onClick={() => setStatusFilter('all')}
                >
                  Все ({sonadWords.length})
                </button>
                <button
                  type="button"
                  className={statusFilter === 'opin' ? 'active' : ''}
                  onClick={() => setStatusFilter('opin')}
                >
                  Учу · Õpin ({opinCount})
                </button>
                <button
                  type="button"
                  className={statusFilter === 'sonavara' ? 'active' : ''}
                  onClick={() => setStatusFilter('sonavara')}
                >
                  Выучено ({sonavaraCount})
                </button>
              </div>

              {settings.sonadFolders.length > 0 && (
                <select
                  className="folder-select"
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                >
                  <option value="">Все папки</option>
                  {settings.sonadFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {filteredWords.length === 0 ? (
            <div className="empty-library-box">
              <GraduationCap size={40} strokeWidth={1.5} />
              <h3>
                {sonadWords.length === 0
                  ? 'Словарь Sõnad ещё не загружен'
                  : 'Слова по фильтру не найдены'}
              </h3>
              <p>
                {sonadWords.length === 0
                  ? 'Подключите токен sonad_pat_... в разделе «Настройки» или нажимайте на незнакомые слова прямо во время чтения книг.'
                  : 'Попробуйте изменить поисковый запрос или переключить фильтр.'}
              </p>
              {sonadWords.length === 0 && (
                <button
                  type="button"
                  className="btn-hero-primary"
                  onClick={onGoToSettings}
                >
                  Подключить словарь Sõnad
                </button>
              )}
            </div>
          ) : (
            <div className="vocab-cards-list">
              {filteredWords.slice(0, 150).map((w) => (
                <article
                  key={w.id}
                  className="vocab-word-row"
                  onClick={() => setInspectWord(w.lemma)}
                >
                  <div className="vocab-word-main">
                    <div className="vocab-word-title-line">
                      <strong>{w.lemma}</strong>
                      <button
                        type="button"
                        className="icon-btn-round"
                        onClick={(e) => speakEstonian(w.lemma, e)}
                        title="Озвучить"
                      >
                        <Volume2 size={15} />
                      </button>
                      {w.level && (
                        <span className={`cefr-badge cefr-${w.level.toLowerCase()}`}>
                          {w.level}
                        </span>
                      )}
                      <span className={`status-pill status-pill-${w.status}`}>
                        {w.status === 'sonavara'
                          ? 'Sõnavara'
                          : w.status === 'recalled'
                            ? 'Õpin'
                            : 'Новое'}
                      </span>
                    </div>

                    <div className="vocab-word-translation">{w.translation}</div>
                  </div>

                  {w.forms?.primary && w.forms.primary.length > 0 && (
                    <div className="vocab-word-forms">
                      {w.forms.primary.join(' · ')}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      ) : bookmarks.length === 0 ? (
        <div className="empty-library-box">
          <Bookmark size={40} strokeWidth={1.5} />
          <h3>Пока нет сохранённых цитат и закладок</h3>
          <p>
            Во время чтения любой книги или рассказа нажмите на значок закладки у понравившегося абзаца, чтобы сохранить его сюда.
          </p>
        </div>
      ) : (
        <div className="bookmarks-list">
          {bookmarks.map((bm) => (
            <article key={bm.id} className="bookmark-card">
              <div className="bookmark-card-top">
                <button
                  type="button"
                  className="bookmark-book-link"
                  onClick={() =>
                    onOpenBookAtChapter(bm.bookId, bm.chapterIndex)
                  }
                >
                  <BookOpen size={15} />
                  <span>
                    {bm.bookTitle} · Глава {bm.chapterIndex + 1}
                  </span>
                </button>

                <div className="bookmark-actions">
                  <button
                    type="button"
                    className="icon-btn-round"
                    onClick={() => speakEstonian(bm.etText)}
                    title="Озвучить цитату"
                  >
                    <Volume2 size={15} />
                  </button>
                  <button
                    type="button"
                    className="book-delete-btn"
                    onClick={() => handleDeleteBookmark(bm.id)}
                    title="Удалить закладку"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <p
                className="bookmark-et-text"
                onClick={() => setInspectWord(bm.etText.split(/\s+/)[0])}
              >
                «{bm.etText}»
              </p>
              {bm.ruText && <p className="bookmark-ru-text">{bm.ruText}</p>}
            </article>
          ))}
        </div>
      )}

      {inspectWord && (
        <WordPopover
          clickedWord={inspectWord}
          localWords={sonadWords}
          settings={settings}
          onClose={() => setInspectWord(null)}
        />
      )}
    </div>
  );
};
