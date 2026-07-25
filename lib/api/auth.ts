// Thin typed API client for Authentication — see
// Application_Architecture.md's "Frontend ↔ Backend Communication" section.

export interface LoggedInUser {
  id: string;
  username: string;
  fullName: string;
  role: "super_admin" | "admin" | "basic_user";
}

export class LoginError extends Error {}

export async function login(username: string, password: string): Promise<LoggedInUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new LoginError(body?.error?.message ?? "Login failed.");
  }

  return res.json();
}
