// Administration module. See docs/02_Modules/Administration.md for the full
// spec: Super Admin gets the full menu (Overview, Monitoring, Folder
// Permissions, Logs, Backup, Internet Access) — a scoped Admin's reduced
// view (parental controls, a specific child's activity logs, folders they
// manage) isn't captured in the design handoff and is deferred; this hub is
// built as the Super Admin experience shown there.
//
// Only Overview's data is fetched server-side here (per
// Application_Architecture.md: "Server Components fetch data directly where
// possible") since it's the tab shown on first load — the other five tabs
// fetch their own data client-side via lib/api/admin.ts when first selected.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { getLatestHealthSnapshot } from "@/lib/core/ai/guardian";
import AdministrationPageClient, { type OverviewData, type FamilyMemberOption } from "./AdministrationPageClient";

interface NotificationRow {
  id: string;
  text: string;
  created_at: string;
}

export default async function AdministrationPage() {
  const userId = (await headers()).get("x-user-id");
  const user = userId ? await getAuthUser(userId) : null;

  if (!user || user.role !== "super_admin") {
    redirect("/dashboard");
  }

  const db = getDb();
  const urgent = db
    .prepare(`SELECT id, text, created_at FROM notifications WHERE user_id = ? AND severity = 'urgent' ORDER BY created_at DESC LIMIT 10`)
    .all(user.id) as NotificationRow[];
  const passive = db
    .prepare(`SELECT id, text, created_at FROM notifications WHERE user_id = ? AND severity = 'routine' ORDER BY created_at DESC LIMIT 10`)
    .all(user.id) as NotificationRow[];

  const { checkedAt, health } = await getLatestHealthSnapshot();

  const overview: OverviewData = {
    urgentNotifications: urgent.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at })),
    passiveNotifications: passive.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at })),
    health,
    checkedAt,
  };

  const memberRows = db.prepare(`SELECT id, full_name FROM users ORDER BY full_name`).all() as {
    id: string;
    full_name: string;
  }[];
  const familyMembers: FamilyMemberOption[] = memberRows.map((r) => ({ id: r.id, fullName: r.full_name }));

  return <AdministrationPageClient initialOverview={overview} familyMembers={familyMembers} />;
}
