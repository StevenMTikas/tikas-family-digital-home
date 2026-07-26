// Local embedding generation for Search — Decision_Log.md #005 picked
// SQLite-based vector search (sqlite-vec) over ChromaDB to stay inside the
// existing DB/Node runtime; this is the other half of that: Ollama's
// /api/embeddings endpoint run against a small local model, not an outside
// call (Search.md's "AI Responsibilities": "built and queried using the
// local AI stack... not an outside call").

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "nomic-embed-text";
// nomic-embed-text's output size — must match the `float[N]` dimension the
// vec_content virtual table (db/schema.sql) was created with.
export const EMBEDDING_DIMENSIONS = 768;

function ollamaHost(): string {
  return process.env.OLLAMA_HOST || "http://localhost:11434";
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${ollamaHost()}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embeddings request failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { embedding: number[] };
  return body.embedding;
}
