import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { inflectionQueries } from '../src/dictionary/inflections';
import { getEkiCefr } from '../src/dictionary/ekiCefr';
import { createVocabularyIndex, tokenizeParagraph } from '../src/tokenizer';
import {
  parseEpubBuffer,
  parseFb2Buffer,
  parsePlainText,
} from '../src/parsers/bookParser';
import type { SonadCompanionWord } from '../src/sonadClient';

describe('Estonian morphology & tokenizer', () => {
  it('generates stem candidates for oblique Estonian noun and verb forms', () => {
    expect(inflectionQueries('kohvikusse')).toContain('kohvik');
    expect(inflectionQueries('otsuseid')).toContain('otsus');
    expect(inflectionQueries('emale')).toContain('ema');
    expect(inflectionQueries('ootas')).toContain('ootama');
  });

  it('resolves EKI CEFR levels for common Estonian words', () => {
    expect(getEkiCefr('raamat')).toBeTruthy();
    expect(getEkiCefr('hommik')).toBeTruthy();
  });

  it('tokenizes paragraphs and matches inflected words against Sõnad vocabulary', () => {
    const mockWords: SonadCompanionWord[] = [
      {
        id: 'w-1',
        lemma: 'kohvik',
        translation: 'кафе',
        partOfSpeech: 'noun',
        forms: {
          primary: ['kohvik', 'kohviku', 'kohvikut'],
          paradigm: [],
        },
        formsNotApplicable: false,
        notes: '',
        folderId: null,
        level: 'A1',
        status: 'recalled',
        firstReviewedAt: null,
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'w-2',
        lemma: 'otsus',
        translation: 'решение',
        partOfSpeech: 'noun',
        forms: {
          primary: ['otsus', 'otsuse', 'otsust'],
          paradigm: [],
        },
        formsNotApplicable: false,
        notes: '',
        folderId: null,
        level: 'A2',
        status: 'new',
        firstReviewedAt: null,
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
    ];

    const index = createVocabularyIndex(mockWords, ['raamat']);
    const segments = tokenizeParagraph(
      'Martin astus kohvikusse, tegi otsuseid ja avas raamatu.',
    );

    const wordSegments = segments.filter((s) => s.isWord);
    expect(wordSegments.map((s) => s.cleanWord)).toEqual([
      'martin',
      'astus',
      'kohvikusse',
      'tegi',
      'otsuseid',
      'ja',
      'avas',
      'raamatu',
    ]);

    expect(index.matchWord('kohvikusse')?.lemma).toBe('kohvik');
    expect(index.matchWord('otsuseid')?.lemma).toBe('otsus');
    expect(index.isTargetWord('raamatu')).toBe(true);
  });
});

describe('Book parsers (.txt, .fb2, .epub)', () => {
  it('parses plain text into chapters and paragraphs', () => {
    const parsed = parsePlainText(
      'Esimene lõik eesti keeles.\n\nTeine lõik eesti keeles.',
      'Test Raamat',
    );
    expect(parsed.title).toBe('Test Raamat');
    expect(parsed.chapters.length).toBe(1);
    expect(parsed.chapters[0].paragraphs.length).toBe(2);
  });

  it('parses FB2 XML into metadata, chapters, and paragraphs', async () => {
    const fb2Xml = `<?xml version="1.0" encoding="utf-8"?>
      <FictionBook>
        <description>
          <title-info>
            <author><first-name>Anton</first-name><last-name>Tammsaare</last-name></author>
            <book-title>Tõde ja õigus</book-title>
          </title-info>
        </description>
        <body>
          <section>
            <title><p>I peatükk</p></title>
            <p>See oli Vargamäe.</p>
            <p>Andres ja Krõõt tulid mäele.</p>
          </section>
        </body>
      </FictionBook>`;

    const buf = new TextEncoder().encode(fb2Xml).buffer;
    const parsed = await parseFb2Buffer(buf);
    expect(parsed.title).toBe('Tõde ja õigus');
    expect(parsed.author).toBe('Anton Tammsaare');
    expect(parsed.chapters.length).toBe(1);
    expect(parsed.chapters[0].title).toBe('I peatükk');
    expect(parsed.chapters[0].paragraphs.map((p) => p.et)).toEqual([
      'See oli Vargamäe.',
      'Andres ja Krõõt tulid mäele.',
    ]);
  });

  it('parses EPUB archive via container.xml -> content.opf -> spine XHTML', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
       <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
         <rootfiles>
           <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
         </rootfiles>
       </container>`,
    );
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="utf-8"?>
       <package xmlns="http://www.idpf.org/2007/opf" version="2.0">
         <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
           <dc:title>Kevade</dc:title>
           <dc:creator>Oskar Luts</dc:creator>
         </metadata>
         <manifest>
           <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
         </manifest>
         <spine>
           <itemref idref="ch1"/>
         </spine>
       </package>`,
    );
    zip.file(
      'OEBPS/ch1.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>
       <html xmlns="http://www.w3.org/1999/xhtml">
         <body>
           <h1>Esimene koolipäev</h1>
           <p>Kui Arno isaga koolimajja jõudis, olid tunnid juba alanud.</p>
         </body>
       </html>`,
    );

    const epubBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const parsed = await parseEpubBuffer(epubBuffer);
    expect(parsed.title).toBe('Kevade');
    expect(parsed.author).toBe('Oskar Luts');
    expect(parsed.chapters.length).toBe(1);
    expect(parsed.chapters[0].title).toBe('Esimene koolipäev');
    expect(
      parsed.chapters[0].paragraphs.some((p) =>
        p.et.includes('Kui Arno isaga koolimajja jõudis'),
      ),
    ).toBe(true);
  });
});
