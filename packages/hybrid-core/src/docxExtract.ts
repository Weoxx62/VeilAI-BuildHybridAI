/**
 * 100% Client-Side Local `.docx` (Office Open XML) Text Extractor (Zero Dependencies, Zero Network).
 * Parses PKZIP structures directly in browser RAM and decompresses `word/document.xml`
 * via the Web Standard `DecompressionStream("deflate-raw")` API.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractParagraphsFromWordXml(xml: string): string[] {
  const paragraphs: string[] = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const inner = pMatch[1]
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n");
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    let buffer = "";
    while ((tMatch = tRegex.exec(inner)) !== null) {
      buffer += decodeXmlEntities(tMatch[1]);
    }
    const cleaned = buffer.trim();
    if (cleaned.length > 0) {
      paragraphs.push(cleaned);
    }
  }

  return paragraphs;
}

export async function extractTextFromDocxBuffer(
  buffer: ArrayBuffer,
): Promise<{ text: string; paragraphCount: number }> {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 22) {
    throw new Error("Invalid .docx file: archive is too small.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minPos = Math.max(0, bytes.byteLength - 65557);
  let eocdPos = -1;
  for (let i = bytes.byteLength - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos === -1) {
    throw new Error(
      "Invalid .docx file: could not locate ZIP central directory.",
    );
  }

  const totalEntries = view.getUint16(eocdPos + 10, true);
  let ptr = view.getUint32(eocdPos + 16, true);
  const decoder = new TextDecoder("utf-8");

  let targetEntry: {
    compressionMethod: number;
    compressedSize: number;
    localHeaderOffset: number;
  } | null = null;

  for (let idx = 0; idx < totalEntries && ptr + 46 <= bytes.byteLength; idx++) {
    if (view.getUint32(ptr, true) !== CD_SIGNATURE) break;
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + nameLen);
    const entryName = decoder.decode(nameBytes);

    if (entryName === "word/document.xml") {
      targetEntry = {
        compressionMethod,
        compressedSize,
        localHeaderOffset,
      };
      break;
    }

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  if (!targetEntry) {
    throw new Error(
      "Unsupported .docx file: missing word/document.xml payload.",
    );
  }

  const lhOffset = targetEntry.localHeaderOffset;
  if (
    lhOffset + 30 > bytes.byteLength ||
    view.getUint32(lhOffset, true) !== LOCAL_FILE_SIGNATURE
  ) {
    throw new Error("Corrupted .docx file: invalid local file header.");
  }

  const lNameLen = view.getUint16(lhOffset + 26, true);
  const lExtraLen = view.getUint16(lhOffset + 28, true);
  const dataStart = lhOffset + 30 + lNameLen + lExtraLen;
  const dataEnd = dataStart + targetEntry.compressedSize;

  if (dataEnd > bytes.byteLength) {
    throw new Error("Corrupted .docx file: truncated XML entry.");
  }

  const compressedData = bytes.slice(dataStart, dataEnd);
  let xmlText: string;

  if (targetEntry.compressionMethod === 0) {
    xmlText = decoder.decode(compressedData);
  } else if (targetEntry.compressionMethod === 8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "DecompressionStream is unavailable in this runtime to read compressed .docx files.",
      );
    }
    const stream = new Blob([compressedData])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const decompressed = await new Response(stream).arrayBuffer();
    xmlText = decoder.decode(decompressed);
  } else {
    throw new Error(
      `Unsupported .docx ZIP compression method (${targetEntry.compressionMethod}).`,
    );
  }

  const paragraphs = extractParagraphsFromWordXml(xmlText);
  if (paragraphs.length === 0) {
    throw new Error(
      "This .docx file contains no readable text paragraphs (it may contain only images).",
    );
  }

  return {
    text: paragraphs.join("\n\n").slice(0, 60_000),
    paragraphCount: paragraphs.length,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Helper used in unit tests to construct a genuine PKZIP-valid `.docx` ArrayBuffer in RAM.
 */
export function buildMinimalDocxBufferForTest(paragraphs: string[]): ArrayBuffer {
  const xmlBody = paragraphs
    .map((p) => `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xmlBody}</w:body></w:document>`;

  const encoder = new TextEncoder();
  const fileName = encoder.encode("word/document.xml");
  const fileData = encoder.encode(xml);

  const localHeaderSize = 30 + fileName.length;
  const cdOffset = localHeaderSize + fileData.length;
  const cdSize = 46 + fileName.length;
  const totalSize = cdOffset + cdSize + 22;

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // Local file header (method 0 = stored)
  view.setUint32(0, LOCAL_FILE_SIGNATURE, true);
  view.setUint16(4, 20, true);
  view.setUint16(8, 0, true);
  view.setUint32(18, fileData.length, true);
  view.setUint32(22, fileData.length, true);
  view.setUint16(26, fileName.length, true);
  out.set(fileName, 30);
  out.set(fileData, localHeaderSize);

  // Central directory entry
  view.setUint32(cdOffset, CD_SIGNATURE, true);
  view.setUint16(cdOffset + 4, 20, true);
  view.setUint16(cdOffset + 6, 20, true);
  view.setUint16(cdOffset + 10, 0, true);
  view.setUint32(cdOffset + 20, fileData.length, true);
  view.setUint32(cdOffset + 24, fileData.length, true);
  view.setUint16(cdOffset + 28, fileName.length, true);
  view.setUint32(cdOffset + 42, 0, true);
  out.set(fileName, cdOffset + 46);

  // End of central directory
  const eocdOffset = cdOffset + cdSize;
  view.setUint32(eocdOffset, EOCD_SIGNATURE, true);
  view.setUint16(eocdOffset + 8, 1, true);
  view.setUint16(eocdOffset + 10, 1, true);
  view.setUint32(eocdOffset + 12, cdSize, true);
  view.setUint32(eocdOffset + 16, cdOffset, true);

  return out.buffer;
}
