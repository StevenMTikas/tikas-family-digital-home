// Location_Tracking.md: location data is "hard-excluded from frontier-model
// routing — not merely gated", enforced "by omission". Omission only holds
// until someone adds the import, so this makes it a failing test instead of a
// comment: nothing the AI layer, the Assistant routes, or any caller of the
// frontier client may reference the location module or its table.

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_EXT = /\.(ts|tsx)$/;
const LOCATION_REFERENCE = /core\/location|location_reports|location_sharing_enabled|getCurrentFamilyLocations|getLocationHistory/;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : walk(full);
    return SOURCE_EXT.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// The warning comment in tools.ts legitimately names the location module —
// only real code (imports, queries) counts.
function code(file: string): string {
  return fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

describe("location data stays out of the AI layer", () => {
  const aiLayer = [...walk(path.join(ROOT, "lib/core/ai")), ...walk(path.join(ROOT, "app/api/assistant")), ...walk(path.join(ROOT, "components"))].filter(
    (f) => /lib\/core\/ai|app\/api\/assistant|AssistantBubble/.test(rel(f))
  );

  // Anything that can send content to the frontier model, wherever it lives.
  const frontierCallers = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))].filter((f) =>
    /from "@\/lib\/core\/ai\/frontier"|from "\.\/frontier"/.test(fs.readFileSync(f, "utf8"))
  );

  it("finds the files it is supposed to be checking", () => {
    expect(aiLayer.length).toBeGreaterThan(5);
    expect(frontierCallers.length).toBeGreaterThan(0);
  });

  it("no AI-layer file references the location module or table", () => {
    const offenders = aiLayer.filter((f) => LOCATION_REFERENCE.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no file that calls the frontier client references the location module or table", () => {
    const offenders = frontierCallers.filter((f) => LOCATION_REFERENCE.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the location module doesn't import from the AI layer either (no shared path)", () => {
    const src = walk(path.join(ROOT, "lib/core/location")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect(src).not.toMatch(/from "@\/lib\/core\/ai/);
  });
});
