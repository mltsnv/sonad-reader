import { cleanWordToken, normalize } from './dictionary/sonapi';
import { inflectionQueries } from './dictionary/inflections';
import type { SonadCompanionWord } from './sonadClient';

export interface TextSegment {
  text: string;
  isWord: boolean;
  cleanWord: string;
}

/**
 * Splits a paragraph into alternating word and punctuation/whitespace segments
 * while preserving every character of the original text.
 */
export function tokenizeParagraph(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /([\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*)/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isWord: false,
        cleanWord: '',
      });
    }
    const wordText = match[0];
    segments.push({
      text: wordText,
      isWord: true,
      cleanWord: cleanWordToken(wordText),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isWord: false,
      cleanWord: '',
    });
  }

  return segments;
}

export interface VocabularyLookupIndex {
  matchWord(cleanWord: string): SonadCompanionWord | null;
  isTargetWord(cleanWord: string): boolean;
}

export function createVocabularyIndex(
  words: SonadCompanionWord[],
  targetWords: string[] = [],
): VocabularyLookupIndex {
  const formMap = new Map<string, SonadCompanionWord>();

  for (const w of words) {
    const lemmaNorm = normalize(w.lemma);
    if (lemmaNorm) formMap.set(lemmaNorm, w);

    for (const primary of w.forms?.primary ?? []) {
      for (const part of primary.split(/[/,]/)) {
        const norm = normalize(part);
        if (norm && norm !== '—' && norm !== '-' && !formMap.has(norm)) {
          formMap.set(norm, w);
        }
      }
    }

    for (const p of w.forms?.paradigm ?? []) {
      for (const part of p.value.split(/[/,]/)) {
        const norm = normalize(part);
        if (norm && norm !== '—' && norm !== '-' && !formMap.has(norm)) {
          formMap.set(norm, w);
        }
      }
    }
  }

  const targetSet = new Set<string>();
  for (const tw of targetWords) {
    const norm = cleanWordToken(tw);
    if (norm) {
      targetSet.add(norm);
      // If a target word ends in -ma (verb), also add its stem
      if (norm.endsWith('ma') && norm.length > 4) {
        targetSet.add(norm.slice(0, -2));
      }
    }
  }

  const matchCache = new Map<string, SonadCompanionWord | null>();
  const targetCache = new Map<string, boolean>();

  return {
    matchWord(cleanWord: string): SonadCompanionWord | null {
      if (!cleanWord || cleanWord.length < 2) return null;
      if (matchCache.has(cleanWord)) return matchCache.get(cleanWord) ?? null;

      const direct = formMap.get(cleanWord);
      if (direct) {
        matchCache.set(cleanWord, direct);
        return direct;
      }

      for (const hint of inflectionQueries(cleanWord)) {
        const hit = formMap.get(hint);
        if (hit) {
          matchCache.set(cleanWord, hit);
          return hit;
        }
      }

      matchCache.set(cleanWord, null);
      return null;
    },

    isTargetWord(cleanWord: string): boolean {
      if (!cleanWord || targetSet.size === 0) return false;
      if (targetCache.has(cleanWord)) return targetCache.get(cleanWord) ?? false;

      if (targetSet.has(cleanWord)) {
        targetCache.set(cleanWord, true);
        return true;
      }

      for (const hint of inflectionQueries(cleanWord)) {
        if (targetSet.has(hint)) {
          targetCache.set(cleanWord, true);
          return true;
        }
      }

      // Check prefix match for clear 4+ char Estonian nominal/verbal stems in targetSet
      for (const target of targetSet) {
        if (
          target.length >= 4 &&
          cleanWord.startsWith(target.slice(0, -1)) &&
          Math.abs(cleanWord.length - target.length) <= 4
        ) {
          targetCache.set(cleanWord, true);
          return true;
        }
      }

      targetCache.set(cleanWord, false);
      return false;
    },
  };
}
