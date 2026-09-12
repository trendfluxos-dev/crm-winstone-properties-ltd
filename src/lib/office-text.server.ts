/**
 * Pulls plain text out of a Word (.docx) or Excel (.xlsx) upload so the lead
 * importer can read it. Both formats are ZIP archives of XML, so we walk the
 * archive's local file headers and inflate only the parts that carry text.
 *
 * Deliberately small: no ZIP library, no full spec support. When an archive
 * uses streaming entries (sizes stored after the data), we give up and say so
 * instead of returning half a file.
 */

const TEXT_PARTS = [
  "word/document.xml",
  "xl/sharedStrings.xml",
  "xl/worksheets/",
  "ppt/slides/",
];

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function xmlToText(xml: string): string {
  return xml
    // Keep row/paragraph/cell boundaries as separators so a table stays a table.
    .replace(/<\/(w:p|w:tr|row|a:p)>/g, "\n")
    .replace(/<\/(w:tc|c|a:t)>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Returns the readable text of an Office Open XML file, or null when unreadable. */
export async function extractOfficeText(buffer: ArrayBuffer): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (compressedSize === 0) return null; // streamed entry — unsupported here
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    if (TEXT_PARTS.some((part) => name.startsWith(part) || name === part)) {
      try {
        const raw = method === 0 ? data : await inflateRaw(data);
        chunks.push(xmlToText(decoder.decode(raw)));
      } catch {
        return null;
      }
    }
    offset = dataStart + compressedSize;
  }

  const text = chunks.join("\n").trim();
  return text.length > 0 ? text : null;
}
