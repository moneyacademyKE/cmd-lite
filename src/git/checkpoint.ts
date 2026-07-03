import { spawn } from "node:child_process";
import { Logger } from "../logger";
import { SessionManager } from "../sessionManager";

const CHECKPOINT_PREFIX = "cmd-lite/pre-";
const session = SessionManager.getInstance();

/**
 * Check if the given directory is inside a git repo with changes to stash.
 */
function isGitRepo(cwd: string): Promise<boolean> {
  return runGit(cwd, ["rev-parse", "--is-inside-work-tree"]).then((result) => result.code === 0);
}

/**
 * Check if there are any unstaged or staged changes to stash.
 */
function hasChanges(cwd: string): Promise<boolean> {
  return runGit(cwd, ["status", "--porcelain"]).then((result) => result.stdout.trim().length > 0);
}

function runGit(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/**
 * Create a pre-flight git stash snapshot.
 * Returns true if a checkpoint was created, false otherwise.
 */
export async function createPreCheckpoint(cwd?: string): Promise<boolean> {
  const dir = cwd ?? process.cwd();
  if (!(await isGitRepo(dir))) return false;
  if (!(await hasChanges(dir))) return false;

  const timestamp = Date.now();
  const message = `${CHECKPOINT_PREFIX}${timestamp}`;

  const result = await runGit(dir, ["stash", "push", "-m", message, "--include-untracked"]);
  if (result.code !== 0) {
    Logger.error("CommandCode: checkpoint failed:", result.stderr);
    return false;
  }
  session.lastCheckpointRef = message;
  return true;
}

/**
 * Pop the most recent cmd-lite stash entry.
 * Returns true on success.
 */
export async function restoreLastCheckpoint(cwd?: string): Promise<boolean> {
  const dir = cwd ?? process.cwd();
  if (!(await isGitRepo(dir))) return false;

  // Find the most recent cmd-lite stash
  const listResult = await runGit(dir, ["stash", "list", `--grep=${CHECKPOINT_PREFIX}`, "--format=%gd"]);
  const refs = listResult.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (refs.length === 0) return false;

  const popResult = await runGit(dir, ["stash", "pop", refs[0]]);
  if (popResult.code !== 0) {
    Logger.error("CommandCode: restore checkpoint failed:", popResult.stderr);
    return false;
  }
  session.lastCheckpointRef = null;
  return true;
}

export function getLastCheckpointRef(): string | null {
  return session.lastCheckpointRef;
}
