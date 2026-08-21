/**
 * Pure TF-IDF / BM25 helpers for the ABTalks chatbot knowledge base.
 * Extracted from `/api/chat` so retrieval logic can be unit-tested without
 * calling Gemini or touching the live request handler.
 */

export type KbChunk = {
  text: string;
  source: string;
};

export type ProcessedChunk = KbChunk & {
  tokens: string[];
  termFrequencies: Record<string, number>;
};

export const CHAT_FALLBACK_MESSAGE =
  "I couldn't find a direct answer to that in my knowledge base. Please reach out to team@abtalks.in.";

/** Minimum BM25 score to keep a chunk in the retrieval set. */
export const CHAT_SCORE_THRESHOLD = 0.1;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export function chunkMarkdown(text: string, filename: string): KbChunk[] {
  const chunks: KbChunk[] = [];
  const lines = text.split("\n");

  let currentChunkText = "";
  let currentHeader = "";

  for (const line of lines) {
    if (line.match(/^#{2,4}\s/)) {
      if (currentChunkText.trim().length > 20) {
        chunks.push({
          text: (currentHeader ? `${currentHeader}\n` : "") + currentChunkText.trim(),
          source: filename,
        });
      }
      currentHeader = line.trim();
      currentChunkText = "";
    } else {
      currentChunkText += line + "\n";
    }
  }

  if (currentChunkText.trim().length > 20) {
    chunks.push({
      text: (currentHeader ? `${currentHeader}\n` : "") + currentChunkText.trim(),
      source: filename,
    });
  }

  // Refine large chunks
  const refinedChunks: KbChunk[] = [];
  for (const c of chunks) {
    if (c.text.length > 1000) {
      const paragraphs = c.text.split("\n\n");
      let subChunk = "";
      for (const p of paragraphs) {
        if (subChunk.length + p.length > 1000 && subChunk.trim()) {
          refinedChunks.push({ text: subChunk.trim(), source: c.source });
          subChunk = "";
        }
        subChunk += p + "\n\n";
      }
      if (subChunk.trim()) refinedChunks.push({ text: subChunk.trim(), source: c.source });
    } else {
      refinedChunks.push(c);
    }
  }
  return refinedChunks;
}

export function buildProcessedKb(allChunks: KbChunk[]): {
  chunks: ProcessedChunk[];
  idf: Record<string, number>;
} {
  const processed: ProcessedChunk[] = [];
  const documentFreq: Record<string, number> = {};

  for (const chunk of allChunks) {
    const tokens = tokenize(chunk.text);
    const tf: Record<string, number> = {};
    const uniqueTokens = new Set(tokens);

    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    for (const t of uniqueTokens) documentFreq[t] = (documentFreq[t] || 0) + 1;

    processed.push({ ...chunk, tokens, termFrequencies: tf });
  }

  const idf: Record<string, number> = {};
  const N = processed.length;
  for (const [term, df] of Object.entries(documentFreq)) {
    idf[term] = Math.log(1 + (N - df + 0.5) / (df + 0.5)); // BM25-style IDF
  }

  return { chunks: processed, idf };
}

/** BM25 scoring against a processed chunk. */
export function scoreQuery(
  queryTokens: string[],
  chunk: ProcessedChunk,
  idf: Record<string, number>,
): number {
  let score = 0;
  const k1 = 1.5; // Term frequency saturation
  const b = 0.75; // Document length normalization
  const avgdl = 150; // Approximated average doc length in tokens
  const dl = chunk.tokens.length;

  for (const q of queryTokens) {
    if (chunk.termFrequencies[q]) {
      const tf = chunk.termFrequencies[q];
      const termIdf = idf[q] || Math.log(1 + 0.5); // Default rare word IDF
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (dl / avgdl));
      score += termIdf * (numerator / denominator);
    }
  }
  return score;
}

export function retrieveTopChunks(
  searchQuery: string,
  chunks: ProcessedChunk[],
  idf: Record<string, number>,
  limit = 10,
): Array<ProcessedChunk & { score: number }> {
  const queryTokens = tokenize(searchQuery);
  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: scoreQuery(queryTokens, chunk, idf),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((c) => c.score > CHAT_SCORE_THRESHOLD).slice(0, limit);
}
