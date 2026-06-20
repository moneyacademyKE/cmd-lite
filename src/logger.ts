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
    this.instance.trace(message, ...args);
  }

  public debug(message: string, ...args: unknown[]): void {
    this.instance.debug(message, ...args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.instance.info(message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.instance.warn(message, ...args);
  }

  public error(message: string | Error, ...args: unknown[]): void {
    this.instance.error(message, ...args);
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

export const Logger = new LoggerService();
