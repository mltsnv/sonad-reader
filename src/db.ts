import Dexie, { type Table } from 'dexie';
import type { SonadCompanionWord, SonadFolder, SonadVocabularySummary } from './sonadClient';
import type { CefrLevel } from './dictionary/ekiCefr';

export type BookSource = 'ai' | 'epub' | 'fb2' | 'txt' | 'paste' | 'starter';

export interface BookParagraph {
  id: string;
  et: string;
  ru?: string;
  grammarNote?: string;
  isHeading?: boolean;
}

export interface BookRecord {
  id: string;
  title: string;
  titleRu?: string;
  author?: string;
  source: BookSource;
  level?: CefrLevel | null;
  genre?: string;
  targetWords?: string[];
  totalChapters: number;
  totalParagraphs: number;
  currentChapterIndex: number;
  currentParagraphIndex: number;
  progressPercent: number;
  coverColor?: string;
  favorite?: boolean;
  createdAt: string;
  lastReadAt: string;
}

export interface ChapterRecord {
  id: string;
  bookId: string;
  index: number;
  title: string;
  paragraphs: BookParagraph[];
}

export interface ParagraphTranslationRecord {
  id: string;
  etText: string;
  ruTranslation: string;
  grammarBreakdown?: string;
  updatedAt: string;
}

export interface BookmarkRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  paragraphId: string;
  etText: string;
  ruText?: string;
  createdAt: string;
}

export type AiProviderId =
  | 'cloudflare'
  | 'gemini'
  | 'groq'
  | 'openrouter'
  | 'openai'
  | 'anthropic';

export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFontFamily = 'serif' | 'sans';

export interface UserProfile {
  name: string;
  avatar: string;
  cefrLevel: CefrLevel;
  learningGoal: string;
  dailyParagraphGoal: number;
  favoriteGenres: string[];
  favoriteAuthors: string[];
  favoriteTopics: string[];
  preferredTone: string;
  recurringCharacters: string;
  avoidTopics: string;
  useProfileInAi: boolean;
  readDays: string[];
  dailyReadCount: Record<string, number>;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Читатель',
  avatar: '🦉',
  cefrLevel: 'A2',
  learningGoal: 'Свободно читать книги, статьи и общаться в Эстонии',
  dailyParagraphGoal: 15,
  favoriteGenres: [
    'Уютная повседневность',
    'Детектив и тайны',
    'Юмор и ирония',
    'Путешествия по Эстонии',
  ],
  favoriteAuthors: [
    'Andrus Kivirähk (ирония и фольклор)',
    'Indrek Hargla (исторический детектив)',
    'Сергей Довлатов (короткий рассказ)',
  ],
  favoriteTopics: [
    'Кафе и гастрономия',
    'Старый Таллинн и Каламая',
    'Природа, болота и острова',
    'Книги, культура и кино',
  ],
  preferredTone: 'Тёплый, живой и с лёгким юмором',
  recurringCharacters: '',
  avoidTopics: '',
  useProfileInAi: true,
  readDays: [],
  dailyReadCount: {},
};

export interface AppSettings {
  sonadToken: string;
  sonadBaseUrl: string;
  lastSyncAt: string | null;
  sonadSummary: SonadVocabularySummary | null;
  sonadFolders: SonadFolder[];
  aiProvider: AiProviderId;
  aiApiKey: string;
  aiModel: string;
  customBaseUrl: string;
  readerTheme: ReaderTheme;
  readerFontSize: number;
  readerLineHeight: number;
  readerFontFamily: ReaderFontFamily;
  highlightOpin: boolean;
  highlightSonavara: boolean;
  profile: UserProfile;
}

export const DEFAULT_MODELS: Record<AiProviderId, string> = {
  cloudflare: '@cf/google/gemma-4-26b-a4b-it',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'deepseek/deepseek-chat:free',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

export const DEFAULT_SETTINGS: AppSettings = {
  sonadToken: '',
  sonadBaseUrl: 'https://sonad.mkin-did-it.workers.dev',
  lastSyncAt: null,
  sonadSummary: null,
  sonadFolders: [],
  aiProvider: 'cloudflare',
  aiApiKey: '',
  aiModel: '@cf/google/gemma-4-26b-a4b-it',
  customBaseUrl: '',
  readerTheme: 'light',
  readerFontSize: 19,
  readerLineHeight: 1.75,
  readerFontFamily: 'serif',
  highlightOpin: true,
  highlightSonavara: false,
  profile: DEFAULT_USER_PROFILE,
};

const SETTINGS_KEY = 'sonad_reader_settings_v1';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_USER_PROFILE } };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      profile: {
        ...DEFAULT_USER_PROFILE,
        ...(parsed.profile ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, profile: { ...DEFAULT_USER_PROFILE } };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    profile: patch.profile
      ? { ...current.profile, ...patch.profile }
      : current.profile,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  window.dispatchEvent(new CustomEvent('sonad-reader-settings-changed', { detail: next }));
  return next;
}

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function recordParagraphsReadToday(count = 1): AppSettings {
  const current = loadSettings();
  const today = todayIsoDate();
  const prevCount = current.profile.dailyReadCount[today] ?? 0;
  const nextReadDays = current.profile.readDays.includes(today)
    ? current.profile.readDays
    : [...current.profile.readDays, today].slice(-90);
  return saveSettings({
    profile: {
      ...current.profile,
      readDays: nextReadDays,
      dailyReadCount: {
        ...current.profile.dailyReadCount,
        [today]: prevCount + count,
      },
    },
  });
}

export function calculateReadingStreak(readDays: string[]): number {
  if (!readDays || readDays.length === 0) return 0;
  const set = new Set(readDays);
  const d = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    if (set.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export class SonadReaderDB extends Dexie {
  books!: Table<BookRecord, string>;
  chapters!: Table<ChapterRecord, string>;
  paragraphTranslations!: Table<ParagraphTranslationRecord, string>;
  sonadWords!: Table<SonadCompanionWord, string>;
  bookmarks!: Table<BookmarkRecord, string>;

  constructor() {
    super('SonadReaderDB');
    this.version(1).stores({
      books: 'id, source, lastReadAt, createdAt',
      chapters: 'id, bookId, [bookId+index]',
      paragraphTranslations: 'id, updatedAt',
      sonadWords: 'id, lemma, status, folderId',
    });
    this.version(2).stores({
      books: 'id, source, lastReadAt, createdAt, favorite',
      chapters: 'id, bookId, [bookId+index]',
      paragraphTranslations: 'id, updatedAt',
      sonadWords: 'id, lemma, status, folderId',
      bookmarks: 'id, bookId, createdAt',
    });
  }
}

export const db = new SonadReaderDB();

export function makeParagraphHash(etText: string): string {
  const norm = etText.trim().replace(/\s+/g, ' ');
  let h1 = 0xdeadbeef ^ norm.length;
  let h2 = 0x41c6ce57 ^ norm.length;
  for (let i = 0; i < norm.length; i++) {
    const ch = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `ptr_${(h2 >>> 0).toString(16)}_${(h1 >>> 0).toString(16)}`;
}

const STARTER_SEEDED_KEY = 'sonad_reader_starters_seeded_v1';

export async function ensureStarterStoriesSeeded(): Promise<void> {
  try {
    if (localStorage.getItem(STARTER_SEEDED_KEY) === '1') {
      const count = await db.books.count();
      if (count > 0) return;
    }
    const existingCount = await db.books.count();
    if (existingCount > 0) {
      localStorage.setItem(STARTER_SEEDED_KEY, '1');
      return;
    }

    const now = new Date().toISOString();

    const starterBooks: {
      book: BookRecord;
      chapters: ChapterRecord[];
    }[] = [
      {
        book: {
          id: 'starter-hommik-kohvikus',
          title: 'Hommik Tallinna kohvikus',
          titleRu: 'Утро в таллинском кафе',
          author: 'Lugemik · Стартовый рассказ',
          source: 'starter',
          level: 'A2',
          genre: 'Уютная повседневность',
          targetWords: ['hommik', 'kohvik', 'otsus', 'raamat', 'sõber', 'ootama', 'aken'],
          totalChapters: 1,
          totalParagraphs: 5,
          currentChapterIndex: 0,
          currentParagraphIndex: 0,
          progressPercent: 0,
          coverColor: '#1e293b',
          createdAt: now,
          lastReadAt: now,
        },
        chapters: [
          {
            id: 'starter-hommik-kohvikus-ch-0',
            bookId: 'starter-hommik-kohvikus',
            index: 0,
            title: 'Hommik Tallinna kohvikus',
            paragraphs: [
              {
                id: 'p-1',
                et: 'Oli vaikne ja päikeseline hommik vanalinnas. Martin astus väiksesse kohvikusse, kus lõhnas värske kohvi ja soojade saiakeste järele.',
                ru: 'Было тихое и солнечное утро в Старом городе. Мартин зашёл в маленькое кафе, где пахло свежим кофе и тёплыми булочками.',
                grammarNote:
                  '• vanalinnas — инессив (seesütlev, падеж на -s «в чём?»): vanalinn → vanalinnas (в Старом городе).\n• väiksesse kohvikusse — иллатив (sisseütlev, падеж на -sse «во что? куда?»): väike kohvik → väiksesse kohvikusse.\n• lõhnas ... järele — конструкция «пахло чем-либо» (глагол lõhnama требует родительного падежа + послелог järele).',
              },
              {
                id: 'p-2',
                et: 'Ta istus akna alla ja võttis kotist oma uue raamatu. Täna pidi ta tegema tähtsa otsuse, kuid kõigepealt tahtis ta rahulikult mõelda.',
                ru: 'Он сел у окна и достал из сумки свою новую книгу. Сегодня он должен был принять важное решение, но сперва хотел спокойно подумать.',
                grammarNote:
                  '• akna alla — родительный падеж (omastav: aken → akna) + послелог alla («под окно / у окна»).\n• kotist — элатив (seestütlev, падеж на -st «из чего?»): kott → kotist (из сумки).\n• tegema tähtsa otsuse — объект в родительном падеже (tähtis otsus → tähtsa otsuse) при утвердительном завершённом действии.',
              },
              {
                id: 'p-3',
                et: 'Ettekandja tõi lauale suure tassi musta kohvi ja naeratas sõbralikult: «Kas soovite veel midagi?»',
                ru: 'Официантка принесла на стол большую чашку чёрного кофе и дружелюбно улыбнулась: «Желаете ли вы ещё чего-нибудь?»',
                grammarNote:
                  '• lauale — аллатив (alaleütlev, падеж на -le «на что? кому?»): laud → lauale (на стол).\n• musta kohvi — партитив (osastav) после слова вещества/количества (tass musta kohvi — чашка чёрного кофе).',
              },
              {
                id: 'p-4',
                et: 'Martin tänas teda ja avas raamatu esimese lehekülje. Samal hetkel helises telefon — tema hea sõber Kristjan juba ootas teda väljas.',
                ru: 'Мартин поблагодарил её и открыл первую страницу книги. В этот же миг зазвонил телефон — его хороший друг Кристьян уже ждал его снаружи.',
                grammarNote:
                  '• tänas teda — глагол tänama (благодарить) в эстонском требует партитива (tema → teda).\n• ootas teda — глагол ootama (ждать) также всегда управляет партитивом (teda).',
              },
              {
                id: 'p-5',
                et: 'Martin jõi kohvi lõpuni, pani raamatu kotti tagasi ja läks rõõmsalt sõbrale vastu.',
                ru: 'Мартин допил кофе до конца, положил книгу обратно в сумку и радостно вышел навстречу другу.',
                grammarNote:
                  '• kotti — краткий иллатив (suunduv / lühike sisseütlev) от слова kott (в сумку).\n• sõbrale vastu — аллатив (sõber → sõbrale) + послелог vastu («навстречу другу»).',
              },
            ],
          },
        ],
      },
      {
        book: {
          id: 'starter-rongisoidul-tartusse',
          title: 'Rongisõit Tartusse',
          titleRu: 'Поездка на поезде в Тарту',
          author: 'Lugemik · Стартовый рассказ',
          source: 'starter',
          level: 'B1',
          genre: 'Путешествия по Эстонии',
          targetWords: ['rong', 'jaam', 'pilet', 'vestlus', 'kogemus', 'ülikool', 'ilm'],
          totalChapters: 1,
          totalParagraphs: 4,
          currentChapterIndex: 0,
          currentParagraphIndex: 0,
          progressPercent: 0,
          coverColor: '#0f766e',
          createdAt: now,
          lastReadAt: now,
        },
        chapters: [
          {
            id: 'starter-rongisoidul-tartusse-ch-0',
            bookId: 'starter-rongisoidul-tartusse',
            index: 0,
            title: 'Rongisõit Tartusse',
            paragraphs: [
              {
                id: 'p-1',
                et: 'Reede hommikul jõudis Anna Balti jaama kümme minutit enne rongi väljumist. Ta oli ostnud pileti juba eelmisel õhtul internetist.',
                ru: 'В пятницу утром Анна прибыла на Балтийский вокзал за десять минут до отправления поезда. Она купила билет ещё прошлым вечером через интернет.',
              },
              {
                id: 'p-2',
                et: 'Oranž rong liikus sujuvalt läbi lumise metsa ja vaiksete külade. Anna kõrval istus vanem proua, kes luges eestikeelset ajalehte.',
                ru: 'Оранжевый поезд плавно двигался сквозь заснеженный лес и тихие деревни. Рядом с Анной сидела пожилая дама, которая читала газету на эстонском языке.',
              },
              {
                id: 'p-3',
                et: 'Peagi algas nende vahel huvitav vestlus Tartu ülikoolist, vanadest traditsioonidest ja eesti keele õppimisest. Proua kiitis Annat ilusa häälduse eest.',
                ru: 'Вскоре между ними завязался интересный разговор о Тартуском университете, старых традициях и изучении эстонского языка. Дама похвалила Анну за красивое произношение.',
              },
              {
                id: 'p-4',
                et: 'Kui rong Tartusse saabus, tundis Anna, et see lühike reis andis talle suurepärase kogemuse ja palju uut julgust.',
                ru: 'Когда поезд прибыл в Тарту, Анна почувствовала, что эта короткая поездка подарила ей прекрасный опыт и много новой смелости.',
              },
            ],
          },
        ],
      },
      {
        book: {
          id: 'starter-kalamaja-saladus',
          title: 'Kalamaja vana võti',
          titleRu: 'Старый ключ из Каламая',
          author: 'Lugemik · Стартовый детектив',
          source: 'starter',
          level: 'A2',
          genre: 'Детектив и тайны',
          targetWords: ['võti', 'pööning', 'kiri', 'saladus', 'naaber', 'leidma', 'uks'],
          totalChapters: 1,
          totalParagraphs: 4,
          currentChapterIndex: 0,
          currentParagraphIndex: 0,
          progressPercent: 0,
          coverColor: '#ac721a',
          createdAt: now,
          lastReadAt: now,
        },
        chapters: [
          {
            id: 'starter-kalamaja-saladus-ch-0',
            bookId: 'starter-kalamaja-saladus',
            index: 0,
            title: 'Kalamaja vana võti',
            paragraphs: [
              {
                id: 'p-1',
                et: 'Vana puumaja Kalamajas peitis endas mitut saladust. Kui Rasmus kolis uude korterisse, leidis ta raamaturiiuli tagant väikese vaskse võtme.',
                ru: 'Старый деревянный дом в Каламая хранил в себе несколько тайн. Когда Расмус переехал в новую квартиру, он нашёл за книжным шкафом маленький медный ключ.',
                grammarNote:
                  '• peitis endas — скрывал в себе (глагол peitma + инессив endas).\n• kolis uude korterisse — переехал в новую квартиру (краткий иллатив uude + иллатив korterisse).\n• raamaturiiuli tagant — из-за книжной полки (родительный падеж + послелог tagant).',
              },
              {
                id: 'p-2',
                et: 'Võtme küljes rippus kollane paberitükk, kuhu oli kirjutatud ainult üks sõna: «Pööning». Rasmus otsustas kohe üles minna.',
                ru: 'На ключе висел жёлтый клочок бумаги, на котором было написано только одно слово: «Чердак». Расмус решил сразу подняться наверх.',
              },
              {
                id: 'p-3',
                et: 'Pööningul seisis tolmune puidust kast. Vana võti sobis lukuauku täpselt ning kaas avanes vaikse kriuksatusega.',
                ru: 'На чердаке стоял пыльный деревянный сундук. Старый ключ идеально подошёл к замочной скважине, и крышка открылась с тихим скрипом.',
              },
              {
                id: 'p-4',
                et: 'Kasti sees olid vanad fotod Tallinna sadamast ja südamlik kiri, mille keegi oli kirjutanud sada aastat tagasi.',
                ru: 'Внутри сундука лежали старые фотографии Таллиннского порта и сердечное письмо, которое кто-то написал сто лет назад.',
              },
            ],
          },
        ],
      },
    ];

    await db.transaction('rw', db.books, db.chapters, db.paragraphTranslations, async () => {
      for (const item of starterBooks) {
        await db.books.put(item.book);
        for (const ch of item.chapters) {
          await db.chapters.put(ch);
          for (const p of ch.paragraphs) {
            if (p.ru) {
              await db.paragraphTranslations.put({
                id: makeParagraphHash(p.et),
                etText: p.et,
                ruTranslation: p.ru,
                grammarBreakdown: p.grammarNote,
                updatedAt: now,
              });
            }
          }
        }
      }
    });

    localStorage.setItem(STARTER_SEEDED_KEY, '1');
  } catch (err) {
    console.warn('Could not seed starter stories:', err);
  }
}
