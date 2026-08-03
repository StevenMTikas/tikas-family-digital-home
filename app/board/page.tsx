// Family Board module — standalone page (not embedded in Dashboard, unlike
// the Family Message Board), so it has a 1:1 counterpart at
// app/family-view/board for external_viewer accounts. See
// app/api/family-board and docs/02_Modules/Family_Board.md.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/core/permissions";
import BoardPageClient from "./BoardPageClient";

export default async function BoardPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  return <BoardPageClient currentUserId={actor.id} currentUserRole={actor.role} />;
}
