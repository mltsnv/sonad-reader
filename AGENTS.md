# Sõnad Reader (Lugemik) — Project Memory & Instructions for AI Agent

Ты работаешь над проектом **Sõnad Reader (Lugemik)** — умной двуязычной читалкой и AI-генератором рассказов на эстонском языке для русскоязычного владельца (не разработчика).
Общайся с владельцем **на русском языке**, работай прямо в этой папке (`c:\Users\mrmol\Desktop\SonadReader`).

Перед началом разработки обязательно прочитай:
1. `SPEC.md` — полное описание функций приложения (AI-генератор рассказов по словам пользователя, чтение своих книг `.epub`/`.fb2`/`.txt` в стиле «Билингва», перевод по нажатию и сохранение слов в `Sõnad`).
2. `SONAD_INTEGRATION.md` — готовый API-протокол и код интеграции с основным приложением `Sõnad`.

---

## Связь с основным проектом Sõnad

Основное приложение словаря и интервальных повторений **Sõnad** уже создано, работает в продакшене и находится на этом же компьютере в соседней папке:
- **Локальный путь к коду Sõnad**: `c:\Users\mrmol\Desktop\Sonad`
- **Production URL Sõnad**: `https://sonad.mkin-did-it.workers.dev`
- **Документация моста интеграции в Sõnad**: `c:\Users\mrmol\Desktop\Sonad\COMPANION_API.md`
- **Серверная реализация моста в Sõnad**: `c:\Users\mrmol\Desktop\Sonad\server\companion.ts`

### Какие модули из `c:\Users\mrmol\Desktop\Sonad` можно переиспользовать напрямую:
1. `c:\Users\mrmol\Desktop\Sonad\src\dictionary\sonapi.ts` и `inflections.ts` — готовый морфологический парсер эстонского словаря SONAPI (умеет находить начальную форму `lemma`, русские переводы по значениям и 3 основные формы даже по косвенному падежу в тексте книги, например `otsuseid → otsus`, `emale → ema`).
2. `c:\Users\mrmol\Desktop\Sonad\src\dictionary\ekiCefr.ts` — определение уровня CEFR (`A1–C2`) для эстонских слов.
3. `c:\Users\mrmol\Desktop\Sonad\src\model.ts` — типы данных `Word`, `WordForms`, `PartOfSpeech`.

> **Важное правило безопасности**: Никогда не удаляй и не ломай файлы или базу данных в `c:\Users\mrmol\Desktop\Sonad`. Взаимодействие с базой слов пользователя происходит через специально подготовленный в `Sõnad` API-мост (`/api/companion/words` и `/api/companion/lookup`) по токену `sonad_pat_...`, который пользователь выпускает в настройках `Sõnad`.

> **Железное финансовое правило (Бюджет 0 €)**:
> Приложение создаётся исключительно для личного пользования владельца и **не должно стоить денег за инфраструктуру/серверы/словари (бюджет 0 евро)**, не считая уже имеющихся у владельца подписок/ключей на нейросети.
> - Всё в приложении должно работать **напрямую через API в 1 клик** (никакого ручного копирования промптов!).
> - Хостинг (локально или Cloudflare Pages / Workers Free Tier), база данных (`IndexedDB / Dexie`), словарный разбор (`EKI SONAPI` + `EKI CEFR`), нейропереводчик `TartuNLP Neurotõlge` (`https://api.tartunlp.ai/translation/v2`) и синхронизация с `Sõnad` полностью бесплатны (`0 €`).
> - Генерация рассказов работает напрямую по API через подключённый ключ владельца (Google Gemini API, OpenAI, Anthropic Claude, OpenRouter, Groq).

---

## Рекомендуемый технологический стек

- **Frontend / PWA**: React + TypeScript (strict) + Vite + Dexie (IndexedDB для офлайн-хранения книг, позиции чтения, сгенерированных рассказов и кэша словаря `Sõnad`).
- **Парсинг книг**:
  - `.txt` / вставленный текст / статьи — нативный разбор на главы и абзацы;
  - `.fb2` — нативный `DOMParser` (XML) с извлечением `<section>` и `<p>`;
  - `.epub` — `jszip` + нативный `DOMParser` (извлечение `META-INF/container.xml` → `.opf` → глав XHTML по `spine`) без тяжёлых внешних iframe-движков, чтобы каждое слово в абзаце было интерактивным `<span>`, по которому работает тап-перевод и подсветка слов из `Sõnad`!
- **AI-провайдеры (BYOK — Bring Your Own Key)**:
  - Пользователь сам вставляет свой API-ключ в настройках приложения (ключ хранится **только локально** в `localStorage` / `Dexie`, никогда не отправляется на сторонние серверы и не коммитится в git).
  - Поддержать 4 варианта из коробки:
    1. **Google Gemini API** (`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`) — рекомендовать по умолчанию (есть бесплатный тариф в Google AI Studio);
    2. **OpenAI (ChatGPT)** (`https://api.openai.com/v1/chat/completions`, модель `gpt-4o-mini` / `gpt-4o`);
    3. **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions` — доступ к любым моделям, включая бесплатные и Claude/DeepSeek);
    4. **Anthropic Claude** или кастомный OpenAI-совместимый URL.
- **Упаковка под Android (по желанию владельца)**:
  - Приложение сразу строится как устанавливаемое **PWA** (с `vite-plugin-pwa`), а при желании оборачивается в `.apk` через Capacitor.
