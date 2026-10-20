import JSZip from 'jszip';
import type { BookParagraph, BookSource } from '../db';

export interface ParsedBookChapter {
  title: string;
  paragraphs: BookParagraph[];
}

export interface ParsedBookData {
  title: string;
  author: string;
  source: BookSource;
  chapters: ParsedBookChapter[];
}

const COVER_COLORS = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#1d4ed8',
  '#047857',
  '#4338ca',
];

export function pickCoverColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COVER_COLORS[hash % COVER_COLORS.length];
}

function cleanText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse plain text (.txt or pasted article) into chapters and paragraphs
 */
export function parsePlainText(
  rawText: string,
  defaultTitle = 'Вставленный текст',
  source: BookSource = 'txt',
): ParsedBookData {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized
    .split(/\n{2,}/)
    .flatMap((block) => {
      // If a block is huge with single line breaks, split by single line breaks
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length > 4) return lines;
      return [lines.join(' ')];
    })
    .map(cleanText)
    .filter(Boolean);

  const headingRegex =
    /^(?:#{1,3}\s+.+|(?:peatükk|глава|chapter|osa)\s+[\dIVXLCDM]+.*|[IVXLCDM]+\.\s+.+)$/i;

  const chapters: ParsedBookChapter[] = [];
  let currentChapter: ParsedBookChapter = {
    title: defaultTitle,
    paragraphs: [],
  };

  for (const block of blocks) {
    const cleanHeading = block.replace(/^#{1,3}\s+/, '').trim();
    if (
      headingRegex.test(block) &&
      currentChapter.paragraphs.length >= 3 &&
      cleanHeading.length < 100
    ) {
      chapters.push(currentChapter);
      currentChapter = {
        title: cleanHeading,
        paragraphs: [],
      };
      continue;
    }

    currentChapter.paragraphs.push({
      id: `p-${currentChapter.paragraphs.length + 1}`,
      et: cleanHeading,
      isHeading: headingRegex.test(block) && cleanHeading.length < 90,
    });

    // Split very long plain-text books into comfortable chapters of ~45 paragraphs
    if (currentChapter.paragraphs.length >= 45) {
      chapters.push(currentChapter);
      currentChapter = {
        title: `${defaultTitle} · Часть ${chapters.length + 1}`,
        paragraphs: [],
      };
    }
  }

  if (currentChapter.paragraphs.length > 0) {
    chapters.push(currentChapter);
  }

  if (chapters.length === 0) {
    chapters.push({
      title: defaultTitle,
      paragraphs: [{ id: 'p-1', et: normalized || defaultTitle }],
    });
  }

  if (chapters.length > 1 && chapters[0].title === defaultTitle) {
    chapters[0].title = `${defaultTitle} · Часть 1`;
  }

  return {
    title: defaultTitle,
    author: source === 'paste' ? 'Свой текст / Статья' : 'Текстовый документ',
    source,
    chapters,
  };
}

function decodeBufferWithXmlEncoding(buffer: ArrayBuffer): string {
  const headBytes = new Uint8Array(buffer.slice(0, 256));
  const asciiHead = Array.from(headBytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  const match = asciiHead.match(/encoding=["']([^"']+)["']/i);
  const encoding = match?.[1]?.toLowerCase() ?? 'utf-8';
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/**
 * Parse FictionBook (.fb2 or .fb2.zip) into chapters and paragraphs
 */
export async function parseFb2Buffer(
  buffer: ArrayBuffer,
  fallbackTitle = 'Книга FB2',
): Promise<ParsedBookData> {
  let xmlText = '';
  const bytes = new Uint8Array(buffer.slice(0, 4));
  // Check if PK zip header (.fb2.zip)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buffer);
    const fb2Entry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.fb2'),
    );
    if (!fb2Entry) {
      throw new Error('Внутри архива не найден файл .fb2.');
    }
    const innerBuf = await fb2Entry.async('arraybuffer');
    xmlText = decodeBufferWithXmlEncoding(innerBuf);
  } else {
    xmlText = decodeBufferWithXmlEncoding(buffer);
  }

  const parser = new DOMParser();
  let doc = parser.parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) {
    doc = parser.parseFromString(xmlText, 'text/html');
  }

  const bookTitle =
    cleanText(doc.querySelector('title-info > book-title, book-title')?.textContent ?? '') ||
    fallbackTitle;

  const authorNode = doc.querySelector('title-info > author, author');
  const firstName = cleanText(authorNode?.querySelector('first-name')?.textContent ?? '');
  const lastName = cleanText(authorNode?.querySelector('last-name')?.textContent ?? '');
  const author = [firstName, lastName].filter(Boolean).join(' ') || 'Автор не указан';

  const body = doc.querySelector('body') ?? doc.documentElement;
  const sections = Array.from(body.querySelectorAll('section')).filter(
    (sec) => sec.querySelectorAll(':scope > p, :scope > subtitle, :scope > poem').length > 0,
  );

  const chapters: ParsedBookChapter[] = [];

  if (sections.length > 0) {
    sections.forEach((sec, idx) => {
      const titleNode = sec.querySelector(':scope > title');
      const secTitle =
        cleanText(titleNode?.textContent ?? '') || `Глава ${idx + 1}`;
      const paragraphs: BookParagraph[] = [];

      for (const child of Array.from(sec.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'title') continue;
        if (tag === 'subtitle') {
          const text = cleanText(child.textContent ?? '');
          if (text) {
            paragraphs.push({
              id: `p-${paragraphs.length + 1}`,
              et: text,
              isHeading: true,
            });
          }
        } else if (tag === 'p' || tag === 'v' || tag === 'epigraph' || tag === 'poem') {
          const text = cleanText(child.textContent ?? '');
          if (text) {
            paragraphs.push({
              id: `p-${paragraphs.length + 1}`,
              et: text,
            });
          }
        }
      }

      if (paragraphs.length > 0) {
        chapters.push({
          title: secTitle,
          paragraphs,
        });
      }
    });
  }

  if (chapters.length === 0) {
    const allP = Array.from(doc.querySelectorAll('p'))
      .map((p) => cleanText(p.textContent ?? ''))
      .filter(Boolean);
    if (allP.length > 0) {
      const parsed = parsePlainText(allP.join('\n\n'), bookTitle, 'fb2');
      return {
        ...parsed,
        title: bookTitle,
        author,
        source: 'fb2',
      };
    }
    throw new Error('Не удалось извлечь текст из файла FB2.');
  }

  return {
    title: bookTitle,
    author,
    source: 'fb2',
    chapters,
  };
}

function resolveRelativePath(baseDir: string, relativeHref: string): string {
  const cleanHref = relativeHref.split('#')[0].replace(/^\/+/, '');
  if (!baseDir) return cleanHref;
  const parts = [...baseDir.split('/').filter(Boolean), ...cleanHref.split('/').filter(Boolean)];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

/**
 * Parse EPUB (.epub) archive into chapters and interactive paragraphs
 */
export async function parseEpubBuffer(
  buffer: ArrayBuffer,
  fallbackTitle = 'Книга EPUB',
): Promise<ParsedBookData> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  // 1. Locate OPF file via META-INF/container.xml or search for .opf
  let opfPath = '';
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('string');
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    const rootfile = containerDoc.querySelector('rootfile');
    opfPath = rootfile?.getAttribute('full-path') ?? '';
  }

  if (!opfPath || !zip.file(opfPath)) {
    const opfEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.opf'),
    );
    if (!opfEntry) {
      throw new Error('В файле EPUB не найден пакет метаданных (.opf).');
    }
    opfPath = opfEntry.name;
  }

  const opfDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/'))
    : '';

  const opfXml = await zip.file(opfPath)!.async('string');
  const opfDoc = parser.parseFromString(opfXml, 'text/xml');

  const titleNode =
    opfDoc.getElementsByTagName('dc:title')[0] ??
    opfDoc.querySelector('metadata title, title');
  const creatorNode =
    opfDoc.getElementsByTagName('dc:creator')[0] ??
    opfDoc.querySelector('metadata creator, creator');

  const bookTitle = cleanText(titleNode?.textContent ?? '') || fallbackTitle;
  const author = cleanText(creatorNode?.textContent ?? '') || 'Автор не указан';

  // 2. Build manifest map (id -> href)
  const manifestMap = new Map<string, string>();
  const itemElements = Array.from(opfDoc.getElementsByTagName('item'));
  for (const item of itemElements) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifestMap.set(id, decodeURIComponent(href));
    }
  }

  // 3. Collect ordered spine items
  const spineItemRefs = Array.from(opfDoc.getElementsByTagName('itemref'));
  const spineHrefs: string[] = [];
  for (const ref of spineItemRefs) {
    const idref = ref.getAttribute('idref');
    if (idref && manifestMap.has(idref)) {
      spineHrefs.push(manifestMap.get(idref)!);
    }
  }

  // Fallback if spine was empty
  if (spineHrefs.length === 0) {
    for (const [id, href] of manifestMap.entries()) {
      if (/\.(xhtml|html|htm)$/i.test(href) && !/nav|toc|cover/i.test(id)) {
        spineHrefs.push(href);
      }
    }
  }

  const chapters: ParsedBookChapter[] = [];

  for (let i = 0; i < spineHrefs.length; i++) {
    const relHref = spineHrefs[i];
    const fullPath = resolveRelativePath(opfDir, relHref);
    const zipEntry =
      zip.file(fullPath) ??
      zip.file(relHref) ??
      Object.values(zip.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith(relHref.toLowerCase()),
      );

    if (!zipEntry) continue;

    const htmlContent = await zipEntry.async('string');
    let htmlDoc = parser.parseFromString(htmlContent, 'application/xhtml+xml');
    if (htmlDoc.querySelector('parsererror')) {
      htmlDoc = parser.parseFromString(htmlContent, 'text/html');
    }

    // Remove script/style/nav/svg elements
    htmlDoc
      .querySelectorAll('script, style, nav, svg, noscript')
      .forEach((el) => el.remove());

    const headingEl = htmlDoc.querySelector('h1, h2, h3, title');
    const candidateTitle = cleanText(headingEl?.textContent ?? '');

    const blockNodes = Array.from(
      htmlDoc.querySelectorAll('h1, h2, h3, h4, p, blockquote, li'),
    );

    const paragraphs: BookParagraph[] = [];
    const seenTexts = new Set<string>();

    for (const node of blockNodes) {
      // Skip nested block nodes (e.g., <p> inside <blockquote> or <li>) to avoid duplication
      if (node.querySelector('p, h1, h2, h3, h4')) continue;
      const text = cleanText(node.textContent ?? '');
      if (!text || seenTexts.has(text)) continue;
      seenTexts.add(text);

      const tag = node.tagName.toLowerCase();
      const isHeading = tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4';

      paragraphs.push({
        id: `p-${paragraphs.length + 1}`,
        et: text,
        isHeading,
      });
    }

    // Fallback if XHTML file used <div> or <br> instead of <p>
    if (paragraphs.length === 0) {
      const bodyText = (htmlDoc.body?.innerText || htmlDoc.body?.textContent || '').trim();
      if (bodyText.length > 20) {
        const lines = bodyText
          .split(/\n+/)
          .map(cleanText)
          .filter((l) => l.length > 1);
        for (const line of lines) {
          paragraphs.push({
            id: `p-${paragraphs.length + 1}`,
            et: line,
          });
        }
      }
    }

    if (paragraphs.length === 0) continue;

    const chapterTitle =
      candidateTitle && candidateTitle.length <= 90 && candidateTitle !== bookTitle
        ? candidateTitle
        : `Глава ${chapters.length + 1}`;

    chapters.push({
      title: chapterTitle,
      paragraphs,
    });
  }

  if (chapters.length === 0) {
    throw new Error('Не удалось найти текстовые главы внутри EPUB-файла.');
  }

  return {
    title: bookTitle,
    author,
    source: 'epub',
    chapters,
  };
}

export async function parseUploadedBookFile(file: File): Promise<ParsedBookData> {
  const fileName = file.name;
  const baseTitle = fileName
    .replace(/\.(fb2\.zip|epub|fb2|txt)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const lower = fileName.toLowerCase();
  if (lower.endsWith('.epub')) {
    const buf = await file.arrayBuffer();
    return parseEpubBuffer(buf, baseTitle || 'Книга EPUB');
  }
  if (lower.endsWith('.fb2') || lower.endsWith('.fb2.zip')) {
    const buf = await file.arrayBuffer();
    return parseFb2Buffer(buf, baseTitle || 'Книга FB2');
  }
  const text = await file.text();
  return parsePlainText(text, baseTitle || 'Текстовая книга', 'txt');
}
