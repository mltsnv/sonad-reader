import React, { useState } from 'react';
import {
  CloudDownload,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  db,
  DEFAULT_MODELS,
  saveSettings,
  type AiProviderId,
  type AppSettings,
} from '../db';
import { SonadClient, type SonadCompanionWord } from '../sonadClient';
import { verifyAiKey } from '../aiClient';

interface SettingsViewProps {
  settings: AppSettings;
  sonadWords: SonadCompanionWord[];
  onSettingsChange: (next: AppSettings) => void;
}

const MODEL_SUGGESTIONS: Record<AiProviderId, { id: string; label: string }[]> = {
  cloudflare: [
    {
      id: '@cf/google/gemma-4-26b-a4b-it',
      label: '@cf/google/gemma-4-26b-a4b-it (Встроенный Workers AI · 0 € без ключей)',
    },
    {
      id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      label: '@cf/meta/llama-3.3-70b-instruct-fp8-fast (Workers AI · 0 € без ключей)',
    },
  ],
  gemini: [
    {
      id: 'gemini-2.5-flash',
      label: 'gemini-2.5-flash (0 € Бесплатный тариф Google AI Studio)',
    },
    { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash (0 € Бесплатный тариф)' },
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  ],
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      label: 'llama-3.3-70b-versatile (0 € Бесплатный тариф Groq)',
    },
    {
      id: 'deepseek-r1-distill-llama-70b',
      label: 'deepseek-r1-distill-llama-70b (0 € Бесплатный тариф)',
    },
  ],
  openrouter: [
    {
      id: 'deepseek/deepseek-chat:free',
      label: 'deepseek/deepseek-chat:free (0 € Бесплатная модель)',
    },
    {
      id: 'google/gemini-2.0-flash-exp:free',
      label: 'google/gemini-2.0-flash-exp:free (0 € Бесплатная модель)',
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      label: 'meta-llama/llama-3.3-70b-instruct:free (0 € Бесплатная)',
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

  const [aiProvider, setAiProvider] = useState<AiProviderId>(settings.aiProvider);
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
        text: 'Вставьте токен Sõnad вида sonad_pat_...',
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
        text: `Словарь успешно синхронизирован! Загружено слов: ${data.summary.total} (Sõnavara: ${data.summary.sonavara}, Õpin: ${
          data.summary.recalled + data.summary.new
        }).`,
      });
    } catch (err: unknown) {
      setSonadMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Не удалось синхронизировать словарь с Sõnad.',
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

  const handleSaveAiSettings = () => {
    const next = saveSettings({
      aiProvider,
      aiApiKey: aiApiKey.trim(),
      aiModel: aiModel.trim() || DEFAULT_MODELS[aiProvider],
    });
    onSettingsChange(next);
  };

  const handleTestAiKey = async () => {
    handleSaveAiSettings();
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
        text: `Ключ успешно проверен! Ответ модели: «${res.modelReply}»`,
      });
    } catch (err: unknown) {
      setAiMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Не удалось проверить API-ключ нейросети.',
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

  return (
    <div className="page-container">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">SEADED · ИНТЕГРАЦИЯ С SÕNAD И БЕСПЛАТНЫЙ AI (0 €)</span>
          <h1 className="page-title">Настройки и подключение</h1>
          <p className="page-subtitle">
            Приложение спроектировано по правилу <strong>Бюджет 0 €</strong>: словари, переводы книг и генерация рассказов работают бесплатно
          </p>
        </div>
      </div>

      {/* Zero Cost Rule Banner */}
      <div className="zero-cost-banner">
        <strong>Личное приложение · Всё работает напрямую через API (0 € за инфраструктуру)</strong>
        <ul>
          <li>
            <strong>Словарь и морфология:</strong> работает через бесплатный государственный API Института эстонского языка (<code>EKI SONAPI</code>).
          </li>
          <li>
            <strong>Перевод абзацев книг (EPUB / FB2 / TXT):</strong> работает автоматически через нейропереводчик Тартуского университета (<code>TartuNLP Neurotõlge</code>) и подключённый AI API.
          </li>
          <li>
            <strong>Генерация рассказов в 1 клик:</strong> подключите ниже ваш API-ключ (Google Gemini, OpenAI, Claude, OpenRouter или Groq) — ключ хранится локально и работает напрямую.
          </li>
        </ul>
      </div>

      <div className="settings-grid">
        {/* Card 1: Sõnad Companion API */}
        <section className="generator-card">
          <div className="settings-card-header">
            <CloudDownload size={22} className="accent-icon" />
            <div>
              <h2>Интеграция со словарём Sõnad (0 €)</h2>
              <p className="muted-hint">
                Синхронизация ваших слов (Õpin и Sõnavara) и сохранение новых слов из книг в 1 касание
              </p>
            </div>
          </div>

          <div className="sonad-stats-grid">
            <div className="stat-box">
              <span className="stat-num">{summary.total}</span>
              <span className="stat-label">Всего слов</span>
            </div>
            <div className="stat-box stat-opin">
              <span className="stat-num">{summary.recalled + summary.new}</span>
              <span className="stat-label">Учу (Õpin)</span>
            </div>
            <div className="stat-box stat-sonavara">
              <span className="stat-num">{summary.sonavara}</span>
              <span className="stat-label">Выучено (Sõnavara)</span>
            </div>
          </div>

          <div className="field-block">
            <label className="field-label">
              Персональный API-ключ Sõnad (<code>sonad_pat_...</code>):
            </label>
            <input
              type="password"
              className="input-text"
              value={sonadToken}
              onChange={(e) => {
                setSonadToken(e.target.value);
                onSettingsChange(
                  saveSettings({ sonadToken: e.target.value.trim() }),
                );
              }}
              placeholder="sonad_pat_..."
            />
            <span className="field-help">
              Откройте{' '}
              <a
                href="https://sonad.mkin-did-it.workers.dev"
                target="_blank"
                rel="noreferrer"
              >
                приложение Sõnad <ExternalLink size={12} />
              </a>{' '}
              → <strong>Настройки</strong> → блок{' '}
              <strong>«Интеграция (Sõnad Reader API)»</strong> → нажмите{' '}
              <strong>«Создать API-ключ»</strong>.
            </span>
          </div>

          <div className="field-block">
            <label className="field-label">URL сервера Sõnad:</label>
            <input
              type="url"
              className="input-text"
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
            <div className={`action-feedback action-${sonadMessage.type}`}>
              {sonadMessage.text}
            </div>
          )}

          <div className="settings-actions-row">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={handleSyncSonad}
              disabled={syncingSonad}
            >
              {syncingSonad ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <RefreshCw size={18} />
              )}
              <span>Синхронизировать словарь с Sõnad</span>
            </button>

            {settings.lastSyncAt && (
              <span className="sync-timestamp">
                Обновлено:{' '}
                {new Date(settings.lastSyncAt).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </section>

        {/* Card 2: BYOK AI Configuration */}
        <section className="generator-card">
          <div className="settings-card-header">
            <Sparkles size={22} className="accent-icon" />
            <div>
              <h2>Подключение AI по API (в 1 клик)</h2>
              <p className="muted-hint">
                Вставьте ваш API-ключ (Gemini, OpenAI, Claude, OpenRouter или Groq) — все рассказы, переводы и грамматические разборы генерируются автоматически внутри приложения
              </p>
            </div>
          </div>

          <div className="field-block">
            <label className="field-label">Выберите провайдера:</label>
            <div className="provider-tabs">
              {(
                [
                  { id: 'cloudflare', label: 'Cloudflare Workers AI (Встроенный · 0 €)' },
                  { id: 'gemini', label: 'Google Gemini (0 € Free Tier)' },
                  { id: 'groq', label: 'Groq Cloud (0 € Free Tier)' },
                  { id: 'openrouter', label: 'OpenRouter (:free 0 €)' },
                  { id: 'openai', label: 'OpenAI (ChatGPT API)' },
                  { id: 'anthropic', label: 'Anthropic Claude API' },
                ] as { id: AiProviderId; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`provider-tab-btn ${
                    aiProvider === p.id ? 'active' : ''
                  }`}
                  onClick={() => handleProviderChange(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {aiProvider !== 'cloudflare' && (
            <div className="field-block">
              <label className="field-label">
                API-ключ ({aiProvider.toUpperCase()}):
              </label>
              <input
                type="password"
                className="input-text"
                value={aiApiKey}
                onChange={(e) => {
                  setAiApiKey(e.target.value);
                  onSettingsChange(
                    saveSettings({ aiApiKey: e.target.value.trim() }),
                  );
                }}
                placeholder={
                  aiProvider === 'gemini'
                    ? 'AIzaSy...'
                    : aiProvider === 'groq'
                      ? 'gsk_...'
                      : aiProvider === 'openrouter'
                        ? 'sk-or-v1-...'
                        : 'sk-...'
                }
              />
              {aiProvider === 'gemini' && (
                <span className="field-help">
                  100% бесплатный ключ без привязки карты можно выпустить за 20 секунд в{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google AI Studio <ExternalLink size={12} />
                  </a>
                  .
                </span>
              )}
              {aiProvider === 'groq' && (
                <span className="field-help">
                  Бесплатный ключ Groq (0 €) можно получить на{' '}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    console.groq.com/keys <ExternalLink size={12} />
                  </a>
                  .
                </span>
              )}
              {aiProvider === 'openrouter' && (
                <span className="field-help">
                  Модели с пометкой <code>:free</code> на{' '}
                  <a
                    href="https://openrouter.ai/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenRouter <ExternalLink size={12} />
                  </a>{' '}
                  работают за 0 €.
                </span>
              )}
            </div>
          )}

          <div className="field-block">
            <label className="field-label">Модель нейросети:</label>
            <div className="model-select-row">
              <select
                className="input-select"
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
                <option value="__custom__">
                  Своя модель (ввести вручную)...
                </option>
              </select>

              <input
                type="text"
                className="input-text"
                value={aiModel}
                onChange={(e) => {
                  setAiModel(e.target.value);
                  onSettingsChange(
                    saveSettings({ aiModel: e.target.value.trim() }),
                  );
                }}
                placeholder="Имя модели"
              />
            </div>
          </div>

          {aiMessage && (
            <div className={`action-feedback action-${aiMessage.type}`}>
              {aiMessage.text}
            </div>
          )}

          <div className="settings-actions-row">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={handleTestAiKey}
              disabled={testingAi}
            >
              {testingAi ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <KeyRound size={18} />
              )}
              <span>Проверить ключ</span>
            </button>

            <span className="privacy-badge">
              <ShieldCheck size={15} />
              <span>Ключ хранится только в вашем браузере</span>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
