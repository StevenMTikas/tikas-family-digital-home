// AI Settings screen. See docs/02_Modules/AI.md: on/off toggle, plus links
// to Conversation History (lives in the Assistant bubble itself — see
// Assistant.md), AI Memory (AI_Memory.md), and Suggestion History
// (AI_Suggestions.md), all in one place reachable from the user's own
// profile/settings area.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser, hasPermission } from "@/lib/core/permissions";
import { getTopMemories } from "@/lib/core/ai/memory";
import AiSettingsPageClient, { type SuggestionData, type ViewableUser } from "./AiSettingsPageClient";

export default async function AiSettingsPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const userRow = getDb().prepare(`SELECT ai_enabled FROM users WHERE id = ?`).get(actor.id) as {
    ai_enabled: number;
  };

  const memories = await getTopMemories(actor.id, 500);

  // Who else this actor is allowed to view the AI Memory profile of — a
  // Super Admin sees everyone, an Admin sees their admin_scope only if also
  // individually granted "View Child Activity Logs" (Authorization.md, and
  // app/api/ai-memory/route.ts's matching GET check).
  let viewableUsers: ViewableUser[] = [];
  if (actor.role === "super_admin") {
    const rows = getDb()
      .prepare(`SELECT id, full_name FROM users WHERE id != ? AND role != 'external_viewer' ORDER BY full_name`)
      .all(actor.id) as {
      id: string;
      full_name: string;
    }[];
    viewableUsers = rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  } else if (actor.role === "admin" && hasPermission(actor, "viewChildActivityLogs") && actor.adminScope.length > 0) {
    const placeholders = actor.adminScope.map(() => "?").join(",");
    const rows = getDb()
      .prepare(`SELECT id, full_name FROM users WHERE id IN (${placeholders}) ORDER BY full_name`)
      .all(...actor.adminScope) as { id: string; full_name: string }[];
    viewableUsers = rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  }

  // module determines which table related_entity_id points into — there's
  // no single FK, so the name has to be resolved per-module rather than joined.
  const suggestionRows = getDb()
    .prepare(
      `SELECT s.*,
         CASE s.module
           WHEN 'documents' THEN (SELECT title FROM documents WHERE id = s.related_entity_id)
           WHEN 'calendar' THEN (SELECT title FROM events WHERE id = s.related_entity_id)
           WHEN 'tasks' THEN (SELECT title FROM tasks WHERE id = s.related_entity_id)
           ELSE NULL
         END AS related_entity_title
       FROM ai_suggestions s WHERE s.user_id = ? ORDER BY s.generated_at DESC`
    )
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
    related_entity_title: string | null;
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
    relatedEntityTitle: row.related_entity_title,
  }));

  return (
    <AiSettingsPageClient
      initialAiEnabled={!!userRow.ai_enabled}
      memories={memories}
      suggestions={suggestions}
      isSuperAdmin={actor.role === "super_admin"}
      myUserId={actor.id}
      viewableUsers={viewableUsers}
    />
  );
}
