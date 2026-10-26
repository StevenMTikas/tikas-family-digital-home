// AI usage metering for outbound (frontier) calls — who called which model for
// what, how many tokens it used, and how long it took. Two reasons it exists:
// a real view of API spend today, and the per-call record the planned
// pay-per-use billing model needs (Future_Ideas.md). Deliberately its own
// table, not a security_events entry: those are purged after 30 days, and
// usage data has to outlive that.
//
// Local Ollama calls aren't metered here (no cost, and no token counts in the
// same shape) — see Future_Ideas.md for the local perf-counter idea.

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

export type FrontierFeature = "assistant_stream" | "escalation" | "curriculum_plan";

/** Passed by callers that want the call metered. Omitted → not recorded (e.g. unit tests of the client itself). */
export interface UsageContext {
  userId: string;
}

export interface UsageRecord {
  userId: string | null;
  feature: FrontierFeature;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  status: "ok" | "error";
}

/**
 * Never throws: metering is bookkeeping, and a failure to write a row must
 * not turn a successful AI answer into an error for the family member who
 * asked. A failed write is logged loudly instead (Core Principle: fail loud).
 */
export function recordAiUsage(record: UsageRecord): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO ai_usage (id, user_id, feature, provider, model, input_tokens, output_tokens, latency_ms, status, created_at)
         VALUES (?, ?, ?, 'anthropic', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        record.userId,
        record.feature,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.latencyMs,
        record.status,
        new Date().toISOString()
      );
  } catch (err) {
    console.error("[ai-usage] failed to record usage:", err);
  }
}

/** Minimal shape of the SDK's usage object — kept loose so a mocked/partial response doesn't break metering. */
export function tokensFrom(usage: { input_tokens?: number; output_tokens?: number } | null | undefined) {
  return { inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null };
}
