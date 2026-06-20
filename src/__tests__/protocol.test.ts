import { describe, it, expect } from "vitest";
import { isIpcRequest } from "../context/protocol";

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

  describe("isIpcRequest validation guard", () => {
    it("returns true for a fully valid IpcRequest", () => {
      const valid = {
        type: "request",
        id: "req-1",
        payload: { action: "getContext" }
      };
      expect(isIpcRequest(valid)).toBe(true);
    });

    it("returns true for request with filePaths array of strings", () => {
      const valid = {
        type: "request",
        id: "req-2",
        payload: { action: "getDiagnostics", filePaths: ["src/a.ts", "src/b.ts"] }
      };
      expect(isIpcRequest(valid)).toBe(true);
    });

    it("returns false for non-objects or null", () => {
      expect(isIpcRequest(null)).toBe(false);
      expect(isIpcRequest("string")).toBe(false);
      expect(isIpcRequest(123)).toBe(false);
    });

    it("returns false if type is not request", () => {
      const invalid = {
        type: "response",
        id: "req-1",
        payload: { action: "getContext" }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns false if id is missing or not a string", () => {
      const invalid = {
        type: "request",
        payload: { action: "getContext" }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns false if payload is missing or not an object", () => {
      const invalid = {
        type: "request",
        id: "req-1"
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns false if action in payload is missing or not a string", () => {
      const invalid = {
        type: "request",
        id: "req-1",
        payload: { filePaths: [] }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns false if filePaths is not an array of strings", () => {
      const invalid = {
        type: "request",
        id: "req-1",
        payload: { action: "getContext", filePaths: [123] }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns false if filePath is not a string", () => {
      const invalid = {
        type: "request",
        id: "req-1",
        payload: { action: "getContext", filePath: 123 }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns false if openFile action has missing filePath", () => {
      const invalid = {
        type: "request",
        id: "req-1",
        payload: { action: "openFile" }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns true for openFile action with valid filePath", () => {
      const valid = {
        type: "request",
        id: "req-1",
        payload: { action: "openFile", filePath: "src/main.ts" }
      };
      expect(isIpcRequest(valid)).toBe(true);
    });

    it("returns false for applyEdit action with invalid editPayload", () => {
      const invalid = {
        type: "request",
        id: "req-1",
        payload: { action: "applyEdit", editPayload: "invalid" }
      };
      expect(isIpcRequest(invalid)).toBe(false);
    });

    it("returns true for applyEdit action with valid editPayload", () => {
      const valid = {
        type: "request",
        id: "req-1",
        payload: {
          action: "applyEdit",
          editPayload: {
            "file:///src/main.ts": [
              {
                range: [
                  { line: 0, character: 0 },
                  { line: 1, character: 0 }
                ],
                newText: "hello"
              }
            ]
          }
        }
      };
      expect(isIpcRequest(valid)).toBe(true);
    });
  });
});

