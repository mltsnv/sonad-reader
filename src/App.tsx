import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  BookOpenText,
  ExternalLink,
  Flame,
  Library,
  Moon,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import {
  calculateReadingStreak,
  db,
  ensureStarterStoriesSeeded,
  loadSettings,
  saveSettings,
  todayIsoDate,
  type AppSettings,
  type ReaderTheme,
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
    document.documentElement.setAttribute(
      'data-theme',
      settings.readerTheme === 'dark' ? 'dark' : 'light',
    );
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cycleTheme = () => {
    const order: ReaderTheme[] = ['light', 'sepia', 'dark'];
    const idx = order.indexOf(settings.readerTheme);
    const nextTheme = order[(idx + 1) % order.length];
    const next = saveSettings({ readerTheme: nextTheme });
    setSettings(next);
  };

  const profile = settings.profile;
  const today = todayIsoDate();
  const readToday = profile.dailyReadCount[today] ?? 0;
  const dailyGoal = Math.max(5, profile.dailyParagraphGoal || 15);
  const dailyPercent = Math.min(100, Math.round((readToday / dailyGoal) * 100));
  const streak = calculateReadingStreak(profile.readDays);

  const navItems: {
    tab: NavTab;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ size?: number }>;
    badge?: number;
    isAccent?: boolean;
  }[] = [
    {
      tab: 'library',
      label: 'Raamatud',
      subtitle: 'Библиотека',
      icon: Library,
      badge: books.length > 0 ? books.length : undefined,
    },
    {
      tab: 'reader',
      label: 'Lugemine',
      subtitle: 'Чтение',
      icon: BookOpen,
    },
    {
      tab: 'generator',
      label: 'Loo lugu',
      subtitle: 'AI-рассказ',
      icon: Sparkles,
      isAccent: true,
    },
    {
      tab: 'profile',
      label: 'Profiil',
      subtitle: 'Вкусы и цели',
      icon: User,
    },
  ];

  return (
    <div className={`app-shell app-theme-${settings.readerTheme}`}>
      {/* Left Sidebar (Desktop) / Bottom Nav (Mobile) */}
      <aside className="sidebar" aria-label="Боковая панель навигации">
        <button
          type="button"
          className="brand"
          onClick={() => setActiveTab('library')}
        >
          lugemik<span>.</span>
        </button>
        <div className="brand-caption">SÕNAD READER · БИЛИНГВА</div>

        <nav aria-label="Главная навигация">
          {navItems.map(({ tab, label, subtitle, icon: Icon, badge, isAccent }) => (
            <button
              key={tab}
              type="button"
              className={`nav-item ${activeTab === tab ? 'active' : ''} ${
                isAccent ? 'nav-add' : ''
              }`}
              aria-current={activeTab === tab ? 'page' : undefined}
              onClick={() => setActiveTab(tab)}
            >
              <Icon size={21} />
              <span>
                {label}
                <small>{subtitle}</small>
              </span>
              {badge !== undefined && <span className="nav-count">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {/* Mini Daily Reading Goal Widget */}
          <div
            className="sidebar-goal-widget"
            onClick={() => setActiveTab('profile')}
            role="button"
            tabIndex={0}
          >
            <div className="sidebar-goal-top">
              <span>Дневная норма</span>
              <strong>
                {readToday}/{dailyGoal} абз.
              </strong>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.max(5, dailyPercent)}%`,
                  backgroundColor: dailyPercent >= 100 ? '#059669' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          <a
            href="https://sonad.mkin-did-it.workers.dev"
            target="_blank"
            rel="noreferrer"
            className="nav-item external-sonad-link"
          >
            <BookOpenText size={19} />
            <span>
              Открыть Sõnad
              <small>Основной словарь</small>
            </span>
            <ExternalLink size={14} style={{ marginLeft: 'auto', opacity: 0.6 }} />
          </a>

          <button
            type="button"
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>
              Seaded
              <small>Настройки и API</small>
            </span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="main-column">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-brand"
              onClick={() => setActiveTab('library')}
            >
              lugemik<span>.</span>
            </button>

            <span className="topbar-label">
              {activeTab === 'library' && 'RAAMATUD · КНИЖНАЯ ПОЛКА'}
              {activeTab === 'reader' && 'LUGEMINE · РЕЖИМ БИЛИНГВА'}
              {activeTab === 'generator' && 'LOO LUGU · AI-ГЕНЕРАТОР РАССКАЗОВ'}
              {activeTab === 'profile' && 'MINU PROFIIL · ЛИЧНЫЕ ПРЕДПОЧТЕНИЯ'}
              {activeTab === 'settings' && 'SEADED · НАСТРОЙКИ И КЛЮЧИ'}
            </span>

            {activeBook && activeTab !== 'reader' && (
              <button
                type="button"
                className="topbar-continue-pill"
                onClick={() => setActiveTab('reader')}
                title="Вернуться к чтению текущей книги"
              >
                <BookOpen size={14} />
                <span>Читать: {activeBook.title}</span>
              </button>
            )}
          </div>

          <div className="topbar-right">
            {/* Sõnad Sync Status Indicator */}
            <button
              type="button"
              className="connection-pill"
              onClick={() => setActiveTab('settings')}
              title="Статус синхронизации со словарём Sõnad"
            >
              <span
                className={`status-dot ${
                  settings.sonadToken.trim() ? 'connected' : 'local'
                }`}
              />
              <span className="hide-mobile">
                {settings.sonadToken.trim()
                  ? `Sõnad: ${sonadWords.length} слов`
                  : 'Подключить Sõnad'}
              </span>
            </button>

            {/* Streak Pill */}
            <button
              type="button"
              className="streak-pill"
              onClick={() => setActiveTab('profile')}
              title="Дневная серия чтения и цель"
            >
              <Flame size={15} />
              <span>{streak} дн.</span>
            </button>

            {/* Theme Switcher */}
            <button
              type="button"
              className="icon-button"
              onClick={cycleTheme}
              title={`Тема: ${
                settings.readerTheme === 'light'
                  ? 'Светлая'
                  : settings.readerTheme === 'sepia'
                    ? 'Сепия'
                    : 'Тёмная'
              }`}
            >
              {settings.readerTheme === 'dark' ? (
                <Moon size={19} />
              ) : (
                <Sun size={19} />
              )}
            </button>

            {/* User Profile Button */}
            <button
              type="button"
              className={`profile-topbar-btn ${
                activeTab === 'profile' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('profile')}
              title="Личный профиль и литературные вкусы"
            >
              <span className="profile-topbar-avatar">{profile.avatar}</span>
              <span className="hide-mobile">{profile.name}</span>
              <span className="profile-topbar-level">{profile.cefrLevel}</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              className={`icon-button ${
                activeTab === 'settings' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('settings')}
              title="Настройки"
            >
              <SettingsIcon size={20} />
            </button>
          </div>
        </header>

        {/* Active View */}
        <div className="app-viewport">
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
              <div className="page-container">
                <div className="empty-library-box">
                  <BookOpen size={40} />
                  <h3>Выберите книгу для чтения</h3>
                  <p>Откройте библиотеку или сгенерируйте новый рассказ.</p>
                  <button
                    type="button"
                    className="btn-hero-primary"
                    onClick={() => setActiveTab('library')}
                  >
                    Перейти в библиотеку
                  </button>
                </div>
              </div>
            ))}

          {activeTab === 'profile' && (
            <ProfileView
              settings={settings}
              books={books}
              sonadWords={sonadWords}
              bookmarksCount={bookmarks.length}
              onSettingsChange={setSettings}
              onGoToGenerator={() => setActiveTab('generator')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              sonadWords={sonadWords}
              onSettingsChange={setSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
};
