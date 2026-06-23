import { describe, it, expect } from "vitest";
import { truncateString, sanitizePath } from "../src/util";

describe("truncateString in sandbox", () => {
  it("returns the string unchanged when shorter than maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when equal to maxLength", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("handles strings with special characters", () => {
    expect(truncateString("héllo wörld", 5)).toBe("héllo...");
  });

  it("truncates multi-code-point unicode and emoji grapheme clusters correctly", () => {
    expect(truncateString("Café 🎉 World!", 6)).toBe("Café 🎉...");
    expect(truncateString("👨‍👩‍👧", 1)).toBe("👨‍👩‍👧");
    expect(truncateString("👨‍👩‍👧 and more", 1)).toBe("👨‍👩‍👧...");
  });

  it("throws for negative maxLength", () => {
    expect(() => truncateString("hello", -1)).toThrow("maxLength must be non-negative");
  });

  it("handles empty string", () => {
    expect(truncateString("", 5)).toBe("");
  });

  it("handles maxLength of 0", () => {
    expect(truncateString("hello", 0)).toBe("...");
  });

  it("handles very long strings", () => {
    const long = "a".repeat(1000);
    expect(truncateString(long, 10)).toBe("a".repeat(10) + "...");
  });

  it("handles single-character maxLength", () => {
    expect(truncateString("ab", 1)).toBe("a...");
  });

  it("handles multi-line strings with newlines and CRLF boundaries", () => {
    // 3 lines: "line1\nline2\r\nline3"
    // Graphemes are: l, i, n, e, 1, \n, l, i, n, e, 2, \r\n, l, i, n, e, 3
    // Total graphemes: 5 + 1 + 5 + 1 + 5 = 17
    const str = "line1\nline2\r\nline3";
    expect(truncateString(str, 5)).toBe("line1...");
    expect(truncateString(str, 6)).toBe("line1\n...");
    expect(truncateString(str, 11)).toBe("line1\nline2...");
    expect(truncateString(str, 12)).toBe("line1\nline2\r\n...");
    expect(truncateString(str, 17)).toBe("line1\nline2\r\nline3");
  });
});

describe("sanitizePath in sandbox", () => {
  it("replaces duplicate path separators with a single forward slash", () => {
    expect(sanitizePath("foo//bar")).toBe("foo/bar");
    expect(sanitizePath("foo///bar////baz")).toBe("foo/bar/baz");
  });

  it("handles both Windows backslashes and POSIX forward slashes", () => {
    expect(sanitizePath("foo\\bar")).toBe("foo/bar");
    expect(sanitizePath("foo\\\\bar\\\\\\baz")).toBe("foo/bar/baz");
    expect(sanitizePath("foo\\/bar/\\baz")).toBe("foo/bar/baz");
  });

  it("trims trailing slashes except for root paths", () => {
    expect(sanitizePath("foo/bar/")).toBe("foo/bar");
    expect(sanitizePath("foo/bar\\\\")).toBe("foo/bar");
    expect(sanitizePath("/")).toBe("/");
    expect(sanitizePath("///")).toBe("/");
    expect(sanitizePath("C:/")).toBe("C:/");
    expect(sanitizePath("C:\\")).toBe("C:/");
    expect(sanitizePath("d:\\\\")).toBe("d:/");
  });

  it("handles empty and relative paths", () => {
    expect(sanitizePath("")).toBe("");
    expect(sanitizePath(".")).toBe(".");
    expect(sanitizePath("./foo/")).toBe("./foo");
  });
});

