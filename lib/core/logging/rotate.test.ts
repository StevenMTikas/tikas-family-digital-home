import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { rotateLogIfLarge } from "./rotate";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-test-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("rotateLogIfLarge", () => {
  it("leaves a small file alone", () => {
    const f = path.join(dir, "a.log");
    fs.writeFileSync(f, "small");
    expect(rotateLogIfLarge(f, { maxBytes: 100, keep: 3 })).toBe(false);
    expect(fs.readFileSync(f, "utf8")).toBe("small");
    expect(fs.existsSync(`${f}.1`)).toBe(false);
  });

  it("does nothing for a file that doesn't exist yet", () => {
    expect(rotateLogIfLarge(path.join(dir, "missing.log"), { maxBytes: 1, keep: 3 })).toBe(false);
  });

  it("copies an oversized file to .1 and empties the live file in place", () => {
    const f = path.join(dir, "a.log");
    fs.writeFileSync(f, "x".repeat(50));
    expect(rotateLogIfLarge(f, { maxBytes: 10, keep: 3 })).toBe(true);
    expect(fs.readFileSync(f, "utf8")).toBe("");
    expect(fs.readFileSync(`${f}.1`, "utf8")).toBe("x".repeat(50));
  });

  it("works while another handle holds the file open for appending (as a shell redirect would)", () => {
    const f = path.join(dir, "a.log");
    const fd = fs.openSync(f, "a");
    fs.writeSync(fd, "y".repeat(50));
    expect(rotateLogIfLarge(f, { maxBytes: 10, keep: 3 })).toBe(true);
    fs.writeSync(fd, "after");
    fs.closeSync(fd);
    expect(fs.readFileSync(f, "utf8")).toBe("after");
    expect(fs.readFileSync(`${f}.1`, "utf8")).toBe("y".repeat(50));
  });

  it("shifts older copies and drops the oldest beyond `keep`", () => {
    const f = path.join(dir, "a.log");
    for (const gen of ["first", "second", "third", "fourth"]) {
      fs.writeFileSync(f, gen.repeat(10));
      rotateLogIfLarge(f, { maxBytes: 5, keep: 2 });
    }
    expect(fs.readFileSync(`${f}.1`, "utf8")).toBe("fourth".repeat(10));
    expect(fs.readFileSync(`${f}.2`, "utf8")).toBe("third".repeat(10));
    expect(fs.existsSync(`${f}.3`)).toBe(false);
  });
});
