import { runPrint } from "../cli/commands";
import type { CliResult, PermissionMode } from "../cli/types";
import { getActiveCwd, getEffectiveMaxTurns, getEffectiveModel, getEffectivePermissionMode } from "../config";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface LoopIterationResult {
  iteration: number;
  prompt: string;
  result: CliResult;
}

export interface LoopOptions {
  task: string;
  verify?: string;
  cwd?: string;
  maxIterations?: number;
  maxRetries?: number;
  delayMs?: number;
  model?: string;
  permissionMode?: PermissionMode;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  runner?: typeof runPrint;
}

export interface LoopResult {
  status: "completed" | "failed" | "cancelled" | "exhausted";
  iterations: LoopIterationResult[];
}

export interface LoopReportSummary {
  path: string;
  label: string;
}

function getLoopDir(): string {
  return path.join(os.homedir(), ".commandcode", "loops");
}

export function writeLoopReport(result: LoopResult, task: string, verify?: string): string {
  const dir = getLoopDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const reportPath = path.join(dir, `loop-${Date.now()}.json`);
  const payload = {
    task,
    verify,
    status: result.status,
    createdAt: new Date().toISOString(),
    iterations: result.iterations.map((entry) => ({
      iteration: entry.iteration,
      exitCode: entry.result.exitCode,
      stdout: entry.result.stdout,
      stderr: entry.result.stderr,
      prompt: entry.prompt,
    })),
  };
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
  return reportPath;
}

export function listLoopReports(): LoopReportSummary[] {
  const dir = getLoopDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .reverse()
    .map((entry) => ({
      path: path.join(dir, entry),
      label: entry.replace(/^loop-/, "").replace(/\.json$/, ""),
    }));
}

export function buildLoopPrompt(input: {
  task: string;
  verify?: string;
  iteration: number;
  maxIterations: number;
  previousOutput?: string;
}): string {
  const verify = input.verify?.trim()
    ? `Verification to run or satisfy: ${input.verify.trim()}`
    : "Verification: use the most relevant existing project checks and report what ran.";
  const previous = input.previousOutput?.trim()
    ? `\nPrevious iteration summary:\n${input.previousOutput.trim().slice(0, 4000)}\n`
    : "";

  return [
    `BOUNDED LOOP ITERATION ${input.iteration}/${input.maxIterations}`,
    `Task: ${input.task.trim()}`,
    verify,
    previous,
    "Do one bounded, reversible improvement. Re-read current state before editing. Preserve unrelated user work. Run or explain the verification. End your response with exactly one marker: LOOP_DONE if the task is complete, otherwise LOOP_CONTINUE with the next remaining action.",
  ].filter(Boolean).join("\n\n");
}

export async function runLoop(options: LoopOptions): Promise<LoopResult> {
  const cwd = options.cwd ?? getActiveCwd();
  const maxIterations = Math.max(1, options.maxIterations ?? 5);
  const maxRetries = Math.max(0, options.maxRetries ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 2000);
  const runner = options.runner ?? runPrint;
  const iterations: LoopIterationResult[] = [];
  let previousOutput = "";
  let failures = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (options.signal?.aborted) return { status: "cancelled", iterations };

    const prompt = buildLoopPrompt({
      task: options.task,
      verify: options.verify,
      iteration,
      maxIterations,
      previousOutput,
    });

    options.onProgress?.(`Loop iteration ${iteration}/${maxIterations} started.`);
    const result = await runner(prompt, {
      cwd,
      model: options.model ?? getEffectiveModel(),
      maxTurns: getEffectiveMaxTurns(),
      permissionMode: options.permissionMode ?? getEffectivePermissionMode(),
      signal: options.signal,
      timeoutMs: 10 * 60 * 1000,
    });

    iterations.push({ iteration, prompt, result });
    previousOutput = result.stdout || result.stderr;

    if (result.exitCode !== 0) {
      failures += 1;
      options.onProgress?.(`Loop iteration ${iteration} failed with exit ${result.exitCode}.`);
      if (failures >= maxRetries) return { status: "failed", iterations };
    } else {
      failures = 0;
    }

    if (/\bLOOP_DONE\b/i.test(result.stdout)) {
      options.onProgress?.(`Loop completed after ${iteration} iteration(s).`);
      return { status: "completed", iterations };
    }

    if (iteration < maxIterations && delayMs > 0) {
      await sleep(delayMs, options.signal);
    }
  }

  return { status: "exhausted", iterations };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
