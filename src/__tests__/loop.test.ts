import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { buildLoopPrompt, listLoopReports, runLoop, writeLoopReport } from "../agents/loop";
import type { CliResult } from "../cli/types";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    workspaceFolders: [{ uri: { fsPath: "/tmp/workspace" } }],
  },
  window: { activeTextEditor: undefined },
}));

function result(stdout: string, exitCode = 0): CliResult {
  return {
    stdout,
    stderr: "",
    exitCode,
    durationMs: 1,
    command: "cmd",
    args: [],
    timedOut: false,
  };
}

describe("bounded agent loop", () => {
  it("builds a bounded prompt with stop markers", () => {
    const prompt = buildLoopPrompt({
      task: "Fix tests",
      verify: "pnpm test",
      iteration: 2,
      maxIterations: 5,
      previousOutput: "Still failing",
    });

    expect(prompt).toContain("BOUNDED LOOP ITERATION 2/5");
    expect(prompt).toContain("Task: Fix tests");
    expect(prompt).toContain("Verification to run or satisfy: pnpm test");
    expect(prompt).toContain("LOOP_DONE");
    expect(prompt).toContain("LOOP_CONTINUE");
  });

  it("stops when the agent reports LOOP_DONE", async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce(result("first pass LOOP_CONTINUE"))
      .mockResolvedValueOnce(result("done LOOP_DONE"));

    const loopResult = await runLoop({
      task: "Fix tests",
      verify: "pnpm test",
      maxIterations: 5,
      delayMs: 0,
      runner,
    });

    expect(loopResult.status).toBe("completed");
    expect(loopResult.iterations).toHaveLength(2);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("fails after repeated command failures", async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce(result("", 1))
      .mockResolvedValueOnce(result("", 1));

    const loopResult = await runLoop({
      task: "Fix tests",
      maxIterations: 5,
      maxRetries: 2,
      delayMs: 0,
      runner,
    });

    expect(loopResult.status).toBe("failed");
    expect(loopResult.iterations).toHaveLength(2);
  });

  it("writes a durable loop report", () => {
    const reportPath = writeLoopReport({
      status: "completed",
      iterations: [{ iteration: 1, prompt: "p", result: result("LOOP_DONE") }],
    }, "Fix tests", "pnpm test");

    const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect(parsed.task).toBe("Fix tests");
    expect(parsed.verify).toBe("pnpm test");
    expect(parsed.status).toBe("completed");
    expect(parsed.iterations[0].stdout).toContain("LOOP_DONE");
    expect(listLoopReports().some((entry) => entry.path === reportPath)).toBe(true);
    fs.unlinkSync(reportPath);
  });
});
