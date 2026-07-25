// Pulled out of route.ts because Next.js's route type-checking rejects any
// export from a route.ts file other than the HTTP verb handlers.

// Per Users.md: full_name, photo, contact_info, hobbies_interests are
// self-editable by anyone about themselves; everything else needs an admin
// and goes through Administration instead, not this route.
const SELF_EDITABLE_FIELDS = ["fullName", "photo", "contactInfo", "hobbiesInterests"] as const;
type SelfEditableField = (typeof SELF_EDITABLE_FIELDS)[number];

export interface UserPatch {
  full_name?: string;
  photo?: string | null;
  contact_info?: string | null;
  hobbies_interests?: string | null;
}

/** Filters an arbitrary request body down to only the self-editable fields, mapped to column names. */
export function pickSelfEditableFields(body: unknown): UserPatch {
  const patch: UserPatch = {};
  if (typeof body !== "object" || body === null) return patch;
  const b = body as Partial<Record<SelfEditableField, unknown>>;

  if (typeof b.fullName === "string" && b.fullName.trim()) patch.full_name = b.fullName.trim();
  if (typeof b.photo === "string" || b.photo === null) patch.photo = b.photo;
  if (typeof b.contactInfo === "string" || b.contactInfo === null) patch.contact_info = b.contactInfo;
  if (Array.isArray(b.hobbiesInterests)) patch.hobbies_interests = JSON.stringify(b.hobbiesInterests);

  return patch;
}
