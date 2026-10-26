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
import { recordAiUsage, tokensFrom, type UsageContext } from "./usage";

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
 * Runs a non-streaming Anthropic call and records its usage (tokens, latency,
 * success/failure) when the caller supplied a UsageContext. The result — or
 * the error — passes through untouched; metering never changes behaviour.
 */
async function meteredCreate<T extends { usage?: { input_tokens?: number; output_tokens?: number } }>(
  usage: UsageContext | undefined,
  feature: "escalation" | "curriculum_plan",
  call: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const response = await call();
    if (usage) {
      recordAiUsage({
        userId: usage.userId,
        feature,
        model: FRONTIER_MODEL,
        ...tokensFrom(response.usage),
        latencyMs: Date.now() - startedAt,
        status: "ok",
      });
    }
    return response;
  } catch (err) {
    if (usage) {
      recordAiUsage({
        userId: usage.userId,
        feature,
        model: FRONTIER_MODEL,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startedAt,
        status: "error",
      });
    }
    throw err;
  }
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
export async function* streamFrontierReply(recentTurns: FrontierTurn[], usage?: UsageContext): AsyncGenerator<string> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("Frontier model not configured (ANTHROPIC_API_KEY unset).");

  const startedAt = Date.now();
  const stream = anthropic.messages.stream({
    model: FRONTIER_MODEL,
    max_tokens: 4096,
    system: [getBaseLayerPrompt(), "", ASSISTANT_ROLE_PROMPT].join("\n"),
    messages: recentTurns,
  });

  // Metered once the stream settles. A consumer that abandons the generator
  // early is not recorded — a small undercount, not worth holding the
  // connection open to settle a call nobody is reading.
  try {
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
    if (usage) {
      recordAiUsage({
        userId: usage.userId,
        feature: "assistant_stream",
        model: FRONTIER_MODEL,
        ...tokensFrom(finalMessage.usage),
        latencyMs: Date.now() - startedAt,
        status: "ok",
      });
    }
    if (finalMessage.stop_reason === "refusal" && !yieldedAny) {
      yield "I'm not able to help with that particular question — could you try asking it a different way?";
    }
  } catch (err) {
    if (usage) {
      recordAiUsage({
        userId: usage.userId,
        feature: "assistant_stream",
        model: FRONTIER_MODEL,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - startedAt,
        status: "error",
      });
    }
    throw err;
  }
}

/**
 * Mechanism 2. Carries the same three things a human giving a second opinion
 * would want: what was asked, what the local model already knew about the
 * person, and what it already said — so the frontier model verifies/improves
 * rather than cold-re-answering with none of that context.
 */
export async function escalateToFrontier(
  question: string,
  memoryContext: string,
  localAnswer: string,
  usage?: UsageContext
): Promise<string> {
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

  const response = await meteredCreate(usage, "escalation", () =>
    anthropic.messages.create({
      model: FRONTIER_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    })
  );

  if (response.stop_reason === "refusal") {
    return "The outside model declined to answer this question.";
  }
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

/**
 * Mechanism 3 (2026-08-23, see Homeschool.md's "AI-Generated Curriculum
 * Plan"). Turns a subject's curriculum material into a paced, dated list of
 * draft assignments spanning a school year. Always frontier — this needs
 * real reading comprehension over a real document plus a whole-year pacing
 * plan, well beyond what the local model reliably handles. What's sent is
 * the material's text plus pacing constraints; no family data, no AI_Memory.
 * Gated by the same Approve Outside Calls permission as any other outside
 * call — checked by the caller (app/api/homeschool/curriculum-plan/generate),
 * not here.
 */
export interface BlackoutRange {
  startDate: string;
  endDate: string;
}

export interface GeneratedAssignment {
  title: string;
  dueDate: string;
  curriculumReference: string;
}

function isValidWeekdayDate(dateIso: string, startDate: string, endDate: string, blackouts: BlackoutRange[]): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  if (dateIso < startDate || dateIso > endDate) return false;
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !blackouts.some((b) => dateIso >= b.startDate && dateIso <= b.endDate);
}

// The model is told to respond with ONLY a JSON array, but real models
// sometimes wrap it in a markdown code fence anyway — pull out the first
// top-level array rather than trusting the whole response is bare JSON.
function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

export async function generateCurriculumPlan(params: {
  subjectName: string;
  materialText: string;
  startDate: string;
  endDate: string;
  blackouts: BlackoutRange[];
  minPerWeek: number;
  maxPerWeek: number;
  usage?: UsageContext;
}): Promise<GeneratedAssignment[]> {
  const anthropic = getClient();
  if (!anthropic) throw new Error("Frontier model not configured (ANTHROPIC_API_KEY unset).");

  const blackoutText =
    params.blackouts.length > 0 ? params.blackouts.map((b) => `- ${b.startDate} to ${b.endDate}`).join("\n") : "None.";

  const systemPrompt = [
    "You are planning a full school-year schedule of homework assignments for a homeschooled student, based on real curriculum material for one subject.",
    "Read the material below and produce a paced sequence of assignments spanning the given date range, grounded in what the material actually covers — do not invent content that isn't there.",
    "",
    "Hard rules:",
    `- Every due date must be a weekday (Monday through Friday) between ${params.startDate} and ${params.endDate}, inclusive. Never Saturday or Sunday.`,
    `- Never place a due date inside any of these blackout ranges — skip them entirely:\n${blackoutText}`,
    `- Aim for between ${params.minPerWeek} and ${params.maxPerWeek} assignments in any given week.`,
    "",
    'Respond with ONLY a JSON array, no other text before or after it, in exactly this shape:',
    '[{"title": "short assignment title", "dueDate": "YYYY-MM-DD", "curriculumReference": "one short line pointing at what part of the material this covers"}]',
    "",
    `Subject: ${params.subjectName}`,
    "",
    "Material:",
    params.materialText,
  ].join("\n");

  const response = await meteredCreate(params.usage, "curriculum_plan", () =>
    anthropic.messages.create({
      model: FRONTIER_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate the year plan now." }],
    })
  );

  if (response.stop_reason === "refusal") {
    throw new Error("The outside model declined to generate a plan for this material.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    throw new Error("The outside model didn't return valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("The outside model's response wasn't a JSON array.");

  // Defensive, not trusting: a model that ignores an instruction (a weekend
  // date, a date outside range/inside a blackout) has that one item quietly
  // dropped rather than failing the whole batch — same "validate, don't
  // trust the model" approach used elsewhere in this codebase.
  return (parsed as unknown[])
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
      curriculumReference: typeof item.curriculumReference === "string" ? item.curriculumReference.trim() : "",
    }))
    .filter((a) => a.title && isValidWeekdayDate(a.dueDate, params.startDate, params.endDate, params.blackouts))
    .slice(0, 500);
}
