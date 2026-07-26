// Content module. One nav destination covering Documents, Photos, Memory, and
// Family Knowledge via an internal tab switcher — per Navigation.md's grouped
// "Content" destination and the design handoff (Tikas Content.dc.html), not
// four separate top-level routes.
//
// Initial data fetched directly from the database (Application_Architecture.md),
// mirroring each module's API route. Client-side actions (upload, create,
// reveal, delete) go through /api/documents, /api/photos, /api/memory,
// /api/family-knowledge via lib/api/*.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, canAccessFolder, hasPermission } from "@/lib/core/permissions";
import ContentPageClient, {
  type DocumentData,
  type PhotoData,
  type MemoryData,
  type FamilyKnowledgeItemData,
  type PasswordEntryData,
  type FamilyMemberOption,
} from "./ContentPageClient";

export default async function ContentPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const db = getDb();
  const ctx = { userId: actor.id };

  // --- Documents ---
  const documentRows = db.prepare(`SELECT * FROM documents ORDER BY uploaded_at DESC`).all() as {
    id: string;
    title: string;
    folder_id: string | null;
    category: string | null;
    is_sensitive: number;
    uploaded_by: string;
    uploaded_at: string;
    sync_status: "local" | "metadata_only" | "fetched";
    file_requested_at: string | null;
    removed_from_source_at: string | null;
  }[];
  const documents: DocumentData[] = [];
  for (const row of documentRows) {
    if (!row.folder_id || !(await canAccessFolder(ctx, row.folder_id, "view"))) continue;
    documents.push({
      id: row.id,
      title: row.title,
      folderId: row.folder_id,
      category: row.category,
      isSensitive: !!row.is_sensitive,
      uploadedBy: row.uploaded_by,
      uploadedAt: row.uploaded_at,
      canDelete: await canAccessFolder(ctx, row.folder_id, "delete"),
      syncStatus: row.sync_status,
      fileRequestedAt: row.file_requested_at,
      removedFromSourceAt: row.removed_from_source_at,
    });
  }

  // --- Photos ---
  const photoRows = db.prepare(`SELECT * FROM photos ORDER BY uploaded_at DESC`).all() as {
    id: string;
    uploaded_by: string;
    uploaded_at: string;
    location: string | null;
    tags: string | null;
    visibility: "public" | "private";
    is_sensitive: number;
    event_link: string | null;
    sync_status: "local" | "metadata_only" | "fetched";
    file_requested_at: string | null;
    removed_from_source_at: string | null;
    thumbnail: string | null;
  }[];
  const photos: PhotoData[] = photoRows
    .filter((row) => row.visibility === "public" || canManageUser(actor, row.uploaded_by))
    .map((row) => ({
      id: row.id,
      uploadedBy: row.uploaded_by,
      uploadedAt: row.uploaded_at,
      location: row.location,
      tags: row.tags ? JSON.parse(row.tags) : [],
      visibility: row.visibility,
      isSensitive: !!row.is_sensitive,
      eventLink: row.event_link,
      canEditVisibility: canManageUser(actor, row.uploaded_by),
      canDelete: hasPermission(actor, "deleteContent"),
      syncStatus: row.sync_status,
      fileRequestedAt: row.file_requested_at,
      removedFromSourceAt: row.removed_from_source_at,
      thumbnail: row.thumbnail,
    }));

  // --- Memory ---
  const memoryRows = db.prepare(`SELECT * FROM memories ORDER BY created_at DESC`).all() as {
    id: string;
    title: string;
    caption_notes: string | null;
    event_link: string | null;
    visibility: "public" | "private";
    is_sensitive: number;
    created_by: string;
    created_at: string;
  }[];
  const memories: MemoryData[] = memoryRows
    .filter((row) => row.visibility === "public" || canManageUser(actor, row.created_by))
    .map((row) => ({
      id: row.id,
      title: row.title,
      captionNotes: row.caption_notes,
      eventLink: row.event_link,
      visibility: row.visibility,
      isSensitive: !!row.is_sensitive,
      createdBy: row.created_by,
      createdAt: row.created_at,
      canEdit: canManageUser(actor, row.created_by),
      canDelete: hasPermission(actor, "deleteContent"),
      photoIds: (
        db.prepare(`SELECT photo_id FROM memory_photos WHERE memory_id = ?`).all(row.id) as {
          photo_id: string;
        }[]
      ).map((r) => r.photo_id),
      documentIds: (
        db.prepare(`SELECT document_id FROM memory_documents WHERE memory_id = ?`).all(row.id) as {
          document_id: string;
        }[]
      ).map((r) => r.document_id),
    }));

  // --- Family Knowledge: general items ---
  const itemRows = db.prepare(`SELECT * FROM family_knowledge_items ORDER BY updated_at DESC`).all() as {
    id: string;
    category: string | null;
    title: string;
    content: string | null;
    is_sensitive: number;
    folder_id: string | null;
    created_by: string;
    updated_at: string;
  }[];
  const knowledgeItems: FamilyKnowledgeItemData[] = [];
  for (const row of itemRows) {
    if (!row.folder_id || !(await canAccessFolder(ctx, row.folder_id, "view"))) continue;
    knowledgeItems.push({
      id: row.id,
      category: row.category,
      title: row.title,
      content: row.content,
      isSensitive: !!row.is_sensitive,
      folderId: row.folder_id,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
      canEdit: await canAccessFolder(ctx, row.folder_id, "edit"),
      canDelete: await canAccessFolder(ctx, row.folder_id, "delete"),
    });
  }

  // --- Family Knowledge: Password Entries (masked) ---
  const passwordRows = db
    .prepare(`SELECT id, service_name, username, url, notes, folder_id FROM password_entries ORDER BY service_name`)
    .all() as { id: string; service_name: string; username: string | null; url: string | null; notes: string | null; folder_id: string | null }[];
  const passwords: PasswordEntryData[] = [];
  for (const row of passwordRows) {
    if (!row.folder_id || !(await canAccessFolder(ctx, row.folder_id, "view"))) continue;
    passwords.push({
      id: row.id,
      serviceName: row.service_name,
      username: row.username,
      url: row.url,
      notes: row.notes,
      canEdit: await canAccessFolder(ctx, row.folder_id, "edit"),
      canDelete: await canAccessFolder(ctx, row.folder_id, "delete"),
    });
  }

  // --- Family members (for display names) ---
  const memberRows = db.prepare(`SELECT id, full_name FROM users`).all() as { id: string; full_name: string }[];
  const familyMembers: FamilyMemberOption[] = memberRows.map((row) => ({ id: row.id, fullName: row.full_name }));

  return (
    <ContentPageClient
      documents={documents}
      photos={photos}
      memories={memories}
      knowledgeItems={knowledgeItems}
      passwords={passwords}
      familyMembers={familyMembers}
      currentUserId={actor.id}
    />
  );
}
