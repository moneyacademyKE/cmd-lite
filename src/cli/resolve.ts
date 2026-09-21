import * as fs from "node:fs";
import { spawn } from "node:child_process";
import * as vscode from "vscode";
import * as path from "node:path";
import * as https from "node:https";

let cached: string | undefined;
let localCliPathOverride: string | undefined;

export function getDefaultCmd(): string {
  return process.platform === "win32" ? "cmdc" : "cmd";
}

export function getDefaultCmdExe(): string {
  return process.platform === "win32" ? "cmdc.exe" : "cmd";
}


export function setLocalCliPathOverride(filePath: string | undefined): void {
  localCliPathOverride = filePath;
}

export function getLocalCliPath(globalStorageUri: vscode.Uri): string {
  const executableName = process.platform === "win32" ? "command-code.exe" : "command-code";
  return path.join(globalStorageUri.fsPath, "cli", executableName);
}

export function detectLocalCli(globalStorageUri: vscode.Uri): string | undefined {
  return findNativeCliPath(path.join(globalStorageUri.fsPath, "cli"));
}

function findNativeCliPath(installDir: string): string | undefined {
  if (!fs.existsSync(installDir)) return undefined;

  const executableName = process.platform === "win32" ? "command-code.exe" : "command-code";
  const candidates = [
    path.join(installDir, executableName),
    path.join(installDir, getDefaultCmdExe()),
    path.join(installDir, "dist", executableName),
    path.join(installDir, "dist", getDefaultCmdExe()),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function resolveCliPath(): string {
  const defaultCmd = getDefaultCmd();
  const configured = vscode.workspace
    .getConfiguration("cmd-lite")
    .get<string>("cliPath", defaultCmd)
    .trim();
  if (configured && configured !== "cmd" && configured !== "cmdc" && configured !== "command-code") {
    return configured;
  }
  if (localCliPathOverride) {
    return localCliPathOverride;
  }
  if (cached) return cached;
  cached = configured || defaultCmd;
  return cached;
}

export function clearCliPathCache(): void {
  cached = undefined;
}

export function validateCliPath(cliPath: string): { valid: boolean; message?: string } {
  if (cliPath === "cmd" || cliPath === "cmdc" || cliPath === "command-code") {
    return { valid: true };
  }
  if (fs.existsSync(cliPath)) {
    try {
      fs.accessSync(cliPath, fs.constants.X_OK);
      return { valid: true };
    } catch {
      // For Windows or systems where .mjs file might not have executable permission bits but is read-accessible
      try {
        fs.accessSync(cliPath, fs.constants.R_OK);
        return { valid: true };
      } catch {
        return { valid: false, message: `CLI path "${cliPath}" is not readable. Check permissions.` };
      }
    }
  }
  return { valid: false, message: `CLI binary not found at "${cliPath}". Install globally or let CommandCode+ set up local version.` };
}

export async function checkCliVersion(cliPath: string): Promise<{ compatible: boolean; version?: string; message?: string }> {
  return new Promise((resolve) => {
    const isJs = cliPath.endsWith(".mjs") || cliPath.endsWith(".js");
    const execPath = isJs ? process.execPath : cliPath;
    const args = isJs ? [cliPath, "--version"] : ["--version"];
    const child = spawn(execPath, args, { windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 5000);

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ compatible: true });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ compatible: true }); // couldn't run --version, assume OK
        return;
      }
      const output = (stdout || stderr || "").trim();
      const match = /(\d+\.\d+\.\d+)/.exec(output);
      if (match) {
        const version = match[1];
        const [major, minor] = version.split(".").map(Number);
        if (major === 0) {
          if (minor < 39) {
            resolve({
              compatible: false,
              version,
              message: `Command Code CLI v${version} is too old. Please update to v0.39.0 or later with \`cmd update\`.`,
            });
            return;
          }
        }
        resolve({ compatible: true, version });
        return;
      }
      resolve({ compatible: true });
    });
  });
}

export function getLocalRegistryConfig(): string | undefined {
  try {
    const config = vscode.workspace.getConfiguration("cmd-lite");
    let val = config.get<string>("localRegistryPath");
    if (val) {
      val = val.trim();
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const root = folders[0].uri.fsPath;
        val = val.replace(/\$\{workspaceFolder\}/g, root);
        if (!path.isAbsolute(val)) {
          val = path.resolve(root, val);
        }
      }
      return val;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function fetchLatestTarballInfo(): Promise<{ version: string; tarball: string }> {
  const localRegistry = getLocalRegistryConfig();
  if (localRegistry) {
    return new Promise((resolve, reject) => {
      try {
        const pkgJsonPath = path.join(localRegistry, "package.json");
        if (!fs.existsSync(pkgJsonPath)) {
          reject(new Error(`localRegistryPath is configured but no package.json was found at "${pkgJsonPath}"`));
          return;
        }
        const content = fs.readFileSync(pkgJsonPath, "utf8");
        const pkg = JSON.parse(content);
        const version = pkg.version;
        if (!version) {
          reject(new Error(`package.json at "${pkgJsonPath}" does not specify a version`));
          return;
        }
        const tarballName = `command-code-${version}.tgz`;
        const tarballPath = path.join(localRegistry, tarballName);
        resolve({
          version,
          tarball: tarballPath,
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  return new Promise((resolve, reject) => {
    https.get("https://registry.npmjs.org/command-code/latest", (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch latest info: status code ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({
            version: json.version,
            tarball: json.dist.tarball,
          });
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

export function downloadFile(url: string, destPath: string, progressCallback?: (percentage: number) => void): Promise<void> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(url)) {
          reject(new Error(`Local tarball not found at "${url}"`));
          return;
        }
        if (progressCallback) progressCallback(50);
        fs.copyFileSync(url, destPath);
        if (progressCallback) progressCallback(100);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download tarball: status code ${res.statusCode}`));
        return;
      }
      const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);

      res.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && progressCallback) {
          progressCallback(Math.round((downloadedBytes / totalBytes) * 100));
        }
      });

      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });

      fileStream.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on("error", reject);
  });
}

export function extractTarball(tarballPath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(targetDir, { recursive: true });

    const child = spawn("tar", ["-xzf", tarballPath, "--strip-components=1", "-C", targetDir], { shell: false });
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => reject(new Error(`Failed to extract tarball: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Failed to extract tarball: ${stderr || `exit code ${code}`}`));
      else resolve();
    });
  });
}

export async function installOrUpdateLocalCli(
  globalStorageUri: vscode.Uri,
  progressCallback?: (percentage: number) => void
): Promise<{ version: string }> {
  const latestInfo = await fetchLatestTarballInfo();
  
  const baseDir = globalStorageUri.fsPath;
  const tempTarball = path.join(baseDir, `command-code-${latestInfo.version}.tgz`);
  const newCliDir = path.join(baseDir, "cli-new");
  const activeCliDir = path.join(baseDir, "cli");
  const oldCliDir = path.join(baseDir, "cli-old");

  fs.mkdirSync(baseDir, { recursive: true });

  await downloadFile(latestInfo.tarball, tempTarball, progressCallback);

  try {
    if (fs.existsSync(newCliDir)) {
      fs.rmSync(newCliDir, { recursive: true, force: true });
    }
    fs.mkdirSync(newCliDir, { recursive: true });

    await extractTarball(tempTarball, newCliDir);

    const newCliPath = findNativeCliPath(newCliDir);
    if (!newCliPath) {
      throw new Error("Downloaded Command Code package did not contain a precompiled CLI binary.");
    }

    if (process.platform !== "win32") {
      try {
        fs.chmodSync(newCliPath, 0o755);
      } catch {
        // Validation will report permission problems if chmod is not allowed.
      }
    }

    if (fs.existsSync(oldCliDir)) {
      fs.rmSync(oldCliDir, { recursive: true, force: true });
    }
    
    if (fs.existsSync(activeCliDir)) {
      fs.renameSync(activeCliDir, oldCliDir);
    }
    
    fs.renameSync(newCliDir, activeCliDir);

    if (fs.existsSync(oldCliDir)) {
      try {
        fs.rmSync(oldCliDir, { recursive: true, force: true });
      } catch (err) {
        // ignore background deletion failures
      }
    }
  } finally {
    if (fs.existsSync(tempTarball)) {
      try {
        fs.unlinkSync(tempTarball);
      } catch (err) {
        // ignore unlink failures
      }
    }
  }

  const localCliPath = findNativeCliPath(activeCliDir);
  if (!localCliPath) {
    throw new Error("Installed Command Code package does not contain a CLI binary.");
  }
  setLocalCliPathOverride(localCliPath);

  return { version: latestInfo.version };
}
