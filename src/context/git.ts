import * as child_process from "node:child_process";
import type { GitContext } from "./protocol";

export async function getGitContext(
  cwd: string,
): Promise<GitContext | null> {
  try {
    const branch = await execGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch) return null;
    const headCommit = await execGit(cwd, ["rev-parse", "HEAD"]);
    const headCommitMessage = await execGit(cwd, ["log", "-1", "--format=%s"]);
    const dirtyFiles = await execGit(cwd, [
      "diff",
      "--name-only",
      "HEAD",
    ]);
    return {
      branch: branch.split(/\r?\n/)[0].trim(),
      headCommit: headCommit.split(/\r?\n/)[0].trim(),
      headCommitMessage: headCommitMessage.split(/\r?\n/)[0].trim(),
      dirtyFiles: dirtyFiles
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}

function execGit(
  cwd: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`git exited ${code}`));
    });
    child.on("error", reject);
  });
}
