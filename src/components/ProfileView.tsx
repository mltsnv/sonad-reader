import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  saveSettings,
  type AppSettings,
  type UserProfile,
} from '../db';
import type { CefrLevel } from '../dictionary/ekiCefr';

interface ProfileViewProps {
  settings: AppSettings;
  onSettingsChange: (next: AppSettings) => void;
  onGoToGenerator: () => void;
}

const GENRE_PRESETS = [
  'Повседневность',
  'Детектив',
  'Ирония',
  'Путешествия',
  'Магический реализм',
  'История',
  'Научная фантастика',
  'Психологическая проза',
  'Скандинавский нуар',
  'Диалоги',
];

const AUTHOR_PRESETS = [
  'Andrus Kivirähk',
  'Indrek Hargla',
  'Anton Hansen Tammsaare',
  'Oskar Luts',
  'Tõnu Õnnepalu',
  'Leelo Tungal',
  'Сергей Довлатов',
  'А. П. Чехов',
  'Агата Кристи',
  'Туве Янссон',
  'Харуки Мураками',
  'Фредрик Бакман',
];

const TOPIC_PRESETS = [
  'Таллинн и Каламая',
  'Тарту',
  'Кафе и гастрономия',
  'Природа и море',
  'Saaremaa и Hiiumaa',
  'Архитектура и город',
  'Работа и технологии',
  'Книги и культура',
  'Железная дорога',
  'История Эстонии',
];

const TONE_PRESETS = [
  'Спокойный и лаконичный',
  'Ироничный',
  'Интригующий',
  'Атмосферный',
  'Динамичный, с диалогами',
];

export const ProfileView: React.FC<ProfileViewProps> = ({
  settings,
  onSettingsChange,
  onGoToGenerator,
}) => {
  const profile = settings.profile;

  const [newGenre, setNewGenre] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newTopic, setNewTopic] = useState('');

  const updateProfile = (patch: Partial<UserProfile>) => {
    const next = saveSettings({
      profile: {
        ...profile,
        ...patch,
      },
    });
    onSettingsChange(next);
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
    <section className="narrow">
      <div className="page-heading">
        <div>
          <h1>
            Profiil<span className="heading-dot">.</span>
          </h1>
        </div>
        <button type="button" className="primary" onClick={onGoToGenerator}>
          <span>Создать рассказ</span>
        </button>
      </div>

      <div className="form-card settings-card">
        <h2>Базовые параметры</h2>

        <div className="field-group">
          <label>Уровень языка по умолчанию</label>
          <div className="segmented-bar">
            {(['A1', 'A2', 'B1', 'B2', 'C1'] as CefrLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={profile.cefrLevel === lvl ? 'selected' : ''}
                onClick={() => updateProfile({ cefrLevel: lvl })}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label>Тон повествования</label>
          <div className="chip-cloud">
            {TONE_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                className={`choice-chip ${
                  profile.preferredTone === t ? 'selected' : ''
                }`}
                onClick={() => updateProfile({ preferredTone: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-card settings-card">
        <h2>Жанры</h2>
        <div className="chip-cloud">
          {allGenres.map((g) => {
            const active = profile.favoriteGenres.includes(g);
            return (
              <button
                key={g}
                type="button"
                className={`choice-chip ${active ? 'selected' : ''}`}
                onClick={() =>
                  updateProfile({
                    favoriteGenres: toggleItem(profile.favoriteGenres, g),
                  })
                }
              >
                {g}
              </button>
            );
          })}
        </div>

        <div className="inline-add-row">
          <input
            type="text"
            value={newGenre}
            onChange={(e) => setNewGenre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomItem('favoriteGenres', newGenre, setNewGenre);
              }
            }}
            placeholder="Свой жанр"
          />
          <button
            type="button"
            className="secondary"
            onClick={() =>
              handleAddCustomItem('favoriteGenres', newGenre, setNewGenre)
            }
          >
            <Plus size={16} />
            <span>Добавить</span>
          </button>
        </div>
      </div>

      <div className="form-card settings-card">
        <h2>Авторы и ориентиры стиля</h2>
        <div className="chip-cloud">
          {allAuthors.map((author) => {
            const active = profile.favoriteAuthors.includes(author);
            return (
              <button
                key={author}
                type="button"
                className={`choice-chip ${active ? 'selected' : ''}`}
                onClick={() =>
                  updateProfile({
                    favoriteAuthors: toggleItem(
                      profile.favoriteAuthors,
                      author,
                    ),
                  })
                }
              >
                {author}
              </button>
            );
          })}
        </div>

        <div className="inline-add-row">
          <input
            type="text"
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomItem('favoriteAuthors', newAuthor, setNewAuthor);
              }
            }}
            placeholder="Добавить автора"
          />
          <button
            type="button"
            className="secondary"
            onClick={() =>
              handleAddCustomItem('favoriteAuthors', newAuthor, setNewAuthor)
            }
          >
            <Plus size={16} />
            <span>Добавить</span>
          </button>
        </div>
      </div>

      <div className="form-card settings-card">
        <h2>Темы и локации</h2>
        <div className="chip-cloud">
          {allTopics.map((topic) => {
            const active = profile.favoriteTopics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                className={`choice-chip ${active ? 'selected' : ''}`}
                onClick={() =>
                  updateProfile({
                    favoriteTopics: toggleItem(profile.favoriteTopics, topic),
                  })
                }
              >
                {topic}
              </button>
            );
          })}
        </div>

        <div className="inline-add-row">
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomItem('favoriteTopics', newTopic, setNewTopic);
              }
            }}
            placeholder="Добавить тему или место"
          />
          <button
            type="button"
            className="secondary"
            onClick={() =>
              handleAddCustomItem('favoriteTopics', newTopic, setNewTopic)
            }
          >
            <Plus size={16} />
            <span>Добавить</span>
          </button>
        </div>
      </div>

      <div className="form-card settings-card">
        <h2>Персонажи и ограничения</h2>

        <div className="field-group">
          <label htmlFor="recurring-chars">Сквозные герои</label>
          <textarea
            id="recurring-chars"
            rows={2}
            value={profile.recurringCharacters}
            onChange={(e) =>
              updateProfile({ recurringCharacters: e.target.value })
            }
            placeholder="Например: Мартин — архитектор из Таллинна"
          />
        </div>

        <div className="field-group" style={{ marginBottom: 0 }}>
          <label htmlFor="avoid-topics">Исключить темы</label>
          <input
            id="avoid-topics"
            type="text"
            value={profile.avoidTopics}
            onChange={(e) => updateProfile({ avoidTopics: e.target.value })}
            placeholder="Например: без политики и мрачных сюжетов"
          />
        </div>
      </div>
    </section>
  );
};
