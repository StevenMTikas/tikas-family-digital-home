"use client";

// Family Board — a standalone module (not folded into Dashboard, unlike the
// Family Message Board) specifically so it has a 1:1 read-only counterpart
// at app/family-view/board for external_viewer accounts. UI pattern is
// deliberately the same as Dashboard's Family Message Board section.

import { useState, useEffect } from "react";
import {
  getBoardPosts,
  postBoardPost,
  editBoardPost,
  deleteBoardPost,
  BoardApiError,
  type BoardPost,
} from "@/lib/api/board";
import type { Role } from "@/lib/core/permissions/types";

function formatPostDate(sqliteDateTime: string): string {
  const d = new Date(sqliteDateTime.replace(" ", "T"));
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export interface Props {
  currentUserId: string;
  currentUserRole: Role;
}

export default function BoardPageClient({ currentUserId, currentUserRole }: Props) {
  const canPost = currentUserRole === "admin" || currentUserRole === "super_admin";

  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPostText, setNewPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getBoardPosts()
      .then(setPosts)
      .catch((err) => setError(err instanceof BoardApiError ? err.message : "Failed to load the Family Board."));
  }, []);

  async function handlePost() {
    if (!newPostText.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const created = await postBoardPost(newPostText.trim());
      setPosts((prev) => [created, ...(prev ?? [])]);
      setNewPostText("");
    } catch (err) {
      setError(err instanceof BoardApiError ? err.message : "Failed to post.");
    } finally {
      setPosting(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editText.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      const updated = await editBoardPost(id, editText.trim());
      setPosts((prev) => (prev ?? []).map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof BoardApiError ? err.message : "Failed to save.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await deleteBoardPost(id);
      setPosts((prev) => (prev ?? []).filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof BoardApiError ? err.message : "Failed to delete.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-xl font-semibold text-ink mb-4">Family Board</h1>
      {error && <p className="text-xs text-urgent mb-2">{error}</p>}

      {canPost && (
        <div className="flex items-start gap-2 mb-4">
          <textarea
            value={newPostText}
            onChange={(e) => setNewPostText(e.target.value)}
            placeholder="Post something for the whole family to see…"
            rows={2}
            className="flex-1 px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y min-h-[42px]"
          />
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || !newPostText.trim()}
            className="text-[13px] font-semibold text-white bg-accent-strong px-4 py-2 rounded-full disabled:opacity-60"
          >
            Post
          </button>
        </div>
      )}

      {posts === null ? (
        <p className="text-xs text-ink-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="text-xs text-ink-muted">No posts yet.</p>
      ) : (
        <div className="bg-surface rounded-xl border border-ink/[0.08] px-4">
          {posts.map((p, i) => {
            const canEdit = p.postedBy === currentUserId;
            const canDelete = canEdit || currentUserRole === "super_admin";
            return (
              <div key={p.id} className={`py-2.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                {editingId === p.id ? (
                  <div className="flex items-start gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      autoFocus
                      className="flex-1 px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y min-h-[42px]"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(p.id)}
                        disabled={busyId === p.id}
                        className="text-[11px] font-semibold text-accent-strong disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-[11px] text-ink-muted">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[13px] text-ink whitespace-pre-wrap">{p.text}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-ink-muted">
                        {p.postedByName} · {formatPostDate(p.createdAt)}
                        {p.updatedAt !== p.createdAt ? " (edited)" : ""}
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditText(p.text);
                            setError(null);
                          }}
                          className="text-[11px] text-ink-muted underline"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={busyId === p.id}
                          className="text-[11px] text-urgent disabled:opacity-60"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
