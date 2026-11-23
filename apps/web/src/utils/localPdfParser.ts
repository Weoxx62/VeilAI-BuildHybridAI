/**
 * 100% Client-Side Local PDF Text Extractor (Zero Server Upload).
 * Dynamically imports `pdfjs-dist` only when the user actually uploads or drops a PDF,
 * keeping initial page load fast while giving legal, medical, and finance professionals
 * true local PDF ingestion in browser RAM.
 */
export async function extractTextFromPdfLocally(
  file: File,
  maxPages = 25,
): Promise<{ text: string; pageCount: number; truncated: boolean }> {
  const [pdfjsLib, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, maxPages);
  const pageBlocks: string[] = [];

  for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = str;
      } else {
        currentLine += currentLine && str && !currentLine.endsWith(" ") && !str.startsWith(" ")
          ? ` ${str}`
          : str;
      }
      if (y !== null) lastY = y;
    }

    if (currentLine.trim()) lines.push(currentLine.trim());
    const pageText = lines.join("\n").trim();
    if (pageText) {
      pageBlocks.push(
        totalPages > 1 ? `--- Page ${pageNum} of ${totalPages} ---\n${pageText}` : pageText,
      );
    }
  }

  const combined = pageBlocks.join("\n\n").trim();
  if (!combined) {
    throw new Error(
      "This PDF appears to be a scanned image with no embedded text. Save or screenshot it as a PNG/JPEG to run local Gemini Nano 4 Vision OCR.",
    );
  }

  return {
    text: combined,
    pageCount: totalPages,
    truncated: totalPages > maxPages,
  };
}
