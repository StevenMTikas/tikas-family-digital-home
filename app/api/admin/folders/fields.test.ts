import { describe, it, expect } from "vitest";
import { parsePermissionsPatch, parseInheritsPermissionsPatch } from "./fields";

describe("parsePermissionsPatch", () => {
  it("returns undefined when the body has no permissions key at all", () => {
    expect(parsePermissionsPatch({ inheritsPermissions: true })).toBeUndefined();
    expect(parsePermissionsPatch(null)).toBeUndefined();
  });

  it("returns null to explicitly clear permissions", () => {
    expect(parsePermissionsPatch({ permissions: null })).toBeNull();
  });

  it("parses valid user and role grants", () => {
    expect(
      parsePermissionsPatch({
        permissions: { users: { dad: "delete", malachi: "view" }, roles: { admin: "edit" } },
      })
    ).toEqual({
      users: { dad: "delete", malachi: "view" },
      roles: { admin: "edit" },
    });
  });

  it("drops an invalid access level rather than letting it through", () => {
    expect(parsePermissionsPatch({ permissions: { users: { dad: "own-everything" } } })).toEqual({
      users: {},
    });
  });

  it("drops an invalid role name rather than letting it through", () => {
    expect(parsePermissionsPatch({ permissions: { roles: { superuser: "edit" } } })).toEqual({
      roles: {},
    });
  });

  it("accepts external_viewer as a valid role-level grant", () => {
    expect(parsePermissionsPatch({ permissions: { roles: { external_viewer: "view" } } })).toEqual({
      roles: { external_viewer: "view" },
    });
  });

  it("treats a malformed permissions value as absent", () => {
    expect(parsePermissionsPatch({ permissions: "not-an-object" })).toBeUndefined();
  });
});

describe("parseInheritsPermissionsPatch", () => {
  it("extracts a boolean inheritsPermissions field", () => {
    expect(parseInheritsPermissionsPatch({ inheritsPermissions: true })).toBe(true);
    expect(parseInheritsPermissionsPatch({ inheritsPermissions: false })).toBe(false);
  });

  it("returns undefined when absent or the wrong type", () => {
    expect(parseInheritsPermissionsPatch({})).toBeUndefined();
    expect(parseInheritsPermissionsPatch({ inheritsPermissions: "true" })).toBeUndefined();
  });
});
