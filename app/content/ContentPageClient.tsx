"use client";

// Client half of the Content screen: Documents/Photos/Memory/Family
// Knowledge tabs. Recreated from the design handoff (Tikas Content.dc.html)
// — the shared sidebar/top-bar/Assistant chrome shown in that mockup isn't
// built yet (Navigation.md's shell is Phase 7), so this renders as a
// standalone page like the other module pages.
//
// AI-prompted category/tag prompting (Documents.md, Photos.md) isn't wired
// up here — lib/core/ai doesn't exist yet (Phase 3). Manual fields stand in
// for it for now, per Milestones.md's own expectation that Content works
// "even before any AI is wired in."

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDocuments,
  uploadDocument,
  setDocumentSensitivity,
  deleteDocument,
  documentDownloadUrl,
  DocumentsApiError,
  type DocumentItem,
} from "@/lib/api/documents";
import { uploadPhoto, deletePhoto, photoFileUrl, PhotosApiError, type PhotoItem } from "@/lib/api/photos";
import { createMemory, deleteMemory, MemoryApiError, type MemoryItem } from "@/lib/api/memory";
import {
  createFamilyKnowledgeItem,
  deleteFamilyKnowledgeItem,
  getPasswordEntries,
  revealPasswordEntry,
  createPasswordEntry,
  deletePasswordEntry,
  FamilyKnowledgeApiError,
  type FamilyKnowledgeItem,
  type PasswordEntrySummary,
} from "@/lib/api/family-knowledge";

export interface DocumentData extends DocumentItem {}
export interface PhotoData extends PhotoItem {}
export interface MemoryData extends MemoryItem {}
export interface FamilyKnowledgeItemData extends FamilyKnowledgeItem {}
export interface PasswordEntryData extends PasswordEntrySummary {}

export interface FamilyMemberOption {
  id: string;
  fullName: string;
}

type Tab = "documents" | "photos" | "memory" | "knowledge";

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-3 text-[13.5px] font-semibold border-b-2 ${
        active ? "text-ink border-accent" : "text-ink-muted border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

function nameFor(members: FamilyMemberOption[], id: string): string {
  return members.find((m) => m.id === id)?.fullName ?? "Unknown";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ContentPageClient({
  documents,
  photos,
  memories,
  knowledgeItems,
  passwords,
  familyMembers,
  currentUserId,
}: {
  documents: DocumentData[];
  photos: PhotoData[];
  memories: MemoryData[];
  knowledgeItems: FamilyKnowledgeItemData[];
  passwords: PasswordEntryData[];
  familyMembers: FamilyMemberOption[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("documents");

  return (
    <main className="p-6 max-w-[1000px]">
      <h1 className="font-display text-2xl font-medium">Content</h1>

      <div className="flex gap-7 mt-4 border-b border-ink/10">
        <TabButton label="Documents" active={tab === "documents"} onClick={() => setTab("documents")} />
        <TabButton label="Photos" active={tab === "photos"} onClick={() => setTab("photos")} />
        <TabButton label="Memory" active={tab === "memory"} onClick={() => setTab("memory")} />
        <TabButton label="Family Knowledge" active={tab === "knowledge"} onClick={() => setTab("knowledge")} />
      </div>

      <div className="mt-7">
        {tab === "documents" && <DocumentsTab documents={documents} familyMembers={familyMembers} />}
        {tab === "photos" && <PhotosTab photos={photos} />}
        {tab === "memory" && (
          <MemoryTab
            memories={memories}
            photos={photos}
            documents={documents}
            familyMembers={familyMembers}
            currentUserId={currentUserId}
          />
        )}
        {tab === "knowledge" && <FamilyKnowledgeTab items={knowledgeItems} passwords={passwords} />}
      </div>
    </main>
  );
}

// ---------- Documents ----------

function DocumentsTab({
  documents,
  familyMembers,
}: {
  documents: DocumentData[];
  familyMembers: FamilyMemberOption[];
}) {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleSensitive(doc: DocumentData) {
    setError(null);
    try {
      await setDocumentSensitivity(doc.id, !doc.isSensitive);
      router.refresh();
    } catch (err) {
      setError(err instanceof DocumentsApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleDelete(doc: DocumentData) {
    setError(null);
    try {
      await deleteDocument(doc.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof DocumentsApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12.5px] text-ink-muted">Home / Whole Family</div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="h-[34px] px-4.5 rounded-[10px] bg-accent-strong text-white text-[13px] font-semibold"
        >
          + Upload
        </button>
      </div>

      {error && <p className="text-xs text-urgent mb-3">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-xs text-ink-muted">No documents yet.</p>
      ) : (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          {documents.map((doc, i) => (
            <div
              key={doc.id}
              className={`flex items-center gap-4 py-3.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{doc.title}</div>
                <div className="text-[11.5px] text-ink-muted mt-0.5">
                  {nameFor(familyMembers, doc.uploadedBy)} · {formatDate(doc.uploadedAt)}
                </div>
              </div>
              {doc.category && (
                <div className="text-[11px] text-ink-muted bg-base px-2.5 py-1 rounded-full">{doc.category}</div>
              )}
              <button
                type="button"
                onClick={() => handleToggleSensitive(doc)}
                className={`text-[11px] px-2 py-1 rounded-full ${
                  doc.isSensitive ? "text-trust bg-trust/[0.12]" : "text-ink-muted"
                }`}
                title="Toggle sensitivity (Super Admin only)"
              >
                {doc.isSensitive ? "Sensitive" : "Mark sensitive"}
              </button>
              <a
                href={documentDownloadUrl(doc.id)}
                className="text-[12.5px] text-accent-strong font-semibold w-16 text-right"
              >
                Download
              </a>
              {doc.canDelete && (
                <button type="button" onClick={() => handleDelete(doc)} className="text-[12.5px] text-urgent">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadDocumentModal onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); router.refresh(); }} />}
    </div>
  );
}

function UploadDocumentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [isSensitive, setIsSensitive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!file || !title.trim()) {
      setError("A file and title are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await uploadDocument({ file, title: title.trim(), category: category.trim() || undefined, isSensitive });
      onSaved();
    } catch (err) {
      setError(err instanceof DocumentsApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-8 w-[440px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold text-ink">Upload Document</div>
        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-[13px] text-ink"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Category <span className="font-normal text-ink-muted">(e.g. tax, medical, school — AI-prompted once the Assistant is built)</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} />
            Mark sensitive
          </label>
        </div>
        {error && <p className="text-xs text-urgent mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70"
          >
            {saving ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Photos ----------

function PhotosTab({ photos }: { photos: PhotoData[] }) {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(photo: PhotoData) {
    setError(null);
    try {
      await deletePhoto(photo.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof PhotosApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12.5px] text-ink-muted">{photos.length} photos</div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="h-[34px] px-4.5 rounded-[10px] bg-accent-strong text-white text-[13px] font-semibold"
        >
          + Upload
        </button>
      </div>

      {error && <p className="text-xs text-urgent mb-3">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-xs text-ink-muted">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-2xl overflow-hidden shadow-[0_8px_20px_rgba(58,52,44,0.05)] bg-surface">
              <div className="aspect-square bg-base relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoFileUrl(photo.id)} alt="" className="w-full h-full object-cover" />
                {photo.visibility === "private" && (
                  <div className="absolute top-2 right-2 w-[22px] h-[22px] rounded-full bg-white/85 flex items-center justify-center text-[10px]">
                    🔒
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <div className="text-xs text-ink">{photo.tags.join(", ") || "—"}</div>
                {photo.location && <div className="text-[11px] text-ink-muted mt-0.5">{photo.location}</div>}
                {photo.canDelete && (
                  <button type="button" onClick={() => handleDelete(photo)} className="text-[11px] text-urgent mt-1.5">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadPhotoModal onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); router.refresh(); }} />}
    </div>
  );
}

function UploadPhotoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [isSensitive, setIsSensitive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!file) {
      setError("A photo is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await uploadPhoto({ file, location: location.trim() || undefined, tags: tags.trim() || undefined, visibility, isSensitive });
      onSaved();
    } catch (err) {
      setError(err instanceof PhotosApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-8 w-[440px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold text-ink">Upload Photo</div>
        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Photo</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-[13px] text-ink" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Who/Event/Tags <span className="font-normal text-ink-muted">(comma-separated — AI-prompted once the Assistant is built)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Malachi, birthday cake"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Where</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Visibility</label>
            <div className="flex rounded-[10px] overflow-hidden border border-ink/15 w-fit">
              <button type="button" onClick={() => setVisibility("public")} className={`px-4 py-1.5 text-xs font-semibold ${visibility === "public" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"}`}>Public</button>
              <button type="button" onClick={() => setVisibility("private")} className={`px-4 py-1.5 text-xs font-semibold ${visibility === "private" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"}`}>Private</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} />
            Mark sensitive
          </label>
        </div>
        {error && <p className="text-xs text-urgent mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70">
            {saving ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Memory ----------

function MemoryTab({
  memories,
  photos,
  documents,
  familyMembers,
  currentUserId,
}: {
  memories: MemoryData[];
  photos: PhotoData[];
  documents: DocumentData[];
  familyMembers: FamilyMemberOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(memory: MemoryData) {
    setError(null);
    try {
      await deleteMemory(memory.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof MemoryApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12.5px] text-ink-muted">Family memory feed</div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="h-[34px] px-4.5 rounded-[10px] bg-accent-strong text-white text-[13px] font-semibold"
        >
          + New Memory
        </button>
      </div>

      {error && <p className="text-xs text-urgent mb-3">{error}</p>}

      {memories.length === 0 ? (
        <p className="text-xs text-ink-muted">No memories yet.</p>
      ) : (
        <div className="flex flex-col gap-4 max-w-[640px]">
          {memories.map((memory) => (
            <div key={memory.id} className="bg-surface rounded-2xl p-5.5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
              <div className="flex items-center justify-between">
                <div className="font-display text-base font-semibold text-ink">{memory.title}</div>
                {memory.visibility === "private" && <span className="text-xs">🔒</span>}
              </div>
              <div className="text-[11.5px] text-ink-muted mt-1">
                {formatDate(memory.createdAt)} · {nameFor(familyMembers, memory.createdBy)}
              </div>
              {memory.captionNotes && (
                <div className="text-[13.5px] text-ink mt-3 leading-relaxed">{memory.captionNotes}</div>
              )}
              {(memory.photoIds.length > 0 || memory.documentIds.length > 0) && (
                <div className="flex gap-2 mt-3.5 flex-wrap">
                  {memory.photoIds.map((pid) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={pid} src={photoFileUrl(pid)} alt="" className="w-14 h-14 rounded-[10px] object-cover" />
                  ))}
                  {memory.documentIds.map((did) => {
                    const doc = documents.find((d) => d.id === did);
                    return (
                      <div key={did} className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-base text-[11.5px] text-ink">
                        📄 {doc?.title ?? "Document"}
                      </div>
                    );
                  })}
                </div>
              )}
              {memory.canDelete && (
                <button type="button" onClick={() => handleDelete(memory)} className="text-[11.5px] text-urgent mt-3">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <NewMemoryModal
          photos={photos}
          documents={documents}
          currentUserId={currentUserId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function NewMemoryModal({
  photos,
  documents,
  onClose,
  onSaved,
}: {
  photos: PhotoData[];
  documents: DocumentData[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [captionNotes, setCaptionNotes] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [isSensitive, setIsSensitive] = useState(false);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePhoto(id: string) {
    setPhotoIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }
  function toggleDoc(id: string) {
    setDocumentIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMemory({
        title: title.trim(),
        captionNotes: captionNotes.trim() || null,
        visibility,
        isSensitive,
        photoIds,
        documentIds,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof MemoryApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-8 w-[460px] max-h-[80vh] overflow-y-auto shadow-[0_24px_60px_rgba(58,52,44,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold text-ink">New Memory</div>
        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Notes</label>
            <textarea rows={3} value={captionNotes} onChange={(e) => setCaptionNotes(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          {photos.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Attach photos (optional)</label>
              <div className="flex gap-2 flex-wrap">
                {photos.map((p) => (
                  <button key={p.id} type="button" onClick={() => togglePhoto(p.id)} className={`text-xs px-3 py-1.5 rounded-full ${photoIds.includes(p.id) ? "bg-accent-strong text-white" : "bg-base text-ink"}`}>
                    {p.tags[0] ?? "photo"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {documents.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Attach documents (optional)</label>
              <div className="flex gap-2 flex-wrap">
                {documents.map((d) => (
                  <button key={d.id} type="button" onClick={() => toggleDoc(d.id)} className={`text-xs px-3 py-1.5 rounded-full ${documentIds.includes(d.id) ? "bg-accent-strong text-white" : "bg-base text-ink"}`}>
                    {d.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Visibility</label>
            <div className="flex rounded-[10px] overflow-hidden border border-ink/15 w-fit">
              <button type="button" onClick={() => setVisibility("public")} className={`px-4 py-1.5 text-xs font-semibold ${visibility === "public" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"}`}>Public</button>
              <button type="button" onClick={() => setVisibility("private")} className={`px-4 py-1.5 text-xs font-semibold ${visibility === "private" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"}`}>Private</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} />
            Mark sensitive
          </label>
        </div>
        {error && <p className="text-xs text-urgent mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70">
            {saving ? "Saving…" : "Save Memory"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Family Knowledge ----------

function FamilyKnowledgeTab({ items, passwords: initialPasswords }: { items: FamilyKnowledgeItemData[]; passwords: PasswordEntryData[] }) {
  const router = useRouter();
  const [showItemForm, setShowItemForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const categories = Array.from(
    items.reduce((map, item) => {
      const key = item.category ?? "Uncategorized";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  );

  async function handleReveal(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setError(null);
    try {
      const entry = await revealPasswordEntry(id);
      setRevealed((prev) => ({ ...prev, [id]: entry.password }));
    } catch (err) {
      setError(err instanceof FamilyKnowledgeApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleDeleteItem(id: string) {
    setError(null);
    try {
      await deleteFamilyKnowledgeItem(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof FamilyKnowledgeApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleDeletePassword(id: string) {
    setError(null);
    try {
      await deletePasswordEntry(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof FamilyKnowledgeApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div>
      {error && <p className="text-xs text-urgent mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-4">
        <div className="text-[12.5px] text-ink-muted">Categories</div>
        <button type="button" onClick={() => setShowItemForm(true)} className="h-[34px] px-4.5 rounded-[10px] bg-accent-strong text-white text-[13px] font-semibold">
          + Add Item
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3.5 mb-7">
        {categories.length === 0 ? (
          <p className="text-xs text-ink-muted col-span-5">No items yet.</p>
        ) : (
          categories.map(([name, count]) => (
            <div key={name} className="bg-surface rounded-2xl p-4.5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] text-center">
              <div className="text-[13px] font-semibold text-ink">{name}</div>
              <div className="text-[11px] text-ink-muted mt-0.5">{count} items</div>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] max-w-[640px] mb-7">
          {items.map((item, i) => (
            <div key={item.id} className={`py-3.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink">{item.title}</div>
                {item.canDelete && (
                  <button type="button" onClick={() => handleDeleteItem(item.id)} className="text-[11.5px] text-urgent">
                    Delete
                  </button>
                )}
              </div>
              {item.content && <div className="text-[12.5px] text-ink-muted mt-1">{item.content}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-ink">🔒 Passwords</div>
        <button type="button" onClick={() => setShowPasswordForm(true)} className="text-[12.5px] font-semibold text-accent-strong">
          + Add Password
        </button>
      </div>
      {initialPasswords.length === 0 ? (
        <p className="text-xs text-ink-muted">No password entries yet.</p>
      ) : (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] max-w-[640px]">
          {initialPasswords.map((pw, i) => (
            <div key={pw.id} className={`flex items-center gap-4 py-3.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink">{pw.serviceName}</div>
                <div className="text-[11.5px] text-ink-muted mt-0.5">{pw.username ?? "—"}</div>
              </div>
              <div className="font-mono text-[13px] text-ink w-36">
                {revealed[pw.id] ?? "••••••••••••"}
              </div>
              <button type="button" onClick={() => handleReveal(pw.id)} className="text-ink-muted" aria-label="Toggle reveal">
                👁
              </button>
              {pw.canDelete && (
                <button type="button" onClick={() => handleDeletePassword(pw.id)} className="text-[11.5px] text-urgent">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showItemForm && (
        <AddKnowledgeItemModal onClose={() => setShowItemForm(false)} onSaved={() => { setShowItemForm(false); router.refresh(); }} />
      )}
      {showPasswordForm && (
        <AddPasswordModal onClose={() => setShowPasswordForm(false)} onSaved={() => { setShowPasswordForm(false); router.refresh(); }} />
      )}
    </div>
  );
}

function AddKnowledgeItemModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [isSensitive, setIsSensitive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createFamilyKnowledgeItem({ title: title.trim(), category: category.trim() || null, content: content.trim() || null, isSensitive });
      onSaved();
    } catch (err) {
      setError(err instanceof FamilyKnowledgeApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-8 w-[440px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold text-ink">Add Family Knowledge Item</div>
        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Category</label>
            <input type="text" placeholder="e.g. Contacts, Medical, Home, Insurance" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Content</label>
            <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} />
            Mark sensitive
          </label>
        </div>
        {error && <p className="text-xs text-urgent mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPasswordModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [serviceName, setServiceName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!serviceName.trim() || !password) {
      setError("Service name and password are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPasswordEntry({
        serviceName: serviceName.trim(),
        username: username.trim() || undefined,
        password,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof FamilyKnowledgeApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-2xl p-8 w-[420px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg font-semibold text-ink">Add Password Entry</div>
        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Service Name</label>
            <input type="text" placeholder="e.g. Netflix" value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Password</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">URL</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
        </div>
        {error && <p className="text-xs text-urgent mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
