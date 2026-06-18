import { describe, it, expect } from "vitest";

interface IpcRequest {
  type: "request";
  id: string;
  payload: { action: string; filePaths?: string[] };
}

function parseMessage(messageStr: string): IpcRequest | null {
  try {
    return JSON.parse(messageStr) as IpcRequest;
  } catch {
    return null;
  }
}

function serializeMessage(message: unknown): string {
  return JSON.stringify(message) + "\n";
}

describe("IPC protocol", () => {
  describe("parseMessage", () => {
    it("parses a valid request", () => {
      const msg = JSON.stringify({
        type: "request",
        id: "abc-123",
        payload: { action: "getContext" },
      });
      const result = parseMessage(msg);
      expect(result).toEqual({
        type: "request",
        id: "abc-123",
        payload: { action: "getContext" },
      });
    });

    it("returns null for invalid JSON", () => {
      expect(parseMessage("not json")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseMessage("")).toBeNull();
    });
  });

  describe("serializeMessage", () => {
    it("appends newline to JSON message", () => {
      const msg = { type: "response", id: "abc", payload: { ok: true } };
      const result = serializeMessage(msg);
      expect(result).toBe(JSON.stringify(msg) + "\n");
    });
  });
});
