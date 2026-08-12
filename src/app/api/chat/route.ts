import fs from "fs";
import path from "path";
import {
  CHAT_FALLBACK_MESSAGE,
  buildProcessedKb,
  chunkMarkdown,
  retrieveTopChunks,
  type ProcessedChunk,
} from "@/lib/chatbot-kb";

const KB_DIR = path.join(process.cwd(), "knowledge", "processed");

let cachedKb: ProcessedChunk[] | null = null;
let idfCache: Record<string, number> = {};

// Generates the KB using TF-IDF on the fly
async function getEmbeddedKb(): Promise<{
  chunks: ProcessedChunk[];
  idf: Record<string, number>;
}> {
  if (cachedKb) return { chunks: cachedKb, idf: idfCache };
  console.log("[chat-api] Generating TF-IDF KB on the fly...");

  const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md"));
  const allChunks = [];

  for (const file of files) {
    const filePath = path.join(KB_DIR, file);
    const text = fs.readFileSync(filePath, "utf-8");
    allChunks.push(...chunkMarkdown(text, file));
  }

  const { chunks, idf } = buildProcessedKb(allChunks);
  cachedKb = chunks;
  idfCache = idf;
  return { chunks: cachedKb, idf: idfCache };
}

const FALLBACK_MESSAGE = CHAT_FALLBACK_MESSAGE;

const SYSTEM_PROMPT = `You are the ABTalks Help Assistant.
Your primary role is to answer questions about ABTalks using ONLY the provided context.
- Always mention that ABTalks is an online community when introducing it.
- If someone asks how to apply or wants to join the team, instruct them to share their cover letter, resume, and any other relevant details to team@abtalks.in.
- When explaining a challenge or program, go into hyper detail based on the context. Every step, requirement, and rule should be clearly listed and explained.
- Site structure (Sitemap): Home (/), Hackathons (/hackathons), Evidence (/evidence), Privacy (/privacy), Sign In (/login).
- For multi-part questions, answer every independently answerable part. Do not stop after answering only the first part.
- Answer naturally as an ABTalks support assistant. Do not mention "the knowledge base", "retrieved context", "chunks", "documents", "RAG", or internal sources unless the user explicitly asks how the assistant works.
- If the answer is NOT present in the provided context, you MUST output exactly: "${FALLBACK_MESSAGE}". Do not invent, guess, or synthesize information outside the context.
- Keep your answers conversational but highly detailed when required.
- If a user's question is ambiguous (e.g., "How do I join?"), briefly explain the options (e.g., Hackathon, AI Cohort) and ask them which one they mean.
- Do not repeat the prompt or context in your response.`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
      });
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") {
      return new Response(
        JSON.stringify({ error: "Last message must be from user" }),
        { status: 400 },
      );
    }

    let searchQuery = lastMessage.content;
    if (messages.length > 2) {
      const prevMessage = messages[messages.length - 2].content;
      searchQuery = `${prevMessage} \n ${searchQuery}`;
    }

    // 3. Search the KB using TF-IDF / BM25
    const { chunks, idf } = await getEmbeddedKb();
    const topChunks = retrieveTopChunks(searchQuery, chunks, idf, 10);

    if (topChunks.length === 0) {
      // If we have absolutely no semantic matches, immediately return the fallback text
      // to save LLM latency and enforce strict boundaries.
      return new Response(
        `data: {"type":"content_block_delta","delta":{"text":${JSON.stringify(FALLBACK_MESSAGE)}}}\n\ndata: {"type":"message_stop"}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }

    const contextText = topChunks
      .map((c) => `[Source: ${c.source}]\n${c.text}`)
      .join("\n\n---\n\n");

    const systemWithContext = `${SYSTEM_PROMPT}\n\nHere is the verified knowledge base context:\n<context>\n${contextText}\n</context>`;

    // 5. Stream response from Gemini using official REST API
    const geminiMessages = messages.map(
      (m: { role: string; content: string }, idx: number) => {
        let text = m.content;
        // Prepend system instruction to the first user message to avoid systemInstruction API issues
        if (idx === 0 && m.role === "user") {
          text = `${systemWithContext}\n\nUser query: ${text}`;
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text }],
        };
      },
    );

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini API error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to generate response", details: err }),
        { status: 500 },
      );
    }

    // We can pipe the exact Gemini SSE stream back to the client.
    return new Response(geminiRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/chat:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      { status: 500 },
    );
  }
}
