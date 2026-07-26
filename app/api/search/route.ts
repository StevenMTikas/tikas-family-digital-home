// Search API. See docs/02_Modules/Search.md — a single query across
// Documents, Photos, and Family Knowledge (incl. Password Entries),
// permission-scoped by lib/core/search itself.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { searchContent } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const query = req.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  try {
    const results = await searchContent(actor, query);
    return NextResponse.json(results);
  } catch (err) {
    console.error("[search] Query failed:", err);
    return errorResponse("SEARCH_FAILED", "Search isn't available right now.", 503);
  }
}
