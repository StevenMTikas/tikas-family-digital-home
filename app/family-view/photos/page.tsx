// External Viewer Photos gallery — a genuinely separate, minimal read-only
// view (not ContentPageClient.tsx, which has upload/delete/admin affordances
// this role must never reach). Reuses the same visibility predicate and
// byte-serving route (/api/photos/[id]/file) as the internal Photos module —
// see lib/photos/visibility.ts.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/core/permissions";
import { getDb } from "@/db/client";
import { isPhotoVisibleTo, type PhotoVisibilityRow } from "@/lib/photos/visibility";
import { photoFileUrl } from "@/lib/api/photos";
import { logSecurityEvent } from "@/lib/core/logging";

interface PhotoRow extends PhotoVisibilityRow {
  id: string;
  location: string | null;
  tags: string | null;
  uploaded_at: string;
}

export default async function ExternalViewerPhotosPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/family-view/login");
  if (actor.role !== "external_viewer") redirect("/dashboard");

  const rows = getDb().prepare(`SELECT * FROM photos ORDER BY uploaded_at DESC`).all() as PhotoRow[];
  const visible: PhotoRow[] = [];
  for (const row of rows) {
    if (await isPhotoVisibleTo(actor, row)) visible.push(row);
  }

  await logSecurityEvent({
    type: "external_content_viewed",
    userId: actor.id,
    detail: { surface: "photos", visibleCount: visible.length },
  });

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-display text-xl font-semibold text-ink mb-4">Photos</h1>
      {visible.length === 0 ? (
        <p className="text-sm text-ink-muted">No photos have been shared with you yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visible.map((photo) => (
            <figure key={photo.id} className="rounded-xl overflow-hidden bg-surface border border-ink/[0.08]">
              <img src={photoFileUrl(photo.id)} alt="" className="w-full aspect-square object-cover" />
              {photo.location && (
                <figcaption className="px-2 py-1.5 text-xs text-ink-muted truncate">{photo.location}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
