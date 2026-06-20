import { exec } from "node:child_process";
import { Logger } from "../logger";
import { SessionManager } from "../sessionManager";

const CHECKPOINT_PREFIX = "cmd-lite/pre-";
const session = SessionManager.getInstance();

/**
 * Check if the given directory is inside a git repo with changes to stash.
 */
function isGitRepo(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec("git rev-parse --is-inside-work-tree", { cwd }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Check if there are any unstaged or staged changes to stash.
 */
function hasChanges(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec("git status --porcelain", { cwd }, (_err, stdout) => {
      resolve(stdout.trim().length > 0);
    });
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

  return new Promise((resolve) => {
    exec(`git stash push -m "${message}" --include-untracked`, { cwd: dir }, (err, _stdout, stderr) => {
      if (err) {
        Logger.error("CommandCode: checkpoint failed:", stderr);
        resolve(false);
        return;
      }
      session.lastCheckpointRef = message;
      resolve(true);
    });
  });
}

/**
 * Pop the most recent cmd-lite stash entry.
 * Returns true on success.
 */
export async function restoreLastCheckpoint(cwd?: string): Promise<boolean> {
  const dir = cwd ?? process.cwd();
  if (!(await isGitRepo(dir))) return false;

  // Find the most recent cmd-lite stash
  return new Promise((resolve) => {
    exec(
      `git stash list --grep="${CHECKPOINT_PREFIX}" --format="%gd"`,
      { cwd: dir },
      (_err, stdout) => {
        const refs = stdout.trim().split(/\r?\n/).filter(Boolean);
        if (refs.length === 0) {
          resolve(false);
          return;
        }
        const mostRecent = refs[0];
        exec(`git stash pop ${mostRecent}`, { cwd: dir }, (popErr, _so, se) => {
          if (popErr) {
            Logger.error("CommandCode: restore checkpoint failed:", se);
            resolve(false);
            return;
          }
          session.lastCheckpointRef = null;
          resolve(true);
        });
      },
    );
  });
}

export function getLastCheckpointRef(): string | null {
  return session.lastCheckpointRef;
}
