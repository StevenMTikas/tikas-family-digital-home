import { describe, it, expect } from "vitest";
import { canManageUser, hasPermission, type AuthUser } from "./index";

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
    },
    ...overrides,
  };
}

describe("canManageUser", () => {
  it("Super Admin can manage any user, unconditionally", () => {
    const superAdmin = makeUser({ id: "dad", role: "super_admin" });
    expect(canManageUser(superAdmin, "malachi")).toBe(true);
    expect(canManageUser(superAdmin, "vee")).toBe(true);
  });

  it("any user can manage their own account", () => {
    const basicUser = makeUser({ id: "malachi", role: "basic_user" });
    expect(canManageUser(basicUser, "malachi")).toBe(true);
  });

  it("a scoped Admin can manage the child they're scoped to", () => {
    const vee = makeUser({ id: "vee", role: "admin", adminScope: ["malachi"] });
    expect(canManageUser(vee, "malachi")).toBe(true);
  });

  it("a scoped Admin cannot manage a user outside their scope", () => {
    const vee = makeUser({ id: "vee", role: "admin", adminScope: ["malachi"] });
    expect(canManageUser(vee, "someone-else")).toBe(false);
  });

  it("a Basic User cannot manage another user's account", () => {
    const malachi = makeUser({ id: "malachi", role: "basic_user" });
    expect(canManageUser(malachi, "vee")).toBe(false);
  });
});

describe("hasPermission", () => {
  it("Super Admin has every permission, unconditionally, even if flags are off", () => {
    const superAdmin = makeUser({ role: "super_admin" });
    expect(hasPermission(superAdmin, "manageDevices")).toBe(true);
    expect(hasPermission(superAdmin, "approveSensitiveOutsideTransmission")).toBe(true);
  });

  it("a non-Super-Admin only has permissions explicitly granted to them", () => {
    const vee = makeUser({
      role: "admin",
      permissions: {
        approveOutsideCalls: false,
        manageDevices: true,
        manageParentalControls: true,
        viewChildActivityLogs: true,
        deleteContent: false,
        manageFolderPermissions: false,
        approveSensitiveOutsideTransmission: false,
      },
    });
    expect(hasPermission(vee, "manageDevices")).toBe(true);
    expect(hasPermission(vee, "deleteContent")).toBe(false);
  });

  it("a Basic User with no granted permissions has none", () => {
    const malachi = makeUser({ role: "basic_user" });
    expect(hasPermission(malachi, "manageDevices")).toBe(false);
  });
});
