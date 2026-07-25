// Administration module. See docs/02_Modules/Administration.md for the full spec.
// This is a placeholder — build against that document's Purpose, Features,
// Screen Layout, Data Stored, and Permissions sections.
//
// Super Admin only — technical admin tools are inherently Super-Admin-only,
// not an individually grantable permission. See Authorization.md's
// "Inherently Super Admin-Only" section.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/core/permissions";

export default async function AdministrationPage() {
  const userId = (await headers()).get("x-user-id");
  const user = userId ? await getAuthUser(userId) : null;

  if (!user || user.role !== "super_admin") {
    redirect("/dashboard");
  }

  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-medium">Administration</h1>
      <p className="text-ink-muted text-sm mt-1">
        TODO — see docs/02_Modules/Administration.md
      </p>
    </main>
  );
}
