import { describe, it, expect } from "vitest";
import { pickSelfEditableFields } from "./route";

describe("pickSelfEditableFields", () => {
  it("maps the self-editable fields to their column names", () => {
    expect(
      pickSelfEditableFields({
        fullName: "Dad",
        photo: "photo.jpg",
        contactInfo: "dad@example.com",
        hobbiesInterests: ["Woodworking", "Chess"],
      })
    ).toEqual({
      full_name: "Dad",
      photo: "photo.jpg",
      contact_info: "dad@example.com",
      hobbies_interests: JSON.stringify(["Woodworking", "Chess"]),
    });
  });

  it("ignores admin-only fields per Users.md, even if present in the body", () => {
    const patch = pickSelfEditableFields({
      fullName: "Dad",
      role: "super_admin",
      username: "hacked",
      approveOutsideCalls: true,
      manageDevices: true,
    });
    expect(patch).toEqual({ full_name: "Dad" });
  });

  it("ignores a blank full name rather than clearing it", () => {
    expect(pickSelfEditableFields({ fullName: "   " })).toEqual({});
  });

  it("allows explicitly clearing photo/contactInfo with null", () => {
    expect(pickSelfEditableFields({ photo: null, contactInfo: null })).toEqual({
      photo: null,
      contact_info: null,
    });
  });

  it("returns an empty patch for a non-object body", () => {
    expect(pickSelfEditableFields(null)).toEqual({});
    expect(pickSelfEditableFields("not an object")).toEqual({});
  });
});
