import { describe, it, expect } from "vitest";
import { canReadBoard, canPostToBoard, canEditBoardPost, canDeleteBoardPost } from "./access";
import type { AuthUser } from "@/lib/core/permissions";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    role: "basic_user",
    adminScope: [],
    permissions: {
      approveOutsideCalls: false,
      manageDevices: false,
      manageParentalControls: false,
      viewChildActivityLogs: false,
      deleteContent: false,
      manageFolderPermissions: false,
      approveSensitiveOutsideTransmission: false,
      viewFamilyBoard: false,
    },
    ...overrides,
  };
}

describe("canReadBoard", () => {
  it("any internal role reads unconditionally", () => {
    expect(canReadBoard(makeUser({ role: "basic_user" }))).toBe(true);
    expect(canReadBoard(makeUser({ role: "admin" }))).toBe(true);
    expect(canReadBoard(makeUser({ role: "super_admin" }))).toBe(true);
  });

  it("an external_viewer without the grant cannot read", () => {
    expect(canReadBoard(makeUser({ role: "external_viewer" }))).toBe(false);
  });

  it("an external_viewer with the grant can read", () => {
    const grandma = makeUser({
      role: "external_viewer",
      permissions: { ...makeUser().permissions, viewFamilyBoard: true },
    });
    expect(canReadBoard(grandma)).toBe(true);
  });
});

describe("canPostToBoard", () => {
  it("Admin and Super Admin can post", () => {
    expect(canPostToBoard(makeUser({ role: "admin" }))).toBe(true);
    expect(canPostToBoard(makeUser({ role: "super_admin" }))).toBe(true);
  });

  it("a Basic User cannot post", () => {
    expect(canPostToBoard(makeUser({ role: "basic_user" }))).toBe(false);
  });

  it("an external_viewer cannot post, even with the read grant", () => {
    const grandma = makeUser({
      role: "external_viewer",
      permissions: { ...makeUser().permissions, viewFamilyBoard: true },
    });
    expect(canPostToBoard(grandma)).toBe(false);
  });
});

describe("canEditBoardPost", () => {
  it("only the poster can edit — not even the Super Admin", () => {
    const poster = makeUser({ id: "vee", role: "admin" });
    const superAdmin = makeUser({ id: "dad", role: "super_admin" });
    expect(canEditBoardPost(poster, "vee")).toBe(true);
    expect(canEditBoardPost(superAdmin, "vee")).toBe(false);
  });
});

describe("canDeleteBoardPost", () => {
  it("the poster can delete their own post", () => {
    const poster = makeUser({ id: "vee", role: "admin" });
    expect(canDeleteBoardPost(poster, "vee")).toBe(true);
  });

  it("the Super Admin can delete anyone's post as a moderation backstop", () => {
    const superAdmin = makeUser({ id: "dad", role: "super_admin" });
    expect(canDeleteBoardPost(superAdmin, "vee")).toBe(true);
  });

  it("a non-poster, non-Super-Admin cannot delete", () => {
    const malachi = makeUser({ id: "malachi", role: "basic_user" });
    expect(canDeleteBoardPost(malachi, "vee")).toBe(false);
  });
});
