// AI Settings screen. See docs/02_Modules/AI.md: on/off toggle, plus links
// to Conversation History (lives in the Assistant bubble itself — see
// Assistant.md), AI Memory (AI_Memory.md), and Suggestion History
// (AI_Suggestions.md), all in one place reachable from the user's own
// profile/settings area.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { getTopMemories } from "@/lib/core/ai/memory";
import AiSettingsPageClient, { type SuggestionData } from "./AiSettingsPageClient";

export default async function AiSettingsPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const userRow = getDb().prepare(`SELECT ai_enabled FROM users WHERE id = ?`).get(actor.id) as {
    ai_enabled: number;
  };

  const memories = await getTopMemories(actor.id, 500);

  const suggestionRows = getDb()
    .prepare(`SELECT * FROM ai_suggestions WHERE user_id = ? ORDER BY generated_at DESC`)
    .all(actor.id) as {
    id: string;
    module: string | null;
    content: string;
    generated_at: string;
    expired: number;
    expired_reason: string | null;
    accepted_at: string | null;
    feedback: string;
    related_entity_id: string | null;
  }[];

  const suggestions: SuggestionData[] = suggestionRows.map((row) => ({
    id: row.id,
    module: row.module,
    content: row.content,
    generatedAt: row.generated_at,
    expired: !!row.expired,
    expiredReason: row.expired_reason,
    acceptedAt: row.accepted_at,
    feedback: row.feedback as SuggestionData["feedback"],
    relatedEntityId: row.related_entity_id,
  }));

  return (
    <AiSettingsPageClient
      initialAiEnabled={!!userRow.ai_enabled}
      memories={memories}
      suggestions={suggestions}
      isSuperAdmin={actor.role === "super_admin"}
    />
  );
}
