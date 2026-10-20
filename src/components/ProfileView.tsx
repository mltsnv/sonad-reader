import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  Compass,
  Feather,
  Flame,
  Heart,
  Plus,
  Sparkles,
  Target,
  UserCheck,
  X,
} from 'lucide-react';
import {
  calculateReadingStreak,
  saveSettings,
  todayIsoDate,
  type AppSettings,
  type BookRecord,
  type UserProfile,
} from '../db';
import type { SonadCompanionWord } from '../sonadClient';
import type { CefrLevel } from '../dictionary/ekiCefr';

interface ProfileViewProps {
  settings: AppSettings;
  books: BookRecord[];
  sonadWords: SonadCompanionWord[];
  bookmarksCount: number;
  onSettingsChange: (next: AppSettings) => void;
  onGoToGenerator: () => void;
}

const AVATARS = ['🦉', '🦊', '📚', '☕', '🌲', '🌊', '🏛️', '🐈‍⬛', '🦌', '🕯️'];

const GENRE_PRESETS = [
  'Уютная повседневность',
  'Детектив и тайны',
  'Юмор и ирония',
  'Путешествия по Эстонии',
  'Магический реализм',
  'Исторические зарисовки',
  'Научная фантастика',
  'Психологическая проза',
  'Скандинавский нуар',
  'Городские легенды и фольклор',
  'Романтическая история',
  'Рабочие и жизненные диалоги',
];

const AUTHOR_PRESETS = [
  'Andrus Kivirähk (ирония и фольклор)',
  'Indrek Hargla (исторический детектив)',
  'Anton Hansen Tammsaare (классика)',
  'Oskar Luts (тёплый юмор)',
  'Tõnu Õnnepalu (созерцательная проза)',
  'Leelo Tungal (добрая проза)',
  'Сергей Довлатов (таллинские рассказы)',
  'А. П. Чехов (короткий рассказ)',
  'Агата Кристи (классический детектив)',
  'Туве Янссон (северная сказка и уют)',
  'Харуки Мураками (атмосфера и джаз)',
  'Фредрик Бакман (человечные истории)',
];

const TOPIC_PRESETS = [
  'Кафе и гастрономия',
  'Старый Таллинн и Каламая',
  'Студенческий Тарту',
  'Природа, болота (raba) и лес',
  'Острова Saaremaa и Hiiumaa',
  'Морской берег и маяки',
  'IT, стартапы и работа',
  'Книги, культура и кино',
  'Путешествия на поезде',
  'Домашние животные и уют',
  'История и средневековье',
  'Музыка и фестивали',
];

const TONE_PRESETS = [
  'Тёплый, живой и с лёгким юмором',
  'Уютный и спокойный (хюгге)',
  'Интригующий и загадочный',
  'Ироничный и остроумный',
  'Поэтичный и созерцательный',
  'Динамичный, с живыми диалогами',
];

const CHARACTER_TEMPLATES = [
  'Мартин — молодой архитектор из района Каламая и его любопытный рыжий кот Мику',
  'Анна — журналистка из Тарту, которая обожает старые книги и расследует необычные истории',
  'Кристьян и София — пара друзей, которые каждые выходные путешествуют в новый уголок Эстонии',
];

export const ProfileView: React.FC<ProfileViewProps> = ({
  settings,
  books,
  sonadWords,
  bookmarksCount,
  onSettingsChange,
  onGoToGenerator,
}) => {
  const profile = settings.profile;

  const [newGenre, setNewGenre] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [savedBanner, setSavedBanner] = useState(false);

  const updateProfile = (patch: Partial<UserProfile>) => {
    const next = saveSettings({
      profile: {
        ...profile,
        ...patch,
      },
    });
    onSettingsChange(next);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2000);
  };

  const toggleItem = (list: string[], item: string): string[] => {
    return list.includes(item)
      ? list.filter((x) => x !== item)
      : [...list, item];
  };

  const handleAddCustomItem = (
    field: 'favoriteGenres' | 'favoriteAuthors' | 'favoriteTopics',
    value: string,
    clearFn: (v: string) => void,
  ) => {
    const clean = value.trim();
    if (!clean) return;
    const currentList = profile[field];
    if (!currentList.includes(clean)) {
      updateProfile({ [field]: [...currentList, clean] });
    }
    clearFn('');
  };

  const today = todayIsoDate();
  const readToday = profile.dailyReadCount[today] ?? 0;
  const dailyGoal = Math.max(5, profile.dailyParagraphGoal || 15);
  const dailyPercent = Math.min(100, Math.round((readToday / dailyGoal) * 100));
  const streak = calculateReadingStreak(profile.readDays);
  const aiStoriesCount = books.filter((b) => b.source === 'ai').length;

  const allGenres = Array.from(
    new Set([...GENRE_PRESETS, ...profile.favoriteGenres]),
  );
  const allAuthors = Array.from(
    new Set([...AUTHOR_PRESETS, ...profile.favoriteAuthors]),
  );
  const allTopics = Array.from(
    new Set([...TOPIC_PRESETS, ...profile.favoriteTopics]),
  );

  return (
    <div className="page-container">
      {/* Top Heading */}
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">MINU PROFIIL · ЛИЧНЫЙ КАБИНЕТ ЧИТАТЕЛЯ</span>
          <h1 className="page-title">Профиль и литературные вкусы</h1>
          <p className="page-subtitle">
            Настройте любимые жанры, авторов, темы и сквозных героев — нейросеть будет создавать рассказы в вашем любимом стиле
          </p>
        </div>

        <button
          type="button"
          className="btn-hero-accent"
          onClick={onGoToGenerator}
        >
          <Sparkles size={18} />
          <span>Создать рассказ по моим вкусам</span>
        </button>
      </div>

      {savedBanner && (
        <div className="profile-saved-toast">
          <Check size={16} />
          <span>Предпочтения автоматически сохранены</span>
        </div>
      )}

      {/* Hero Profile Card + Daily Goal & Stats */}
      <div className="profile-hero-grid">
        <section className="profile-identity-card">
          <div className="profile-avatar-row">
            <div className="profile-avatar-big">{profile.avatar}</div>
            <div className="profile-identity-fields">
              <label className="field-label">Ваше имя или псевдоним</label>
              <input
                type="text"
                className="input-text"
                value={profile.name}
                onChange={(e) => updateProfile({ name: e.target.value })}
                placeholder="Как к вам обращаться?"
              />
            </div>
          </div>

          <div className="avatar-picker-row">
            <span className="small-caption">Аватар:</span>
            <div className="avatar-options">
              {AVATARS.map((av) => (
                <button
                  key={av}
                  type="button"
                  className={`avatar-btn ${profile.avatar === av ? 'active' : ''}`}
                  onClick={() => updateProfile({ avatar: av })}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-level-goal-row">
            <div className="field-block">
              <label className="field-label">Мой уровень эстонского:</label>
              <div className="segmented-group">
                {(['A1', 'A2', 'B1', 'B2', 'C1'] as CefrLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={profile.cefrLevel === lvl ? 'active' : ''}
                    onClick={() => updateProfile({ cefrLevel: lvl })}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-block">
              <label className="field-label">Дневная цель (абзацев):</label>
              <div className="segmented-group">
                {[10, 15, 25, 40].map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    className={profile.dailyParagraphGoal === goal ? 'active' : ''}
                    onClick={() => updateProfile({ dailyParagraphGoal: goal })}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field-block" style={{ marginBottom: 0 }}>
            <label className="field-label">Моя главная цель в эстонском:</label>
            <input
              type="text"
              className="input-text"
              value={profile.learningGoal}
              onChange={(e) => updateProfile({ learningGoal: e.target.value })}
              placeholder="Напр.: Сдать B1 и читать эстонские книги в оригинале"
            />
          </div>
        </section>

        {/* Reading Progress & Achievements Card */}
        <section className="profile-stats-card">
          <div className="daily-goal-box">
            <div className="daily-goal-header">
              <div className="daily-goal-title">
                <Target size={19} className="accent-icon" />
                <div>
                  <strong>Дневная норма чтения</strong>
                  <span>
                    Сегодня прочитано: {readToday} из {dailyGoal} абзацев
                  </span>
                </div>
              </div>
              <span className="daily-goal-badge">{dailyPercent}%</span>
            </div>
            <div className="progress-bar-track large">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${Math.max(4, dailyPercent)}%`,
                  backgroundColor: dailyPercent >= 100 ? '#059669' : '#111111',
                }}
              />
            </div>
          </div>

          <div className="profile-metrics-grid">
            <div className="profile-metric-tile">
              <div className="metric-icon amber">
                <Flame size={19} />
              </div>
              <div>
                <strong>{streak} дн.</strong>
                <span>Серия чтения</span>
              </div>
            </div>

            <div className="profile-metric-tile">
              <div className="metric-icon">
                <BookOpen size={19} />
              </div>
              <div>
                <strong>{books.length}</strong>
                <span>Книг на полке</span>
              </div>
            </div>

            <div className="profile-metric-tile">
              <div className="metric-icon blue">
                <Award size={19} />
              </div>
              <div>
                <strong>{sonadWords.length}</strong>
                <span>Слов в Sõnad</span>
              </div>
            </div>

            <div className="profile-metric-tile">
              <div className="metric-icon teal">
                <Sparkles size={19} />
              </div>
              <div>
                <strong>{aiStoriesCount}</strong>
                <span>AI-рассказов ({bookmarksCount} цитат)</span>
              </div>
            </div>
          </div>

          <label className="checkbox-row profile-ai-toggle">
            <input
              type="checkbox"
              checked={profile.useProfileInAi}
              onChange={(e) =>
                updateProfile({ useProfileInAi: e.target.checked })
              }
            />
            <span>
              <strong>Учитывать мои вкусы при генерации AI-рассказов</strong> (любимые авторы, темы, тон и сквозные персонажи)
            </span>
          </label>
        </section>
      </div>

      {/* Literary Preferences Sections */}
      <div className="preferences-sections">
        {/* 1. Favorite Genres */}
        <section className="generator-card">
          <div className="settings-card-header">
            <Heart size={21} className="accent-icon" />
            <div>
              <h2>Любимые жанры</h2>
              <p className="muted-hint">
                Отметьте жанры, которые вам приятнее всего читать — они будут предлагаться первыми в генераторе рассказов
              </p>
            </div>
          </div>

          <div className="preference-chips-wrap">
            {allGenres.map((g) => {
              const active = profile.favoriteGenres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  className={`pref-chip ${active ? 'active' : ''}`}
                  onClick={() =>
                    updateProfile({
                      favoriteGenres: toggleItem(profile.favoriteGenres, g),
                    })
                  }
                >
                  {active ? <Check size={14} /> : <Plus size={14} />}
                  <span>{g}</span>
                </button>
              );
            })}
          </div>

          <div className="custom-chip-input-row">
            <input
              type="text"
              className="input-text"
              value={newGenre}
              onChange={(e) => setNewGenre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomItem('favoriteGenres', newGenre, setNewGenre);
                }
              }}
              placeholder="Добавить свой жанр (напр. Киберпанк, Мемуары, Фельетон)..."
            />
            <button
              type="button"
              className="btn-hero-secondary"
              onClick={() =>
                handleAddCustomItem('favoriteGenres', newGenre, setNewGenre)
              }
            >
              <Plus size={16} />
              <span>Добавить</span>
            </button>
          </div>
        </section>

        {/* 2. Favorite Authors & Literary Style */}
        <section className="generator-card">
          <div className="settings-card-header">
            <Feather size={21} className="accent-icon" />
            <div>
              <h2>Любимые авторы и литературный стиль</h2>
              <p className="muted-hint">
                Выберите эстонских или мировых писателей, чья атмосфера, юмор или построение сюжета вам близки
              </p>
            </div>
          </div>

          <div className="preference-chips-wrap">
            {allAuthors.map((author) => {
              const active = profile.favoriteAuthors.includes(author);
              return (
                <button
                  key={author}
                  type="button"
                  className={`pref-chip ${active ? 'active' : ''}`}
                  onClick={() =>
                    updateProfile({
                      favoriteAuthors: toggleItem(
                        profile.favoriteAuthors,
                        author,
                      ),
                    })
                  }
                >
                  {active ? <Check size={14} /> : <Plus size={14} />}
                  <span>{author}</span>
                </button>
              );
            })}
          </div>

          <div className="custom-chip-input-row">
            <input
              type="text"
              className="input-text"
              value={newAuthor}
              onChange={(e) => setNewAuthor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomItem('favoriteAuthors', newAuthor, setNewAuthor);
                }
              }}
              placeholder="Добавить любимого автора (напр. Jaan Kross, Борхес, Рэй Брэдбери)..."
            />
            <button
              type="button"
              className="btn-hero-secondary"
              onClick={() =>
                handleAddCustomItem('favoriteAuthors', newAuthor, setNewAuthor)
              }
            >
              <Plus size={16} />
              <span>Добавить</span>
            </button>
          </div>
        </section>

        {/* 3. Favorite Topics & Estonian Locations */}
        <section className="generator-card">
          <div className="settings-card-header">
            <Compass size={21} className="accent-icon" />
            <div>
              <h2>Любимые темы, места и интересы</h2>
              <p className="muted-hint">
                О чём вам интереснее всего читать? Выберите локации и темы для генерации рассказов
              </p>
            </div>
          </div>

          <div className="preference-chips-wrap">
            {allTopics.map((topic) => {
              const active = profile.favoriteTopics.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  className={`pref-chip ${active ? 'active' : ''}`}
                  onClick={() =>
                    updateProfile({
                      favoriteTopics: toggleItem(profile.favoriteTopics, topic),
                    })
                  }
                >
                  {active ? <Check size={14} /> : <Plus size={14} />}
                  <span>{topic}</span>
                </button>
              );
            })}
          </div>

          <div className="custom-chip-input-row">
            <input
              type="text"
              className="input-text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomItem('favoriteTopics', newTopic, setNewTopic);
                }
              }}
              placeholder="Добавить тему или город (напр. Нарва, Пярну, фотография, яхтинг)..."
            />
            <button
              type="button"
              className="btn-hero-secondary"
              onClick={() =>
                handleAddCustomItem('favoriteTopics', newTopic, setNewTopic)
              }
            >
              <Plus size={16} />
              <span>Добавить</span>
            </button>
          </div>
        </section>

        {/* 4. Narrative Tone & Recurring Characters */}
        <section className="generator-card">
          <div className="settings-card-header">
            <UserCheck size={21} className="accent-icon" />
            <div>
              <h2>Тон повествования и постоянные герои (сериал)</h2>
              <p className="muted-hint">
                Вы можете задать сквозных персонажей — тогда новые AI-рассказы станут главами приключений ваших любимых героев!
              </p>
            </div>
          </div>

          <div className="field-block">
            <label className="field-label">Предпочтительный тон и настроение:</label>
            <div className="preference-chips-wrap" style={{ marginBottom: '0.6rem' }}>
              {TONE_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`pref-chip ${profile.preferredTone === t ? 'active' : ''}`}
                  onClick={() => updateProfile({ preferredTone: t })}
                >
                  <span>{t}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              className="input-text"
              value={profile.preferredTone}
              onChange={(e) => updateProfile({ preferredTone: e.target.value })}
              placeholder="Опишите желаемое настроение текстов..."
            />
          </div>

          <div className="field-block">
            <label className="field-label">
              Постоянные главные герои (необязательно):
            </label>
            <textarea
              className="input-textarea"
              rows={2}
              value={profile.recurringCharacters}
              onChange={(e) =>
                updateProfile({ recurringCharacters: e.target.value })
              }
              placeholder="Напр.: Мартин — архитектор из Таллинна и его рыжий кот Мику..."
            />
            <div className="character-presets-row">
              <span className="small-caption">Примеры героев:</span>
              {CHARACTER_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn-small-ghost"
                  onClick={() => updateProfile({ recurringCharacters: tpl })}
                >
                  Вариант {i + 1}
                </button>
              ))}
              {profile.recurringCharacters && (
                <button
                  type="button"
                  className="btn-small-ghost"
                  onClick={() => updateProfile({ recurringCharacters: '' })}
                >
                  <X size={13} /> Очистить
                </button>
              )}
            </div>
          </div>

          <div className="field-block" style={{ marginBottom: 0 }}>
            <label className="field-label">
              Чего избегать в текстах (необязательно):
            </label>
            <input
              type="text"
              className="input-text"
              value={profile.avoidTopics}
              onChange={(e) => updateProfile({ avoidTopics: e.target.value })}
              placeholder="Напр.: Без мрачных тем, без политики, избегать сложных архаизмов"
            />
          </div>
        </section>
      </div>
    </div>
  );
};
