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
import { ASSISTANT_TOOLS, runTool } from "./tools";

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
  const systemPrompt = [
    getBaseLayerPrompt(),
    "",
    ASSISTANT_ROLE_PROMPT,
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

  for await (const event of ollamaChatStream(model, messages, ASSISTANT_TOOLS)) {
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

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)`).run(
    randomUUID(),
    conversationId,
    full,
    now
  );
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);

  await logAiInteraction("assistant", userId, { conversationId, replyLength: full.length });
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
