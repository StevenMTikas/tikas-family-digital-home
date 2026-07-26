"use client";

// Client half of the Users screen: tab switching + the two interactive forms
// (My Profile's Save Changes, Add User's Create Account). Recreated from the
// design handoff (Tikas Users.dc.html) — the shared sidebar/top-bar/Assistant
// chrome shown in that mockup isn't built yet (Navigation.md's shell is
// Phase 7), so this renders as a standalone page like the other module stubs.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateMyProfile, createUser, UsersApiError, type NewUserInput } from "@/lib/api/users";

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  photo: string | null;
  contactInfo: string | null;
  hobbiesInterests: string[];
  relationship: string | null;
  dateOfBirth: string | null;
  role: string;
}

export interface Device {
  id: string;
  type: string;
  name: string;
  status: string;
}

export interface FamilyMember {
  id: string;
  fullName: string;
  photo: string | null;
  relationship: string | null;
  hobbiesInterests: string[];
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  basic_user: "Basic User",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function initials(fullName: string): string {
  return fullName.trim().charAt(0).toUpperCase() || "?";
}

type Tab = "profile" | "devices" | "family" | "add";

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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

export default function UsersPageClient({
  currentUser,
  devices,
  familyMembers,
  isSuperAdmin,
}: {
  currentUser: CurrentUser;
  devices: Device[];
  familyMembers: FamilyMember[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <main className="p-6 max-w-[820px]">
      <h1 className="font-display text-2xl font-medium">Users</h1>

      <div className="flex gap-7 mt-4 border-b border-ink/10">
        <TabButton label="My Profile" active={tab === "profile"} onClick={() => setTab("profile")} />
        <TabButton label="My Devices" active={tab === "devices"} onClick={() => setTab("devices")} />
        <TabButton label="Family Members" active={tab === "family"} onClick={() => setTab("family")} />
        {isSuperAdmin && (
          <TabButton label="Add User" active={tab === "add"} onClick={() => setTab("add")} />
        )}
      </div>

      <div className="mt-7">
        {tab === "profile" && (
          <MyProfileTab currentUser={currentUser} onSaved={() => router.refresh()} />
        )}
        {tab === "devices" && <MyDevicesTab devices={devices} />}
        {tab === "family" && <FamilyMembersTab members={familyMembers} />}
        {tab === "add" && isSuperAdmin && <AddUserTab onCreated={() => router.refresh()} />}
      </div>
    </main>
  );
}

function MyProfileTab({
  currentUser,
  onSaved,
}: {
  currentUser: CurrentUser;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [contactInfo, setContactInfo] = useState(currentUser.contactInfo ?? "");
  const [hobbies, setHobbies] = useState(currentUser.hobbiesInterests.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateMyProfile(currentUser.id, {
        fullName,
        contactInfo: contactInfo || null,
        hobbiesInterests: hobbies
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[720px]">
    <div className="flex gap-6">
      <div className="bg-surface rounded-2xl p-7 shadow-[0_8px_20px_rgba(58,52,44,0.05)] flex-1">
        <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase mb-4">Editable</div>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full bg-trust text-white flex items-center justify-center font-semibold text-xl">
            {initials(fullName)}
          </div>
          <div className="text-xs text-ink-muted" title="Photo upload isn't available yet — Photos module not built.">
            Change photo
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Contact Info</label>
            <input
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Hobbies &amp; Interests</label>
            <input
              type="text"
              value={hobbies}
              onChange={(e) => setHobbies(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}
        {saved && !error && <p className="text-xs text-calm mt-3">Saved.</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-5 text-[13px] font-semibold text-white bg-accent-strong px-5 py-2.5 rounded-full disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="bg-surface rounded-2xl p-7 shadow-[0_8px_20px_rgba(58,52,44,0.05)] w-[280px] shrink-0">
        <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase mb-4">
          Admin-Only (read-only)
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[11px] text-ink-muted">Username</div>
            <div className="text-[13.5px] text-ink mt-0.5">{currentUser.username}</div>
          </div>
          <div>
            <div className="text-[11px] text-ink-muted">Role</div>
            <div className="text-[13.5px] text-ink mt-0.5">{roleLabel(currentUser.role)}</div>
          </div>
          <div>
            <div className="text-[11px] text-ink-muted">Relationship</div>
            <div className="text-[13.5px] text-ink mt-0.5">{currentUser.relationship ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-ink-muted">Date of Birth</div>
            <div className="text-[13.5px] text-ink mt-0.5">{currentUser.dateOfBirth ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
      <Link href="/ai-settings" className="inline-block mt-4 text-[13px] font-semibold text-accent-strong">
        AI Settings — conversation history, what the AI knows about you, suggestions →
      </Link>
    </div>
  );
}

function MyDevicesTab({ devices }: { devices: Device[] }) {
  return (
    <div>
      <p className="text-xs text-ink-muted mb-4 max-w-[640px]">
        Devices linked to your account. Adding, removing, or editing a device requires an admin — see
        Administration.
      </p>
      {devices.length === 0 ? (
        <p className="text-xs text-ink-muted">No devices linked yet.</p>
      ) : (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] max-w-[640px]">
          {devices.map((dv, i) => (
            <div
              key={dv.id}
              className={`flex items-center gap-4 py-3.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
            >
              <div className="flex-1">
                <div className="text-sm text-ink">{dv.name}</div>
                <div className="text-[11.5px] text-ink-muted mt-0.5">{dv.type}</div>
              </div>
              <div
                className={`text-[11.5px] px-3 py-1 rounded-full ${
                  dv.status === "trusted" ? "text-calm bg-calm/[0.14]" : "text-urgent bg-urgent/[0.14]"
                }`}
              >
                {dv.status === "trusted" ? "Trusted" : "Revoked"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyMembersTab({ members }: { members: FamilyMember[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 max-w-[820px]">
      {members.map((m) => (
        <div key={m.id} className="bg-surface rounded-2xl p-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] text-center">
          <div className="w-14 h-14 rounded-full bg-trust text-white flex items-center justify-center font-semibold text-lg mx-auto mb-3">
            {initials(m.fullName)}
          </div>
          <div className="font-display text-base font-semibold text-ink">{m.fullName}</div>
          <div className="text-[11.5px] text-ink-muted mt-0.5">
            {m.relationship ? `${m.relationship} · ${roleLabel(m.role)}` : roleLabel(m.role)}
          </div>
          {m.hobbiesInterests.length > 0 && (
            <div className="text-xs text-ink mt-3 leading-relaxed">{m.hobbiesInterests.join(", ")}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function AddUserTab({ onCreated }: { onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<NewUserInput["role"]>("basic_user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    setCreated(false);
    try {
      await createUser({ fullName, relationship, dateOfBirth, username, password, role });
      setFullName("");
      setRelationship("");
      setDateOfBirth("");
      setUsername("");
      setPassword("");
      setRole("basic_user");
      setCreated(true);
      onCreated();
    } catch (err) {
      setError(err instanceof UsersApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-7 shadow-[0_8px_20px_rgba(58,52,44,0.05)] max-w-[460px]">
      <p className="text-xs text-ink-muted mb-4">Super Admin only — creates a new family member&apos;s account.</p>
      <div className="flex flex-col gap-3.5">
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">Full Name</label>
          <input
            type="text"
            placeholder="e.g. Grandma Tikas"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink mb-1.5">Relationship</label>
            <input
              type="text"
              placeholder="e.g. Grandmother"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink mb-1.5">Date of Birth</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">Initial Username</label>
          <input
            type="text"
            placeholder="e.g. grandma.tikas"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">Initial Password</label>
          <input
            type="password"
            placeholder="Temporary password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as NewUserInput["role"])}
            className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="basic_user">Basic User</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-urgent mt-3">{error}</p>}
      {created && !error && <p className="text-xs text-calm mt-3">Account created.</p>}

      <button
        type="button"
        onClick={handleCreate}
        disabled={saving}
        className="mt-5 text-[13px] font-semibold text-white bg-accent-strong px-5 py-2.5 rounded-full disabled:opacity-70"
      >
        {saving ? "Creating…" : "Create Account"}
      </button>
    </div>
  );
}
