import React, { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  Volume2,
  X,
} from 'lucide-react';
import {
  directRussian,
  normalize,
  partsOfSpeech,
  type PartOfSpeech,
} from '../dictionary/sonapi';
import { getEkiCefr, type CefrLevel } from '../dictionary/ekiCefr';
import { translateWithTartuNlp } from '../dictionary/tartunlp';
import {
  lookupEstonianWord,
  SonadClient,
  type SonadCompanionWord,
  type SonadFolder,
  type SonadLookupCandidate,
} from '../sonadClient';
import { db, type AppSettings } from '../db';

interface WordPopoverProps {
  clickedWord: string;
  sentenceContext?: string;
  localWords: SonadCompanionWord[];
  settings: AppSettings;
  onClose: () => void;
  onWordSaved?: (word: SonadCompanionWord) => void;
}

export const WordPopover: React.FC<WordPopoverProps> = ({
  clickedWord,
  sentenceContext,
  localWords,
  settings,
  onClose,
  onWordSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SonadLookupCandidate[]>([]);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);
  const [selectedMeaningIdx, setSelectedMeaningIdx] = useState(0);
  const [existingWord, setExistingWord] = useState<{
    id: string;
    lemma: string;
    translation: string;
    forms: { primary: string[] };
    status?: 'sonavara' | 'recalled' | 'new';
  } | null>(null);

  const [customLemma, setCustomLemma] = useState('');
  const [customTranslation, setCustomTranslation] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [showParadigm, setShowParadigm] = useState(false);

  const [savingWord, setSavingWord] = useState(false);
  const [savingInbox, setSavingInbox] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActionMessage(null);
    setShowParadigm(false);

    lookupEstonianWord(clickedWord, localWords, {
      sonadToken: settings.sonadToken,
      sonadBaseUrl: settings.sonadBaseUrl,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setCandidates(res.candidates);
        setExistingWord(res.existingWord);
        setSelectedCandidateIdx(0);

        const firstCandidate = res.candidates[0];
        const firstMeaningIdx = firstCandidate?.details?.meaningIndex ?? 0;
        setSelectedMeaningIdx(firstMeaningIdx);

        const resolvedLemma =
          firstCandidate?.lemma ||
          res.existingWord?.lemma ||
          res.query ||
          clickedWord;
        setCustomLemma(resolvedLemma);

        const meaning = firstCandidate?.details?.meanings?.[firstMeaningIdx];
        const ruList = meaning ? directRussian(meaning) : [];
        const defaultTrans =
          res.existingWord?.translation || ruList.slice(0, 4).join('; ') || '';
        setCustomTranslation(defaultTrans);
        setLoading(false);

        if (!defaultTrans) {
          translateWithTartuNlp(resolvedLemma, controller.signal).then(
            (freeRu) => {
              if (!controller.signal.aborted && freeRu) {
                setCustomTranslation(freeRu);
              }
            },
          );
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Ошибка поиска слова');
        setCustomLemma(clickedWord.toLowerCase());
        setLoading(false);
      });

    return () => controller.abort();
  }, [clickedWord, localWords, settings.sonadToken, settings.sonadBaseUrl]);

  const currentCandidate: SonadLookupCandidate | undefined =
    candidates[selectedCandidateIdx];
  const meanings = currentCandidate?.details?.meanings ?? [];
  const currentMeaning = meanings[selectedMeaningIdx] ?? meanings[0];

  const handleSelectCandidate = (idx: number) => {
    setSelectedCandidateIdx(idx);
    const cand = candidates[idx];
    if (!cand) return;
    const mIdx = cand.details.meaningIndex ?? 0;
    setSelectedMeaningIdx(mIdx);
    setCustomLemma(cand.lemma);
    const m = cand.details.meanings[mIdx];
    const ru = m ? directRussian(m).slice(0, 4).join('; ') : '';
    if (ru) setCustomTranslation(ru);
  };

  const handleSelectMeaning = (mIdx: number) => {
    setSelectedMeaningIdx(mIdx);
    const m = meanings[mIdx];
    if (!m) return;
    const ru = directRussian(m).slice(0, 4).join('; ');
    if (ru) setCustomTranslation(ru);
  };

  const speakEstonian = (textToSpeak: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'et-EE';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  const effectiveLemma = (
    customLemma ||
    currentCandidate?.lemma ||
    clickedWord
  ).trim();
  const effectiveLevel: string | null =
    currentCandidate?.level ?? getEkiCefr(effectiveLemma) ?? null;
  const effectivePos = (currentMeaning?.partOfSpeech ??
    'unknown') as PartOfSpeech;
  const primaryForms =
    currentCandidate?.forms?.primary?.filter(Boolean) ??
    existingWord?.forms?.primary?.filter(Boolean) ?? [effectiveLemma];

  const matchedLocalWord =
    localWords.find((w) => normalize(w.lemma) === normalize(effectiveLemma)) ??
    (existingWord
      ? localWords.find((w) => w.id === existingWord.id)
      : undefined);

  const isAlreadySaved = Boolean(
    matchedLocalWord || existingWord || currentCandidate?.alreadyInSonad,
  );

  const statusLabel = (status?: 'sonavara' | 'recalled' | 'new') => {
    if (status === 'sonavara') return 'Уже в Sõnad · Sõnavara (Выучено)';
    if (status === 'recalled') return 'Уже в Sõnad · Õpin (Учу сейчас)';
    if (status === 'new') return 'Уже в Sõnad · Õpin (Новое)';
    return 'Уже в вашем словаре Sõnad';
  };

  const handleAddWord = async () => {
    const lemma = effectiveLemma;
    const translation = customTranslation.trim();
    if (!lemma || !translation) {
      setActionMessage({
        type: 'error',
        text: 'Укажите перевод слова перед сохранением.',
      });
      return;
    }

    setSavingWord(true);
    setActionMessage(null);

    try {
      let savedWord: SonadCompanionWord;

      if (settings.sonadToken.trim()) {
        const client = new SonadClient(
          settings.sonadToken,
          settings.sonadBaseUrl,
        );
        const res = await client.addWordToSonad({
          lemma,
          translation,
          partOfSpeech: effectivePos,
          forms: { primary: primaryForms },
          notes: sentenceContext
            ? `Из книги: «${sentenceContext.slice(0, 180)}»`
            : '',
          folderId: selectedFolderId || undefined,
        });
        savedWord = {
          ...res.word,
          status: res.word.status ?? 'new',
          level: (res.word.level as CefrLevel | null) ?? getEkiCefr(lemma),
        };
        await db.sonadWords.put(savedWord);
        setActionMessage({
          type: 'success',
          text:
            res.status === 'existing'
              ? `Слово «${lemma}» уже было в Sõnad — данные синхронизированы!`
              : `Слово «${lemma}» добавлено в Sõnad (Õpin)!`,
        });
      } else {
        savedWord = {
          id: `local-${normalize(lemma)}`,
          lemma,
          translation,
          partOfSpeech: effectivePos,
          forms: {
            primary: primaryForms,
            paradigm: currentCandidate?.forms?.paradigm ?? [],
          },
          formsNotApplicable: false,
          notes: sentenceContext
            ? `Из книги: «${sentenceContext.slice(0, 180)}»`
            : '',
          folderId: selectedFolderId || null,
          level: getEkiCefr(lemma),
          status: 'new',
          firstReviewedAt: null,
          updatedAt: new Date().toISOString(),
        };
        await db.sonadWords.put(savedWord);
        setActionMessage({
          type: 'info',
          text: `Сохранено локально («${lemma}»). Подключите API-ключ Sõnad в настройках для облачной синхронизации.`,
        });
      }

      setExistingWord({
        id: savedWord.id,
        lemma: savedWord.lemma,
        translation: savedWord.translation,
        forms: { primary: savedWord.forms.primary },
        status: savedWord.status,
      });
      onWordSaved?.(savedWord);
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Ошибка при сохранении слова.',
      });
    } finally {
      setSavingWord(false);
    }
  };

  const handleAddToInbox = async () => {
    const text = effectiveLemma || clickedWord;
    if (!settings.sonadToken.trim()) {
      setActionMessage({
        type: 'error',
        text: 'Для отправки в Inbox подключите API-ключ Sõnad в разделе «Настройки».',
      });
      return;
    }

    setSavingInbox(true);
    setActionMessage(null);
    try {
      const client = new SonadClient(settings.sonadToken, settings.sonadBaseUrl);
      await client.addToInbox(text);
      setActionMessage({
        type: 'success',
        text: `«${text}» отправлено во входящие (Inbox) Sõnad!`,
      });
    } catch (err: unknown) {
      setActionMessage({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'Не удалось отправить в Inbox.',
      });
    } finally {
      setSavingInbox(false);
    }
  };

  const folders: SonadFolder[] = settings.sonadFolders ?? [];

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div
        className="word-popover-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Словарный разбор слова"
      >
        <div className="popover-drag-handle" />

        <div className="popover-header">
          <div className="popover-title-group">
            <div className="popover-word-line">
              {normalize(clickedWord) !== normalize(effectiveLemma) && (
                <>
                  <span className="clicked-form-chip">{clickedWord}</span>
                  <span className="lemma-arrow">→</span>
                </>
              )}
              <span className="lemma-title">{effectiveLemma}</span>
              <button
                type="button"
                className="icon-btn-round"
                onClick={() => speakEstonian(effectiveLemma)}
                title="Прослушать произношение (et-EE)"
              >
                <Volume2 size={18} />
              </button>
              {effectiveLevel && (
                <span
                  className={`cefr-badge cefr-${effectiveLevel.toLowerCase()}`}
                >
                  {effectiveLevel}
                </span>
              )}
              {effectivePos && effectivePos !== 'unknown' && (
                <span className="pos-badge">
                  {partsOfSpeech[effectivePos] ?? effectivePos}
                </span>
              )}
            </div>

            {primaryForms.length > 0 && (
              <div className="primary-forms-row">
                {primaryForms.join(' · ')}
              </div>
            )}
          </div>

          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status banner if already in Sõnad */}
        {isAlreadySaved && (
          <div
            className={`sonad-status-banner ${
              matchedLocalWord?.status === 'sonavara'
                ? 'status-sonavara'
                : 'status-opin'
            }`}
          >
            <CheckCircle2 size={17} />
            <div>
              <strong>
                {statusLabel(matchedLocalWord?.status ?? existingWord?.status)}
              </strong>
              {(matchedLocalWord?.translation || existingWord?.translation) && (
                <span className="saved-translation-inline">
                  — {matchedLocalWord?.translation || existingWord?.translation}
                </span>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="popover-loading">
            <Loader2 size={24} className="spin" />
            <span>Ищем начальную форму и перевод в SONAPI...</span>
          </div>
        ) : error ? (
          <div className="popover-error">{error}</div>
        ) : (
          <div className="popover-body">
            {candidates.length > 1 && (
              <div className="candidate-tabs">
                {candidates.map((cand, idx) => (
                  <button
                    key={`${cand.lemma}-${idx}`}
                    type="button"
                    className={`candidate-tab ${
                      idx === selectedCandidateIdx ? 'active' : ''
                    }`}
                    onClick={() => handleSelectCandidate(idx)}
                  >
                    {cand.lemma}
                    {cand.forms.primary.length > 0
                      ? ` (${cand.forms.primary.slice(0, 2).join(', ')})`
                      : ''}
                  </button>
                ))}
              </div>
            )}

            {meanings.length > 0 ? (
              <div className="meanings-list">
                {meanings.slice(0, 4).map((m, idx) => {
                  const ruWords = directRussian(m);
                  const isSelected = idx === selectedMeaningIdx;
                  return (
                    <div
                      key={idx}
                      className={`meaning-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectMeaning(idx)}
                    >
                      <div className="meaning-ru">
                        <span className="meaning-index">{idx + 1}.</span>
                        <strong>
                          {ruWords.length > 0
                            ? ruWords.join(', ')
                            : 'Перевод не указан (см. толкование)'}
                        </strong>
                      </div>
                      {m.definition && (
                        <div className="meaning-def">{m.definition}</div>
                      )}
                      {m.examples.length > 0 && (
                        <div className="meaning-example">
                          «{m.examples[0]}»
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-sonapi-note">
                В словаре SONAPI точная статья не найдена. Перевод подставлен автоматически — при желании отредактируйте его ниже.
              </div>
            )}

            {currentCandidate?.forms?.paradigm &&
              currentCandidate.forms.paradigm.length > 0 && (
                <div className="paradigm-section">
                  <button
                    type="button"
                    className="paradigm-toggle"
                    onClick={() => setShowParadigm((v) => !v)}
                  >
                    <span>
                      Все падежные / личные формы (
                      {currentCandidate.forms.paradigm.length})
                    </span>
                    {showParadigm ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                  {showParadigm && (
                    <div className="paradigm-grid">
                      {currentCandidate.forms.paradigm
                        .slice(0, 28)
                        .map((f, i) => (
                          <div key={i} className="paradigm-cell">
                            <span className="paradigm-label">
                              {f.label || f.code}
                            </span>
                            <span className="paradigm-val">{f.value}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

            <div className="save-word-editor">
              <div className="editor-row">
                <div className="editor-field">
                  <label>Лемма (начальная форма)</label>
                  <input
                    type="text"
                    value={customLemma}
                    onChange={(e) => setCustomLemma(e.target.value)}
                    placeholder="Напр. otsus"
                  />
                </div>
                <div className="editor-field flex-2">
                  <label>Перевод на русский (для карточки в Sõnad)</label>
                  <input
                    type="text"
                    value={customTranslation}
                    onChange={(e) => setCustomTranslation(e.target.value)}
                    placeholder="Введите русский перевод..."
                  />
                </div>
              </div>

              {folders.length > 0 && (
                <div className="editor-options-row">
                  <select
                    className="folder-select"
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                  >
                    <option value="">Без папки (общий словарь)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {actionMessage && (
              <div className={`action-feedback action-${actionMessage.type}`}>
                {actionMessage.text}
              </div>
            )}

            <div className="popover-actions">
              <button
                type="button"
                className="btn-primary-add"
                onClick={handleAddWord}
                disabled={savingWord}
              >
                {savingWord ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <BookmarkPlus size={18} />
                )}
                <span>
                  {isAlreadySaved
                    ? 'Обновить / Сохранить в Sõnad'
                    : '+ Добавить в Sõnad (Õpin)'}
                </span>
              </button>

              <button
                type="button"
                className="btn-secondary-inbox"
                onClick={handleAddToInbox}
                disabled={savingInbox}
                title="Отправить слово во Входящие (Inbox) Sõnad"
              >
                {savingInbox ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <Inbox size={17} />
                )}
                <span>В Inbox</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
