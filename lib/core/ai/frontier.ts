// Hybrid local/frontier Assistant routing — see Future_Ideas.md's history of
// this design and Assistant.md's "Hybrid Local/Frontier Routing" section.
// Two independent mechanisms, both landing here:
//   1. Automatic routing (index.ts's streamAssistantReply): a short recent
//      window of the conversation that plausibly needs no family data is
//      answered here instead of locally — no approval prompt, since nothing
//      family-specific is ever sent (the window classification, not just
//      this file, is what guarantees that — see index.ts).
//   2. Thumbs-down escalation: a family member unsatisfied with a local
//      answer can ask for a second opinion, carrying the original question,
//      the AI_Memory context the local model had, and its own answer — gated
//      by "Approve Outside Calls" plus the sensitive-data gate, since real
//      family data does leave the house for this one.
//
// Provider is hardcoded to Anthropic for now (Steven, 2026-07-31) — see
// Future_Ideas.md for the deferred multi-provider/bring-your-own-key design.

import Anthropic from "@anthropic-ai/sdk";
import { getBaseLayerPrompt } from "./base-layer";
import { ASSISTANT_ROLE_PROMPT } from "./roles";

const FRONTIER_MODEL = "claude-opus-5";

export interface FrontierTurn {
  role: "user" | "assistant";
  content: string;
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export function isFrontierConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Mechanism 1. Takes a short recent window of the conversation (index.ts's
 * `streamAssistantReply`), never the full thread, and never any AI_Memory
 * context. The window itself is what's classified "needs no family data" —
 * every turn in it, not just the newest one — so sending it here doesn't
 * weaken the original guarantee (2026-08-01, replacing the single-question-
 * only design after the "assistant doesn't see previous chats" complaint:
 * a bounded, still-fully-classified window restores follow-up continuity
 * like "and verse 4?" without sending anything that failed the same
 * no-family-data check a single question was already trusted against).
 */
export async function* streamFrontierReply(recentTurns: FrontierTurn[]): AsyncGenerator<string> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("Frontier model not configured (ANTHROPIC_API_KEY unset).");

  const stream = anthropic.messages.stream({
    model: FRONTIER_MODEL,
    max_tokens: 4096,
    system: [getBaseLayerPrompt(), "", ASSISTANT_ROLE_PROMPT].join("\n"),
    messages: recentTurns,
  });

  let yieldedAny = false;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yieldedAny = true;
      yield event.delta.text;
    }
  }

  // stop_reason must be checked before trusting content was returned at all
  // — a declined request is a normal 200, not a thrown error.
  const finalMessage = await stream.finalMessage();
  if (finalMessage.stop_reason === "refusal" && !yieldedAny) {
    yield "I'm not able to help with that particular question — could you try asking it a different way?";
  }
}

/**
 * Mechanism 2. Carries the same three things a human giving a second opinion
 * would want: what was asked, what the local model already knew about the
 * person, and what it already said — so the frontier model verifies/improves
 * rather than cold-re-answering with none of that context.
 */
export async function escalateToFrontier(question: string, memoryContext: string, localAnswer: string): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("Frontier model not configured (ANTHROPIC_API_KEY unset).");

  const systemPrompt = [
    getBaseLayerPrompt(),
    "",
    ASSISTANT_ROLE_PROMPT,
    "",
    "A family member wasn't satisfied with the local model's answer to their question and asked you for a second opinion. Here's what the local model already knew about them and how it already answered — verify or improve on it, don't cold-restart from nothing.",
    "",
    "What the local model knew about this person:",
    memoryContext,
    "",
    `The local model's answer: ${localAnswer}`,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: FRONTIER_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: question }],
  });

  if (response.stop_reason === "refusal") {
    return "The outside model declined to answer this question.";
  }
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}
