import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Readable, Writable } from "node:stream";
import * as vscode from "vscode";

// Mock vscode
vi.mock("vscode", () => {
  let configVal = "cmd";
  return {
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: "file" }),
    },
    workspace: {
      getConfiguration: () => ({
        get: (key: string, defaultValue: string) => {
          if (key === "cliPath") return configVal;
          return defaultValue;
        },
        update: (key: string, value: string) => {
          if (key === "cliPath") configVal = value;
        }
      })
    }
  };
});

// Mock https for download and version checks
vi.mock("node:https", () => {
  return {
    get: (url: string, callback: (res: unknown) => void) => {
      const responseStream = new Readable() as unknown as Readable & { statusCode: number; headers: Record<string, string> };
      responseStream.statusCode = 200;
      responseStream.headers = { "content-length": "100" };

      if (url.includes("registry.npmjs.org")) {
        // Mock registry version response
        responseStream.push(JSON.stringify({
          version: "0.40.0",
          dist: {
            tarball: "https://registry.npmjs.org/command-code/-/command-code-0.40.0.tgz"
          }
        }));
        responseStream.push(null);
      } else {
        // Mock tarball file download stream
        responseStream.push("mock tarball content");
        responseStream.push(null);
      }

      callback(responseStream);
      
      const reqStream = new Writable({
        write(_chunk, _encoding, cb) { cb(); }
      }) as unknown as Writable & { on: ReturnType<typeof vi.fn> };
      // Add error listener support
      reqStream.on = vi.fn().mockImplementation((_event, _listener) => {
        return reqStream;
      });
      return reqStream;
    }
  };
});

// Mock child_process exec to simulate tar extraction and CLI version execution
vi.mock("node:child_process", () => {
  return {
    exec: (cmd: string, options: unknown, callback?: unknown) => {
      const cb = (typeof options === "function" ? options : callback) as (err: Error | null, stdout: string, stderr: string) => void;
      
      if (cmd.includes("tar")) {
        const destMatch = /-C\s+"([^"]+)"/.exec(cmd);
        if (destMatch) {
          const dest = destMatch[1];
          fs.mkdirSync(path.join(dest, "dist"), { recursive: true });
          fs.writeFileSync(path.join(dest, "dist", "index.mjs"), "console.log('latest version')");
        }
      }
      
      cb(null, "0.40.0\n", "");
      return {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
    },
    spawn: vi.fn(),
  };
});

import {
  setLocalCliPathOverride,
  resolveCliPath,
  getLocalCliPath,
  detectLocalCli,
  installOrUpdateLocalCli,
  checkCliVersion,
} from "../cli/resolve";

describe("Local CLI resolution & auto-update", () => {
  const tempStorageDir = path.join(os.tmpdir(), `vscode-cmd-storage-${Date.now()}`);
  const mockStorageUri = { fsPath: tempStorageDir } as unknown as vscode.Uri;

  beforeEach(() => {
    fs.mkdirSync(tempStorageDir, { recursive: true });
    setLocalCliPathOverride(undefined);
  });

  afterEach(() => {
    fs.rmSync(tempStorageDir, { recursive: true, force: true });
  });

  it("resolves default path initially", () => {
    expect(resolveCliPath()).toBe("cmd");
  });

  it("detects no local CLI on empty directory", () => {
    expect(getLocalCliPath(mockStorageUri)).toBe(path.join(tempStorageDir, "cli", "dist", "index.mjs"));
    const detected = detectLocalCli(mockStorageUri);
    expect(detected).toBeUndefined();
  });

  it("detects local CLI when index.mjs exists", () => {
    const localDir = path.join(tempStorageDir, "cli", "dist");
    fs.mkdirSync(localDir, { recursive: true });
    const localFile = path.join(localDir, "index.mjs");
    fs.writeFileSync(localFile, "console.log('mock CLI')");

    const detected = detectLocalCli(mockStorageUri);
    expect(detected).toBe(localFile);
  });

  it("respects localCliPathOverride if set and config is default", () => {
    setLocalCliPathOverride("/mock/local/path/index.mjs");
    expect(resolveCliPath()).toBe("/mock/local/path/index.mjs");
  });

  it("runs version check for local CLI using node", async () => {
    const result = await checkCliVersion("/mock/local/path/index.mjs");
    expect(result.compatible).toBe(true);
    expect(result.version).toBe("0.40.0");
  });

  it("executes local update download and atomic swap", async () => {
    const beforeSwap = detectLocalCli(mockStorageUri);
    expect(beforeSwap).toBeUndefined();

    const { version } = await installOrUpdateLocalCli(mockStorageUri);
    expect(version).toBe("0.40.0");

    const afterSwap = detectLocalCli(mockStorageUri);
    expect(afterSwap).toBe(path.join(tempStorageDir, "cli", "dist", "index.mjs"));
    expect(fs.existsSync(afterSwap!)).toBe(true);
  });
});
