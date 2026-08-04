import { describe, it, expect } from "vitest";
import { feedbackToMemoryFact } from "./feedback";

describe("feedbackToMemoryFact", () => {
  it("thumbs-up stores the suggestion content verbatim at full confidence", () => {
    const write = feedbackToMemoryFact("thumbs_up", "calendar", "Add a reminder for the dentist visit?");
    expect(write).toEqual({ fact: "Add a reminder for the dentist visit?", confidence: 1.0 });
  });

  it("thumbs-down writes a negative preference fact, category preferences", () => {
    const write = feedbackToMemoryFact("thumbs_down", "tasks", "Finish the HOA payment task?");
    expect(write.category).toBe("preferences");
    expect(write.fact).toContain("unhelpful");
    expect(write.fact).toContain("task");
    expect(write.fact).toContain("Finish the HOA payment task?");
  });

  it("dismissed writes a lighter negative preference fact", () => {
    const write = feedbackToMemoryFact("dismissed", "documents", "Categorize this as Tax?");
    expect(write.category).toBe("preferences");
    expect(write.fact).toContain("Dismissed");
    expect(write.fact).toContain("document");
  });

  it("thumbs-down is weighted as a stronger signal than dismissed, per AI_Suggestions.md", () => {
    const down = feedbackToMemoryFact("thumbs_down", "calendar", "x");
    const dismissed = feedbackToMemoryFact("dismissed", "calendar", "x");
    expect(down.confidence).toBeGreaterThan(dismissed.confidence);
  });

  it("falls back to a generic label when module is null", () => {
    const write = feedbackToMemoryFact("thumbs_down", null, "Some suggestion");
    expect(write.fact).toContain("AI suggestion");
  });
});
