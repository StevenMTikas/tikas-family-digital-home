// Location Tracking screen. See docs/02_Modules/Location_Tracking.md.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/core/permissions";
import LocationPageClient from "./LocationPageClient";

export default async function LocationPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");
  if (actor.role === "external_viewer") redirect("/dashboard");

  return <LocationPageClient myUserId={actor.id} isSuperAdmin={actor.role === "super_admin"} />;
}
