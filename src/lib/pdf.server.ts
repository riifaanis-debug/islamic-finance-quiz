import { embedTexts } from "./ai.server";

export type PageChunk = {
  page_number: number;
  chunk_index: number;
  section_title: string | null;
  content: string;
};

const MAX_CHARS = 900;
const OVERLAP = 150;

function cleanText(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessSectionTitle(pageText: string): string | null {
  const first = pageText
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 3 && l.length < 90);
  return first ?? null;
}

export function chunkPages(pages: string[]): PageChunk[] {
  const chunks: PageChunk[] = [];
  pages.forEach((rawPage, pageIndex) => {
    const page = cleanText(rawPage);
    if (page.length < 25) return;
    const title = guessSectionTitle(page);
    let cursor = 0;
    let chunkIndex = 0;
    while (cursor < page.length) {
      let end = Math.min(page.length, cursor + MAX_CHARS);
      if (end < page.length) {
        const window = page.slice(cursor, end);
        const breakAt = Math.max(
          window.lastIndexOf("\n"),
          window.lastIndexOf("."),
          window.lastIndexOf("۔"),
          window.lastIndexOf("؟"),
        );
        if (breakAt > MAX_CHARS * 0.5) end = cursor + breakAt + 1;
      }
      const content = page.slice(cursor, end).trim();
      if (content.length > 25) {
        chunks.push({
          page_number: pageIndex + 1,
          chunk_index: chunkIndex++,
          section_title: title,
          content,
        });
      }
      if (end >= page.length) break;
      cursor = Math.max(end - OVERLAP, cursor + 1);
    }
  });
  return chunks;
}

export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [String(text)];
}

export async function embedInBatches(
  texts: string[],
  batchSize = 24,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    out.push(...(await embedTexts(batch)));
  }
  return out;
}
