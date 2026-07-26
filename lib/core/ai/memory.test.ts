import { describe, it, expect } from "vitest";
import { decayedPriority, formatMemoriesForPrompt, type MemoryFact } from "./memory";

describe("decayedPriority", () => {
  it("returns full confidence for a fact reinforced right now", () => {
    const now = new Date("2026-07-25T12:00:00Z");
    expect(decayedPriority(1.0, now.toISOString(), now)).toBeCloseTo(1.0, 5);
  });

  it("halves priority after exactly one half-life (30 days)", () => {
    const now = new Date("2026-07-25T00:00:00Z");
    const thirtyDaysAgo = new Date("2026-06-25T00:00:00Z").toISOString();
    expect(decayedPriority(1.0, thirtyDaysAgo, now)).toBeCloseTo(0.5, 2);
  });

  it("treats a never-reinforced fact (null) as undecayed", () => {
    expect(decayedPriority(0.8, null)).toBe(0.8);
  });

  it("never goes negative or increases for a future reinforcement date (clamped at 0 days)", () => {
    const now = new Date("2026-07-25T00:00:00Z");
    const future = new Date("2026-08-01T00:00:00Z").toISOString();
    expect(decayedPriority(1.0, future, now)).toBeCloseTo(1.0, 5);
  });
});

describe("formatMemoriesForPrompt", () => {
  it("formats facts as a bulleted list", () => {
    const memories: MemoryFact[] = [
      { id: "1", fact: "Prefers short answers", category: "preferences", source: "explicit_statement", confidence: 1, lastReinforcedAt: null, isSensitive: false, flagged: false },
      { id: "2", fact: "Soccer practice on Tuesdays", category: "routines_patterns", source: "inferred_pattern", confidence: 0.8, lastReinforcedAt: null, isSensitive: false, flagged: false },
    ];
    expect(formatMemoriesForPrompt(memories)).toBe(
      "- Prefers short answers\n- Soccer practice on Tuesdays"
    );
  });

  it("returns a placeholder when there are no memories yet", () => {
    expect(formatMemoriesForPrompt([])).toBe("No stored facts about this person yet.");
  });
});
