// "Plan Curriculum" — the AI-Generated Curriculum Plan feature's own area,
// off the main Homeschool screen. Admin/Super-Admin only, same boundary as
// the rest of curriculum planning. See docs/02_Modules/Homeschool.md.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import PlanCurriculumPageClient, { type ChildOption, type SubjectOption } from "./PlanCurriculumPageClient";

export default async function PlanCurriculumPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");
  if (actor.role !== "admin" && actor.role !== "super_admin") redirect("/homeschool");

  const db = getDb();

  const memberRows = db
    .prepare(`SELECT id, full_name, role, admin_scope FROM users WHERE role != 'external_viewer'`)
    .all() as { id: string; full_name: string; role: string; admin_scope: string | null }[];

  const childIds = new Set(
    memberRows
      .filter((row) => row.role === "admin" && row.admin_scope)
      .flatMap((row) => JSON.parse(row.admin_scope!) as string[])
  );
  const childUsers: ChildOption[] = memberRows.filter((m) => childIds.has(m.id)).map((m) => ({ id: m.id, fullName: m.full_name }));

  const subjectRows = db.prepare(`SELECT id, name FROM subjects ORDER BY name COLLATE NOCASE`).all() as {
    id: string;
    name: string;
  }[];
  const subjects: SubjectOption[] = subjectRows.map((s) => ({ id: s.id, name: s.name }));

  return <PlanCurriculumPageClient childUsers={childUsers} subjects={subjects} />;
}
