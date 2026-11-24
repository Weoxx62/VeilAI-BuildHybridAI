/**
 * 100% Client-Side Local PDF Text & Scanned-Page Extractor (Zero Server Upload).
 * Dynamically imports `pdfjs-dist` only when the user uploads or drops a PDF.
 * If a PDF is a scanned image with < 30 extracted characters, automatically renders Page 1
 * onto an offscreen canvas in browser RAM so Gemini Nano 4 Vision can review it.
 */
export async function extractTextFromPdfLocally(
  file: File,
  maxPages = 25,
): Promise<{
  text: string;
  pageCount: number;
  truncated: boolean;
  scannedPageImageFile?: File;
}> {
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
  if (combined.length < 30) {
    // Fallback for scanned image-only PDFs: render Page 1 locally into a PNG File for Vision AI
    const page1 = await pdf.getPage(1);
    const viewport = page1.getViewport({ scale: 1.75 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "Unable to render scanned PDF page in browser canvas. Please upload a PNG/JPEG image.",
      );
    }
    await page1.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      throw new Error("Could not convert scanned PDF page to PNG image locally.");
    }
    const imageFile = new File(
      [blob],
      file.name.replace(/\.pdf$/i, "-scan-page1.png"),
      { type: "image/png" },
    );
    return {
      text: "",
      pageCount: totalPages,
      truncated: false,
      scannedPageImageFile: imageFile,
    };
  }

  return {
    text: combined,
    pageCount: totalPages,
    truncated: totalPages > maxPages,
  };
}
