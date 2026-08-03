// External Viewer Family Board (read-only). Reuses the same canReadBoard
// gate and query shape as GET /api/family-board — see
// app/api/family-board/access.ts.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/core/permissions";
import { getDb } from "@/db/client";
import { canReadBoard } from "@/app/api/family-board/access";

interface PostRow {
  id: string;
  text: string;
  posted_by_name: string;
  created_at: string;
}

function formatPostDate(sqliteDateTime: string): string {
  const d = new Date(sqliteDateTime.replace(" ", "T"));
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export default async function ExternalViewerBoardPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/family-view/login");
  if (actor.role !== "external_viewer") redirect("/dashboard");

  if (!canReadBoard(actor)) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-xl font-semibold text-ink mb-2">Family Board</h1>
        <p className="text-sm text-ink-muted">You don't have access to the Family Board yet.</p>
      </div>
    );
  }

  const posts = getDb()
    .prepare(
      `SELECT p.id, p.text, u.full_name AS posted_by_name, p.created_at
       FROM family_board_posts p JOIN users u ON u.id = p.posted_by
       ORDER BY p.created_at DESC`
    )
    .all() as PostRow[];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-xl font-semibold text-ink mb-4">Family Board</h1>
      {posts.length === 0 ? (
        <p className="text-sm text-ink-muted">No posts yet.</p>
      ) : (
        <div className="bg-surface rounded-xl border border-ink/[0.08] px-4">
          {posts.map((p, i) => (
            <div key={p.id} className={`py-2.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
              <div className="text-[13px] text-ink whitespace-pre-wrap">{p.text}</div>
              <span className="text-[11px] text-ink-muted">
                {p.posted_by_name} · {formatPostDate(p.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
