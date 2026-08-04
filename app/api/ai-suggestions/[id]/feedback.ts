// Pure mapping from suggestion feedback to what gets written into AI_Memory.
// Pulled out of route.ts since Next.js route files may only export HTTP verb
// handlers (see project memory's "Gotcha worth remembering" on this).
//
// AI_Suggestions.md: "Records feedback (thumbs-up/down/dismiss) and folds it
// into the relevant user's AI_Memory over time" — all three, not just
// thumbs-up — with thumbs-down as "a stronger negative signal than a
// dismiss." Reflected here as different starting confidence: a stronger
// signal is more resistant to decay and outranks a weaker one when ranked
// for the prompt (see decayedPriority in lib/core/ai/memory.ts).

import type { MemoryCategory } from "@/lib/core/ai/memory";

export type SuggestionFeedback = "thumbs_up" | "thumbs_down" | "dismissed";

export interface FeedbackMemoryWrite {
  fact: string;
  category?: MemoryCategory;
  confidence: number;
}

const MODULE_LABELS: Record<string, string> = {
  calendar: "calendar",
  tasks: "task",
  documents: "document",
};

export function feedbackToMemoryFact(
  feedback: SuggestionFeedback,
  module: string | null,
  content: string
): FeedbackMemoryWrite {
  const moduleLabel = (module && MODULE_LABELS[module]) || "AI";

  if (feedback === "thumbs_up") {
    return { fact: content, confidence: 1.0 };
  }
  if (feedback === "thumbs_down") {
    return {
      fact: `Found this ${moduleLabel} suggestion unhelpful: "${content}"`,
      category: "preferences",
      confidence: 0.7,
    };
  }
  return {
    fact: `Dismissed this ${moduleLabel} suggestion without acting on it: "${content}"`,
    category: "preferences",
    confidence: 0.4,
  };
}
