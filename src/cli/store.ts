import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Logger } from "../logger";

export interface ParticipantState {
  permissionMode: "standard" | "plan" | "auto-accept";
  model: string | undefined;
  planMode: boolean;
}

const DEFAULT_STATE: ParticipantState = {
  permissionMode: "standard",
  model: undefined,
  planMode: false,
};

function getStorePath(): string {
  const dir = path.join(os.homedir(), ".commandcode");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Compatible with unstorage-mcp 'fs' driver using the 'session' key
  return path.join(dir, "session.json");
}

export function readSessionState(): ParticipantState {
  try {
    const storePath = getStorePath();
    if (!fs.existsSync(storePath)) {
      return { ...DEFAULT_STATE };
    }
    const content = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<ParticipantState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
    };
  } catch (err) {
    Logger.error("Failed to read session state:", err);
    return { ...DEFAULT_STATE };
  }
}

export function writeSessionState(state: ParticipantState): void {
  try {
    const storePath = getStorePath();
    fs.writeFileSync(storePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    Logger.error("Failed to write session state:", err);
  }
}
