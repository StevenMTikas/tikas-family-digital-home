import { describe, it, expect } from "vitest";
import { hoursSince } from "./scheduler";

describe("hoursSince", () => {
  it("returns 0 for the same instant", () => {
    const now = new Date("2026-07-25T12:00:00Z");
    expect(hoursSince(now.toISOString(), now)).toBe(0);
  });

  it("returns 24 for exactly one day earlier", () => {
    const now = new Date("2026-07-25T12:00:00Z");
    expect(hoursSince("2026-07-24T12:00:00Z", now)).toBe(24);
  });

  it("returns a fractional value for a partial hour", () => {
    const now = new Date("2026-07-25T12:30:00Z");
    expect(hoursSince("2026-07-25T12:00:00Z", now)).toBe(0.5);
  });
});
