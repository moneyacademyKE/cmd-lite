import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => {
  return {
    workspace: {
      getConfiguration: () => ({ get: vi.fn() })
    }
  };
});

import { buildSessionArgs } from "../cli/commands";

function parseModelList(raw: string) {
  const models: { id: string; label?: string; provider?: string }[] = [];
  const lines = raw.split(/\r?\n/);
  let currentProvider: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[A-Za-z][\w &/.-]{0,40}$/.test(trimmed) && !/[/]/.test(trimmed)) {
      const knownHeaders = [
        "Open Source",
        "Anthropic",
        "OpenAI",
        "Frontier",
        "Open",
        "Yours",
        "Available models",
      ];
      if (knownHeaders.some((h) => trimmed.toLowerCase().startsWith(h.toLowerCase()))) {
        currentProvider = trimmed;
        continue;
      }
    }
    if (/^Available\s+models/i.test(trimmed)) continue;
    const idMatch = /^([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|[A-Za-z][A-Za-z0-9._-]*)\s+(.+)$/.exec(
      trimmed,
    );
    if (idMatch) {
      models.push({ id: idMatch[1].trim(), label: idMatch[2].trim(), provider: currentProvider });
      continue;
    }
    const dashMatch = /^[-*]\s+(\S+)\s+(.+)$/.exec(trimmed);
    if (dashMatch) {
      models.push({ id: dashMatch[1].trim(), label: dashMatch[2].trim(), provider: currentProvider });
      continue;
    }
    const firstToken = trimmed.split(/\s+/)[0];
    if (/^[A-Za-z0-9._/-]+$/.test(firstToken)) {
      models.push({ id: firstToken, provider: currentProvider });
    }
  }
  return models;
}

describe("parseModelList", () => {
  it("parses model entries with id and label", () => {
    const raw = "claude-opus-4.8 Claude Opus 4.8 (Anthropic)";
    const result = parseModelList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "claude-opus-4.8", label: "Claude Opus 4.8 (Anthropic)" });
  });

  it("tracks provider section headers", () => {
    const raw = `Anthropic
claude-opus-4.8 Claude Opus 4.8
claude-sonnet-4.8 Claude Sonnet 4.8`;
    const result = parseModelList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe("Anthropic");
    expect(result[1].provider).toBe("Anthropic");
  });

  it("parses dash-list entries", () => {
    const raw = "- claude-opus-4.8 Claude Opus 4.8";
    const result = parseModelList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "claude-opus-4.8", label: "Claude Opus 4.8" });
  });

  it("falls back to first token when no label", () => {
    const raw = "claude-opus-4.8";
    const result = parseModelList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "claude-opus-4.8", provider: undefined });
  });

  it("skips 'Available models' header line", () => {
    const raw = `Available models
claude-opus-4.8 Claude Opus 4.8`;
    const result = parseModelList(raw);
    expect(result).toHaveLength(1);
  });

  it("skips empty lines", () => {
    const raw = `

claude-opus-4.8 Claude Opus 4.8

`;
    const result = parseModelList(raw);
    expect(result).toHaveLength(1);
  });

  it("parses slash-separated model IDs", () => {
    const raw = "anthropic/claude-opus-4.8 Claude Opus 4.8";
    const result = parseModelList(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("anthropic/claude-opus-4.8");
  });

  it("returns empty array for empty input", () => {
    expect(parseModelList("")).toEqual([]);
  });
});

describe("buildSessionArgs", () => {

  it("correctly maps option flags into CLI arguments", () => {
    const args = buildSessionArgs({
      continueLast: true,
      resume: "test-session",
      plan: true,
      autoAccept: false,
      yolo: false,
      model: "claude-3-opus",
      permissionMode: "plan",
    });
    expect(args).toContain("-c");
    expect(args).toContain("-r");
    expect(args).toContain("test-session");
    expect(args).toContain("--plan");
    expect(args).toContain("-m");
    expect(args).toContain("claude-3-opus");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("plan");
  });
});
