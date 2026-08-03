// Thin typed API client for the External Viewer login surface — mirrors
// lib/api/auth.ts's shape, but posts to the separate /family-view login
// route (see app/api/family-view/auth/login/route.ts).

export interface LoggedInExternalViewer {
  id: string;
  username: string;
  fullName: string;
  role: "external_viewer";
}

export class ExternalLoginError extends Error {}

export async function loginExternalViewer(username: string, password: string): Promise<LoggedInExternalViewer> {
  const res = await fetch("/api/family-view/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ExternalLoginError(body?.error?.message ?? "Login failed.");
  }

  return res.json();
}

// Session cookie/logout mechanism is shared with internal accounts — reuse
// the existing endpoint rather than duplicating it.
export { logout } from "./auth";
