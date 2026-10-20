import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import {
  calculateReadingStreak,
  db,
  DEFAULT_MODELS,
  saveSettings,
  todayIsoDate,
  type AiProviderId,
  type AppSettings,
  type BookRecord,
  type ReaderTheme,
} from '../db';
import { SonadClient, type SonadCompanionWord } from '../sonadClient';
import { verifyAiKey } from '../aiClient';

interface SettingsViewProps {
  settings: AppSettings;
  books: BookRecord[];
  sonadWords: SonadCompanionWord[];
  onSettingsChange: (next: AppSettings) => void;
}

const MODEL_SUGGESTIONS: Record<AiProviderId, { id: string; label: string }[]> = {
  cloudflare: [
    {
      id: '@cf/google/gemma-4-26b-a4b-it',
      label: 'Gemma 4 26B (Workers AI)',
    },
    {
      id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      label: 'Llama 3.3 70B (Workers AI)',
    },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
    {
      id: 'deepseek-r1-distill-llama-70b',
      label: 'deepseek-r1-distill-llama-70b',
    },
  ],
  openrouter: [
    { id: 'deepseek/deepseek-chat:free', label: 'deepseek/deepseek-chat:free' },
    {
      id: 'google/gemini-2.0-flash-exp:free',
      label: 'google/gemini-2.0-flash-exp:free',
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      label: 'meta-llama/llama-3.3-70b-instruct:free',
    },
    { id: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { id: 'gpt-4o', label: 'gpt-4o' },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' },
    { id: 'claude-3-7-sonnet-latest', label: 'claude-3-7-sonnet-latest' },
  ],
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  books,
  sonadWords,
  onSettingsChange,
}) => {
  const [sonadToken, setSonadToken] = useState(settings.sonadToken);
  const [sonadBaseUrl, setSonadBaseUrl] = useState(
    settings.sonadBaseUrl || 'https://sonad.mkin-did-it.workers.dev',
  );
  const [syncingSonad, setSyncingSonad] = useState(false);
  const [sonadMessage, setSonadMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [aiProvider, setAiProvider] = useState<AiProviderId>(
    settings.aiProvider,
  );
  const [aiApiKey, setAiApiKey] = useState(settings.aiApiKey);
  const [aiModel, setAiModel] = useState(settings.aiModel);
  const [testingAi, setTestingAi] = useState(false);
  const [aiMessage, setAiMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleSyncSonad = async () => {
    const cleanToken = sonadToken.trim();
    const cleanUrl =
      sonadBaseUrl.trim() || 'https://sonad.mkin-did-it.workers.dev';

    if (!cleanToken) {
      setSonadMessage({
        type: 'error',
        text: 'Укажите ключ sonad_pat_...',
      });
      return;
    }

    setSyncingSonad(true);
    setSonadMessage(null);

    try {
      const client = new SonadClient(cleanToken, cleanUrl);
      const data = await client.fetchVocabulary();

      await db.transaction('rw', db.sonadWords, async () => {
        await db.sonadWords.clear();
        await db.sonadWords.bulkPut(data.words);
      });

      const next = saveSettings({
        sonadToken: cleanToken,
        sonadBaseUrl: cleanUrl,
        lastSyncAt: new Date().toISOString(),
        sonadSummary: data.summary,
        sonadFolders: data.folders ?? [],
      });
      onSettingsChange(next);

      setSonadMessage({
        type: 'success',
        text: `Синхронизировано: ${data.summary.total} слов (Õpin: ${
          data.summary.recalled + data.summary.new
        }, Sõnavara: ${data.summary.sonavara}).`,
      });
    } catch (err: unknown) {
      setSonadMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Ошибка синхронизации с Sõnad.',
      });
    } finally {
      setSyncingSonad(false);
    }
  };

  const handleProviderChange = (nextProvider: AiProviderId) => {
    setAiProvider(nextProvider);
    const defaultModel = DEFAULT_MODELS[nextProvider];
    setAiModel(defaultModel);
    const next = saveSettings({
      aiProvider: nextProvider,
      aiModel: defaultModel,
    });
    onSettingsChange(next);
  };

  const handleTestAiKey = async () => {
    const next = saveSettings({
      aiProvider,
      aiApiKey: aiApiKey.trim(),
      aiModel: aiModel.trim() || DEFAULT_MODELS[aiProvider],
    });
    onSettingsChange(next);

    setTestingAi(true);
    setAiMessage(null);

    try {
      const res = await verifyAiKey({
        aiProvider,
        aiApiKey: aiApiKey.trim(),
        aiModel: aiModel.trim() || DEFAULT_MODELS[aiProvider],
      });
      setAiMessage({
        type: 'success',
        text: `Подключено: ${res.modelReply}`,
      });
    } catch (err: unknown) {
      setAiMessage({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Не удалось подключиться к API.',
      });
    } finally {
      setTestingAi(false);
    }
  };

  const summary = settings.sonadSummary ?? {
    total: sonadWords.length,
    sonavara: sonadWords.filter((w) => w.status === 'sonavara').length,
    recalled: sonadWords.filter((w) => w.status === 'recalled').length,
    new: sonadWords.filter((w) => w.status === 'new').length,
  };

  const profile = settings.profile;
  const today = todayIsoDate();
  const readToday = profile.dailyReadCount[today] ?? 0;
  const streak = calculateReadingStreak(profile.readDays);

  return (
    <section className="narrow">
      <div className="page-heading">
        <div>
          <h1>
            Настройки<span className="heading-dot">.</span>
          </h1>
        </div>
      </div>

      {/* 1. Theme */}
      <div className="form-card settings-card">
        <h2>Внешний вид</h2>
        <div className="theme-options">
          {(
            [
              { value: 'light', label: 'Светлая', icon: Sun },
              { value: 'sepia', label: 'Сепия', icon: BookOpen },
              { value: 'dark', label: 'Тёмная', icon: Moon },
            ] as { value: ReaderTheme; label: string; icon: typeof Sun }[]
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={settings.readerTheme === value}
              className={settings.readerTheme === value ? 'selected' : ''}
              onClick={() =>
                onSettingsChange(saveSettings({ readerTheme: value }))
              }
            >
              <Icon size={20} />
              <span>{label}</span>
              {settings.readerTheme === value && <Check size={15} />}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Sõnad Companion API */}
      <div className="form-card settings-card">
        <h2>Связь с Sõnad</h2>

        <div className="sonavara-stats">
          <div className="sonavara-stats-grid three-cols">
            <div className="stat-item">
              <span className="stat-num">{summary.total}</span>
              <span className="stat-desc">Всего</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{summary.recalled + summary.new}</span>
              <span className="stat-desc">Õpin</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{summary.sonavara}</span>
              <span className="stat-desc">Sõnavara</span>
            </div>
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="sonad-token">API-ключ (sonad_pat_...)</label>
          <input
            id="sonad-token"
            type="password"
            value={sonadToken}
            onChange={(e) => {
              setSonadToken(e.target.value);
              onSettingsChange(
                saveSettings({ sonadToken: e.target.value.trim() }),
              );
            }}
            placeholder="sonad_pat_..."
          />
        </div>

        <div className="field-group">
          <label htmlFor="sonad-url">Адрес сервера Sõnad</label>
          <input
            id="sonad-url"
            type="url"
            value={sonadBaseUrl}
            onChange={(e) => {
              setSonadBaseUrl(e.target.value);
              onSettingsChange(
                saveSettings({ sonadBaseUrl: e.target.value.trim() }),
              );
            }}
            placeholder="https://sonad.mkin-did-it.workers.dev"
          />
        </div>

        {sonadMessage && (
          <div className={`status-banner ${sonadMessage.type}`}>
            {sonadMessage.text}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="primary"
            onClick={handleSyncSonad}
            disabled={syncingSonad}
          >
            {syncingSonad ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <RefreshCw size={17} />
            )}
            <span>Синхронизировать</span>
          </button>

          {settings.lastSyncAt && (
            <span className="save-note">
              Обновлено{' '}
              {new Date(settings.lastSyncAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>

      {/* 3. AI Provider */}
      <div className="form-card settings-card">
        <h2>Нейросеть (AI API)</h2>

        <div className="field-group">
          <label>Провайдер</label>
          <div className="chip-cloud">
            {(
              [
                { id: 'cloudflare', label: 'Cloudflare AI' },
                { id: 'gemini', label: 'Gemini' },
                { id: 'groq', label: 'Groq' },
                { id: 'openrouter', label: 'OpenRouter' },
                { id: 'openai', label: 'OpenAI' },
                { id: 'anthropic', label: 'Claude' },
              ] as { id: AiProviderId; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`choice-chip ${
                  aiProvider === p.id ? 'selected' : ''
                }`}
                onClick={() => handleProviderChange(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {aiProvider !== 'cloudflare' && (
          <div className="field-group">
            <label htmlFor="ai-key">API-ключ ({aiProvider})</label>
            <input
              id="ai-key"
              type="password"
              value={aiApiKey}
              onChange={(e) => {
                setAiApiKey(e.target.value);
                onSettingsChange(
                  saveSettings({ aiApiKey: e.target.value.trim() }),
                );
              }}
              placeholder="Вставьте ключ API"
            />
          </div>
        )}

        <div className="field-group">
          <label htmlFor="ai-model">Модель</label>
          <select
            id="ai-model"
            value={
              MODEL_SUGGESTIONS[aiProvider].some((m) => m.id === aiModel)
                ? aiModel
                : '__custom__'
            }
            onChange={(e) => {
              if (e.target.value !== '__custom__') {
                setAiModel(e.target.value);
                onSettingsChange(saveSettings({ aiModel: e.target.value }));
              }
            }}
          >
            {MODEL_SUGGESTIONS[aiProvider].map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="__custom__">Своя модель…</option>
          </select>

          {!MODEL_SUGGESTIONS[aiProvider].some((m) => m.id === aiModel) && (
            <input
              type="text"
              style={{ marginTop: 10 }}
              value={aiModel}
              onChange={(e) => {
                setAiModel(e.target.value);
                onSettingsChange(
                  saveSettings({ aiModel: e.target.value.trim() }),
                );
              }}
              placeholder="Идентификатор модели"
            />
          )}
        </div>

        {aiMessage && (
          <div className={`status-banner ${aiMessage.type}`}>
            {aiMessage.text}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={handleTestAiKey}
            disabled={testingAi}
          >
            {testingAi && <Loader2 size={16} className="spin" />}
            <span>Проверить соединение</span>
          </button>
        </div>
      </div>

      {/* 4. Reading Stats & Daily Goal (moved from topbar/sidebar) */}
      <div className="form-card settings-card">
        <h2>Статистика чтения</h2>

        <div className="sonavara-stats">
          <div className="sonavara-stats-grid three-cols">
            <div className="stat-item">
              <span className="stat-num">{streak}</span>
              <span className="stat-desc">Дней подряд</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">
                {readToday}/{profile.dailyParagraphGoal || 15}
              </span>
              <span className="stat-desc">Сегодня (абз.)</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{books.length}</span>
              <span className="stat-desc">Книг</span>
            </div>
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Дневная норма абзацев</label>
          <div className="segmented-bar">
            {[10, 15, 25, 40].map((goal) => (
              <button
                key={goal}
                type="button"
                className={
                  profile.dailyParagraphGoal === goal ? 'selected' : ''
                }
                onClick={() =>
                  onSettingsChange(
                    saveSettings({
                      profile: { ...profile, dailyParagraphGoal: goal },
                    }),
                  )
                }
              >
                {goal}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
