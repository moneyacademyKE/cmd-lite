import { describe, it, expect } from "vitest";

function parseTasteList(raw: string) {
  const packages: { name: string; scope: "project" | "global" | "remote" }[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const scopeMatch = /^(\[?(project|global|remote)\]?\s+)?(.+?)(?:\s+\(([^)]+)\))?$/.exec(
      trimmed,
    );
    if (scopeMatch) {
      const scope = (scopeMatch[2] as "project" | "global" | "remote") ?? "project";
      packages.push({ name: scopeMatch[3].trim(), scope });
    }
  }
  return packages;
}

describe("parseTasteList", () => {
  it("parses package name with scope", () => {
    const raw = "project  cli";
    const result = parseTasteList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "cli", scope: "project" });
  });

  it("defaults scope to project when missing", () => {
    const raw = "cli";
    const result = parseTasteList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "cli", scope: "project" });
  });

  it("parses global scope", () => {
    const raw = "global  frontend";
    const result = parseTasteList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "frontend", scope: "global" });
  });

  it("parses remote scope", () => {
    const raw = "remote  ahmadawais/cli";
    const result = parseTasteList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "ahmadawais/cli", scope: "remote" });
  });

  it("parses multiple packages", () => {
    const raw = `project  cli
global  frontend
remote  owner/package`;
    const result = parseTasteList(raw);
    expect(result).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(parseTasteList("")).toEqual([]);
  });

  it("skips blank lines", () => {
    const raw = `

project  cli

`;
    const result = parseTasteList(raw);
    expect(result).toHaveLength(1);
  });
});
