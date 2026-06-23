import { describe, it, expect } from "vitest";
import {
  parseJsonLinesDefensive,
  formatJsonLines,
  filterJsonLines,
} from "../util/util";

// ---------- parseJsonLinesDefensive ----------

describe("parseJsonLinesDefensive", () => {
  it("parses valid JSON lines", () => {
    const input = '{"a": 1}\n{"b": 2}\n{"c": 3}';
    expect(parseJsonLinesDefensive(input)).toEqual([
      { a: 1 },
      { b: 2 },
      { c: 3 },
    ]);
  });

  it("skips empty lines", () => {
    const input = '{"a": 1}\n\n\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips whitespace-only lines", () => {
    const input = '{"a": 1}\n   \n\t\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips invalid JSON lines", () => {
    const input = '{"a": 1}\nnot json\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips arrays (not valid records)", () => {
    const input = '{"a": 1}\n[1, 2, 3]\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips primitives (not valid records)", () => {
    const input = '{"a": 1}\n"hello"\n42\ntrue\nnull\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles empty string", () => {
    expect(parseJsonLinesDefensive("")).toEqual([]);
  });

  it("handles only whitespace", () => {
    expect(parseJsonLinesDefensive("  \n \n")).toEqual([]);
  });

  it("handles trailing newline", () => {
    const input = '{"a": 1}\n{"b": 2}\n';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns objects with nested values", () => {
    const input = '{"a": {"b": [1, 2]}}\n{"c": true}';
    expect(parseJsonLinesDefensive(input)).toEqual([
      { a: { b: [1, 2] } },
      { c: true },
    ]);
  });

  it("all lines invalid returns empty array", () => {
    const input = "invalid\nnot json\n42";
    expect(parseJsonLinesDefensive(input)).toEqual([]);
  });
});

// ---------- formatJsonLines ----------

describe("formatJsonLines", () => {
  it("serializes an array of records to JSON Lines", () => {
    const records = [{ a: 1 }, { b: 2 }, { c: 3 }];
    const result = formatJsonLines(records);
    expect(result).toBe('{"a":1}\n{"b":2}\n{"c":3}');
  });

  it("serializes a single record", () => {
    expect(formatJsonLines([{ x: "y" }])).toBe('{"x":"y"}');
  });

  it("skips empty records", () => {
    const records = [{ a: 1 }, {}, { b: 2 }];
    expect(formatJsonLines(records)).toBe('{"a":1}\n{"b":2}');
  });

  it("skips non-object values in the array", () => {
    const records = [
      { a: 1 },
      null as unknown as Record<string, unknown>,
      "string" as unknown as Record<string, unknown>,
      42 as unknown as Record<string, unknown>,
      [1, 2] as unknown as Record<string, unknown>,
      { b: 2 },
    ];
    expect(formatJsonLines(records)).toBe('{"a":1}\n{"b":2}');
  });

  it("skips null in the array", () => {
    const records = [
      { a: 1 },
      null as unknown as Record<string, unknown>,
      { b: 2 },
    ];
    expect(formatJsonLines(records)).toBe('{"a":1}\n{"b":2}');
  });

  it("handles empty input array", () => {
    expect(formatJsonLines([])).toBe("");
  });

  it("handles array of only empty objects", () => {
    expect(formatJsonLines([{}, {}])).toBe("");
  });

  it("handles array of only non-object values", () => {
    const records = [
      null as unknown as Record<string, unknown>,
      "x" as unknown as Record<string, unknown>,
    ];
    expect(formatJsonLines(records)).toBe("");
  });

  it("preserves nested objects and arrays in values", () => {
    const records = [{ a: { b: [1, 2] } }, { c: true, d: null }];
    expect(formatJsonLines(records)).toBe(
      '{"a":{"b":[1,2]}}\n{"c":true,"d":null}',
    );
  });

  it("round-trips through parseJsonLinesDefensive", () => {
    const records = [{ a: 1 }, { b: [2, 3] }, { c: { d: "e" } }];
    const jsonl = formatJsonLines(records);
    const parsed = parseJsonLinesDefensive(jsonl);
    expect(parsed).toEqual(records);
  });
});

// ---------- filterJsonLines ----------

describe("filterJsonLines", () => {
  const input = '{"x": 1}\n{"x": 2}\n{"x": 3}\n{"x": 4}';

  it("filters records matching the predicate", () => {
    const result = filterJsonLines(input, (r) => (r.x as number) % 2 === 0);
    expect(result).toBe('{"x":2}\n{"x":4}');
  });

  it("returns empty string when no records match", () => {
    const result = filterJsonLines(input, () => false);
    expect(result).toBe("");
  });

  it("returns all records when predicate always true", () => {
    const result = filterJsonLines(input, () => true);
    expect(result).toBe('{"x":1}\n{"x":2}\n{"x":3}\n{"x":4}');
  });

  it("handles empty input string", () => {
    expect(filterJsonLines("", () => true)).toBe("");
  });

  it("handles input with only invalid lines", () => {
    expect(filterJsonLines("invalid\nnot json", () => true)).toBe("");
  });

  it("filters based on nested property", () => {
    const jsonl = '{"a": {"b": 1}}\n{"a": {"b": 2}}\n{"a": {"b": 3}}';
    const result = filterJsonLines(
      jsonl,
      (r) => (r.a as Record<string, unknown>).b === 2,
    );
    expect(result).toBe('{"a":{"b":2}}');
  });

  it("filters using a predicate that checks key existence", () => {
    const jsonl = '{"a": 1}\n{"b": 2}\n{"a": 3, "c": 4}';
    const result = filterJsonLines(jsonl, (r) => "a" in r);
    expect(result).toBe('{"a":1}\n{"a":3,"c":4}');
  });

  it("strips invalid lines before filtering", () => {
    const jsonl = '{"a": 1}\nbroken\n{"a": 2}';
    const result = filterJsonLines(jsonl, (r) => (r.a as number) > 1);
    expect(result).toBe('{"a":2}');
  });

  it("skips empty records after filtering (defensive output)", () => {
    const jsonl = '{"a": 1}\n{}';
    const result = filterJsonLines(jsonl, () => true);
    expect(result).toBe('{"a":1}');
  });

  it("round-trips through parse + filter + format", () => {
    const jsonl = '{"x": 1}\n{"x": 2}\n{"x": 3}';
    const parsed = parseJsonLinesDefensive(jsonl);
    const filtered = parsed.filter((r) => (r.x as number) !== 2);
    const result = formatJsonLines(filtered);
    expect(result).toBe('{"x":1}\n{"x":3}');
  });
});
