import * as vscode from "vscode";

class LoggerService {
  private channel: vscode.LogOutputChannel | undefined;

  public initialize(contextName: string): void {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(contextName, { log: true });
    }
  }

  public get isInitialized(): boolean {
    return this.channel !== undefined;
  }

  public get instance(): vscode.LogOutputChannel {
    if (!this.channel) {
      // Fallback in case a component logs before initialization
      this.channel = vscode.window.createOutputChannel("Command Code", { log: true });
    }
    return this.channel;
  }

  public trace(message: string, ...args: unknown[]): void {
    this.instance.trace(redact(message), ...args.map(redactUnknown));
  }

  public debug(message: string, ...args: unknown[]): void {
    this.instance.debug(redact(message), ...args.map(redactUnknown));
  }

  public info(message: string, ...args: unknown[]): void {
    this.instance.info(redact(message), ...args.map(redactUnknown));
  }

  public warn(message: string, ...args: unknown[]): void {
    this.instance.warn(redact(message), ...args.map(redactUnknown));
  }

  public error(message: string | Error, ...args: unknown[]): void {
    this.instance.error(redactError(message), ...args.map(redactUnknown));
  }

  public show(preserveFocus?: boolean): void {
    this.instance.show(preserveFocus);
  }

  public clear(): void {
    this.instance.clear();
  }

  public dispose(): void {
    this.channel?.dispose();
    this.channel = undefined;
  }
}

function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (value instanceof Error) return redactError(value);
  return value;
}

function redactError(error: string | Error): string | Error {
  if (typeof error === "string") return redact(error);
  const clone = new Error(redact(error.message));
  clone.name = error.name;
  clone.stack = error.stack ? redact(error.stack) : undefined;
  return clone;
}

function redact(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted-token]")
    .replace(/(authToken|token|password|secret|api[_-]?key)(["'\s:=]+)([^"'\s,}]+)/gi, "$1$2[redacted]")
    .replace(new RegExp(process.env.HOME?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || "^$", "g"), "~");
}

export const Logger = new LoggerService();
