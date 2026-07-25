// Thin typed API client for Users — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface SelfEditableProfile {
  fullName: string;
  photo: string | null;
  contactInfo: string | null;
  hobbiesInterests: string[];
}

export class UsersApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new UsersApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export async function updateMyProfile(
  userId: string,
  fields: Partial<SelfEditableProfile>
): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  await unwrap(res);
}

export interface NewUserInput {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  username: string;
  password: string;
  role: "super_admin" | "admin" | "basic_user";
}

export async function createUser(input: NewUserInput): Promise<void> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await unwrap(res);
}
