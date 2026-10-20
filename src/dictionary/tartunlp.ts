import { cleanWordToken } from './sonapi';

/**
 * Free Estonian <-> Russian neural machine translation using TartuNLP API
 * (University of Tartu, https://api.tartunlp.ai/translation/v2 — 100% Free, 0 €).
 */
export async function translateWithTartuNlp(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const clean = text.trim();
  if (!clean) return null;
  const isCyrillic = /\p{Script=Cyrillic}/u.test(clean);
  const src = isCyrillic ? 'rus' : 'est';
  const tgt = isCyrillic ? 'est' : 'rus';

  const timeout = AbortSignal.timeout(7000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const res = await fetch('https://api.tartunlp.ai/translation/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, src, tgt }),
      signal: requestSignal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string };
    return data.result?.trim() || null;
  } catch {
    return null;
  }
}

interface EstonianMorphRule {
  pattern: RegExp;
  label: string;
  explanation: string;
}

const ESTONIAN_MORPH_RULES: EstonianMorphRule[] = [
  {
    pattern: /([a-zõäöüšž]{3,})sse$/i,
    label: 'Иллатив (sisseütlev, падеж на -sse)',
    explanation: 'отвечает на вопрос «куда? во что?» (внутрь чего-либо)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})st$/i,
    label: 'Элатив (seestütlev, падеж на -st)',
    explanation: 'отвечает на вопрос «откуда? из чего? о чём?»',
  },
  {
    pattern: /([a-zõäöüšž]{3,})le$/i,
    label: 'Аллатив (alaleütlev, падеж на -le)',
    explanation: 'отвечает на вопрос «кому? на что? куда?»',
  },
  {
    pattern: /([a-zõäöüšž]{3,})lt$/i,
    label: 'Аблатив (alaltütlev, падеж на -lt)',
    explanation: 'отвечает на вопрос «от кого? с чего? откуда?»',
  },
  {
    pattern: /([a-zõäöüšž]{3,})ga$/i,
    label: 'Комитатив (kaasaütlev, падеж на -ga)',
    explanation: 'отвечает на вопрос «с кем? с чем? каким образом?»',
  },
  {
    pattern: /([a-zõäöüšž]{3,})ta$/i,
    label: 'Абессив (ilmaütlev, падеж на -ta)',
    explanation: 'означает «без кого? без чего?» (или форму да-инфинитива)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})ks$/i,
    label: 'Транслатив (saav, падеж на -ks)',
    explanation: 'означает превращение («кем? чем? на какой срок? к какому времени?»)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})ni$/i,
    label: 'Терминатив (rajav, падеж на -ni)',
    explanation: 'означает предел («до чего? докуда? до какого момента?»)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})sime$/i,
    label: 'Прошедшее время, 1 л. мн. ч. (-sime)',
    explanation: 'форма «мы делали / сделали» в простом прошедшем времени (lihtminevik)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})sid$/i,
    label: 'Прошедшее время (-sid) или мн. ч. партитива',
    explanation: 'форма «ты делал(а) / они делали» или партитив множественного числа',
  },
  {
    pattern: /([a-zõäöüšž]{3,})nud$/i,
    label: 'Причастие прошедшего времени (-nud)',
    explanation: 'активное причастие прошедшего времени (составное прошедшее время или отрицание в прошлом: ei + -nud)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})tud$/i,
    label: 'Страдательное причастие (-tud / -dud)',
    explanation: 'пассивное причастие («сделанный / сделано»)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})ma$/i,
    label: 'Инфинитив на -ma (ma-tegevusnimi)',
    explanation: 'первая словарная форма глагола (употребляется после глаголов движения, pidama, hakkama)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})mas$/i,
    label: 'Форма -mas (в процессе действия)',
    explanation: 'означает нахождение в процессе или месте действия («быть занятым чем-то»)',
  },
  {
    pattern: /([a-zõäöüšž]{3,})des$/i,
    label: 'Деепричастие (-des форма)',
    explanation: 'означает одновременное действие («делая что-то»)',
  },
  {
    pattern: /([a-zõäöüšž]{4,})s$/i,
    label: 'Инессив (seesütlev, падеж на -s) или 3 л. ед. ч. прошедшего времени (-s)',
    explanation: 'падеж «в ком? в чём? где?» у существительных, либо «он/она сделал(а)» у глаголов',
  },
  {
    pattern: /([a-zõäöüšž]{4,})l$/i,
    label: 'Адессив (alalütlev, падеж на -l)',
    explanation: 'означает «на чём? у кого? когда?» (также конструкция обладания: mul/tal on...)',
  },
];

const POSTPOSITIONS: Record<string, string> = {
  alla: 'послелог «под (куда?)» — требует родительного падежа (omastav)',
  all: 'послелог «под (где?)» — требует родительного падежа (omastav)',
  peale: 'послелог «на / после» — требует родительного падежа',
  peal: 'послелог «на (поверхности)» — требует родительного падежа',
  jaoks: 'послелог «для» — требует родительного падежа',
  järele: 'послелог «за / вслед за / по» — требует родительного падежа',
  kõrval: 'послелог «рядом с» — требует родительного падежа',
  vahel: 'послелог «между» — требует родительного падежа',
  eest: 'послелог «за (благодарить за что-то) / от» — требует родительного падежа',
  vastu: 'послелог «навстречу / против» — требует родительного или аллатива',
  juurde: 'послелог «к (кому/чему)» — требует родительного падежа',
  juures: 'послелог «у / при / около» — требует родительного падежа',
  taga: 'послелог «за / позади (где?)» — требует родительного падежа',
  tagant: 'послелог «из-за (откуда?)» — требует родительного падежа',
  sees: 'послелог «внутри (где?)» — требует родительного падежа',
};

/**
 * Built-in 0 € offline Estonian morphological & case analyzer for any paragraph.
 * Works immediately without any API keys or costs!
 */
export function analyzeEstonianGrammarOffline(etText: string): string {
  const tokens = etText
    .split(/\s+/)
    .map((t) => cleanWordToken(t))
    .filter((t) => t.length >= 3);

  const notes: string[] = [];
  const seen = new Set<string>();

  for (const word of tokens) {
    if (seen.has(word)) continue;

    if (POSTPOSITIONS[word]) {
      seen.add(word);
      notes.push(`• ${word} — ${POSTPOSITIONS[word]}`);
      continue;
    }

    for (const rule of ESTONIAN_MORPH_RULES) {
      if (rule.pattern.test(word)) {
        seen.add(word);
        notes.push(`• ${word} — ${rule.label}: ${rule.explanation}`);
        break;
      }
    }

    if (notes.length >= 6) break;
  }

  if (notes.length === 0) {
    return '• В этом предложении используются базовые словарные формы (именительный, родительный или партитив без внешних падежных окончаний). Нажмите на любое слово в абзаце, чтобы увидеть все 3 его основные формы в словаре SONAPI.';
  }

  return notes.join('\n');
}
