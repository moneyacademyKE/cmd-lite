import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock vscode
let mockLocalRegistryPath: string | undefined = undefined;
vi.mock("vscode", () => {
  return {
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: "file" }),
    },
    workspace: {
      workspaceFolders: [
        { uri: { fsPath: "/mock/workspace/root" } }
      ],
      getConfiguration: () => ({
        get: (key: string, defaultValue: string) => {
          if (key === "localRegistryPath") return mockLocalRegistryPath;
          if (key === "cliPath") return "cmd";
          return defaultValue;
        }
      })
    }
  };
});

// Mock child_process exec to track runs and simulate extraction
let execCommandHistory: string[] = [];
let mockPackageJsonContent: string | undefined = undefined;
vi.mock("node:child_process", () => {
  return {
    exec: (cmd: string, options: unknown, callback?: unknown) => {
      execCommandHistory.push(cmd);
      const cb = (typeof options === "function" ? options : callback) as (err: Error | null, stdout: string, stderr: string) => void;
      if (cmd.includes("tar")) {
        const destMatch = /-C\s+"([^"]+)"/.exec(cmd);
        if (destMatch) {
          const dest = destMatch[1];
          fs.mkdirSync(path.join(dest, "dist"), { recursive: true });
          fs.writeFileSync(path.join(dest, "dist", "index.mjs"), "console.log('mock index.mjs')");
          if (mockPackageJsonContent) {
            fs.writeFileSync(path.join(dest, "package.json"), mockPackageJsonContent);
          }
        }
      }
      cb(null, "0.45.0\n", "");
      return {
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
    }
  };
});

import {
  fetchLatestTarballInfo,
  downloadFile,
  installOrUpdateLocalCli,
  getLocalRegistryConfig,
} from "../cli/resolve";

import * as vscode from "vscode";

describe("Local CLI registry override updates", () => {
  const tempDir = path.join(os.tmpdir(), `vscode-cmd-local-registry-${Date.now()}`);
  const tempStorageDir = path.join(os.tmpdir(), `vscode-cmd-storage-${Date.now()}`);
  const mockStorageUri = { fsPath: tempStorageDir } as unknown as vscode.Uri;

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(tempStorageDir, { recursive: true });
    mockLocalRegistryPath = tempDir;
    execCommandHistory = [];
    mockPackageJsonContent = undefined;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tempStorageDir, { recursive: true, force: true });
    mockLocalRegistryPath = undefined;
    mockPackageJsonContent = undefined;
  });

  it("fails to fetch info if package.json is missing in localRegistryPath", async () => {
    await expect(fetchLatestTarballInfo()).rejects.toThrow("no package.json was found");
  });

  it("resolves version and tarball path if package.json exists", async () => {
    const pkgJson = { version: "0.45.0" };
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkgJson));

    const info = await fetchLatestTarballInfo();
    expect(info.version).toBe("0.45.0");
    expect(info.tarball).toBe(path.join(tempDir, "command-code-0.45.0.tgz"));
  });

  it("fails to download if local tarball is missing", async () => {
    const infoTarball = path.join(tempDir, "command-code-0.45.0.tgz");
    await expect(downloadFile(infoTarball, path.join(tempStorageDir, "temp.tgz"))).rejects.toThrow("Local tarball not found");
  });

  it("interpolates ${workspaceFolder} template in local registry path config", () => {
    mockLocalRegistryPath = "${workspaceFolder}/my-local-reg";
    const resolvedPath = getLocalRegistryConfig();
    expect(resolvedPath).toBe(path.resolve("/mock/workspace/root/my-local-reg"));
  });

  it("skips pnpm install if dependencies list is missing or empty", async () => {
    // Write package.json with no dependencies
    const pkgJson = { version: "0.45.0" };
    mockPackageJsonContent = JSON.stringify(pkgJson);
    fs.writeFileSync(path.join(tempDir, "package.json"), mockPackageJsonContent);

    const tarballPath = path.join(tempDir, "command-code-0.45.0.tgz");
    fs.writeFileSync(tarballPath, "fake tarball data");

    const result = await installOrUpdateLocalCli(mockStorageUri);
    expect(result.version).toBe("0.45.0");

    // Verify pnpm install was NOT run
    const ranPnpm = execCommandHistory.some(cmd => cmd.includes("pnpm install"));
    expect(ranPnpm).toBe(false);
  });

  it("runs pnpm install if dependencies list is non-empty", async () => {
    // Write package.json with dependencies
    const pkgJson = { 
      version: "0.45.0",
      dependencies: { "some-pkg": "^1.0.0" }
    };
    mockPackageJsonContent = JSON.stringify(pkgJson);
    fs.writeFileSync(path.join(tempDir, "package.json"), mockPackageJsonContent);

    const tarballPath = path.join(tempDir, "command-code-0.45.0.tgz");
    fs.writeFileSync(tarballPath, "fake tarball data");

    const result = await installOrUpdateLocalCli(mockStorageUri);
    expect(result.version).toBe("0.45.0");

    // Verify pnpm install WAS run
    const ranPnpm = execCommandHistory.some(cmd => cmd.includes("pnpm install"));
    expect(ranPnpm).toBe(true);
  });
});
