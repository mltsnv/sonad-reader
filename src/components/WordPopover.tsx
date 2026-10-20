import React, { useEffect, useState } from 'react';
import {
  Check,
  Inbox,
  Loader2,
  Plus,
  Volume2,
  X,
} from 'lucide-react';
import { db, type AppSettings } from '../db';
import {
  cleanWordToken,
  normalize,
  type PartOfSpeech,
} from '../dictionary/sonapi';
import { getEkiCefr } from '../dictionary/ekiCefr';
import { explainWordInContextWithAi } from '../aiClient';
import {
  lookupEstonianWord,
  SonadClient,
  type SonadCompanionWord,
  type SonadLookupCandidate,
} from '../sonadClient';

interface WordPopoverProps {
  clickedWord: string;
  sentenceContext?: string;
  localWords: SonadCompanionWord[];
  settings: AppSettings;
  onClose: () => void;
}

const POS_LABELS: Record<string, string> = {
  noun: 'СУЩЕСТВИТЕЛЬНОЕ',
  verb: 'ГЛАГОЛ',
  adjective: 'ПРИЛАГАТЕЛЬНОЕ',
  adverb: 'НАРЕЧИЕ',
  pronoun: 'МЕСТОИМЕНИЕ',
  numeral: 'ЧИСЛИТЕЛЬНОЕ',
  conjunction: 'СОЮЗ',
  adposition: 'ПРЕДЛОГ / ПОСЛЕЛОГ',
  phrase: 'ВЫРАЖЕНИЕ',
  other: 'СЛОВО',
};

export const WordPopover: React.FC<WordPopoverProps> = ({
  clickedWord,
  sentenceContext,
  localWords,
  settings,
  onClose,
}) => {
  const cleanSurface = cleanWordToken(clickedWord);

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<SonadLookupCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [selectedMeaningIndex, setSelectedMeaningIndex] = useState(0);
  const [existingWord, setExistingWord] = useState<{
    id: string;
    lemma: string;
    translation: string;
    forms: { primary: string[] };
    status?: 'sonavara' | 'recalled' | 'new';
  } | null>(null);

  const [customLemma, setCustomLemma] = useState(cleanSurface);
  const [customTranslation, setCustomTranslation] = useState('');
  const [customForms, setCustomForms] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiGrammarNote, setAiGrammarNote] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setActionMessage(null);
    setAiGrammarNote(null);

    lookupEstonianWord(clickedWord, localWords, {
      sonadToken: settings.sonadToken,
      sonadBaseUrl: settings.sonadBaseUrl,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setExistingWord(res.existingWord);
        setCandidates(res.candidates);
        setSelectedCandidateIndex(0);

        const firstCandidate = res.candidates[0];
        if (firstCandidate) {
          setCustomLemma(firstCandidate.lemma);
          setCustomForms(firstCandidate.forms.primary.join(' · '));
          const mIdx = firstCandidate.details.meaningIndex ?? 0;
          setSelectedMeaningIndex(mIdx);
          const m =
            firstCandidate.details.meanings[mIdx] ??
            firstCandidate.details.meanings[0];
          const ruWords = (m?.translations?.rus ?? [])
            .map((t) => t.words)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
          setCustomTranslation(
            res.existingWord?.translation || ruWords || m?.definition || '',
          );
        } else if (res.existingWord) {
          setCustomLemma(res.existingWord.lemma);
          setCustomTranslation(res.existingWord.translation);
          setCustomForms(res.existingWord.forms.primary.join(' · '));
        } else {
          setCustomLemma(cleanSurface);
          setCustomTranslation('');
          setCustomForms('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCustomLemma(cleanSurface);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [clickedWord, cleanSurface, localWords, settings.sonadToken, settings.sonadBaseUrl]);

  const currentCandidate = candidates[selectedCandidateIndex] ?? null;
  const meanings = currentCandidate?.details.meanings ?? [];
  const currentMeaning =
    meanings[selectedMeaningIndex] ?? meanings[0] ?? undefined;

  const handleSelectCandidate = (idx: number) => {
    setSelectedCandidateIndex(idx);
    const cand = candidates[idx];
    if (!cand) return;
    setCustomLemma(cand.lemma);
    setCustomForms(cand.forms.primary.join(' · '));
    const mIdx = cand.details.meaningIndex ?? 0;
    setSelectedMeaningIndex(mIdx);
    const m = cand.details.meanings[mIdx] ?? cand.details.meanings[0];
    const ruWords = (m?.translations?.rus ?? [])
      .map((t) => t.words)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    setCustomTranslation(ruWords || m?.definition || '');
  };

  const handleSelectMeaning = (mIdx: number) => {
    setSelectedMeaningIndex(mIdx);
    const m = meanings[mIdx];
    if (!m) return;
    const ruWords = (m.translations?.rus ?? [])
      .map((t) => t.words)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    if (ruWords) {
      setCustomTranslation(ruWords);
    } else if (m.definition) {
      setCustomTranslation(m.definition);
    }
  };

  const speakEstonian = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'et-EE';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  const handleAiExplainWord = async () => {
    setAiLoading(true);
    try {
      const res = await explainWordInContextWithAi(
        clickedWord,
        sentenceContext || clickedWord,
      );
      setCustomLemma(res.lemma || customLemma);
      if (!customTranslation) setCustomTranslation(res.translation);
      if (!customForms && res.forms.length > 0) {
        setCustomForms(res.forms.join(' · '));
      }
      setAiGrammarNote(res.grammarExplanation);
    } catch (err: unknown) {
      setActionMessage(
        err instanceof Error ? err.message : 'Ошибка ИИ-разбора.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveToSonad = async () => {
    const lemma = customLemma.trim() || cleanSurface;
    const translation = customTranslation.trim();
    if (!translation) {
      setActionMessage('Укажите русский перевод.');
      return;
    }

    setSaving(true);
    setActionMessage(null);

    const primaryForms = customForms
      .split(/[·,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const effectivePos: PartOfSpeech | string =
      currentMeaning?.partOfSpeech ?? 'other';

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
          forms:
            primaryForms.length > 0 ? { primary: primaryForms } : undefined,
          notes: sentenceContext
            ? `Из текста: «${sentenceContext.slice(0, 180)}»`
            : undefined,
          folderId: selectedFolderId || undefined,
        });
        savedWord = res.word;
        await db.sonadWords.put(savedWord);
        setActionMessage('Сохранено в Sõnad');
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
            ? `Из текста: «${sentenceContext.slice(0, 180)}»`
            : '',
          folderId: selectedFolderId || null,
          level: getEkiCefr(lemma),
          status: 'new',
          firstReviewedAt: null,
          updatedAt: new Date().toISOString(),
        };
        await db.sonadWords.put(savedWord);
        setActionMessage('Сохранено локально');
      }

      setExistingWord({
        id: savedWord.id,
        lemma: savedWord.lemma,
        translation: savedWord.translation,
        forms: { primary: savedWord.forms.primary },
        status: savedWord.status,
      });
    } catch (err: unknown) {
      setActionMessage(
        err instanceof Error ? err.message : 'Не удалось сохранить слово.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSendToInbox = async () => {
    const lemma = customLemma.trim() || cleanSurface;
    if (!settings.sonadToken.trim()) {
      setActionMessage('Подключите ключ Sõnad в настройках.');
      return;
    }

    setSaving(true);
    try {
      const client = new SonadClient(
        settings.sonadToken,
        settings.sonadBaseUrl,
      );
      await client.addToInbox(lemma);
      setActionMessage(`Отправлено в Inbox Sõnad`);
    } catch (err: unknown) {
      setActionMessage(
        err instanceof Error ? err.message : 'Ошибка отправки в Inbox.',
      );
    } finally {
      setSaving(false);
    }
  };

  const posLabel =
    POS_LABELS[currentMeaning?.partOfSpeech ?? 'other'] ?? 'СЛОВО';
  const cefr = currentCandidate?.level ?? getEkiCefr(customLemma);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card word-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="word-modal-top">
          <span className="eyebrow" style={{ marginBottom: 0 }}>
            {posLabel}
            {cefr ? ` · ${cefr}` : ''}
            {existingWord ? ' · В SÕNAD' : ''}
          </span>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={19} />
          </button>
        </div>

        <div className="word-modal-head">
          <h2 lang="et">{customLemma}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={() => speakEstonian(customLemma)}
            title="Озвучить"
          >
            <Volume2 size={19} />
          </button>
        </div>

        {cleanSurface.toLowerCase() !== customLemma.toLowerCase() && (
          <p className="surface-form-note">
            В тексте: <strong lang="et">{clickedWord}</strong>
          </p>
        )}

        {loading ? (
          <div className="loading" style={{ padding: '20px 0' }}>
            <Loader2 size={18} className="spin" /> Поиск в словаре EKI…
          </div>
        ) : (
          <>
            {candidates.length > 1 && (
              <div className="chip-cloud" style={{ marginBottom: 14 }}>
                {candidates.map((cand, idx) => (
                  <button
                    key={`${cand.lemma}-${idx}`}
                    type="button"
                    className={`choice-chip ${
                      idx === selectedCandidateIndex ? 'selected' : ''
                    }`}
                    onClick={() => handleSelectCandidate(idx)}
                  >
                    {cand.lemma}
                  </button>
                ))}
              </div>
            )}

            {customForms && (
              <div className="word-forms-box">
                <span className="eyebrow">ОСНОВНЫЕ ФОРМЫ</span>
                <p lang="et">{customForms}</p>
              </div>
            )}

            {meanings.length > 0 && (
              <div className="meanings-stack">
                {meanings.slice(0, 4).map((m, idx) => {
                  const ruList = (m.translations?.rus ?? [])
                    .map((t) => t.words)
                    .filter(Boolean)
                    .join(', ');
                  if (!ruList && !m.definition) return null;
                  const active = idx === selectedMeaningIndex;
                  return (
                    <button
                      key={m.id ?? idx}
                      type="button"
                      className={`meaning-row ${active ? 'selected' : ''}`}
                      onClick={() => handleSelectMeaning(idx)}
                    >
                      <strong>{ruList || m.definition}</strong>
                      {ruList && m.definition && <small>{m.definition}</small>}
                    </button>
                  );
                })}
              </div>
            )}

            {aiGrammarNote ? (
              <div className="grammar-note" style={{ marginBottom: 16 }}>
                <p>{aiGrammarNote}</p>
              </div>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={handleAiExplainWord}
                disabled={aiLoading}
                style={{ marginBottom: 12 }}
              >
                {aiLoading ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Разбор формы…</span>
                  </>
                ) : (
                  <span>Разобрать грамматическую форму через AI →</span>
                )}
              </button>
            )}

            <div className="word-save-fields">
              <input
                type="text"
                value={customTranslation}
                onChange={(e) => setCustomTranslation(e.target.value)}
                placeholder="Перевод на русский"
              />

              {settings.sonadFolders.length > 0 && (
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                >
                  <option value="">Без списка</option>
                  {settings.sonadFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {actionMessage && (
              <div className="status-banner success">{actionMessage}</div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="primary"
                style={{ flex: 1 }}
                onClick={handleSaveToSonad}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={17} className="spin" />
                ) : existingWord ? (
                  <Check size={17} />
                ) : (
                  <Plus size={17} />
                )}
                <span>
                  {existingWord ? 'Обновить в Sõnad' : 'Сохранить в Sõnad'}
                </span>
              </button>

              {settings.sonadToken.trim() && (
                <button
                  type="button"
                  className="secondary"
                  onClick={handleSendToInbox}
                  disabled={saving}
                  title="В Inbox"
                >
                  <Inbox size={17} />
                  <span>Inbox</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
