// Central AI service. Every module routes AI requests through here rather
// than calling Ollama directly, so permission checks, outside-call approval,
// and logging never get duplicated per module.
// See docs/01_System_Architecture/AI_Architecture.md and
// docs/01_System_Architecture/Application_Architecture.md ("AI Integration").

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, hasPermission } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";
import { getBaseLayerPrompt } from "./base-layer";
import { ASSISTANT_ROLE_PROMPT } from "./roles";
import { getTopMemories, formatMemoriesForPrompt } from "./memory";
import { ollamaChatStream, type ChatMessage } from "./ollama";
import { ASSISTANT_TOOLS, runTool, messageNeedsTools } from "./tools";
import { isFrontierConfigured, streamFrontierReply, type FrontierTurn } from "./frontier";

// How many recent messages (both roles combined) count as "the conversation
// so far" for frontier auto-routing — see the classification comment in
// streamAssistantReply. Small on purpose: enough for a real follow-up
// ("and verse 4?") without growing the amount of text that must pass the
// no-family-data check as a conversation gets long.
const FRONTIER_HISTORY_WINDOW = 6;

interface RecentMessageRow {
  role: "user" | "assistant";
  content: string;
  source: "local" | "frontier"; // only meaningful for role === "assistant"
}

export type AgentRole = "assistant" | "advisor" | "guardian";

export interface AIRequestContext {
  userId: string;
  agent: AgentRole;
}

export function getModelForRole(agent: AgentRole): string {
  if (agent === "guardian") return process.env.GUARDIAN_MODEL || "llama3.2:3b";
  return process.env.OLLAMA_MODEL || "llama3.1:8b";
}

/**
 * Per AI.md: the per-user AI on/off toggle. When off, "the Assistant is not
 * available to that user [and] no new Advisor suggestions are generated" —
 * Guardian's household-level monitoring is unaffected (checked separately,
 * it has no requesting user).
 */
export async function isAiEnabledForUser(userId: string): Promise<boolean> {
  const row = getDb().prepare(`SELECT ai_enabled FROM users WHERE id = ?`).get(userId) as
    | { ai_enabled: number }
    | undefined;
  return !!row?.ai_enabled;
}

export async function logAiInteraction(
  agent: AgentRole,
  userId: string,
  detail: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({ type: "ai_interaction", userId, detail: { agent, ...detail } });
}

/**
 * Assembles the Assistant's full message list: Base Layer + Role Layer +
 * Context Layer (AI_Memory facts) as a system message, followed by this
 * conversation's history — ready to hand to Ollama.
 */
export async function buildAssistantMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
  const memories = await getTopMemories(userId);
  const requester = getDb().prepare(`SELECT full_name, role FROM users WHERE id = ?`).get(userId) as
    | { full_name: string; role: string }
    | undefined;
  const systemPrompt = [
    getBaseLayerPrompt(),
    "",
    ASSISTANT_ROLE_PROMPT,
    "",
    // Previously never stated, so the model had no way to know who it was
    // replying to — a real gap a user hit directly ("I also don't currently
    // know for certain who I'm talking to"), 2026-08-01.
    requester
      ? `You are currently speaking with ${requester.full_name} (role: ${requester.role}).`
      : "You could not verify who you're currently speaking with.",
    "",
    "What you know about this person:",
    formatMemoriesForPrompt(memories),
  ].join("\n");

  const history = getDb()
    .prepare(`SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at`)
    .all(conversationId) as { role: "user" | "assistant"; content: string }[];

  return [{ role: "system", content: systemPrompt }, ...history];
}

/**
 * Streams the Assistant's reply for the latest message in a conversation,
 * handling at most one round of tool-calling (AI_Architecture.md: "the AI
 * needs to call into permissions and data lookups, not just converse").
 * Persists the finished reply and logs the interaction once streaming ends.
 */
export async function* streamAssistantReply(userId: string, conversationId: string): AsyncGenerator<string> {
  const model = getModelForRole("assistant");
  const messages = await buildAssistantMessages(userId, conversationId);
  let full = "";

  // Only offer tools when the latest message plausibly needs them — see
  // messageNeedsTools' comment. The latest message is always last in
  // history since it was inserted just before this call. A separate query
  // (not derived from `messages`) since Ollama's ChatMessage shape has no
  // `source` field and shouldn't be sent one — this one needs `source` to
  // classify assistant turns (see below).
  const recentWindow = getDb()
    .prepare(`SELECT role, content, source FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(conversationId, FRONTIER_HISTORY_WINDOW)
    .reverse() as RecentMessageRow[];
  const latestUserMessage = [...recentWindow].reverse().find((m) => m.role === "user");

  // A conversation can drift into family topics over several turns even if
  // the newest message alone looks clean, so this checks every message in
  // the recent window, not just the latest one — but a user turn and an
  // assistant turn need different checks:
  //   - a user turn is checked with the same messageNeedsTools() keyword
  //     heuristic already trusted for a single message.
  //   - an assistant turn is checked by its recorded `source`, not by
  //     keyword. A locally-answered reply may carry real family data
  //     (AI_Memory, tool results) that doesn't necessarily contain any
  //     messageNeedsTools() keyword at all (e.g. "Malachi has a dentist
  //     appointment") — keyword-scanning assistant text wouldn't actually
  //     catch that. It would, however, generate false positives on
  //     ordinary assistant text that happens to contain a keyword for
  //     unrelated reasons — found live: a Bible translation's "...for
  //     tomorrow the LORD will do wonders..." tripped "tomorrow" and forced
  //     an unrelated follow-up back to local. `source` is the actual signal
  //     that matters: any reply already known to have been produced locally
  //     (so, potentially informed by real family data) keeps the whole
  //     window on local for anything after it too.
  // (2026-08-01, fixing "the assistant doesn't see previous chats" without
  // weakening the original no-family-data guarantee: only a window where
  // every turn passes its check is ever sent to the frontier model.)
  const needsFamilyData =
    !latestUserMessage ||
    recentWindow.some((m) => (m.role === "user" ? messageNeedsTools(m.content) : m.source === "local"));

  // Hybrid local/frontier routing (Future_Ideas.md's history of this
  // design): a recent window that plausibly needs no family data at all is
  // routed straight to the frontier model instead — no approval prompt,
  // since nothing family-specific is ever in the payload. Falls back to
  // local whenever any recent message needs family data, or no frontier
  // connection is configured.
  let source: "local" | "frontier" = "local";
  if (!needsFamilyData && latestUserMessage && isFrontierConfigured()) {
    source = "frontier";
    const frontierTurns: FrontierTurn[] = recentWindow.map((m) => ({ role: m.role, content: m.content }));
    for await (const chunk of streamFrontierReply(frontierTurns)) {
      full += chunk;
      yield chunk;
    }
  } else {
    const tools = needsFamilyData ? ASSISTANT_TOOLS : undefined;

    for await (const event of ollamaChatStream(model, messages, tools)) {
      if (event.type === "tool_calls") {
        const toolMessages: ChatMessage[] = [];
        for (const call of event.calls) {
          const result = await runTool(call.function.name, call.function.arguments, userId);
          toolMessages.push({ role: "tool", content: result });
        }
        const followUpMessages: ChatMessage[] = [
          ...messages,
          { role: "assistant", content: "", tool_calls: event.calls },
          ...toolMessages,
        ];
        // No tools on the follow-up call — one round of tool use per reply
        // keeps this simple and avoids an unbounded call loop.
        for await (const followUp of ollamaChatStream(model, followUpMessages)) {
          if (followUp.type === "content") {
            full += followUp.text;
            yield followUp.text;
          }
        }
        break;
      } else {
        full += event.text;
        yield event.text;
      }
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, created_at, source) VALUES (?, ?, 'assistant', ?, ?, ?)`).run(
    randomUUID(),
    conversationId,
    full,
    now,
    source
  );
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);

  await logAiInteraction("assistant", userId, { conversationId, replyLength: full.length, source });
}

/**
 * The outside-call approval flow: shows the user exactly what's being sent,
 * requires the "Approve Outside Calls" permission (and the sensitive-data
 * gate if applicable — never grantable to a minor).
 * See docs/01_System_Architecture/Security_Architecture.md and
 * docs/04_Permissions/AI_Permissions.md.
 */
export async function requestOutsideCallApproval(
  ctx: AIRequestContext,
  payloadDescription: string,
  isSensitive: boolean
): Promise<boolean> {
  const actor = await getAuthUser(ctx.userId);
  if (!actor) return false;

  if (!hasPermission(actor, "approveOutsideCalls")) {
    await logSecurityEvent({
      type: "outside_call_blocked",
      userId: ctx.userId,
      detail: { payloadDescription, reason: "missing approve_outside_calls permission" },
    });
    return false;
  }

  // A second, additional gate for sensitive data specifically (AI_Permissions.md)
  // — categorically unavailable to a minor, not just off by default.
  if (isSensitive && !hasPermission(actor, "approveSensitiveOutsideTransmission")) {
    await logSecurityEvent({
      type: "outside_call_blocked",
      userId: ctx.userId,
      detail: { payloadDescription, reason: "missing sensitive-data outside-transmission gate" },
    });
    return false;
  }

  await logSecurityEvent({
    type: "outside_call_approved",
    userId: ctx.userId,
    detail: { payloadDescription, isSensitive },
  });
  return true;
}
