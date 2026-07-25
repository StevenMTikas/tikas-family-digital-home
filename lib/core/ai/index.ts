// Central AI service. Every module routes AI requests through here rather
// than calling Ollama directly, so permission checks, outside-call approval,
// and logging never get duplicated per module.
// See docs/01_System_Architecture/AI_Architecture.md and
// docs/01_System_Architecture/Application_Architecture.md ("AI Integration").

// TODO: wire to Ollama (see .env.example for OLLAMA_HOST / OLLAMA_MODEL) and
// to the frontier-model provider once chosen (Decision_Log.md #007, open).

export type AgentRole = "assistant" | "advisor" | "guardian";

export interface AIRequestContext {
  userId: string;
  agent: AgentRole;
}

/**
 * Assembles the three-layer prompt (Base → Role → Context) per
 * AI_Architecture.md, and routes the request through permission checks
 * before touching Ollama.
 */
export async function runAgent(
  ctx: AIRequestContext,
  input: string
): Promise<string> {
  throw new Error("Not implemented — see docs/01_System_Architecture/AI_Architecture.md");
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
  throw new Error("Not implemented — see docs/01_System_Architecture/Security_Architecture.md");
}
