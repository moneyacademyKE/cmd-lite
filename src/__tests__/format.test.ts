import { describe, it, expect } from "vitest";
import { stripAnsi, markdownFromCli } from "../chat/format";

describe("stripAnsi", () => {
  it("removes ANSI color codes", () => {
    expect(stripAnsi("\x1b[32mhello\x1b[0m")).toBe("hello");
  });

  it("passes through plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("removes multiple ANSI codes in a line", () => {
    expect(
      stripAnsi("\x1b[1m\x1b[31mERROR\x1b[0m\x1b[0m: something failed"),
    ).toBe("ERROR: something failed");
  });

  it("removes ANSI codes with semicolons", () => {
    expect(stripAnsi("\x1b[38;5;208mwarning\x1b[0m")).toBe("warning");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("removes OSC hyperlink sequences", () => {
    expect(
      stripAnsi("\x1b]8;;https://example.com\x1b\\link text\x1b]8;;\x1b\\"),
    ).toBe("link text");
  });

  it("removes OSC hyperlinks with BEL terminator", () => {
    expect(
      stripAnsi("\x1b]8;;https://x.com\x07link\x1b]8;;\x07"),
    ).toBe("link");
  });
});

describe("markdownFromCli", () => {
  it("strips ANSI from input", () => {
    expect(markdownFromCli("\x1b[32mok\x1b[0m")).toBe("ok");
  });

  it("passes clean text unchanged", () => {
    expect(markdownFromCli("## Plan\n- Step 1")).toBe("## Plan\n- Step 1");
  });
});
