import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { writeFileSync, chmodSync, unlinkSync, existsSync, accessSync, constants } from "node:fs";

describe("validateCliPath logic", () => {
  function validateCliPath(cliPath: string): { valid: boolean; message?: string } {
    if (cliPath === "cmd" || cliPath === "command-code") {
      return { valid: true };
    }
    if (existsSync(cliPath)) {
      try {
        accessSync(cliPath, constants.X_OK);
        return { valid: true };
      } catch {
        return {
          valid: false,
          message: `CLI path "${cliPath}" is not executable.`,
        };
      }
    }
    return {
      valid: false,
      message: `CLI binary not found at "${cliPath}".`,
    };
  }

  it("accepts 'cmd' as valid", () => {
    expect(validateCliPath("cmd")).toEqual({ valid: true });
  });

  it("accepts 'command-code' as valid", () => {
    expect(validateCliPath("command-code")).toEqual({ valid: true });
  });

  it("rejects non-existent path", () => {
    const result = validateCliPath("/nonexistent/path/to/cmd");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("rejects non-executable file", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-test-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho hi");
    try {
      chmodSync(tmpFile, 0o644); // not executable
      const result = validateCliPath(tmpFile);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("not executable");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("accepts executable file", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-test-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho hi");
    try {
      chmodSync(tmpFile, 0o755);
      const result = validateCliPath(tmpFile);
      expect(result.valid).toBe(true);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});
