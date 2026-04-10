/**
 * Shared PDF utilities used across all PDF tools.
 *
 * - Download trigger (blob -> anchor click)
 * - Page range parsing ("1-5", "1,3,5-10")
 * - PDF.js thumbnail rendering
 * - File size formatting helpers
 */

import { PDFDocument } from 'pdf-lib';

// ─── Download helper ───────────────────────────────────────────────────────

/**
 * Trigger a file download from a Uint8Array or Blob.
 * Uses an ephemeral anchor element — the URL is revoked after a short delay.
 */
export function triggerDownload(data: Uint8Array | Blob, filename: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Page range parsing ────────────────────────────────────────────────────

/**
 * Parse a page range string like "1-5, 8, 10-12" into a sorted, de-duped
 * array of 0-indexed page numbers. Returns null if the input is invalid.
 *
 * @param input  User-typed range string (1-indexed)
 * @param total  Total page count for bounds checking
 */
export function parsePageRange(input: string, total: number): number[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const result = new Set<number>();
  const segments = trimmed.split(',');

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;

    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(s);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]!, 10);
      const end = parseInt(rangeMatch[2]!, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || start > total || end > total) {
        return null;
      }
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let i = lo; i <= hi; i++) {
        result.add(i - 1); // convert to 0-indexed
      }
    } else {
      const page = parseInt(s, 10);
      if (isNaN(page) || page < 1 || page > total) return null;
      result.add(page - 1);
    }
  }

  if (result.size === 0) return null;
  return Array.from(result).sort((a, b) => a - b);
}

// ─── Safe PDF loading ──────────────────────────────────────────────────────

/**
 * Attempt to load a PDF from an ArrayBuffer. Returns the PDFDocument or
 * throws a user-friendly error message.
 */
export async function loadPdf(buffer: ArrayBuffer, filename: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('encrypt') || msg.toLowerCase().includes('password')) {
      throw new Error(`"${filename}" is password-protected and cannot be processed.`);
    }
    throw new Error(`"${filename}" could not be loaded. It may be corrupted or not a valid PDF.`);
  }
}

// ─── PDF.js thumbnail rendering ────────────────────────────────────────────

let pdfjsInitialized = false;

/**
 * Lazily import and configure pdfjs-dist. We do this once per session.
 */
async function getPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsInitialized) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).href;
    pdfjsInitialized = true;
  }
  return pdfjsLib;
}

/**
 * Render a single page of a PDF to a data URL (PNG).
 *
 * @param data   Raw PDF bytes as ArrayBuffer
 * @param pageNum  1-indexed page number
 * @param scale    Render scale (1 = 72dpi, 2 = 144dpi)
 */
export async function renderPageToDataUrl(
  data: ArrayBuffer,
  pageNum: number,
  scale: number = 1,
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');

  page.cleanup();
  pdf.destroy();

  return dataUrl;
}

/**
 * Render a single page to a canvas data URL with format choice.
 */
export async function renderPageToImage(
  data: ArrayBuffer,
  pageNum: number,
  scale: number,
  format: 'png' | 'jpg',
  quality: number = 0.92,
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const dataUrl = format === 'jpg' ? canvas.toDataURL(mimeType, quality) : canvas.toDataURL(mimeType);

  page.cleanup();
  pdf.destroy();

  return dataUrl;
}

/**
 * Get page count from raw PDF bytes using pdfjs-dist.
 */
export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const count = pdf.numPages;
  pdf.destroy();
  return count;
}

/**
 * Render thumbnail data URLs for multiple pages.
 */
export async function renderThumbnails(
  data: ArrayBuffer,
  pageNumbers: number[],
  scale: number = 0.3,
): Promise<Map<number, string>> {
  const pdfjsLib = await getPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const results = new Map<number, string>();

  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdf.numPages) continue;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      page.cleanup();
      continue;
    }

    await page.render({ canvasContext: ctx, viewport }).promise;
    results.set(pageNum, canvas.toDataURL('image/png'));
    page.cleanup();
  }

  pdf.destroy();
  return results;
}
