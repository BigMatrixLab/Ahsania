import { encodePage, type PreparedPage } from "./render";

/** Longest side of a PDF page once drawn: about 190 dpi on A4, sharp enough to read. */
export const PDF_PAGE_SIDE = 2200;

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Draw the first `limit` pages of a PDF as page images, on a white background.
 * pdf.js is loaded only when a PDF is picked, so the app stays small for photo-only use.
 */
export async function pdfToPages(file: File, limit: number): Promise<{ pages: PreparedPage[]; total: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    const pages: PreparedPage[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, limit); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_PAGE_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(await encodePage(canvas));
      page.cleanup();
    }
    return { pages, total: doc.numPages };
  } finally {
    await task.destroy();
  }
}
