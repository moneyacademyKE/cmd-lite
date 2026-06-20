import { runCli } from "../cli/spawn";
import type { CliResult } from "../cli/types";
import { getActiveCwd, getEffectiveModel, getEffectiveMaxTurns, getEffectivePermissionMode } from "../config";
import { stripAnsi } from "../chat/format";

export interface AgentTask {
  label: string;
  prompt: string;
  model?: string;
  planMode?: boolean;
}

export interface AgentResult {
  label: string;
  prompt: string;
  result: CliResult;
}

export interface OrchestraOptions {
  cwd?: string;
  defaultModel?: string;
  maxTurns?: number;
  /** Maximum number of agents to run concurrently (default: 3). Set to 0 for unlimited. */
  maxConcurrency?: number;
  permissionMode?: "standard" | "plan" | "auto-accept";
  planMode?: boolean;
  onAgentProgress?: (label: string, chunk: string) => void;
  onAgentDone?: (label: string) => void;
  signal?: AbortSignal;
}

/**
 * Run a list of async functions with a concurrency cap.
 * When `maxConcurrency` is 0 or exceeds the task count, all tasks run in parallel.
 */
async function runWithConcurrency<T>(
  factories: (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<T[]> {
  if (maxConcurrency <= 0 || maxConcurrency >= factories.length) {
    return Promise.all(factories.map((fn) => fn()));
  }

  const results: T[] = new Array(factories.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < factories.length) {
      const i = index++;
      results[i] = await factories[i]();
    }
  }

  const workers = Array.from({ length: maxConcurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runParallel(
  tasks: AgentTask[],
  options: OrchestraOptions = {},
): Promise<AgentResult[]> {
  const cwd = options.cwd ?? getActiveCwd();
  const defaultModel = options.defaultModel ?? getEffectiveModel();
  const maxTurns = options.maxTurns ?? getEffectiveMaxTurns();
  const concurrency = options.maxConcurrency ?? 3;
  const permissionMode = options.permissionMode ?? getEffectivePermissionMode();

  const factories = tasks.map((task) => async () => {
    const args: string[] = ["-p", task.prompt];
    args.push("--max-turns", String(maxTurns));
    const model = task.model ?? defaultModel;
    if (model) args.push("-m", model);
    args.push("--permission-mode", permissionMode);
    if (task.planMode ?? options.planMode) args.push("--plan");

    const result = await runCli(args, {
      cwd,
      timeoutMs: 10 * 60 * 1000,
      signal: options.signal,
      onStdoutChunk: options.onAgentProgress
        ? (chunk: string) => options.onAgentProgress!(task.label, chunk)
        : undefined,
      onStderrChunk: options.onAgentProgress
        ? (chunk: string) => options.onAgentProgress!(task.label, `[stderr] ${chunk}`)
        : undefined,
    });

    options.onAgentDone?.(task.label);

    return {
      label: task.label,
      prompt: task.prompt,
      result,
    } satisfies AgentResult;
  });

  return runWithConcurrency(factories, concurrency);
}

export function formatParallelResults(
  results: AgentResult[],
): string {
  const parts: string[] = [];
  for (const r of results) {
    const cleanOutput = stripAnsi(r.result.stdout).trim();
    const cleanStderr = stripAnsi(r.result.stderr).trim();

    parts.push(`### ${r.label}`);
    if (cleanOutput) {
      parts.push(cleanOutput);
    }
    if (cleanStderr) {
      parts.push(`\n<details><summary>stderr (exit ${r.result.exitCode})</summary>\n\n\`\`\`\n${cleanStderr}\n\`\`\`\n</details>\n`);
    }
    parts.push("");
  }
  return parts.join("\n");
}
