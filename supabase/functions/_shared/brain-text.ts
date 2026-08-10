// Chunking + hashing helpers shared by brain-index and (later) brain-retrieval.

const MAX_DOCUMENT_CHARS = 20000; // matches CHARTER_TEXT_LIMIT in drive-watch
const TARGET_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;
const SINGLE_CHUNK_THRESHOLD = 1400;
const HEADING_RE = /^#{1,6}\s+(.*)$/;

export interface TextChunk {
  chunkIndex: number;
  heading: string | null;
  content: string;
}

/** SHA-256 hex digest, used to skip re-embedding unchanged documents. */
export async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Splits text into heading-aware, overlap-padded chunks. Short documents
 * (the common case for quick-capture notes and recaps) come back as a
 * single chunk.
 */
export function chunkText(rawText: string): TextChunk[] {
  const text = rawText.slice(0, MAX_DOCUMENT_CHARS).trim();
  if (!text) return [];
  if (text.length <= SINGLE_CHUNK_THRESHOLD) {
    return [{ chunkIndex: 0, heading: null, content: text }];
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: TextChunk[] = [];
  let current = "";
  let currentHeading: string | null = null;
  let pendingHeading: string | null = null;

  const flush = () => {
    if (!current.trim()) return;
    chunks.push({ chunkIndex: chunks.length, heading: currentHeading, content: current.trim() });
  };

  for (const para of paragraphs) {
    const headingMatch = para.match(HEADING_RE);
    if (headingMatch) {
      pendingHeading = headingMatch[1].trim();
      continue;
    }
    if (current.length + para.length + 2 > TARGET_CHUNK_CHARS && current.length > 0) {
      flush();
      const overlap = current.slice(-CHUNK_OVERLAP_CHARS);
      current = overlap ? `${overlap}\n\n${para}` : para;
      currentHeading = pendingHeading ?? currentHeading;
    } else {
      current = current ? `${current}\n\n${para}` : para;
      if (pendingHeading) currentHeading = pendingHeading;
    }
    pendingHeading = null;
  }
  flush();

  return chunks.length ? chunks : [{ chunkIndex: 0, heading: null, content: text }];
}
