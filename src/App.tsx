import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowUpRight,
  BookOpen,
  BookOpenText,
  Plus,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from 'lucide-react';
import {
  db,
  ensureStarterStoriesSeeded,
  loadSettings,
  type AppSettings,
} from './db';
import { LibraryView } from './components/LibraryView';
import { StoryGeneratorView } from './components/StoryGeneratorView';
import { ReaderView } from './components/ReaderView';
import { SettingsView } from './components/SettingsView';
import { ProfileView } from './components/ProfileView';

export type NavTab =
  | 'library'
  | 'reader'
  | 'generator'
  | 'profile'
  | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('library');
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    ensureStarterStoriesSeeded();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.readerTheme);
  }, [settings.readerTheme]);

  const books = useLiveQuery(
    () => db.books.orderBy('lastReadAt').reverse().toArray(),
    [],
    [],
  );

  const sonadWords = useLiveQuery(() => db.sonadWords.toArray(), [], []);
  const bookmarks = useLiveQuery(
    () => db.bookmarks.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  );

  const currentBookId = activeBookId ?? books[0]?.id ?? null;

  const activeBook = useLiveQuery(
    () => (currentBookId ? db.books.get(currentBookId) : undefined),
    [currentBookId],
  );

  const activeChapters = useLiveQuery(
    () =>
      currentBookId
        ? db.chapters.where('bookId').equals(currentBookId).sortBy('index')
        : [],
    [currentBookId],
    [],
  );

  const handleOpenBook = (bookId: string) => {
    setActiveBookId(bookId);
    setActiveTab('reader');
    window.scrollTo({ top: 0 });
  };

  const handleOpenBookAtChapter = async (
    bookId: string,
    chapterIndex: number,
  ) => {
    await db.books.update(bookId, {
      currentChapterIndex: chapterIndex,
      lastReadAt: new Date().toISOString(),
    });
    setActiveBookId(bookId);
    setActiveTab('reader');
    window.scrollTo({ top: 0 });
  };

  const navItems: {
    tab: NavTab;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ size?: number }>;
    isAdd?: boolean;
  }[] = [
    {
      tab: 'library',
      label: 'Raamatud',
      subtitle: 'Книги',
      icon: BookOpen,
    },
    {
      tab: 'reader',
      label: 'Lugemine',
      subtitle: 'Чтение',
      icon: BookOpenText,
    },
    {
      tab: 'generator',
      label: 'Loo lugu',
      subtitle: 'Создать',
      icon: Plus,
      isAdd: true,
    },
    {
      tab: 'profile',
      label: 'Profiil',
      subtitle: 'Вкусы',
      icon: SlidersHorizontal,
    },
  ];

  const isConnected = Boolean(settings.sonadToken.trim());

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Навигация">
        <button
          type="button"
          className="brand"
          onClick={() => setActiveTab('library')}
        >
          lugemik<span>.</span>
        </button>

        <nav aria-label="Главная навигация">
          {navItems.map(({ tab, label, subtitle, icon: Icon, isAdd }) => (
            <button
              key={tab}
              type="button"
              className={`nav-item ${activeTab === tab ? 'active' : ''} ${
                isAdd ? 'nav-add' : ''
              }`}
              aria-current={activeTab === tab ? 'page' : undefined}
              onClick={() => setActiveTab(tab)}
            >
              <Icon size={21} />
              <span>
                {label}
                <small>{subtitle}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <a
            href="https://sonad.mkin-did-it.workers.dev"
            target="_blank"
            rel="noreferrer"
            className="nav-item"
          >
            <ArrowUpRight size={20} />
            <span>Sõnad</span>
          </a>

          <button
            type="button"
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>Настройки</span>
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <span />
          <button
            type="button"
            className="mobile-brand"
            onClick={() => setActiveTab('library')}
          >
            lugemik<span>.</span>
          </button>

          <div className="topbar-right">
            <button
              type="button"
              className="connection"
              onClick={() => setActiveTab('settings')}
              aria-label="Статус Sõnad"
            >
              <span
                className={`status-dot ${isConnected ? '' : 'is-offline'}`}
              />
              {!isConnected && <span>Sõnad не подключён</span>}
            </button>

            <button
              type="button"
              className={`icon-button ${
                activeTab === 'settings' ? 'active' : ''
              }`}
              aria-label="Настройки"
              title="Настройки"
              onClick={() => setActiveTab('settings')}
            >
              <SettingsIcon size={21} />
            </button>
          </div>
        </header>

        <main id="main" className="main-content">
          {activeTab === 'library' && (
            <LibraryView
              books={books}
              bookmarks={bookmarks}
              onOpenBook={handleOpenBook}
              onOpenBookAtChapter={handleOpenBookAtChapter}
              onGoToGenerator={() => setActiveTab('generator')}
            />
          )}

          {activeTab === 'generator' && (
            <StoryGeneratorView
              sonadWords={sonadWords}
              settings={settings}
              onSettingsChange={setSettings}
              onStoryCreated={handleOpenBook}
              onOpenSettings={() => setActiveTab('settings')}
              onOpenProfile={() => setActiveTab('profile')}
            />
          )}

          {activeTab === 'reader' &&
            (activeBook && activeChapters.length > 0 ? (
              <ReaderView
                book={activeBook}
                chapters={activeChapters}
                sonadWords={sonadWords}
                bookmarks={bookmarks}
                settings={settings}
                onSettingsChange={setSettings}
                onBackToLibrary={() => setActiveTab('library')}
              />
            ) : (
              <div className="empty">
                <div className="empty-icon">
                  <BookOpen size={30} />
                </div>
                <h2>Книга не выбрана</h2>
                <p>Выберите книгу на полке или сгенерируйте новый текст.</p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setActiveTab('library')}
                >
                  Открыть библиотеку
                </button>
              </div>
            ))}

          {activeTab === 'profile' && (
            <ProfileView
              settings={settings}
              onSettingsChange={setSettings}
              onGoToGenerator={() => setActiveTab('generator')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              books={books}
              sonadWords={sonadWords}
              onSettingsChange={setSettings}
            />
          )}
        </main>
      </div>
    </div>
  );
};
